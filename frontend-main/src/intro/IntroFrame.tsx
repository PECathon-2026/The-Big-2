/**
 * The crimson frame (§7.3 first frame, §10.4). ScrollExpand's math (startWidth 42 / startHeight 58,
 * smoothstep, radius → 0) driven by the master timeline instead of its own scroll listener:
 *   - #canvas-root is clipped to the frame (NOTES contract; cleared when the frame is open / intro ends)
 *   - outside it: urushi lacquer with a faint gold seigaiha wave pattern, a gold hairline at the frame
 *   - the eyebrow and hero title above, the scroll hint below
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { P, smooth } from '@/scene/intro/introBus';
import { Kanji } from '@/ui';

export interface FrameHandle {
  update(p: number): void;
}

const START_W = 42;
const START_H = 58;
const START_R = 6;

const IntroFrame = forwardRef<FrameHandle>(function IntroFrame(_, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const fill = useRef<SVGPathElement>(null);
  const wave = useRef<SVGPathElement>(null);
  const line = useRef<SVGRectElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const last = useRef(-1);

  useImperativeHandle(ref, () => ({
    update(p: number) {
      const e = smooth(0, 1, Math.min(1, p / P.frameEnd));
      const key = Math.round(e * 2000);
      if (key === last.current) return;
      last.current = key;
      const root = document.getElementById('canvas-root');
      const open = e >= 0.999;
      if (svg.current) svg.current.style.display = open ? 'none' : '';
      if (open) {
        if (root) root.style.clipPath = '';
        if (hero.current) hero.current.style.opacity = '0';
        if (hint.current) hint.current.style.opacity = '0';
        return;
      }
      const W = window.innerWidth;
      const H = window.innerHeight;
      const w = START_W + (100 - START_W) * e;
      const h = START_H + (100 - START_H) * e;
      const ix = ((100 - w) / 2 / 100) * W;
      const iy = ((100 - h) / 2 / 100) * H;
      const r = START_R * (1 - e);
      if (root) root.style.clipPath = `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${r}px)`;
      const x0 = ix, y0 = iy, x1 = W - ix, y1 = H - iy;
      const inner = `M${x0 + r} ${y0}H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}Z`;
      const d = `M0 0H${W}V${H}H0Z${inner}`;
      fill.current?.setAttribute('d', d);
      wave.current?.setAttribute('d', d);
      if (line.current) {
        line.current.setAttribute('x', `${x0 - 0.5}`);
        line.current.setAttribute('y', `${y0 - 0.5}`);
        line.current.setAttribute('width', `${x1 - x0 + 1}`);
        line.current.setAttribute('height', `${y1 - y0 + 1}`);
        line.current.setAttribute('rx', `${r}`);
        line.current.style.opacity = `${1 - e}`;
      }
      const fadeOut = 1 - smooth(0.05, 0.6, e);
      if (hero.current) {
        hero.current.style.bottom = `${H - y0 + 22}px`;
        hero.current.style.opacity = `${fadeOut}`;
        hero.current.style.transform = `translateY(${-24 * (1 - fadeOut)}px)`;
      }
      if (hint.current) {
        hint.current.style.top = `${y1 + 20}px`;
        const g = 1 - smooth(0, 0.25, e);
        hint.current.style.opacity = `${g}`;
        hint.current.style.transform = `translateY(${8 * (1 - g)}px)`;
      }
      if (svg.current) svg.current.style.opacity = `${1 - smooth(0.82, 1, e)}`;
    },
  }));

  return (
    <>
      <svg ref={svg} className="tw-intro-frame" aria-hidden="true">
        <defs>
          <pattern id="tw-seigaiha" width="48" height="24" patternUnits="userSpaceOnUse">
            {[
              [24, 12],
              [0, 24],
              [48, 24],
            ].map(([cx, cy]) => (
              <g key={`${cx},${cy}`}>
                <circle cx={cx} cy={cy} r={23} style={{ fill: "var(--urushi)", stroke: "var(--gold)" }} strokeWidth="1" />
                <circle cx={cx} cy={cy} r={17} fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1" />
                <circle cx={cx} cy={cy} r={11} fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1" />
                <circle cx={cx} cy={cy} r={5} fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1" />
              </g>
            ))}
          </pattern>
          <radialGradient id="tw-lacquer" cx="50%" cy="45%" r="75%">
            <stop offset="0" style={{ stopColor: "var(--crimson)" }} />
            <stop offset=".55" style={{ stopColor: "var(--urushi)" }} />
            <stop offset="1" style={{ stopColor: "var(--urushi-deep)" }} />
          </radialGradient>
        </defs>
        <path ref={fill} fillRule="evenodd" fill="url(#tw-lacquer)" />
        <path ref={wave} fillRule="evenodd" fill="url(#tw-seigaiha)" opacity=".06" style={{ mixBlendMode: 'screen' }} />
        <rect ref={line} fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1" />
      </svg>
      <div ref={hero} className="tw-intro-hero">
        <div className="eyebrow">
          <Kanji>月読</Kanji> · TSUKUYOMI WATCH
        </div>
        <h1>
          The night begins at <em>dusk</em>.
        </h1>
      </div>
      <div ref={hint} className="tw-intro-hint">
        Scroll into the night <i>↓</i>
      </div>
    </>
  );
});

export default IntroFrame;
