/**
 * Watchtower extras: aurora chance (/api/aurora), the observing planner (/api/planner/*) and the
 * personal horizon (/api/horizon/terrain). Every number comes from the backend; errors are shown as is.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, type AuroraReport, type HorizonProfile, type Plan, type PlannerTarget, type PlanStep, type Provenance } from '@/data/api';
import { fmtNum, fmtTime } from '@/data/format';
import { useApp } from '@/state/store';
import { Card, Chip, Divider, InfoPopover, Tag } from '@/ui';
import { DataState, Num, Reveal, SectionHead } from '../_ui/kit';
import type { PageData } from '../_ui/usePageData';
import './extras.css';

// ---------------------------------------------------------------------------
// Aurora
// ---------------------------------------------------------------------------

const CHANCE_JP: Record<string, string> = { none: '無', low: '微', possible: '可', likely: '望', high: '高' };

function KpStrip({ a, tz }: { a: AuroraReport; tz: string }) {
  const W = 380;
  const H = 160;
  const pts = a.forecast;
  if (!pts.length) return <p className="pg-quiet">NOAA returned no Kp forecast points.</p>;
  const bw = W / pts.length;
  const y = (kp: number) => H - 18 - (Math.min(9, kp) / 9) * (H - 30);
  const req = a.required_kp.horizon;
  return (
    <svg className="wx-kp" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kp forecast, peak ${fmtNum(a.max_kp_next_24h, 1)}`}>
      {[0, 3, 5, 7, 9].map((k) => (
        <g key={k}>
          <line className="wt-grid" x1={0} x2={W} y1={y(k)} y2={y(k)} />
          <text className="wx-axis" x={2} y={y(k) - 2}>
            {k}
          </text>
        </g>
      ))}
      {pts.map((p, i) => (
        <g key={p.time}>
          <rect className={`wx-kp-bar ${p.kind} ${p.kp >= 5 ? 'storm' : ''}`} x={i * bw + 3} width={Math.max(2, bw - 6)} y={y(p.kp)} height={H - 18 - y(p.kp)}>
            <title>
              {fmtTime(p.time, tz, true)} · Kp {p.kp.toFixed(2)} ({p.kind}){p.g_scale ? ` · ${p.g_scale}` : ''}
            </title>
          </rect>
          {i % 4 === 0 && (
            <text className="wx-axis" x={i * bw + bw / 2} y={H - 4} textAnchor="middle">
              {fmtTime(p.time, tz)}
            </text>
          )}
        </g>
      ))}
      {req != null && req <= 9 && (
        <g>
          <line className="wx-req" x1={0} x2={W} y1={y(req)} y2={y(req)} />
          <text className="wx-req-label" x={W - 4} y={y(req) - 4} textAnchor="end">
            needed here · Kp {req}
          </text>
        </g>
      )}
    </svg>
  );
}

export function AuroraSection({ aurora }: { aurora: PageData<AuroraReport> }) {
  const tz = useApp((s) => s.tz);
  const a = aurora.data;
  return (
    <section className="pg-section" id="aurora">
      <SectionHead
        jp="極光"
        eyebrow="Kyokkō · Aurora tonight"
        right={a && <InfoPopover title="Aurora chance" trace={a.trace} provenance={aurora.provenance} computedAt={aurora.computedAt} />}
      >
        The northern <em>lights</em>?
      </SectionHead>
      <DataState status={aurora.status} error={aurora.error} stale={aurora.stale} hasData={!!a} what="Asking NOAA for the planetary K-index…" onRetry={aurora.reload} />
      {a && (
        <div className="pg-grid hero">
          <Reveal i={0}>
            <Card brand={{ kanji: '極', text: 'Aurora chance' }} tag="№ 03">
              <div className="wx-chance">
                <span className={`wx-chance-jp ${a.chance_tonight}`} lang="ja" aria-hidden="true">
                  {CHANCE_JP[a.chance_tonight] ?? '？'}
                </span>
                <div>
                  <span className="pg-label">Chance tonight</span>
                  <div className="wx-chance-word">{a.chance_tonight}</div>
                </div>
              </div>
              <p className="wt-reason">{a.verdict}</p>
              <Divider />
              <div className="pg-stats">
                <div className="pg-stat">
                  <span className="pg-label">Kp now</span>
                  <span className="v">
                    <Num value={a.kp_now} decimals={2} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Peak 24 h</span>
                  <span className="v">
                    <Num value={a.max_kp_next_24h} decimals={2} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Needed (horizon)</span>
                  <span className="v num">{a.required_kp.horizon != null ? a.required_kp.horizon : '> 9'}</span>
                </div>
              </div>
            </Card>
          </Reveal>
          <Reveal i={1}>
            <Card brand={{ kanji: '磁', text: 'Kp forecast' }} tag="№ 04">
              <KpStrip a={a} tz={tz} />
              <p className="pg-quiet" style={{ marginTop: 8 }}>
                Bars: <span className="wx-key estimated" /> estimated <span className="wx-key predicted" /> predicted <span className="wx-key storm" /> storm (Kp ≥ 5).
              </p>
              <dl className="pg-kv" style={{ marginTop: 12 }}>
                <dt>Geomagnetic latitude</dt>
                <dd>{fmtNum(a.geomagnetic_lat, 1)}°</dd>
                <dt>Storm level now</dt>
                <dd>{a.g_now ?? '—'}</dd>
                <dt>Needed overhead</dt>
                <dd>{a.required_kp.overhead != null ? `Kp ${a.required_kp.overhead}` : 'not reachable'}</dd>
                <dt>Look toward</dt>
                <dd>{a.look_toward}</dd>
                <dt>Dark window</dt>
                <dd>
                  {a.dark_window_local.dusk ?? '—'}–{a.dark_window_local.dawn ?? '—'}
                </dd>
                {a.max_kp_time && (
                  <>
                    <dt>Peak at</dt>
                    <dd>{fmtTime(a.max_kp_time, tz, true)}</dd>
                  </>
                )}
              </dl>
            </Card>
          </Reveal>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Observing planner
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<PlanStep['status'], string> = {
  usable: 'usable',
  daylight: 'daylight',
  altitude: 'too low',
  moon: 'moonlight',
  cloud: 'cloud',
  light_pollution: 'light pollution',
};

function bindingOf(blocked: Record<string, number>): [string, number] | null {
  const e = Object.entries(blocked).filter(([k, v]) => v > 0 && k !== 'daylight');
  if (!e.length) return null;
  return e.reduce((a, b) => (b[1] > a[1] ? b : a));
}

function PlanStrip({ steps }: { steps: PlanStep[] }) {
  if (!steps.length) return <p className="pg-quiet">No 15-minute steps in this window.</p>;
  return (
    <div className="wx-strip-wrap">
      <div className="wx-strip" role="img" aria-label="Per 15 minutes: what limits the target">
        {steps.map((s) => (
          <span key={s.time} className={`wx-cell ${s.status}`} style={{ opacity: s.status === 'usable' ? 0.45 + 0.55 * Math.max(0, Math.min(1, s.quality)) : undefined }} title={`${s.local} · ${STATUS_LABEL[s.status] ?? s.status} · target ${s.target_alt.toFixed(0)}° · Moon ${s.moon_alt.toFixed(0)}°${s.cloud != null ? ` · cloud ${s.cloud.toFixed(0)}%` : ''}`} />
        ))}
      </div>
      <div className="wx-strip-axis num">
        <span>{steps[0].local}</span>
        <span>{steps[Math.floor(steps.length / 2)].local}</span>
        <span>{steps[steps.length - 1].local}</span>
      </div>
      <div className="wx-legend">
        {(Object.keys(STATUS_LABEL) as PlanStep['status'][]).map((k) => (
          <span key={k} className="wx-legend-i">
            <span className={`wx-cell ${k}`} aria-hidden="true" /> {STATUS_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlannerSection() {
  const place = useApp((s) => s.place);
  const [meta, setMeta] = useState<{ targets: PlannerTarget[]; equipment: Record<string, { min_alt: number; label: string }> } | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [target, setTarget] = useState('m31');
  const [equipment, setEquipment] = useState('binoculars');
  const [travel, setTravel] = useState(60);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metaTick, setMetaTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setMetaErr(null);
    api.planner
      .targets(ac.signal)
      .then(setMeta)
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setMetaErr(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [metaTick]);

  // a plan is for one place: drop it when the place changes
  useEffect(() => setPlan(null), [place?.lat, place?.lon]);

  const run = () => {
    if (!place) return;
    setBusy(true);
    setErr(null);
    api.planner
      .plan({ lat: place.lat, lon: place.lon, target, equipment, travel_limit_km: travel, candidate_limit: 6 })
      .then((p) => setPlan(p))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  const best = plan?.best ?? null;
  // with no usable site the planner still scores the candidates; show the first so the block is visible
  const shown = best ?? plan?.candidates[0] ?? null;
  const binding = shown ? bindingOf(shown.blocked_minutes) : null;
  const tgt = meta?.targets.find((t) => t.id === target);

  return (
    <section className="pg-section" id="planner">
      <SectionHead
        jp="計画"
        eyebrow="Keikaku · Observing planner"
        right={plan && <InfoPopover title="Observing plan" trace={plan.trace} computedAt={null} notes={`Target from ${plan.target.source}; times in ${plan.timezone}.`} />}
      >
        One target, the <em>best</em> hour.
      </SectionHead>
      <Reveal>
        <Card plain className="wt-chart-card">
          {metaErr && !meta && (
            <p className="pg-error" role="alert">
              Could not load the target list ({metaErr}).
              <button className="tw-btn secondary" onClick={() => setMetaTick((t) => t + 1)} style={{ minHeight: 32 }}>
                Retry now
              </button>
            </p>
          )}
          <div className="wx-form">
            <label className="wx-field">
              <span className="pg-label">Target</span>
              <select className="wx-input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={!meta}>
                {(meta?.targets ?? [{ id: 'm31', name: 'Andromeda Galaxy (M31)', jp: '', kind: 'deepsky', note: '' }]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.jp ? ` · ${t.jp}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="wx-field">
              <span className="pg-label">Equipment</span>
              <select className="wx-input" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                {Object.entries(meta?.equipment ?? { eyes: { label: 'eyes', min_alt: 0 }, binoculars: { label: 'binoculars', min_alt: 0 }, telescope: { label: 'telescope', min_alt: 0 }, camera: { label: 'camera', min_alt: 0 } }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                    {meta ? ` · above ${v.min_alt}°` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="wx-field">
              <span className="pg-label">Travel up to</span>
              <select className="wx-input" value={travel} onChange={(e) => setTravel(Number(e.target.value))}>
                {[0, 20, 40, 60, 100, 150].map((k) => (
                  <option key={k} value={k}>
                    {k === 0 ? 'stay here' : `${k} km`}
                  </option>
                ))}
              </select>
            </label>
            <button className="tw-btn primary" onClick={run} disabled={busy || !place}>
              {busy ? 'Planning…' : 'Plan tonight'}
            </button>
          </div>
          {tgt?.note && <p className="pg-quiet" style={{ marginTop: 8 }}>{tgt.note}</p>}
          {busy && (
            <p className="pg-loading" role="status">
              <span className="pg-brush-dot" aria-hidden="true" /> Scoring nearby sites every 15 minutes against forecast, Moon and light… (this can take a while)
            </p>
          )}
          {err && (
            <p className="pg-error" role="alert">
              The planner could not finish ({err}).
              <button className="tw-btn secondary" onClick={run} style={{ minHeight: 32 }}>
                Retry
              </button>
            </p>
          )}
          {!plan && !busy && !err && <p className="pg-quiet" style={{ marginTop: 10 }}>Pick a target and press plan; it scores the night for your place and up to {travel} km around it.</p>}
          {plan && (
            <div className="wx-plan">
              <h3 className="pg-name wt-headline">{plan.recommendation}</h3>
              <span className="tw-brush" style={{ margin: '10px 0 14px' }} aria-hidden="true" />
              <div className="pg-stats">
                <div className="pg-stat">
                  <span className="pg-label">Best time</span>
                  <span className="v num">{best && best.windows[0] ? `${best.windows[0].start_local}–${best.windows[0].end_local}` : '—'}</span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Usable</span>
                  <span className="v">
                    <Num value={best?.usable_minutes ?? 0} />
                    <small>min</small>
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Binding constraint</span>
                  <span className="v wx-binding">{binding ? `${STATUS_LABEL[binding[0] as PlanStep['status']] ?? binding[0]} · ${binding[1]} min` : shown ? 'none' : '—'}</span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Min altitude</span>
                  <span className="v num">{plan.min_altitude}°</span>
                </div>
              </div>
              {best && (
                <p className="pg-quiet num" style={{ marginTop: 10 }}>
                  Best site: <strong style={{ color: 'var(--kinu)' }}>{best.name}</strong> · {best.kind} · {fmtNum(best.distance_km, 1)} km ({Math.round(best.travel_minutes)} min) · Bortle {fmtNum(best.bortle, 1)} · net score {fmtNum(best.net_score, 1)}
                  {plan.moonset_local ? ` · moonset ${plan.moonset_local}` : ''}
                  {plan.forecast_spread_pct != null ? ` · forecast spread ${fmtNum(plan.forecast_spread_pct, 0)}%` : ''}
                </p>
              )}
              {shown && (
                <>
                  <Divider />
                  <span className="pg-label">
                    Every 15 minutes at {shown.name}
                    {!best && ' · nothing usable'}
                  </span>
                  <PlanStrip steps={shown.timeline} />
                </>
              )}
              {plan.counterfactuals.length > 0 && (
                <>
                  <Divider />
                  <span className="pg-label">What if…</span>
                  <ul className="wx-whatif">
                    {plan.counterfactuals.map((c) => (
                      <li key={c.question}>
                        <span className="wx-q">{c.question}</span>
                        <span className="wx-a">{c.answer}</span>
                        <Tag num>
                          {c.delta_minutes > 0 ? '+' : ''}
                          {c.delta_minutes} min
                        </Tag>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {plan.candidates.length > 1 && (
                <p className="pg-quiet" style={{ marginTop: 10 }}>
                  Also scored: {plan.candidates.filter((c) => c !== shown).map((c) => `${c.name} (${c.usable_minutes} min)`).join(' · ')}
                </p>
              )}
              <p className="pg-quiet num" style={{ marginTop: 6 }}>
                Plan for {plan.date_local} ({plan.timezone}) · window {plan.window.start}–{plan.window.end} · sunset {plan.night.sunset ?? '—'}, astronomical dusk {plan.night.dusk ?? '—'}, dawn {plan.night.dawn ?? '—'}
              </p>
            </div>
          )}
        </Card>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Horizon / terrain mask
// ---------------------------------------------------------------------------

function HorizonChart({ h }: { h: HorizonProfile }) {
  const W = 640;
  const H = 170;
  const padL = 30;
  const padB = 22;
  const maxAlt = Math.max(2, Math.ceil(Math.max(...h.mask, 0) * 1.25));
  const n = h.mask.length;
  const x = (i: number) => padL + (i / n) * (W - padL);
  const y = (alt: number) => H - padB - (alt / maxAlt) * (H - padB - 10);
  const line = h.mask.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(a).toFixed(1)}`).join(' ') + ` L${W},${y(h.mask[0]).toFixed(1)}`;
  const fill = `${line} L${W},${H - padB} L${padL},${H - padB} Z`;
  const hiI = Math.round(h.highest.az / h.az_step) % n;
  const ticks = [0, 90, 180, 270];
  const names = ['N', 'E', 'S', 'W'];
  return (
    <svg className="wx-hz" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Skyline profile; highest ${fmtNum(h.highest.alt, 1)}° toward ${h.highest.compass}`}>
      {[0, maxAlt / 2, maxAlt].map((a) => (
        <g key={a}>
          <line className="wt-grid" x1={padL} x2={W} y1={y(a)} y2={y(a)} />
          <text className="wx-axis" x={padL - 4} y={y(a) + 3} textAnchor="end">
            {a.toFixed(a < 10 ? 1 : 0)}°
          </text>
        </g>
      ))}
      {ticks.map((az, k) => (
        <text key={az} className="wx-axis" x={padL + (az / 360) * (W - padL)} y={H - 6} textAnchor="middle">
          {names[k]}
        </text>
      ))}
      <path className="wx-hz-fill" d={fill} />
      <path className="wx-hz-line" d={line} />
      <circle className="wx-hz-hi" cx={x(hiI)} cy={y(h.mask[hiI])} r={4} />
      <text className="wx-req-label" x={Math.min(W - 4, x(hiI) + 6)} y={y(h.mask[hiI]) - 6} textAnchor={x(hiI) > W - 120 ? 'end' : 'start'}>
        {fmtNum(h.highest.alt, 2)}° {h.highest.compass}
      </text>
    </svg>
  );
}

function HorizonPolar({ h }: { h: HorizonProfile }) {
  const R = 70;
  const maxAlt = Math.max(2, Math.max(...h.mask, 0));
  const pts = h.mask.map((a, i) => {
    const az = (i * h.az_step * Math.PI) / 180;
    const r = R * (1 - 0.35 * (a / maxAlt)); // the skyline pushes the visible dome inward
    return `${(Math.sin(az) * r).toFixed(1)},${(-Math.cos(az) * r).toFixed(1)}`;
  });
  return (
    <svg className="wx-polar" viewBox="-84 -84 168 168" role="img" aria-label="Skyline seen from above, north up">
      <circle className="wx-polar-ring" r={R} />
      <circle className="wx-polar-ring soft" r={R * 0.65} />
      <polygon className="wx-hz-fill" points={pts.join(' ')} />
      <polygon className="wx-hz-line" points={pts.join(' ')} />
      {['N', 'E', 'S', 'W'].map((c, k) => {
        const a = (k * Math.PI) / 2;
        return (
          <text key={c} className="wx-axis" x={Math.sin(a) * (R + 9)} y={-Math.cos(a) * (R + 9) + 3} textAnchor="middle">
            {c}
          </text>
        );
      })}
      <circle className="wx-origin" r={3} />
    </svg>
  );
}

export function HorizonSection({ horizon }: { horizon: PageData<HorizonProfile> }) {
  const h = horizon.data;
  const flat = useMemo(() => (h ? h.terrain.every((v) => v === 0) : false), [h]);
  const terrainDown = horizon.provenance.some((p: Provenance) => (p.note ?? '').includes('terrain unavailable'));
  return (
    <section className="pg-section" id="horizon">
      <SectionHead
        jp="山の端"
        eyebrow="Yama no ha · Your skyline"
        right={h && <InfoPopover title="Terrain horizon" provenance={horizon.provenance} computedAt={horizon.computedAt} notes={h.note} />}
      >
        What the <em>hills</em> hide.
      </SectionHead>
      <DataState status={horizon.status} error={horizon.error} stale={horizon.stale} hasData={!!h} what="Tracing the land around you (90 m elevation model)…" onRetry={horizon.reload} />
      {h && (
        <Reveal>
          <Card brand={{ kanji: '嶺', text: 'Horizon profile' }} tag="№ 05">
            {terrainDown && <p className="pg-error" role="alert">Elevation data was unavailable, so this is a flat horizon, not your terrain.</p>}
            <div className="wx-hz-grid">
              <HorizonPolar h={h} />
              <div>
                <HorizonChart h={h} />
                <p className="pg-quiet" style={{ marginTop: 4 }}>
                  Altitude of the land horizon every {h.az_step}° of bearing, north → east → south → west. The plan view (north up) pulls the rim inward where the land is highest, scaled to the tallest obstruction. {flat && !terrainDown ? 'The land is flat to the horizon here.' : ''}
                </p>
              </div>
            </div>
            <Divider />
            <div className="pg-stats">
              <div className="pg-stat">
                <span className="pg-label">Max obstruction</span>
                <span className="v">
                  <Num value={h.highest.alt} decimals={2} suffix="°" />
                  <small>{h.highest.compass} · {h.highest.az}°</small>
                </span>
              </div>
              <div className="pg-stat">
                <span className="pg-label">Mean skyline</span>
                <span className="v">
                  <Num value={h.mean_deg} decimals={2} suffix="°" />
                </span>
              </div>
              <div className="pg-stat">
                <span className="pg-label">Sky lost</span>
                <span className="v">
                  <Num value={h.sky_fraction_lost * 100} decimals={2} suffix="%" />
                </span>
              </div>
              <div className="pg-stat">
                <span className="pg-label">You stand at</span>
                <span className="v">
                  <Num value={h.observer_elevation_m} />
                  <small>m</small>
                </span>
              </div>
            </div>
            {!terrainDown && <Chip variant="provenance">terrain only · traced skyline not set</Chip>}
          </Card>
        </Reveal>
      )}
    </section>
  );
}
