/**
 * 旧暦 lunar calendar as a horizontal emakimono (§9.3): a washi strip that scrolls sideways by drag or
 * wheel. Each day: Moon glyph, date, lunar day, sekki / kō, and event seals (gold meteor, grey ISS,
 * crimson eclipse). Today is ringed in crimson. Data: /api/scroll/calendar (+ events for the seals).
 */
import { useEffect, useMemo, useRef } from 'react';
import type { CalendarDay, Eclipse, LunarCalendar, SkyEvent } from '@/data/api';
import { Kanji } from '@/ui';
import { MoonGlyph } from '../_ui/kit';

const WD = ['月', '火', '水', '木', '金', '土', '日']; // API weekday: Monday = 0

function dayKey(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function EmakiCalendar({ cal, events, eclipses, tz }: { cal: LunarCalendar; events: SkyEvent[]; eclipses: Eclipse[]; tz: string }) {
  const track = useRef<HTMLDivElement>(null);
  const seals = useMemo(() => {
    const m = new Map<string, { meteor: number; iss: number; eclipse: number; titles: string[] }>();
    const add = (k: string, kind: 'meteor' | 'iss' | 'eclipse', title: string) => {
      const v = m.get(k) ?? { meteor: 0, iss: 0, eclipse: 0, titles: [] };
      v[kind]++;
      v.titles.push(title);
      m.set(k, v);
    };
    for (const e of events) {
      if (e.kind === 'meteor') add(dayKey(e.start, tz), 'meteor', e.title);
      else if (e.kind === 'satellite') add(dayKey(e.start, tz), 'iss', e.title);
      else if (e.kind === 'eclipse') add(dayKey(e.start, tz), 'eclipse', e.title);
    }
    for (const e of eclipses) add(dayKey(e.peak, tz), 'eclipse', `${e.type} eclipse · ${e.kind}`);
    return m;
  }, [events, eclipses, tz]);

  // centre today on mount / month change
  useEffect(() => {
    const el = track.current;
    const today = el?.querySelector<HTMLElement>('[data-today="true"]');
    if (el && today) el.scrollLeft = today.offsetLeft - el.clientWidth / 2 + today.clientWidth / 2;
    else if (el) el.scrollLeft = 0;
  }, [cal]);

  // vertical wheel → sideways scroll; drag to scroll
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return; // let the page scroll on at the ends
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    let down: { x: number; left: number; id: number } | null = null;
    const pd = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      down = { x: e.clientX, left: el.scrollLeft, id: e.pointerId };
    };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      if (Math.abs(e.clientX - down.x) > 4 && !el.hasPointerCapture(down.id)) el.setPointerCapture(down.id);
      el.scrollLeft = down.left - (e.clientX - down.x);
    };
    const pu = () => (down = null);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);
    el.addEventListener('pointercancel', pu);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('pointercancel', pu);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const el = track.current;
    if (!el) return;
    if (e.key === 'ArrowRight') el.scrollBy({ left: 120, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') el.scrollBy({ left: -120, behavior: 'smooth' });
  };

  let prevSekki = -1;
  return (
    <div className="pg-emaki">
      <div className="pg-emaki-track pg-washi sc-cal" ref={track} tabIndex={0} onKeyDown={onKey} role="region" aria-label="Lunar calendar scroll, use arrow keys to move" data-lenis-prevent data-cursor="off">
        <ol className="sc-cal-row">
          {cal.days.map((d: CalendarDay) => {
            const s = seals.get(d.date);
            const newSekki = d.sekki.index !== prevSekki;
            prevSekki = d.sekki.index;
            return (
              <li key={d.date} className={`sc-day ${d.is_today ? 'today' : ''} ${d.is_full_moon ? 'full' : ''} ${d.is_new_moon ? 'new' : ''}`} data-today={d.is_today}>
                <span className="sc-day-wd" lang="ja">
                  {WD[d.weekday]}
                </span>
                <span className="sc-day-n num">{Number(d.date.slice(-2))}</span>
                <MoonGlyph phaseDeg={d.phase_deg} size={34} lit="var(--moon-warm)" dark="rgba(27,26,32,.82)" label={`${d.moon_name.romaji}, ${Math.round(d.illumination * 100)}% lit`} />
                <span className="sc-day-moon" lang="ja" title={`${d.moon_name.romaji} · ${d.moon_name.meaning}`}>
                  {d.moon_name.kanji}
                </span>
                <span className="sc-day-lunar num">
                  {d.lunar_month}月{d.lunar_day}日
                </span>
                {newSekki ? (
                  <span className="sc-day-sekki" title={`${d.sekki.romaji} · ${d.sekki.meaning}`}>
                    <Kanji>{d.sekki.kanji}</Kanji>
                    <small>{d.sekki.romaji}</small>
                  </span>
                ) : (
                  <span className="sc-day-ko" lang="ja" title={d.ko.meaning}>
                    {d.ko.kanji}
                  </span>
                )}
                <span className="sc-day-seals" aria-label={s ? s.titles.join('; ') : 'no events'}>
                  {s?.meteor ? <i className="seal meteor" title="meteor shower" /> : null}
                  {s?.iss ? <i className="seal iss" title="ISS pass" /> : null}
                  {s?.eclipse ? <i className="seal eclipse" title="eclipse" /> : null}
                </span>
                {d.is_full_moon && <span className="sc-day-tag">満月 full</span>}
                {d.is_new_moon && <span className="sc-day-tag">新月 new</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
