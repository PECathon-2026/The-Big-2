/**
 * The master intro timeline (§6.5, §7.3): one ScrollTrigger (scrub 1) over a ~650vh track, driven by
 * Lenis. Everything — camera, real time-lapse, frame, captions, clock, the in-canvas scene — is a pure
 * function of one progress value, so scrubbing backwards is exact. Return visitors get an 8 s autoplay.
 */
import { useEffect, useMemo, useRef } from 'react';
import { gsap, ScrollTrigger, lenis } from '@/app/lenis';
import { useApp } from '@/state/store';
import { Director, DOME_POS, EYE } from '@/scene/Director';
import { skyClock } from '@/scene/skyClock';
import { compass16, dirToYawPitch, type Vec3 } from '@/astro/coords';
import { fmtClock, kokuAt, moonState } from '@/astro/skytime';
import { moonName } from '@/astro/moonNames';
import { Button, Kanji } from '@/ui';
import { P, intro, landForMag, lerp, smooth, timeAt } from '@/scene/intro/introBus';
import { finishIntro, introSeen } from './flow';
import IntroFrame, { type FrameHandle } from './IntroFrame';

const D = Math.PI / 180;
const TRACK_VH = 650;

/** piecewise-smooth keyframes */
function keys(p: number, k: [number, number][]): number {
  if (p <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) {
    if (p <= k[i + 1][0]) return lerp(k[i][1], k[i + 1][1], smooth(k[i][0], k[i + 1][0], p));
  }
  return k[k.length - 1][1];
}

const dirOf = (yaw: number, pitch: number): Vec3 => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

/** The camera at progress p (eye height, facing the real sunset azimuth; then the pull-back to the dome). */
function cameraAt(p: number, yaw0: number) {
  const pitch = keys(p, [[0, 6], [P.frameEnd, 7], [P.sunEnd, 8.5], [P.streamEnd, 30], [P.landEnd, 38], [P.titleEnd, 36], [P.moonEnd, 30]]) * D;
  const yaw = yaw0 + keys(p, [[0, 0], [P.sunEnd, 2], [P.landEnd, -4], [P.moonEnd, -6]]) * D;
  const fov = keys(p, [[0, 38], [P.frameEnd, 55], [P.streamEnd, 58], [P.moonEnd, 58], [1, 50]]);
  const t = smooth(P.moonEnd, 1, p);
  if (t <= 0) return { pos: EYE, yaw, pitch, fov };
  // rise first (clears the trees), then dolly out through the sky to the dome view
  const up = smooth(0, 0.55, t);
  const out = smooth(0.15, 1, t);
  const pos: Vec3 = [lerp(EYE[0], DOME_POS[0], out), lerp(EYE[1], DOME_POS[1], up * 0.6 + out * 0.4), lerp(EYE[2], DOME_POS[2], out)];
  const a = dirOf(yaw, pitch);
  const b: Vec3 = [-pos[0], -pos[1], -pos[2]];
  const bl = Math.hypot(...b) || 1;
  const w = smooth(0.1, 0.9, t);
  const dir: Vec3 = [lerp(a[0], b[0] / bl, w), lerp(a[1], b[1] / bl, w), lerp(a[2], b[2] / bl, w)];
  const yp = dirToYawPitch(dir);
  return { pos, yaw: yp.yaw, pitch: yp.pitch, fov };
}

interface Cap {
  from: number;
  to: number;
  eyebrow: string;
  jp: string;
  text: () => string;
}

