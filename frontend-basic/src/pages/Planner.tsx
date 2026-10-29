import { useState } from 'react';
import api, { type Plan, type PlanCandidate, type PlannerTarget } from '../api';
import { Card, Chip, KV, Label } from '../components/Card';
import { Controls } from '../components/Controls';
import { Await, ErrorBox } from '../components/Status';
import { useApp } from '../context/AppContext';
import { useApi } from '../hooks/useApi';

const COLORS: Record<string, string> = {
  usable: '#cfa84f',
  daylight: '#2a2a35',
  altitude: '#4a4653',
  moon: '#d9dee8',
  cloud: '#6e7482',
  light_pollution: '#b4282d',
};
const LABELS: Record<string, string> = {
  usable: 'usable',
  daylight: 'too bright (Sun)',
  altitude: 'too low',
  moon: 'moonlight',
  cloud: 'cloud',
  light_pollution: 'light pollution',
};

/** One row of 15-minute blocks coloured by the binding constraint. */
function Timeline({ c, start, end }: { c: PlanCandidate; start: string; end: string }) {
  const n = c.timeline.length || 1;
  return (
    <div>
      <svg viewBox={`0 0 ${n * 6} 14`} preserveAspectRatio="none" style={{ width: '100%', height: 14, display: 'block' }} role="img" aria-label={`timeline for ${c.name}`}>
        {c.timeline.map((s, i) => (
          <rect key={i} x={i * 6} y={0} width={6} height={14} fill={COLORS[s.status]}>
            <title>
              {s.local}: {LABELS[s.status]} · target {s.target_alt}° · moon {s.moon_alt}°{s.cloud !== null ? ` · cloud ${s.cloud}%` : ''}
            </title>
          </rect>
        ))}
      </svg>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

export default function Planner() {
  const { lat, lon, atIso } = useApp();
  const targets = useApi((s) => api.planner.targets(s).then((t) => ({ data: t, provenance: [], computed_at: '' })), []);
  const [targetId, setTargetId] = useState('m31');
  const [custom, setCustom] = useState('');
  const [equipment, setEquipment] = useState('binoculars');
  const [earliest, setEarliest] = useState('');
  const [latest, setLatest] = useState('');
  const [travel, setTravel] = useState(60);
  const [plan, setPlan] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: Plan; error?: Error }>({ status: 'idle' });

  const run = async () => {
    setPlan({ status: 'loading' });
    try {
      const data = await api.planner.plan({
        lat,
        lon,
        target: targetId === 'custom' ? custom : targetId,
        equipment,
        date: atIso,
        earliest_local: earliest || undefined,
        latest_local: latest || undefined,
        travel_limit_km: travel,
      });
      setPlan({ status: 'ok', data });
    } catch (e) {
      setPlan({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  };

  return (
    <main className="page">
      <div className="page-title">
        <h1>Planner</h1>
        <span className="jp">策</span>
        <span className="sub">where and when · and what would change the answer</span>
      </div>
      <Controls />

      <Card en="What do you want to see" jp="目標">
        <Await q={targets} what="Loading targets">
          {(t) => (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label>
                target{' '}
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  {t.targets.map((x: PlannerTarget) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.jp}
                    </option>
                  ))}
                  <option value="custom">Any SIMBAD name…</option>
                </select>
              </label>
              {targetId === 'custom' && (
                <label>
                  name <input type="text" value={custom} placeholder="NGC 7000" onChange={(e) => setCustom(e.target.value)} />
                </label>
              )}
              <label>
                equipment{' '}
                <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                  {Object.entries(t.equipment).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label} (min {v.min_alt}°)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                earliest <input type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)} />
              </label>
              <label>
                latest <input type="time" value={latest} onChange={(e) => setLatest(e.target.value)} />
              </label>
              <label>
                travel limit km <input type="number" min={0} max={150} value={travel} onChange={(e) => setTravel(Number(e.target.value))} style={{ width: 80 }} />
              </label>
              <button className="btn" onClick={() => void run()} disabled={plan.status === 'loading'} type="button">
                {plan.status === 'loading' ? 'Planning the night…' : 'Plan tonight'}
              </button>
            </div>
          )}
        </Await>
        <p className="muted small">Uses the chosen location and the night that contains or follows the reference time. First run for a new place can take a minute while spots are discovered.</p>
      </Card>

      {plan.status === 'error' && plan.error && <ErrorBox error={plan.error} onRetry={() => void run()} />}
      {plan.status === 'ok' && plan.data && (
        <>
          <Card en="Recommendation" jp="進言" right={`${plan.data.date_local} · dark ${plan.data.night.dusk}–${plan.data.night.dawn}`}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--moon)' }}>{plan.data.recommendation}</div>
            <KV
              rows={[
                ['Target', `${plan.data.target.name} (${plan.data.target.kind}${plan.data.target.note ? `, ${plan.data.target.note}` : ''}) via ${plan.data.target.source}`],
                ['Rules', `Sun below ${plan.data.sun_limit}° · target above ${plan.data.min_altitude}° for ${plan.data.equipment} · window ${plan.data.window.start}–${plan.data.window.end}`],
                ['Forecast agreement', plan.data.forecast_spread_pct !== null ? `models disagree by ±${plan.data.forecast_spread_pct}% cloud (used as a penalty, not a probability)` : 'no ensemble data'],
                ['Moonset', plan.data.moonset_local ?? 'Moon not setting during the window'],
              ]}
            />
          </Card>

          <Card en="What would change the answer" jp="もし">
            <div className="grid2">
              {plan.data.counterfactuals.map((c) => (
                <div key={c.question} className="ink-sub">
                  <div className="gold small" style={{ letterSpacing: '.08em' }}>{c.question}</div>
                  <div>{c.answer}</div>
                  <div className="muted small">
                    best spot: {c.best_spot} {c.best_spot_changes ? <Chip tone="ok">changes</Chip> : <Chip tone="mist">same</Chip>} · {c.delta_minutes >= 0 ? '+' : ''}
                    {c.delta_minutes} min
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card en="Candidates" jp="候補" right={`${plan.data.candidates.length} places within ${plan.data.travel_limit_km} km`}>
            <div className="row small muted" style={{ marginBottom: 8 }}>
              {Object.entries(LABELS).map(([k, v]) => (
                <span key={k}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: COLORS[k], marginRight: 4, verticalAlign: 'middle' }} />
                  {v}
                </span>
              ))}
            </div>
            {plan.data.candidates.map((c) => (
              <div key={c.name} style={{ padding: '10px 0', borderTop: '1px solid rgba(233,224,204,.1)' }}>
                <Label
                  en={c.name}
                  jp={c.kind === 'home' ? '此処' : c.kind === 'peak' ? '山' : c.kind === 'viewpoint' ? '望' : '所'}
                  right={
                    <span className="small">
                      {c.distance_km} km · {c.travel_minutes} min · Bortle {c.bortle ?? '?'} · <b style={{ color: 'var(--moon)' }}>{c.usable_minutes} usable min</b> · quality {c.mean_quality} · net {c.net_score}
                      {plan.data?.best?.name === c.name && <Chip tone="ok">best</Chip>}
                    </span>
                  }
                />
                <Timeline c={c} start={plan.data!.window.start} end={plan.data!.window.end} />
                <div className="muted small">
                  windows: {c.windows.length ? c.windows.map((w) => `${w.start_local}–${w.end_local} (${w.minutes} min)`).join(' · ') : 'none'} · blocked:{' '}
                  {Object.entries(c.blocked_minutes)
                    .filter(([, m]) => m > 0)
                    .map(([k, m]) => `${LABELS[k]} ${m} min`)
                    .join(', ') || 'nothing'}
                </div>
              </div>
            ))}
          </Card>
          <Card en="How it is computed" jp="理">
            <div className="small">
              <code>{plan.data.trace.formula}</code>
              <ul className="muted">
                {plan.data.trace.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
