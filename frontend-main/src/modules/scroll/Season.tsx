/** /scroll extras: the current sekki and kō (GET /api/scroll/season), and a test Web Push (POST /api/alerts/test). */
import { useState } from 'react';
import { api, type Season } from '@/data/api';
import { ensureSubscribed, pushSupported } from '@/data/push';
import { fmtNum, fmtTime } from '@/data/format';
import { useApp } from '@/state/store';
import { BrushLine, Card, Divider, InfoPopover, Kanji } from '@/ui';
import { DataState, Reveal } from '../_ui/kit';
import type { PageData } from '../_ui/usePageData';

/** Mean apparent motion of the Sun in ecliptic longitude, degrees per day. Real speed varies ±3 % over the year. */
const SUN_DEG_PER_DAY = 360 / 365.2422;

/**
 * Start/end of the segment the Sun is in, from its longitude now. Each sekki is 15° of longitude, each kō 5°.
 * Dates are estimated with the Sun's mean motion, so they can be off by up to about a day.
 */
function span(lon: number, width: number, now: number) {
  const start = Math.floor(lon / width) * width;
  const daysIn = (lon - start) / SUN_DEG_PER_DAY;
  const daysLeft = (start + width - lon) / SUN_DEG_PER_DAY;
  return { startDeg: start, from: new Date(now - daysIn * 86_400_000), to: new Date(now + daysLeft * 86_400_000), daysIn, daysLeft };
}

function fmtDay(d: Date, tz?: string) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
}

export function SeasonCard({ season }: { season: PageData<Season> }) {
  const tz = useApp((s) => s.tz);
  const d = season.data;
  const now = season.computedAt ? new Date(season.computedAt).getTime() : Date.now();
  const sk = d ? span(d.sun_longitude, 15, now) : null;
  const ko = d ? span(d.sun_longitude, 5, now) : null;
  return (
    <>
      <DataState status={season.status} error={season.error} stale={season.stale} hasData={!!d} what="Reading the Sun's longitude…" onRetry={season.reload} />
      {d && sk && ko && (
        <Reveal>
          <Card
            brand={{ kanji: '節', text: 'The season now' }}
            tag={`☉ ${fmtNum(d.sun_longitude, 1)}°`}
            className="sc-season"
          >
            <div className="pg-grid two sc-season-grid">
              <div>
                <span className="pg-label">Sekki {d.sekki.index} of 24 · 二十四節気</span>
                <p className="sc-season-kanji" lang="ja">
                  {d.sekki.kanji}
                </p>
                <p className="sc-season-romaji">{d.sekki.romaji}</p>
                <BrushLine />
                <p className="sc-season-meaning">{d.sekki.meaning}</p>
                <dl className="pg-kv">
                  <dt>Began</dt>
                  <dd>
                    ≈ {fmtDay(sk.from, tz)} · ☉ {sk.startDeg}°
                  </dd>
                  <dt>Next sekki</dt>
                  <dd>
                    ≈ {fmtDay(sk.to, tz)} · in {fmtNum(sk.daysLeft, 1)} d
                  </dd>
                </dl>
              </div>
              <div>
                <span className="pg-label">Kō {d.ko.index} of 72 · 七十二候</span>
                <p className="sc-season-kanji ko" lang="ja">
                  {d.ko.kanji}
                </p>
                <p className="sc-season-romaji">microseason</p>
                <BrushLine />
                <p className="sc-season-meaning">{d.ko.meaning}</p>
                <dl className="pg-kv">
                  <dt>Began</dt>
                  <dd>
                    ≈ {fmtDay(ko.from, tz)} · ☉ {ko.startDeg}°
                  </dd>
                  <dt>Next kō</dt>
                  <dd>
                    ≈ {fmtDay(ko.to, tz)} · in {fmtNum(ko.daysLeft, 1)} d
                  </dd>
                </dl>
              </div>
            </div>
            <Divider />
            <p className="pg-quiet">
              <Kanji>☉</Kanji> The Sun's ecliptic longitude is computed exactly; a new sekki starts every 15° and a kō every 5°. Start and end dates are estimated from the Sun's mean motion (±1 day).
              <InfoPopover
                title="Season"
                provenance={season.provenance}
                computedAt={season.computedAt}
                notes={`Sun longitude ${fmtNum(d.sun_longitude, 3)}° at ${fmtTime(season.computedAt, tz, true)}. Dates use ${SUN_DEG_PER_DAY.toFixed(4)}°/day; the real rate varies about 3 % through the year.`}
              />
            </p>
          </Card>
        </Reveal>
      )}
    </>
  );
}

type TState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

/** Sends one push to this browser right now, so you can see notifications work before relying on a reminder. */
export function TestPush() {
  const [st, setSt] = useState<TState>({ kind: 'idle' });
  if (!pushSupported()) return null;
  const run = async () => {
    setSt({ kind: 'busy' });
    try {
      const endpoint = await ensureSubscribed();
      const r = await api.alerts.test(endpoint, 0);
      const dlv = r.delivery;
      if (r.status === 'failed' || (dlv && dlv.sent === 0)) setSt({ kind: 'error', text: r.error ?? `server sent ${dlv?.sent ?? 0}, failed ${dlv?.failed ?? 0}, gone ${dlv?.gone ?? 0}` });
      else setSt({ kind: 'done', text: dlv ? `Server sent ${dlv.sent} push${dlv.sent === 1 ? '' : 'es'}${dlv.failed ? `, ${dlv.failed} failed` : ''}. It should appear in a moment.` : `Queued (${r.status}).` });
    } catch (e) {
      setSt({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="sc-remind sc-testpush">
      <button className="tw-btn secondary" onClick={() => void run()} disabled={st.kind === 'busy'} style={{ minHeight: 34 }}>
        {st.kind === 'busy' ? 'Sending…' : 'Send a test notification'}
      </button>
      {st.kind === 'done' && <span className="pg-quiet">{st.text}</span>}
      {st.kind === 'error' && (
        <span className="pg-quiet" role="alert">
          Not sent: {st.text}
        </span>
      )}
    </span>
  );
}