export default function IntroScroll() {
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef<FrameHandle>(null);
  const clockT = useRef<HTMLSpanElement>(null);
  const clockK = useRef<HTMLSpanElement>(null);
  const clockS = useRef<HTMLSpanElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capText = useRef<(HTMLParagraphElement | null)[]>([]);
  const fade = useRef<HTMLDivElement>(null);
  const place = useApp((s) => s.place);
  const reduced = useApp((s) => s.reducedMotion);
  const auto = useMemo(() => introSeen(), []);

  const caps = useMemo<Cap[]>(() => {
    const tz = () => useApp.getState().tz;
    const city = (place?.label ?? 'you').replace(/^≈\s*/, '');
    return [
      {
        from: 0.1,
        to: 0.28,
        eyebrow: 'Sunset',
        jp: '日没',
        text: () => {
          const tl = intro.timeline;
          if (!tl) return 'The sun sets';
          const az = Math.round(tl.sunsetAz);
          return `The sun sets at ${az}° ${compass16(tl.sunsetAz)}${tl.sunset ? ` · ${fmtClock(tl.sunset, tz())}` : ''}`;
        },
      },
      {
        from: 0.33,
        to: 0.52,
        eyebrow: 'Sakura',
        jp: '桜',
        text: () => `The petals rise to find the stars above ${city}`,
      },
      {
        from: 0.565,
        to: 0.71,
        eyebrow: 'Hoshi',
        jp: '星',
        text: () => {
          const t = intro.targets;
          if (!t || !t.count) return 'Each petal lands on a real star, brightest first';
          let k = 0;
          for (let i = 0; i < t.count; i++) if (landForMag(t.mags[i]) <= intro.progress) k++;
          return `${k.toLocaleString('en')} of ${t.count.toLocaleString('en')} real stars lit, brightest first`;
        },
      },
      {
        from: 0.83,
        to: 0.895,
        eyebrow: 'Tonight',
        jp: '月',
        text: () => {
          const ms = moonState(intro.time, place ?? { lat: skyClock.lat, lon: skyClock.lon });
          const mn = moonName(ms.ageDays);
          const up = ms.alt > 0 ? `${Math.round(ms.alt)}° up` : 'below the horizon';
          return `${mn.kanji} · ${mn.romaji} · ${Math.round(ms.illumination * 100)}% lit · ${up}`;
        },
      },
      {
        from: 0.915,
        to: 0.985,
        eyebrow: 'Your sky',
        jp: '天蓋',
        text: () => `Tonight over ${city}, captured`,
      },
    ];
  }, [place]);

  useEffect(() => {
    const tl = intro.timeline;
    const yaw0 = (tl?.sunsetAz ?? 270) * D;
    const s = useApp.getState();
    let lastStore = -1;
    let lastMinute = -1;
    let done = false;

    const apply = (p: number) => {
      if (done) return;
      intro.progress = p;
      if (tl) {
        intro.time = timeAt(p, tl);
        skyClock.override = intro.time;
      }
      const c = cameraAt(p, yaw0);
      Director.set(c, true);
      frame.current?.update(p);
      if (Math.abs(p - lastStore) > 0.002 || p === 1) {
        lastStore = p;
        s.setIntroProgress(p);
      }
      // koku clock (real time of the time-lapse)
      const m = Math.floor(intro.time.getTime() / 60_000);
      if (m !== lastMinute) {
        lastMinute = m;
        const tz = useApp.getState().tz;
        const k = kokuAt(intro.time, tz);
        if (clockT.current) clockT.current.textContent = fmtClock(intro.time, tz);
        if (clockK.current) clockK.current.textContent = `${k.kanji}の刻`;
        if (clockS.current) clockS.current.textContent = `${k.romaji} no koku · hour of the ${k.animal}`;
      }
      caps.forEach((cap, i) => {
        const el = capRefs.current[i];
        if (!el) return;
        const a = smooth(cap.from, cap.from + 0.025, p) * (1 - smooth(cap.to - 0.025, cap.to, p));
        el.style.opacity = a.toFixed(3);
        el.style.transform = `translate(-50%, ${(1 - a) * 14}px)`;
        if (a > 0.01 && capText.current[i]) {
          const txt = cap.text();
          if (capText.current[i]!.textContent !== txt) capText.current[i]!.textContent = txt;
        }
      });
      if (p >= 0.998) {
        done = true;
        finishIntro();
      }
    };

    apply(0);
    const proxy = { p: 0 };
    let tween: gsap.core.Tween | gsap.core.Timeline;
    if (auto) {
      // Return visit: the same timeline, auto-played in 8 s (Skip stays visible).
      tween = gsap.to(proxy, { p: 1, duration: reduced ? 2 : 8, ease: 'power1.inOut', delay: 0.4, onUpdate: () => apply(proxy.p) });
    } else {
      window.scrollTo(0, 0);
      lenis().scrollTo(0, { immediate: true });
      tween = gsap
        .timeline({
          scrollTrigger: {
            trigger: track.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: reduced ? true : 1,
          },
        })
        .to(proxy, { p: 1, ease: 'none', duration: 1, onUpdate: () => apply(proxy.p) });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      const root = document.getElementById('canvas-root');
      if (root) root.style.clipPath = '';
    };
  }, [auto, caps, reduced]);

  const skip = () => {
    if (reduced && fade.current) {
      fade.current.classList.add('on');
      setTimeout(() => {
        finishIntro();
      }, 330);
      return;
    }
    finishIntro();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <>
      {!auto && <div ref={track} className="tw-intro-track" style={{ height: `${TRACK_VH}vh` }} aria-hidden="true" />}
      <div className="tw-intro-ui">
        <IntroFrame ref={frame} />
        <div className="tw-intro-clock" aria-live="off">
          <span ref={clockT} className="t num" />
          <span ref={clockK} className="k" lang="ja" />
          <span ref={clockS} className="s" />
        </div>
        {caps.map((c, i) => (
          <div key={c.eyebrow} className="tw-intro-cap" ref={(el) => void (capRefs.current[i] = el)}>
            <div className="eyebrow">
              <Kanji>{c.jp}</Kanji> · {c.eyebrow}
            </div>
            <p ref={(el) => void (capText.current[i] = el)} />
          </div>
        ))}
        <div className="tw-intro-skip">
          <Button variant="secondary" onClick={skip}>
            Skip intro →
          </Button>
        </div>
      </div>
      <div ref={fade} className="tw-intro-fade" aria-hidden="true" />
    </>
  );
}
