import api from '../api';
import { useApp } from '../context/AppContext';
import { fmtTime } from '../format';
import { useApi } from '../hooks/useApi';
import { Card, Chip, KV } from './Card';
import { Await } from './Status';

const TONE: Record<string, string> = { likely: 'ok', possible: 'ok', low: 'mist', 'very low': 'mist', none: 'bad', unknown: 'mist' };

/** Aurora chance tonight: a Kp bar chart (observed grey, predicted gold) with the required-Kp line. */
export function AuroraCard() {
  const { lat, lon, atIso } = useApp();
  const q = useApi((s) => api.aurora({ lat, lon }, atIso, s), [lat, lon, atIso]);
  return (
    <Card en="Aurora" jp="極光" right={q.data ? `geomagnetic ${q.data.geomagnetic_lat}°` : undefined}>
      <Await q={q} what="Asking NOAA space weather">
        {(a) => {
          const pts = a.forecast;
          const W = 640, H = 120, L = 28, B = 22;
          const bw = pts.length ? (W - L - 8) / pts.length : 10;
          const need = a.required_kp.horizon;
          const sy = (k: number) => H - B - (k / 9) * (H - B - 8);
          return (
            <div>
              <div style={{ fontFamily: 'var(--font-display)', color: 'var(--moon)', fontSize: 18 }}>
                <Chip tone={TONE[a.chance_tonight] ?? 'mist'}>{a.chance_tonight}</Chip> {a.verdict}
              </div>
              <KV
                rows={[
                  ['Kp now', a.kp_now !== null ? `${a.kp_now} (estimated, ${fmtTime(a.kp_now_time, undefined, true)})${a.g_now ? ` · NOAA scale ${a.g_now}` : ''}` : '—'],
                  ['Needed here', need === null ? 'not reachable even at Kp 9' : `Kp ${need} on the ${a.look_toward}ern horizon${a.required_kp.overhead !== null ? ` · Kp ${a.required_kp.overhead} overhead` : ''}`],
                  ['Forecast peak (24 h)', a.max_kp_next_24h !== null ? `Kp ${a.max_kp_next_24h} at ${fmtTime(a.max_kp_time, undefined, true)}` : '—'],
                  ['Dark', `${a.dark_window_local.dusk} – ${a.dark_window_local.dawn}`],
                ]}
              />
              {pts.length > 0 && (
                <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Kp forecast">
                  {[3, 5, 7, 9].map((k) => (
                    <g key={k}>
                      <line x1={L} x2={W - 8} y1={sy(k)} y2={sy(k)} stroke="rgba(233,224,204,.1)" />
                      <text x={L - 4} y={sy(k) + 4} textAnchor="end" fontSize="10" fill="#8b94a7">
                        {k}
                      </text>
                    </g>
                  ))}
                  {need !== null && <line x1={L} x2={W - 8} y1={sy(need)} y2={sy(need)} stroke="#b4282d" strokeDasharray="4 4" />}
                  {pts.map((p, i) => (
                    <rect key={i} x={L + i * bw + 1} y={sy(p.kp)} width={Math.max(1, bw - 2)} height={H - B - sy(p.kp)} fill={p.kind === 'observed' ? 'rgba(139,148,167,.6)' : p.kp >= 5 ? '#b4282d' : '#cfa84f'}>
                      <title>
                        {fmtTime(p.time, undefined, true)} · Kp {p.kp} · {p.kind}
                        {p.g_scale ? ` · ${p.g_scale}` : ''}
                      </title>
                    </rect>
                  ))}
                  <text x={L} y={H - 6} fontSize="10" fill="#8b94a7">
                    {fmtTime(pts[0].time, undefined, true)}
                  </text>
                  <text x={W - 8} y={H - 6} fontSize="10" fill="#8b94a7" textAnchor="end">
                    {fmtTime(pts[pts.length - 1].time, undefined, true)} · grey observed · gold forecast · red = needed here
                  </text>
                </svg>
              )}
              <div className="muted small">{a.trace.notes.join(' · ')}</div>
            </div>
          );
        }}
      </Await>
    </Card>
  );
}
