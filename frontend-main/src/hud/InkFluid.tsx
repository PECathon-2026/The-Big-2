/* Fork of React Bits LiquidEther (MIT, reactbits.dev). Solver and shaders copied verbatim; component rewritten. */

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';


interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Target {
  texture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
}

interface Splat {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  radius: number;
}

type TargetName = 'velocity' | 'velocityNext' | 'divergence' | 'pressure' | 'pressureNext';
type ProgramName = 'splat' | 'smooth' | 'divergence' | 'pressure' | 'project' | 'advect' | 'display';

const PIXEL_BUDGET = 2.4e6;
const MAX_CELLS = 140000;
const PRESSURE_STEPS = 32;
const PALETTE_SIZE = 256;

const VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vUv = corners[gl_VertexID] * 0.5 + 0.5;
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uTexel;
`;

const SPLAT = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uSize;
uniform vec4 uSegment;
uniform vec2 uForce;
uniform float uRadius;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}

void main() {
  float d = segment(vUv * uSize, uSegment.xy, uSegment.zw) / uRadius;
  vec2 velocity = texture(uVelocity, vUv).xy + uForce * exp(-d * d * 6.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const SMOOTH = `${HEADER}
uniform sampler2D uVelocity;
uniform float uAmount;

void main() {
  vec2 center = texture(uVelocity, vUv).xy;
  vec2 around =
    texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).xy +
    texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).xy +
    texture(uVelocity, vUv - vec2(0.0, uTexel.y)).xy +
    texture(uVelocity, vUv + vec2(0.0, uTexel.y)).xy;
  fragColor = vec4(mix(center, around * 0.25, uAmount), 0.0, 1.0);
}`;

const DIVERGENCE = `${HEADER}
uniform sampler2D uVelocity;
uniform float uWalls;

void main() {
  vec2 center = texture(uVelocity, vUv).xy;
  float left = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float down = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float up = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float edge = uWalls > 0.5 ? -1.0 : 0.0;
  if (vUv.x - uTexel.x < 0.0) left = edge * center.x;
  if (vUv.x + uTexel.x > 1.0) right = edge * center.x;
  if (vUv.y - uTexel.y < 0.0) down = edge * center.y;
  if (vUv.y + uTexel.y > 1.0) up = edge * center.y;
  fragColor = vec4(0.5 * (right - left + up - down), 0.0, 0.0, 1.0);
}`;

const EDGE = `
uniform float uWalls;

float pressureAt(sampler2D field, vec2 uv) {
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture(field, uv).x * mix(inside.x * inside.y, 1.0, uWalls);
}
`;

const PRESSURE = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
${EDGE}
void main() {
  vec2 reach = uTexel * 2.0;
  float sum =
    pressureAt(uPressure, vUv - vec2(reach.x, 0.0)) +
    pressureAt(uPressure, vUv + vec2(reach.x, 0.0)) +
    pressureAt(uPressure, vUv - vec2(0.0, reach.y)) +
    pressureAt(uPressure, vUv + vec2(0.0, reach.y));
  fragColor = vec4(sum * 0.25 - texture(uDivergence, vUv).x, 0.0, 0.0, 1.0);
}`;

