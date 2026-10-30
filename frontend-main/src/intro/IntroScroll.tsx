/**
 * The master intro timeline (§6.5, §7.3): one ScrollTrigger over a ~650vh track, driven by
 * Lenis. Everything — camera, real time-lapse, frame, captions, clock, the in-canvas scene — is a pure
 * function of one progress value, so scrubbing backwards is exact on every visit.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ScrollTrigger, lenis } from '@/app/lenis';
import { useApp } from '@/state/store';
import { Director, EYE } from '@/scene/Director';
import { skyClock } from '@/scene/skyClock';
import { compass16 } from '@/astro/coords';
import { fmtClock, kokuAt } from '@/astro/skytime';
import { Button, Kanji } from '@/ui';
import { P, intro, landForMag, lerp, smooth, timeAt } from '@/scene/intro/introBus';
import { finishIntro, startIntro } from './flow';
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


/** End-of-intro framing = the sky station's own defaults, so the hand-off to phase 'sky' is seamless. */
const SKY_PITCH = 24;
const SKY_FOV = 62;

/**
 * The camera at progress p: eye height at the origin the whole time, facing the real sunset azimuth,
 * lifting toward the stars and meeting the open sky as the last petals land.
 */
function cameraAt(p: number, yaw0: number) {
  const pitch = keys(p, [[0, 6], [P.frameEnd, 7], [P.sunEnd, 8.5], [P.streamEnd, 30], [P.sceneEnd, SKY_PITCH]]) * D;
  const yaw = yaw0 + keys(p, [[0, 0], [P.sunEnd, 2], [P.streamEnd, -4], [P.sceneEnd, -6]]) * D;
  const fov = keys(p, [[0, 38], [P.frameEnd, 55], [P.streamEnd, 58], [P.sceneEnd, SKY_FOV]]);
  return { pos: EYE, yaw, pitch, fov };
}

/** The heading the intro ends on (used by finishIntro for Director.station('sky', { yaw })). */
export const endYaw = (yaw0Deg: number) => (yaw0Deg - 6) * D;

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
  const ui = useRef<HTMLDivElement>(null);
  const clockT = useRef<HTMLSpanElement>(null);
  const clockK = useRef<HTMLSpanElement>(null);
  const clockS = useRef<HTMLSpanElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capText = useRef<(HTMLParagraphElement | null)[]>([]);
  const fade = useRef<HTMLDivElement>(null);
  const place = useApp((s) => s.place);
  const reduced = useApp((s) => s.reducedMotion);

  const caps = useMemo<Cap[]>(() => {
    const tz = () => useApp.getState().tz;
    const city = (place?.label ?? 'you').replace(/^≈\s*/, '');
    return [
      {
        from: 0.18,
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
    ];
  }, [place]);

  useLayoutEffect(() => {
    if (!intro.active) startIntro(); // ?dev=intro enters without the gate
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
      if (ui.current) ui.current.style.opacity = (1 - smooth(P.landEnd, P.sceneEnd, p)).toFixed(3);
      if (Math.abs(p - lastStore) > 0.002 || p >= P.sceneEnd) {
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
        el.style.transform = `translate(-50%, ${reduced ? 0 : (1 - a) * 14}px)`;
        if (a > 0.01 && capText.current[i]) {
          const txt = cap.text();
          if (capText.current[i]!.textContent !== txt) capText.current[i]!.textContent = txt;
        }
      });
    };

    // Let completion follow the actual scroll position rather than tween interpolation.
    // Finish within the last pixel so fractional viewport heights cannot strand the intro.
    const update = (self: ScrollTrigger) => {
      if (done) return;
      const atEnd = self.progress > 0 && self.scroll() >= self.end - 1;
      apply(atEnd ? P.sceneEnd : self.progress * P.sceneEnd);
      if (atEnd) {
        done = true;
        finishIntro();
      }
    };

    window.scrollTo(0, 0);
    lenis().scrollTo(0, { immediate: true });
    apply(0);
    const scroll = ScrollTrigger.create({
      trigger: track.current,
      start: 'top top',
      end: 'max',
      onUpdate: update,
      onRefresh: update,
    });
    // The intro mounts before PhaseSync releases the window's scroll lock.
    const refresh = requestAnimationFrame(() => {
      lenis().resize();
      ScrollTrigger.refresh();
    });
    return () => {
      done = true;
      cancelAnimationFrame(refresh);
      scroll.kill();
      const root = document.getElementById('canvas-root');
      if (root) root.style.clipPath = '';
    };
  }, [caps, reduced]);

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
      <div ref={track} className="tw-intro-track" style={{ height: `${TRACK_VH}svh` }} aria-hidden="true" />
      <div ref={ui} className="tw-intro-ui">
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
