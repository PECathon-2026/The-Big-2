/**
 * /honor — 誉 Homare (§9.5). A rank banner, "Log tonight's watch" (gated by the real verdict or a visible
 * event at sky time), a hanko stamp, and a journal kept in this browser (localStorage) drawn as a washi
 * emakimono. Each entry snapshots the conditions from /api/watchtower/score at the moment it was logged.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useTonight } from '@/data/tonight';
import { fmtNum, fmtTime } from '@/data/format';
import { cue } from '@/audio/engine';
import { useApp } from '@/state/store';
import { Button, Card, Chip, Divider, InfoPopover, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { MoonGlyph, Num, Reveal, SectionHead } from '../_ui/kit';
import './honor.css';

const KEY = 'tsukuyomi-honor-journal-v1';

interface Entry {
  id: string;
  at: string; // ISO, real time of logging
  sky: string; // ISO, sky time logged for
  night: string; // night_start from the score (one log per night)
  place: { label: string; lat: number; lon: number };
  tz: string;
  score: number;
  verdict: string;
  headline: string;
  bortle: number | null;
  window: string | null;
  moon: { phase: number; kanji: string; romaji: string; illum: number } | null;
  reason: string; // why the log was allowed
  points: number;
}

const RANKS = [
  { min: 0, jp: '足軽', romaji: 'Ashigaru', en: 'foot soldier' },
  { min: 30, jp: '侍', romaji: 'Samurai', en: 'retainer of the night' },
  { min: 60, jp: '大名', romaji: 'Daimyō', en: 'lord of a domain of sky' },
  { min: 100, jp: '将軍', romaji: 'Shōgun', en: 'commander of the watch' },
];

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}
function save(list: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the journal lives only for this visit */
  }
}

/** Points: 10 for keeping the watch + 1 per 10 points of that night's score (stated on the page). */
const pointsFor = (score: number) => 10 + Math.floor(score / 10);

/** The demo's hanko: crimson filled seal with 月読 in two lines and a rough edge. */
function Hanko({ size = 64, animate = false, kanji = ['月', '読'] }: { size?: number; animate?: boolean; kanji?: [string, string] | string[] }) {
  const fid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} className={`hn-hanko ${animate ? 'stamp' : ''}`} role="img" aria-label={`seal ${kanji.join('')}`}>
      <defs>
        <filter id={`r-${fid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
        </filter>
      </defs>
      <g filter={`url(#r-${fid})`}>
        <rect x="4" y="4" width="52" height="52" rx="3" fill="var(--shu)" />
        <rect x="9" y="9" width="42" height="42" rx="2" fill="none" stroke="var(--kinu)" strokeWidth="1.5" opacity=".8" />
        <text x="30" y="27" textAnchor="middle" fontFamily="'Shippori Mincho', serif" fontSize="17" fill="var(--kinu)" fontWeight="700">
          {kanji[0]}
        </text>
        <text x="30" y="46" textAnchor="middle" fontFamily="'Shippori Mincho', serif" fontSize="17" fill="var(--kinu)" fontWeight="700">
          {kanji[1]}
        </text>
      </g>
    </svg>
  );
}

