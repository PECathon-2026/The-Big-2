/**
 * Next-event countdown, top-right (§8.7): the next event visible from here (/api/scroll/events, plus
 * visible ISS passes), `DAYS 日 · HOURS 時 · MINS 分 · SECS 秒`, crimson beacon under an hour. Click dives.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTonight } from '@/data/tonight';
import { app, useApp, type SkyObject } from '@/state/store';
import { Director } from '@/scene/Director';
import { chapterTarget } from './nav';
import { fmtClock } from '@/astro/skytime';
import { cue } from '@/audio/engine';

interface Next {
  title: string;
  jp: string | null;
  at: number;
  route: string;
  objId: string | null;
}

const ROUTE: Record<string, [string, string | null]> = {
  moon: ['/scroll#moon', 'moon'],
  meteor: ['/scroll#meteors', 'meteor-radiant'],
  satellite: ['/scroll#passes', 'iss'],
  planet: ['/scroll#planets', null],
  eclipse: ['/scroll#eclipses', null],
  launch: ['/scroll#launches', null],
};

export default function Countdown() {
  const events = useTonight((s) => s.events.data);
  const passes = useTonight((s) => s.passes.data);
  const tz = useApp((s) => s.tz);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);

  const minute = Math.floor(now / 60_000);
  const next = useMemo<Next | null>(() => {
    const t = minute * 60_000;
    const list: Next[] = [];
    for (const e of events ?? []) {
      const at = Date.parse(e.start);
      if (!e.visible_from_here || !(at > t)) continue;
      const [route, objId] = ROUTE[e.kind] ?? ['/scroll#events', null];
      list.push({ title: e.title, jp: e.jp, at, route, objId });
    }
    for (const p of passes ?? []) {
      const at = Date.parse(p.start);
      if (!p.visible || !(at > t)) continue;
      list.push({ title: `${p.satellite} pass · ${Math.round(p.max_alt)}° up`, jp: '国際宇宙ステーション', at, route: '/scroll#passes', objId: 'iss' });
    }
    list.sort((a, b) => a.at - b.at);
    return list[0] ?? null;
  }, [events, passes, minute]);

  if (!next) return null;
  const left = Math.max(0, Math.floor((next.at - now) / 1000));
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const soon = left < 3600;
  const pad = (n: number) => String(n).padStart(2, '0');

  const dive = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const objects = app().objects;
    const obj: SkyObject = (next.objId && objects[next.objId]) || chapterTarget('/scroll');
    cue('pluck');
    void Director.diveTo(obj, { x: r.left + r.width / 2, y: r.bottom - 10 }, next.route);
  };

  return (
    <button className="hud-count hud-bar" onClick={dive} aria-label={`Next: ${next.title} at ${fmtClock(new Date(next.at), tz, true)}, in ${d} days ${h} hours ${m} minutes. Open in the Celestial Scroll`}>
      <span className="lbl">
        {soon && <span className="beacon" aria-hidden="true" />}
        <span className="t">Next · {next.title}</span>
      </span>
      <span className="digits num" aria-hidden="true">
        {d > 0 && (
          <span className="unit">
            <span className="n">{d}</span>
            <span className="ku"><span className="k" lang="ja">日</span><span className="u">Days</span></span>
          </span>
        )}
        <span className="unit">
          <span className="n">{pad(h)}</span>
          <span className="ku"><span className="k" lang="ja">時</span><span className="u">Hours</span></span>
        </span>
        <span className="unit">
          <span className="n">{pad(m)}</span>
          <span className="ku"><span className="k" lang="ja">分</span><span className="u">Mins</span></span>
        </span>
        <span className="unit">
          <span className="n">{pad(s)}</span>
          <span className="ku"><span className="k" lang="ja">秒</span><span className="u">Secs</span></span>
        </span>
      </span>
    </button>
  );
}
