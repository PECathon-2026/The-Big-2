/**
 * The ONE persistent R3F <Canvas> (§4.2). Mounted once under the router; never torn down.
 * Layers: SkyLayer (A), IntroLayer (B). Camera is driven only by the Director's rig.
 * The dome exterior (scene/dome) is no longer mounted: product-owner decision, the intro lands inside the sky.
 */
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useApp } from '@/state/store';
import { rig, Director } from './Director';
import { damp, nearestAngle } from '@/astro/coords';
import { stepQuality, tierDpr } from './quality';
import { skyClock, updateSkyClock } from './skyClock';
import SkyLayer from './sky/SkyLayer';
import IntroLayer from './intro/IntroLayer';

const clear = new THREE.Color();
const zen = new THREE.Color();
const space = new THREE.Color('#07090C') // pecfest page bg;

/** Eases the camera toward rig.tgt every frame (time-based damping, always interruptible). */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    updateSkyClock();
    const c = rig.cur;
    const t = rig.tgt;
    if (rig.station === 'dome' && rig.domeSpin) t.yaw += rig.domeSpin * dt;
    const k = damp(dt, rig.ease);
    for (let i = 0; i < 3; i++) c.pos[i] += (t.pos[i] - c.pos[i]) * k;
    c.yaw += (nearestAngle(t.yaw, c.yaw) - c.yaw) * k;
    c.pitch += (t.pitch - c.pitch) * k;
    c.fov += (t.fov - c.fov) * k;
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    if (Math.abs(camera.fov - c.fov) > 1e-3) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(
      c.pos[0] + Math.sin(c.yaw) * Math.cos(c.pitch),
      c.pos[1] + Math.sin(c.pitch),
      c.pos[2] - Math.cos(c.yaw) * Math.cos(c.pitch),
    );
    // clear colour follows the Sun's real altitude inside the sky; fades to deep space outside the dome
    const outside = THREE.MathUtils.smoothstep(Math.hypot(c.pos[0], c.pos[1], c.pos[2]), 95, 160);
    zen.setRGB(...skyClock.palette.zenithRgb, THREE.SRGBColorSpace);
    clear.copy(zen).lerp(space, outside);
    gl.setClearColor(clear, 1);
  }, -10);
  return null;
}

/** Drag-look and wheel-zoom while inside the sky. A/C may replace with richer controls. */
function SkyInput() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (useApp.getState().phase !== 'sky') return;
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      Director.drag(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      if (useApp.getState().phase !== 'sky') return;
      e.preventDefault();
      Director.zoom(e.deltaY);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);
  return null;
}

/** Module pages fully cover the sky: render on demand there (§6.5). */
function FrameloopSwitch() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const phase = useApp((s) => s.phase);
  useEffect(() => {
    setFrameloop(phase === 'module' ? 'demand' : 'always');
  }, [phase, setFrameloop]);
  return null;
}

export default function CanvasRoot() {
  const quality = useApp((s) => s.quality);
  const phase = useApp((s) => s.phase);
  const wrap = useRef<HTMLDivElement>(null);
  const dimmed = phase === 'module';
  return (
    <div
      ref={wrap}
      id="canvas-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        // pages mount over the dimmed sky (§9.1)
        filter: dimmed ? 'brightness(.35) blur(6px)' : 'none',
        transition: 'filter 900ms var(--ease-cinematic)',
      }}
    >
      <Canvas
        dpr={tierDpr(quality)}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
        camera={{ fov: rig.cur.fov, near: 0.1, far: 2000, position: rig.cur.pos }}
        flat={false}
      >
        <PerformanceMonitor onDecline={() => stepQuality('down')} onIncline={() => stepQuality('up')} flipflops={3} />
        <CameraRig />
        <SkyInput />
        <FrameloopSwitch />
        <Suspense fallback={null}>
          <SkyLayer />
          <IntroLayer />
        </Suspense>
      </Canvas>
    </div>
  );
}