const PROJECT = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
${EDGE}
void main() {
  float left = pressureAt(uPressure, vUv - vec2(uTexel.x, 0.0));
  float right = pressureAt(uPressure, vUv + vec2(uTexel.x, 0.0));
  float down = pressureAt(uPressure, vUv - vec2(0.0, uTexel.y));
  float up = pressureAt(uPressure, vUv + vec2(0.0, uTexel.y));
  vec2 velocity = texture(uVelocity, vUv).xy - 0.5 * vec2(right - left, up - down);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const ADVECT = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uStep;
uniform float uKeep;
uniform float uWalls;

vec2 at(vec2 uv) {
  vec2 outside = max(-uv, uv - 1.0) / uTexel;
  float open = clamp(1.0 - max(outside.x, outside.y) / 1.5, 0.0, 1.0);
  return texture(uVelocity, uv).xy * mix(open, 1.0, uWalls);
}

void main() {
  vec2 start = vUv - at(vUv) * uStep;
  vec2 back = start + at(start) * uStep;
  vec2 corrected = vUv - (back - vUv) * 0.5;
  vec2 origin = corrected - at(corrected) * uStep;
  vec2 a = at(origin + vec2(-0.5, -0.5) * uTexel);
  vec2 b = at(origin + vec2(0.5, -0.5) * uTexel);
  vec2 c = at(origin + vec2(-0.5, 0.5) * uTexel);
  vec2 d = at(origin + vec2(0.5, 0.5) * uTexel);
  vec2 velocity = clamp(at(origin), min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  fragColor = vec4(velocity * uKeep, 0.0, 1.0);
}`;

const DISPLAY = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uPalette;
uniform vec2 uSimSize;
uniform float uSpeedScale;
uniform float uLight;
uniform vec4 uBackground;

vec2 velocityAt(vec2 uv) {
  vec2 st = uv * uSimSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uSimSize;
  vec2 h1 = (i + 1.5 + w3 / g1) / uSimSize;
  vec2 a = texture(uVelocity, vec2(h0.x, h0.y)).xy;
  vec2 b = texture(uVelocity, vec2(h1.x, h0.y)).xy;
  vec2 c = texture(uVelocity, vec2(h0.x, h1.y)).xy;
  vec2 d = texture(uVelocity, vec2(h1.x, h1.y)).xy;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

void main() {
  float speed = length(velocityAt(vUv)) * uSpeedScale;
  float level = speed < 0.75 ? speed : 0.75 + 0.25 * tanh((speed - 0.75) * 4.0);
  vec3 ink = texture(uPalette, vec2(level, 0.5)).rgb;
  float alpha = level;
  if (uLight > 0.5) {
    float hollow = smoothstep(0.7, 1.6, speed);
    alpha = smoothstep(0.08, 0.5, level) * mix(0.85, 0.1, hollow);
  } else {
    float hot = 1.0 - exp(-max(speed - 0.75, 0.0) * 1.2);
    ink = mix(ink, min(ink * 1.8 + 0.06, vec3(1.0)), hot);
  }
  vec3 color = ink * alpha + uBackground.rgb * uBackground.a * (1.0 - alpha);
  float coverage = alpha + uBackground.a * (1.0 - alpha);
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  color += (grain - 0.5) / 255.0 * step(0.002, coverage);
  fragColor = vec4(clamp(color, vec3(0.0), vec3(coverage)), coverage);
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const keepFor = (persistence: number, dt: number) => Math.pow(0.5, dt / (0.35 + persistence * persistence * 12));

const parseColor = (value: string): number[] | null => {
  const text = String(value || '').trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].replace(/./g, digit => digit + digit) : hex[1];
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255);
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(channel => clamp(parseFloat(channel) / 255, 0, 1));
  return null;
};

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));

const buildPalette = (colors: string[]) => {
  const stops: number[][] = [];
  colors.forEach(color => {
    const parsed = parseColor(color);
    if (parsed) stops.push(parsed);
  });
  if (!stops.length) stops.push([1, 1, 1]);
  const values = stops.map(color => color.map(toLinear));
  const data = new Uint8Array(PALETTE_SIZE * 4);
  for (let index = 0; index < PALETTE_SIZE; index++) {
    const t = clamp((index / (PALETTE_SIZE - 1)) * values.length - 0.5, 0, values.length - 1);
    const from = Math.min(Math.floor(t), Math.max(values.length - 2, 0));
    const to = Math.min(from + 1, values.length - 1);
    const k = t - from;
    const eased = k * k * (3 - 2 * k);
    for (let channel = 0; channel < 3; channel++) {
      const value = values[from][channel] + (values[to][channel] - values[from][channel]) * eased;
      data[index * 4 + channel] = Math.round(clamp(value, 0, 1) * 255);
    }
    data[index * 4 + 3] = 255;
  }
  return data;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const link = (gl: WebGL2RenderingContext, fragmentSource: string): Program | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Program['uniforms'] = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};


/** Imperative handle: coordinates are CSS pixels from the top-left of the layer. */
export interface InkFluidHandle {
  /** one stroke of force from (x, y) along (dx, dy) px, `radius` px wide */
  splat(x: number, y: number, dx: number, dy: number, radius?: number): void;
  /** `count` radial splats outward from (x, y) */
  burst(x: number, y: number, count?: number, strength?: number, radius?: number): void;
}

export interface InkFluidProps {
  colors: string[];
  intensity?: number;
  persistence?: number;
  viscosity?: number;
  resolution?: number;
  maxDevicePixelRatio?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fork of React Bits LiquidEther (vendor/reactbits/LiquidEther.tsx, solver + shaders unchanged above)
 * for the dive ink flood (§7.6, §10.3): no auto demo, no pointer input, no intro sweep. It is driven
 * only by `splat` / `burst` and sleeps when the fluid's energy has decayed.
 */
const InkFluid = forwardRef<InkFluidHandle, InkFluidProps>(function InkFluid(
  { colors, intensity = 1.4, persistence = 0.55, viscosity = 0.35, resolution = 0.35, maxDevicePixelRatio = 1.5, className = '', style },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<InkFluidHandle | null>(null);
  const opts = useRef({ colors, intensity, persistence, viscosity, resolution, maxDevicePixelRatio });
  opts.current = { colors, intensity, persistence, viscosity, resolution, maxDevicePixelRatio };

  useImperativeHandle(ref, () => ({
    splat: (...a) => api.current?.splat(...a),
    burst: (...a) => api.current?.burst(...a),
  }));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return;
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return;
    const programs = {
      splat: link(gl, SPLAT),
      smooth: link(gl, SMOOTH),
      divergence: link(gl, DIVERGENCE),
      pressure: link(gl, PRESSURE),
      project: link(gl, PROJECT),
      advect: link(gl, ADVECT),
      display: link(gl, DISPLAY),
    } as Record<ProgramName, Program>;
    if (Object.values(programs).some((entry) => !entry)) return;

    const vao = gl.createVertexArray();
    const size = { width: 1, height: 1 };
    const grid = { width: 0, height: 0 };
    const targets = {} as Record<TargetName, Target>;
    const splats: Splat[] = [];
    let energy = 0;
    let raf = 0;
    let last = 0;
    let lost = false;

    const paletteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PALETTE_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildPalette(opts.current.colors));

    const makeTarget = (width: number, height: number, channels: number): Target => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, channels === 2 ? gl.RG16F : gl.R16F, width, height, 0, channels === 2 ? gl.RG : gl.RED, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, framebuffer };
    };
    const dropTargets = () => {
      (Object.keys(targets) as TargetName[]).forEach((key) => {
        gl.deleteTexture(targets[key].texture);
        gl.deleteFramebuffer(targets[key].framebuffer);
        delete targets[key];
      });
    };
    const resize = () => {
      const o = opts.current;
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, o.maxDevicePixelRatio, Math.sqrt(PIXEL_BUDGET / (cssWidth * cssHeight)));
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.max(1, Math.round(cssHeight * ratio));
      size.width = cssWidth;
      size.height = cssHeight;
      const base = clamp(o.resolution, 0.05, 1) * 0.5;
      const scale = base * Math.min(1, Math.sqrt(MAX_CELLS / (cssWidth * cssHeight * base * base)));
      const gw = clamp(Math.round(cssWidth * scale), 16, 1024);
      const gh = clamp(Math.round(cssHeight * scale), 16, 1024);
      if (gw === grid.width && gh === grid.height) return;
      dropTargets();
      grid.width = gw;
      grid.height = gh;
      targets.velocity = makeTarget(gw, gh, 2);
      targets.velocityNext = makeTarget(gw, gh, 2);
      targets.divergence = makeTarget(gw, gh, 1);
      targets.pressure = makeTarget(gw, gh, 1);
      targets.pressureNext = makeTarget(gw, gh, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const swap = (a: TargetName, b: TargetName) => {
      const held = targets[a];
      targets[a] = targets[b];
      targets[b] = held;
    };
    const bindTexture = (unit: number, texture: WebGLTexture | null, location: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location, unit);
    };
    const run = (entry: Program, output: Target | null, bind: (uniforms: Program['uniforms']) => void) => {
      gl.useProgram(entry.program);
      gl.uniform2f(entry.uniforms.uTexel, 1 / grid.width, 1 / grid.height);
      bind(entry.uniforms);
      gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.framebuffer : null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const simulate = (dt: number) => {
      const o = opts.current;
      gl.viewport(0, 0, grid.width, grid.height);
      splats.forEach((s) => {
        run(programs.splat, targets.velocityNext, (u) => {
          bindTexture(0, targets.velocity.texture, u.uVelocity);
          gl.uniform2f(u.uSize, size.width, size.height);
          gl.uniform4f(u.uSegment, s.ax, s.ay, s.bx, s.by);
          gl.uniform2f(u.uForce, s.vx, s.vy);
          gl.uniform1f(u.uRadius, s.radius);
        });
        swap('velocity', 'velocityNext');
      });
      splats.length = 0;
      const passes = Math.ceil(o.viscosity * 4);
      for (let pass = 0; pass < passes; pass++) {
        run(programs.smooth, targets.velocityNext, (u) => {
          bindTexture(0, targets.velocity.texture, u.uVelocity);
          gl.uniform1f(u.uAmount, Math.min(1, o.viscosity * 4 - pass) * 0.9);
        });
        swap('velocity', 'velocityNext');
      }
      run(programs.divergence, targets.divergence, (u) => {
        bindTexture(0, targets.velocity.texture, u.uVelocity);
        gl.uniform1f(u.uWalls, 0);
      });
      for (let i = 0; i < PRESSURE_STEPS; i++) {
        run(programs.pressure, targets.pressureNext, (u) => {
          bindTexture(0, targets.pressure.texture, u.uPressure);
          bindTexture(1, targets.divergence.texture, u.uDivergence);
          gl.uniform1f(u.uWalls, 0);
        });
        swap('pressure', 'pressureNext');
      }
      run(programs.project, targets.velocityNext, (u) => {
        bindTexture(0, targets.pressure.texture, u.uPressure);
        bindTexture(1, targets.velocity.texture, u.uVelocity);
        gl.uniform1f(u.uWalls, 0);
      });
      swap('velocity', 'velocityNext');
      run(programs.advect, targets.velocityNext, (u) => {
        bindTexture(0, targets.velocity.texture, u.uVelocity);
        gl.uniform2f(u.uStep, dt / size.width, dt / size.height);
        gl.uniform1f(u.uKeep, keepFor(o.persistence, dt));
        gl.uniform1f(u.uWalls, 0);
      });
      swap('velocity', 'velocityNext');
    };
    const render = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      run(programs.display, null, (u) => {
        bindTexture(0, targets.velocity.texture, u.uVelocity);
        bindTexture(1, paletteTexture, u.uPalette);
        gl.uniform2f(u.uSimSize, grid.width, grid.height);
        gl.uniform1f(u.uSpeedScale, (1.25 * opts.current.intensity) / (0.84 * Math.max(size.width, size.height)));
        gl.uniform1f(u.uLight, 0);
        gl.uniform4f(u.uBackground, 0, 0, 0, 0);
      });
    };
    const frame = (now: number) => {
      raf = 0;
      if (lost) return;
      const dt = clamp((now - last) / 1000 || 0, 0, 1 / 30);
      last = Math.max(last, now);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      if (dt > 0) simulate(dt);
      render();
      energy *= keepFor(opts.current.persistence, dt);
      if (energy > 0.002 || splats.length) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      if (raf || lost) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    // CSS px from the top-left → sim space (origin bottom-left).
    const push = (x: number, y: number, dx: number, dy: number, radius: number) => {
      const yy = size.height - y;
      splats.push({ ax: x, ay: yy, bx: x + dx, by: yy - dy, vx: clamp(dx * 60, -6000, 6000), vy: clamp(-dy * 60, -6000, 6000), radius: clamp(radius, 4, 600) });
      energy = 1;
      wake();
    };
    api.current = {
      splat: (x, y, dx, dy, radius = 90) => push(x, y, dx, dy, radius),
      burst: (x, y, count = 14, strength = 60, radius = 70) => {
        const a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < count; i++) {
          const a = a0 + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
          const k = strength * (0.7 + Math.random() * 0.6);
          push(x + Math.cos(a) * radius * 0.3, y + Math.sin(a) * radius * 0.3, Math.cos(a) * k, Math.sin(a) * k, radius * (0.7 + Math.random() * 0.6));
        }
      },
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    return () => {
      cancelAnimationFrame(raf);
      api.current = null;
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      if (!gl.isContextLost()) {
        dropTargets();
        gl.deleteTexture(paletteTexture);
        gl.deleteVertexArray(vao);
        Object.values(programs).forEach((entry) => gl.deleteProgram(entry.program));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />
    </div>
  );
});

export default InkFluid;
