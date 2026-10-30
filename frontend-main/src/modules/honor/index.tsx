/**
 * /honor — 誉 Homare (§9.5) on the real ledger (/api/honor). "Log tonight's watch" posts a claim to
 * /observe; the server checks it against the sky (Moon up, dark enough, inside the event's window) and
 * answers with a verdict and a reason. Accepted claims get the hanko stamp and points; rejected ones show
 * why, with zero points. The rank banner and the journal come from /ledger. A stable anonymous user id
 * lives in localStorage. A finished, plate-solved Lens job can be attached for the photo bonus.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { api, type HonorRank, type Ledger, type ObserveResult, type Observation } from '@/data/api';
import { useTonight } from '@/data/tonight';
import { fmtNum, fmtTime, kindGlyph } from '@/data/format';
import { cue } from '@/audio/engine';
import { useApp } from '@/state/store';
import { Button, Card, Chip, Divider, InfoPopover, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { DataState, Num, Reveal, SectionHead } from '../_ui/kit';
import './honor.css';

const USER_KEY = 'tsukuyomi-honor-user';
export const LAST_JOB_KEY = 'tsukuyomi-last-lens-job';

function userId(): string {
  try {
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = `tw-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`}`;
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return 'tw-ephemeral';
  }
}
function lastJob(): string {
  try {
    return localStorage.getItem(LAST_JOB_KEY) ?? '';
  } catch {
    return '';
  }
}

const KIND_JP: Record<string, string> = { moon: '月', planet: '惑', meteor: '流', satellite: '衛', launch: '発', eclipse: '食', deepsky: '雲', custom: '他' };
const KIND_EN: Record<string, string> = { moon: 'The Moon', planet: 'A planet', meteor: 'Meteors', satellite: 'A satellite', launch: 'A launch', eclipse: 'An eclipse', deepsky: 'A deep-sky object', custom: 'Something else' };

interface Claim {
  key: string;
  kind: string;
  title: string;
  event_id?: string;
  hint?: string;
}

/** The demo's hanko: crimson filled seal with two kanji and a rough edge. Rejected claims get a grey 否. */
function Hanko({ size = 64, animate = false, kanji = ['月', '読'], rejected = false }: { size?: number; animate?: boolean; kanji?: string[]; rejected?: boolean }) {
  const fid = useId().replace(/:/g, '');
  const fill = rejected ? 'var(--washi-3)' : 'var(--shu)';
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} className={`hn-hanko ${animate ? 'stamp' : ''} ${rejected ? 'rejected' : ''}`} role="img" aria-label={rejected ? 'rejected claim' : `seal ${kanji.join('')}`}>
      <defs>
        <filter id={`r-${fid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
        </filter>
      </defs>
      <g filter={`url(#r-${fid})`}>
        {rejected ? (
          <>
            <circle cx="30" cy="30" r="25" fill="none" stroke={fill} strokeWidth="3" />
            <text x="30" y="38" textAnchor="middle" fontFamily="'Shippori Mincho', serif" fontSize="24" fill={fill} fontWeight="700">
              否
            </text>
          </>
        ) : (
          <>
            <rect x="4" y="4" width="52" height="52" rx="3" fill={fill} />
            <rect x="9" y="9" width="42" height="42" rx="2" fill="none" stroke="var(--kinu)" strokeWidth="1.5" opacity=".8" />
            <text x="30" y="27" textAnchor="middle" fontFamily="'Shippori Mincho', serif" fontSize="17" fill="var(--kinu)" fontWeight="700">
              {kanji[0]}
            </text>
            <text x="30" y="46" textAnchor="middle" fontFamily="'Shippori Mincho', serif" fontSize="17" fill="var(--kinu)" fontWeight="700">
              {kanji[1]}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}

export default function Honor() {
  const score = useTonight((s) => s.score);
  const events = useTonight((s) => s.events);
  const planets = useTonight((s) => s.planets);
  const moon = useTonight((s) => s.moon);
  const place = useApp((s) => s.place);
  const tz = useApp((s) => s.tz);
  const offsetMs = useApp((s) => s.offsetMs);
  const uid = useMemo(userId, []);

  const [ranks, setRanks] = useState<{ ranks: HonorRank[]; points: Record<string, number>; photo_bonus: number } | null>(null);
  const [ledger, setLedger] = useState<{ data: Ledger | null; status: 'loading' | 'ok' | 'error'; error: string | null }>({ data: null, status: 'loading', error: null });
  const [claimKey, setClaimKey] = useState<string>('');
  const [note, setNote] = useState('');
  const [jobId, setJobId] = useState(lastJob);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ObserveResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.honor
      .ledger(uid)
      .then((d) => setLedger({ data: d, status: 'ok', error: null }))
      .catch((e) => setLedger((l) => ({ ...l, status: 'error', error: e instanceof Error ? e.message : String(e) })));
  }, [uid]);
  useEffect(() => {
    reload();
    api.honor.ranks().then(setRanks).catch(() => setRanks(null));
  }, [reload]);

  // What you can claim: tonight's visible events, the Moon, each planet up, a deep-sky object, or anything else.
  const claims = useMemo<Claim[]>(() => {
    const list: Claim[] = [];
    const t = Date.now() + offsetMs;
    for (const e of events.data ?? []) {
      if (!e.visible_from_here || new Date(e.start).getTime() > t + 12 * 3600_000) continue;
      if (!['meteor', 'satellite', 'launch', 'eclipse'].includes(e.kind)) continue;
      list.push({ key: `ev:${e.id}`, kind: e.kind, title: e.title, event_id: e.id, hint: e.start_local });
    }
    const m = moon.data;
    list.unshift({ key: 'moon', kind: 'moon', title: m ? `The Moon · ${m.name.romaji}` : 'The Moon', hint: m ? `${Math.round(m.illumination * 100)}% lit` : undefined });
    for (const p of planets.data ?? []) if (p.naked_eye) list.push({ key: `pl:${p.name}`, kind: 'planet', title: p.name, hint: p.up_now ? 'up now' : `rises ${p.rise ? fmtTime(p.rise, tz) : '—'}` });
    list.push({ key: 'deepsky', kind: 'deepsky', title: 'A deep-sky object' });
    list.push({ key: 'custom', kind: 'custom', title: 'Something else' });
    return list;
  }, [events.data, moon.data, planets.data, offsetMs, tz]);
  useEffect(() => {
    if (!claimKey && claims.length) setClaimKey(claims[0].key);
  }, [claims, claimKey]);
  const claim = claims.find((c) => c.key === claimKey) ?? null;

  const future = offsetMs > 60_000;
  const skyIso = new Date(Date.now() + Math.min(0, offsetMs)).toISOString();

  const submit = async () => {
    if (!place || !claim) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.honor.observe({
        user_id: uid,
        lat: +place.lat.toFixed(2),
        lon: +place.lon.toFixed(2),
        kind: claim.kind,
        event_id: claim.event_id,
        title: claim.title,
        note: note.trim() || undefined,
        claimed_at: skyIso,
        photo_job_id: jobId.trim() || undefined,
      });
      setResult(r);
      cue(r.accepted ? 'thud' : 'tick');
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const L = ledger.data;
  const rank = L?.rank ?? result?.rank ?? null;
  const prevAt = ranks && rank ? ([...ranks.ranks].reverse().find((r) => rank.points >= r.at)?.at ?? 0) : 0;
  const progress = rank?.next ? (rank.points - prevAt) / Math.max(1, rank.next.at - prevAt) : 1;
  const verdict = score.data?.verdict;

  return (
    <PageFrame
      seal="誉"
      eyebrow="六 · 誉 Homare · Honor"
      title={
        <>
          Keep the <em>watch</em>.
        </>
      }
      lede="Claim what you saw. The server checks every claim against the real sky (was the Moon up, was it dark, was the pass overhead) before it awards a single point."
    >
      <Reveal>
        <Card spotlight brand={{ kanji: '位', text: 'Your rank' }} tag={L ? `№ ${String(L.verified_count).padStart(2, '0')}` : '№ —'} className="hn-banner">
          <DataState status={ledger.status} error={ledger.error} stale={ledger.status === 'error' && !!L} hasData={!!L} what="Opening your ledger…" onRetry={reload} />
          {rank && (
            <div className="hn-banner-row">
              <div className="hn-rank-seal" lang="ja" aria-hidden="true">
                {rank.kanji}
              </div>
              <div className="hn-rank-text">
                <p className="hn-rank-name">
                  {rank.romaji} <span className="pg-quiet">· {rank.meaning}</span>
                </p>
                <p className="hn-points">
                  <Num value={rank.points} /> <span className="pg-label">honor</span>
                  {L && (
                    <span className="pg-quiet">
                      {L.verified_count} verified · {L.rejected_count} rejected
                    </span>
                  )}
                </p>
                <div className="hn-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={rank.next ? `Progress to ${rank.next.romaji}` : 'Highest rank'}>
                  <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
                </div>
                <p className="pg-quiet">{rank.next ? `${rank.next.points_needed} honor to ${rank.next.kanji} ${rank.next.romaji}` : 'The highest rank. The night answers to you.'}</p>
              </div>
              {ranks && (
                <ol className="hn-ladder" aria-label="Ranks">
                  {ranks.ranks.map((r) => (
                    <li key={r.at} className={rank.points >= r.at ? 'got' : ''} title={r.meaning}>
                      <Kanji>{r.kanji}</Kanji>
                      <span>{r.romaji}</span>
                      <span className="num">{r.at}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </Card>
      </Reveal>

      <section className="pg-section" id="log">
        <SectionHead
          jp="記帳"
          eyebrow="Kichō · log tonight's watch"
          right={verdict && <InfoPopover title="Tonight's verdict" trace={score.data?.trace} provenance={score.provenance} computedAt={score.computedAt} />}
        >
          Stamp the <em>night</em>.
        </SectionHead>
        <Reveal>
          <Card plain className="hn-log">
            <div className="hn-log-row">
              <div className="hn-stamp-slot" aria-live="polite">
                {result ? <Hanko key={result.observation.id} size={110} animate rejected={!result.accepted} /> : <span className="hn-stamp-ghost" aria-hidden="true">印</span>}
              </div>
              <div className="hn-form">
                {verdict && (
                  <p className="hn-cond">
                    Tonight: <strong>{verdict.headline}</strong> score <span className="num">{Math.round(verdict.score)}</span>
                    {score.data?.best_window && <> · best {score.data.best_window.start_local}–{score.data.best_window.end_local}</>}
                  </p>
                )}
                <fieldset className="hn-claims">
                  <legend className="pg-label">What did you see?</legend>
                  {claims.map((c) => (
                    <label key={c.key} className={`hn-claim ${claimKey === c.key ? 'on' : ''}`}>
                      <input type="radio" name="claim" value={c.key} checked={claimKey === c.key} onChange={() => setClaimKey(c.key)} className="sr-only" />
                      <span className="jp" aria-hidden="true">
                        {KIND_JP[c.kind] ?? kindGlyph(c.kind)}
                      </span>
                      <span className="t">{c.title}</span>
                      {c.hint && <span className="h">{c.hint}</span>}
                      {ranks && <span className="p num">+{ranks.points[c.kind] ?? 0}</span>}
                    </label>
                  ))}
                </fieldset>
                <div className="hn-fields">
                  <label className="hn-field">
                    <span className="pg-label">Note (optional)</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Where you stood, what it looked like" />
                  </label>
                  <label className="hn-field">
                    <span className="pg-label">Lens photo job (optional{ranks ? `, +${ranks.photo_bonus} if plate-solved` : ''})</span>
                    <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="job id from the Spirit Lens" className="num" />
                  </label>
                </div>
                <Button variant="commit" onClick={() => void submit()} disabled={busy || !claim || !place || future}>
                  {busy ? 'Checking the sky…' : `Log tonight's watch · 記帳`}
                </Button>
                <p className="pg-quiet hn-why">
                  {future
                    ? 'The time compass is in the future. You can only claim what has already happened: turn it back to now.'
                    : `Claimed for ${fmtTime(skyIso, tz, true)} at ${place?.label ?? 'your place'}${claim ? ` · ${KIND_EN[claim.kind] ?? claim.kind}` : ''}. The server decides.`}
                </p>
                {result && (
                  <p className={`hn-verdict ${result.accepted ? 'ok' : 'no'}`} role="status">
                    {result.accepted ? `Verified · +${result.points_awarded} honor.` : 'Not verified · 0 points.'} <span>{result.reason}</span>
                  </p>
                )}
                {err && (
                  <p className="pg-error" role="alert">
                    {err}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </Reveal>
      </section>

      <section className="pg-section" id="journal">
        <SectionHead jp="日誌" eyebrow={`Nisshi · journal · ${L?.entries.length ?? 0} claims`}>
          The scroll of <em>nights</em>.
        </SectionHead>
        {L && L.entries.length === 0 && <p className="pg-quiet">No seals yet. Your first watch will be drawn here.</p>}
        {L && L.entries.length > 0 && (
          <div className="pg-emaki">
            <div className="pg-emaki-track pg-washi hn-scroll" tabIndex={0} role="region" aria-label="Journal scroll" data-lenis-prevent data-cursor="off">
              <ol className="hn-entries">
                {L.entries.map((e: Observation) => (
                  <li key={e.id} className={`hn-entry ${e.verified ? '' : 'rej'}`}>
                    <Hanko size={54} rejected={!e.verified} kanji={[KIND_JP[e.kind] ?? '月', '読']} />
                    <span className="hn-date num">{fmtTime(e.claimed_at, tz, true)}</span>
                    <span className="hn-place">{e.title}</span>
                    <span className="hn-reason">{e.reason}</span>
                    {e.conditions && (
                      <span className="hn-meta num">
                        score {Math.round(e.conditions.score)} · cloud {fmtNum(e.conditions.cloud_low, 0)}%
                        <br />
                        Moon {Math.round(e.conditions.moon_illum * 100)}% · {e.conditions.time_local}
                      </span>
                    )}
                    {e.photo_job_id && <span className="hn-meta">photo {e.photo_job_id}</span>}
                    <span className="hn-pts">{e.verified ? `+${e.points}` : '0'}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
        <Divider />
        <p className="pg-quiet">
          Your anonymous id <code>{uid}</code> is kept in this browser. Points per kind and the photo bonus come from <Tag>/api/honor/ranks</Tag>. {!L && <Chip variant="provenance">ledger unavailable</Chip>}
        </p>
      </section>
    </PageFrame>
  );
}