export default function Honor() {
  const score = useTonight((s) => s.score);
  const moon = useTonight((s) => s.moon);
  const events = useTonight((s) => s.events);
  const passes = useTonight((s) => s.passes);
  const place = useApp((s) => s.place);
  const tz = useApp((s) => s.tz);
  const offsetMs = useApp((s) => s.offsetMs);
  const [journal, setJournal] = useState<Entry[]>(load);
  const [justStamped, setJustStamped] = useState<string | null>(null);

  useEffect(() => save(journal), [journal]);

  const total = journal.reduce((a, e) => a + e.points, 0);
  const rank = [...RANKS].reverse().find((r) => total >= r.min) ?? RANKS[0];
  const next = RANKS.find((r) => r.min > total) ?? null;
  const prevMin = rank.min;
  const progress = next ? (total - prevMin) / (next.min - prevMin) : 1;

  const n = score.data;
  const skyNow = new Date(Date.now() + offsetMs);

  // Gate (§9.5): allowed when tonight's verdict is not stay_in, or something is visible at sky time.
  const gate = useMemo(() => {
    if (!n) return { ok: false, why: 'Waiting for tonight’s forecast…', reason: '' };
    if (journal.some((e) => e.night === n.night_start)) return { ok: false, why: 'You have already kept tonight’s watch. One seal per night.', reason: '' };
    if (n.verdict.verdict !== 'stay_in') return { ok: true, why: '', reason: `verdict ${n.verdict.verdict.replace('_', ' ')} · ${Math.round(n.verdict.score)}` };
    const t = skyNow.getTime();
    const ev = (events.data ?? []).find((e) => e.visible_from_here && Math.abs(new Date(e.start).getTime() - t) < 90 * 60_000);
    if (ev) return { ok: true, why: '', reason: `${ev.title} visible at sky time` };
    const ps = (passes.data ?? []).find((p) => p.visible && new Date(p.start).getTime() - 15 * 60_000 <= t && t <= new Date(p.end).getTime() + 15 * 60_000);
    if (ps) return { ok: true, why: '', reason: `${ps.satellite} pass visible at sky time` };
    return { ok: false, why: `The sky says stay in tonight (${n.verdict.reason}). Turn the time compass to a visible event, or come back on a clearer night.`, reason: '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, journal, events.data, passes.data, Math.floor(offsetMs / 60_000)]);

  const log = () => {
    if (!n || !place || !gate.ok) return;
    const m = moon.data;
    const e: Entry = {
      id: `${Date.now()}`,
      at: new Date().toISOString(),
      sky: skyNow.toISOString(),
      night: n.night_start,
      place: { label: place.label, lat: +place.lat.toFixed(2), lon: +place.lon.toFixed(2) },
      tz,
      score: n.verdict.score,
      verdict: n.verdict.verdict,
      headline: n.verdict.headline,
      bortle: n.bortle,
      window: n.best_window ? `${n.best_window.start_local}–${n.best_window.end_local}` : null,
      moon: m ? { phase: m.phase_deg, kanji: m.name.kanji, romaji: m.name.romaji, illum: m.illumination } : null,
      reason: gate.reason,
      points: pointsFor(n.verdict.score),
    };
    setJournal((j) => [e, ...j]);
    setJustStamped(e.id);
    cue('thud');
  };

  return (
    <PageFrame
      seal="誉"
      eyebrow="五 · 誉 Homare · Honor"
      title={
        <>
          Keep the <em>watch</em>.
        </>
      }
      lede="Each night you go out under a sky worth seeing, stamp it. Your seals stay in this browser only: nothing leaves your device."
    >
      <Reveal>
        <Card spotlight brand={{ kanji: '位', text: 'Your rank' }} tag={`№ ${String(journal.length).padStart(2, '0')}`} className="hn-banner">
          <div className="hn-banner-row">
            <div className="hn-rank-seal" lang="ja" aria-hidden="true">
              {rank.jp}
            </div>
            <div className="hn-rank-text">
              <p className="hn-rank-name">
                {rank.romaji} <span className="pg-quiet">· {rank.en}</span>
              </p>
              <p className="hn-points">
                <Num value={total} /> <span className="pg-label">honor</span>
              </p>
              <div className="hn-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={next ? `Progress to ${next.romaji}` : 'Highest rank'}>
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="pg-quiet">{next ? `${next.min - total} honor to ${next.jp} ${next.romaji}` : 'The highest rank. The night is yours.'} · each watch earns 10, plus 1 per 10 points of that night's score.</p>
            </div>
            <ol className="hn-ladder" aria-label="Ranks">
              {RANKS.map((r) => (
                <li key={r.min} className={total >= r.min ? 'got' : ''}>
                  <Kanji>{r.jp}</Kanji>
                  <span>{r.romaji}</span>
                  <span className="num">{r.min}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </Reveal>

      <section className="pg-section" id="log">
        <SectionHead jp="記帳" eyebrow="Tonight" right={n && <InfoPopover title="Conditions snapshot" trace={n.trace} provenance={score.provenance} computedAt={score.computedAt} />}>
          Stamp the <em>night</em>.
        </SectionHead>
        <Reveal>
          <Card plain className="hn-log">
            <div className="hn-log-row">
              <div className="hn-stamp-slot" aria-live="polite">
                {justStamped ? <Hanko size={110} animate key={justStamped} /> : <span className="hn-stamp-ghost" aria-hidden="true">印</span>}
              </div>
              <div>
                {n ? (
                  <p className="hn-cond">
                    <strong>{n.verdict.headline}</strong> Score <span className="num">{Math.round(n.verdict.score)}</span>
                    {n.bortle != null && <> · Bortle {fmtNum(n.bortle, 1)}</>}
                    {n.best_window && (
                      <>
                        {' '}
                        · best {n.best_window.start_local}–{n.best_window.end_local}
                      </>
                    )}
                    {moon.data && <> · {moon.data.name.romaji}, {Math.round(moon.data.illumination * 100)}% lit</>}
                  </p>
                ) : (
                  <p className="pg-loading">Reading tonight's forecast…</p>
                )}
                <Button variant="commit" onClick={log} disabled={!gate.ok} aria-describedby="hn-why">
                  Log tonight's watch · 記帳
                </Button>
                <p id="hn-why" className="pg-quiet hn-why">
                  {gate.ok ? `Allowed: ${gate.reason}. Logs ${fmtTime(skyNow.toISOString(), tz, true)} at ${place?.label ?? 'your place'}.` : gate.why}
                </p>
                {justStamped && <p className="hn-done">Sealed. +{journal[0]?.points ?? 0} honor.</p>}
              </div>
            </div>
          </Card>
        </Reveal>
      </section>

      <section className="pg-section" id="journal">
        <SectionHead
          jp="日誌"
          eyebrow={`Nisshi · journal · ${journal.length} ${journal.length === 1 ? 'watch' : 'watches'}`}
          right={
            journal.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm('Erase every seal in this browser? This cannot be undone.')) setJournal([]);
                }}
              >
                erase journal
              </Button>
            )
          }
        >
          The scroll of <em>nights</em>.
        </SectionHead>
        {journal.length === 0 ? (
          <p className="pg-quiet">No seals yet. Your first watch will be drawn here.</p>
        ) : (
          <div className="pg-emaki">
            <div className="pg-emaki-track pg-washi hn-scroll" tabIndex={0} role="region" aria-label="Journal scroll" data-lenis-prevent data-cursor="off">
              <ol className="hn-entries">
                {journal.map((e) => (
                  <li key={e.id} className="hn-entry">
                    <Hanko size={54} />
                    <span className="hn-date num">{fmtTime(e.sky, e.tz, true)}</span>
                    {e.moon && <MoonGlyph phaseDeg={e.moon.phase} size={30} lit="var(--moon-warm)" dark="rgba(27,26,32,.82)" label={`${e.moon.romaji}, ${Math.round(e.moon.illum * 100)}% lit`} />}
                    {e.moon && (
                      <span className="hn-moon" lang="ja" title={e.moon.romaji}>
                        {e.moon.kanji}
                      </span>
                    )}
                    <span className="hn-place">{e.place.label}</span>
                    <span className="hn-score num">{Math.round(e.score)}</span>
                    <span className="pg-label">{e.verdict.replace('_', ' ')}</span>
                    <span className="hn-meta num">
                      {e.bortle != null && `Bortle ${fmtNum(e.bortle, 1)}`}
                      {e.window && <br />}
                      {e.window && `best ${e.window}`}
                    </span>
                    <span className="hn-pts">+{e.points}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
        <Divider />
        <p className="pg-quiet">
          Stored only in this browser (localStorage key <code>{KEY}</code>). Conditions are copied from <Tag>/api/watchtower/score</Tag> at the moment of logging. {!journal.length && <Chip variant="provenance">empty</Chip>}
        </p>
      </section>
    </PageFrame>
  );
}
