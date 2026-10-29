import { useEffect, useState } from 'react';
import api, { type Horizon as HorizonT, type MaskPoint, type PathReport } from '../api';
import { Card, Chip, KV } from '../components/Card';
import { Controls } from '../components/Controls';
import { ErrorBox, Loading } from '../components/Status';
import { useApp } from '../context/AppContext';

const TARGETS = ['moon', 'jupiter', 'saturn', 'mars', 'm31', 'm42', 'm45', 'sirius', 'vega'];

/** Polar sky chart: zenith at the centre, horizon at the rim; the mask is a ridge filled from the rim inward. */
function SkyChart({ h, path, onPick }: { h: HorizonT; path?: PathReport['path']; onPick?: (az: number, alt: number) => void }) {
  const S = 420, c = S / 2, R = 190;
  const toXY = (az: number, alt: number) => {
    const r = R * (1 - Math.max(0, Math.min(90, alt)) / 90);
    const a = ((az - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const ridge = (vals: number[]) => {
    const pts = vals.map((v, i) => toXY(i * h.az_step, v));
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z';
  };
  const rim = `M${c + R},${c} A${R},${R} 0 1,1 ${c - R},${c} A${R},${R} 0 1,1 ${c + R},${c} Z`;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      style={{ width: '100%', maxWidth: 440, display: 'block', margin: '0 auto', cursor: onPick ? 'crosshair' : 'default' }}
      role="img"
      aria-label="sky chart with horizon mask"
      onClick={(e) => {
        if (!onPick) return;
        const svg = e.currentTarget;
        const r = svg.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * S - c;
        const y = ((e.clientY - r.top) / r.height) * S - c;
        const dist = Math.hypot(x, y);
        if (dist > R) return;
        const az = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
        const alt = 90 * (1 - dist / R);
        onPick(Math.round(az), Math.round(alt));
      }}
    >
      <path d={rim} fill="#0b0b12" stroke="rgba(233,224,204,.25)" />
      {[30, 60].map((alt) => (
        <circle key={alt} cx={c} cy={c} r={R * (1 - alt / 90)} fill="none" stroke="rgba(233,224,204,.1)" strokeDasharray="3 4" />
      ))}
      <path d={`${rim} ${ridge(h.terrain)}`} fill="rgba(74,70,83,.75)" fillRule="evenodd" />
      <path d={`${rim} ${ridge(h.mask)}`} fill="rgba(180,40,45,.35)" fillRule="evenodd" />
      <path d={ridge(h.mask)} fill="none" stroke="#cfa84f" strokeWidth="1.2" />
      {path &&
        path.map((p, i) =>
          p.alt > 0 ? (
            <circle key={i} cx={toXY(p.az, p.alt)[0]} cy={toXY(p.az, p.alt)[1]} r={p.visible ? 2.2 : 1.4} fill={p.visible ? '#f3ead6' : 'rgba(139,148,167,.6)'}>
              <title>
                {p.local} · alt {p.alt}° · az {p.az}° · skyline {p.mask_alt}° · {p.visible ? 'visible' : 'behind skyline'}
              </title>
            </circle>
          ) : null,
        )}
      {[
        ['N', 0],
        ['E', 90],
        ['S', 180],
        ['W', 270],
      ].map(([l, az]) => {
        const [x, y] = toXY(Number(az), -6);
        return (
          <text key={String(l)} x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#b4282d" fontFamily="var(--font-display)">
            {l}
          </text>
        );
      })}
    </svg>
  );
}

export default function Horizon() {
  const { lat, lon, atIso } = useApp();
  const [points, setPoints] = useState<MaskPoint[]>([]);
  const [useTerrain, setUseTerrain] = useState(true);
  const [target, setTarget] = useState('moon');
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: { horizon: HorizonT; report: PathReport }; error?: Error }>({ status: 'idle' });

  const run = async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const d = await api.horizon.path({ lat, lon, points, use_terrain: useTerrain, target, date: atIso });
      setState({ status: 'ok', data: d });
    } catch (e) {
      setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  };
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, atIso, target, useTerrain, points]);

  const h = state.data?.horizon;
  const rep = state.data?.report;
  return (
    <main className="page">
      <div className="page-title">
        <h1>Horizon</h1>
        <span className="jp">地平</span>
        <span className="sub">your real skyline · terrain from elevation data · trace roofs and trees by clicking</span>
      </div>
      <Controls />
      <div className="grid2">
        <Card en="Sky chart" jp="天球" right={h ? `terrain highest ${h.highest.alt}° toward ${h.highest.compass} · ${Math.round(h.sky_fraction_lost * 100)}% of the dome hidden` : undefined}>
          {state.status === 'loading' && !h && <Loading what="Sampling the terrain in 72 directions" />}
          {state.status === 'error' && state.error && <ErrorBox error={state.error} onRetry={() => void run()} />}
          {h && <SkyChart h={h} path={rep?.path} onPick={(az, alt) => setPoints((p) => [...p, { az, alt }])} />}
          <p className="muted small">Grey: terrain. Red: your traced obstructions. Gold line: the combined skyline. Dots: {target} tonight, bright where it is above the skyline. Click inside the circle to add an obstruction at that direction and height.</p>
        </Card>
        <div>
          <Card en="Obstructions" jp="遮り" right={<button className="btn small ghost" type="button" onClick={() => setPoints([])}>Clear</button>}>
            <div className="row">
              <label>
                <input type="checkbox" checked={useTerrain} onChange={(e) => setUseTerrain(e.target.checked)} /> use terrain
              </label>
              <button className="btn small" type="button" onClick={() => setPoints((p) => [...p, { az: 90, alt: 25 }, { az: 150, alt: 25 }, { az: 160, alt: 0 }, { az: 80, alt: 0 }])}>
                Add a 25° wall to the SE
              </button>
            </div>
            {points.length === 0 && <div className="status">No traced points. Click the chart, or add the sample wall.</div>}
            {points.length > 0 && (
              <table className="t">
                <thead>
                  <tr>
                    <th>az°</th>
                    <th>alt°</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i}>
                      <td>{p.az}</td>
                      <td>{p.alt}</td>
                      <td>
                        <button className="btn small ghost" type="button" onClick={() => setPoints((ps) => ps.filter((_, j) => j !== i))}>
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card en="Clears your skyline" jp="越える">
            <div className="row">
              <label>
                target{' '}
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {TARGETS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            {rep && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--moon)', fontSize: 18 }}>{rep.sentence}</div>
                <KV
                  rows={[
                    ['Geometric rise / set', `${rep.geometric_rise_local ?? '—'} / ${rep.geometric_set_local ?? '—'}`],
                    ['Above the horizon', `${rep.minutes_above_geometric} min`],
                    ['Above your skyline', `${rep.minutes_above_mask} min`],
                    ['Lost to the skyline', <Chip tone={rep.minutes_lost_to_skyline > 0 ? 'bad' : 'ok'}>{rep.minutes_lost_to_skyline} min</Chip>],
                  ]}
                />
                {rep.crossings.length > 0 && (
                  <ul className="small muted">
                    {rep.crossings.map((c, i) => (
                      <li key={i}>
                        {c.local} · {c.kind.replace(/_/g, ' ')} · az {c.az}° · alt {c.alt}° · skyline {c.mask_alt}°
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
      {h && <p className="muted small">{h.note}</p>}
    </main>
  );
}
