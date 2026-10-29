import { useEffect, useState } from 'react';
import api, { type SubtractionResult, type TransientDetail, type TransientObject } from '../api';
import { Card, Chip, KV, Label } from '../components/Card';
import { Controls } from '../components/Controls';
import { ProvenanceFooter } from '../components/Provenance';
import { Await, ErrorBox } from '../components/Status';
import { useApp } from '../context/AppContext';
import { fmtDate, fmtNum } from '../format';
import { useApi } from '../hooks/useApi';

const CLASSES = ['SNIa', 'SNII', 'SNIbc', 'SLSN', 'CV/Nova', 'AGN', 'Blazar', 'QSO', 'YSO', 'LPV', 'RRL', 'CEP'];

/** Light curve: magnitude (brighter up) vs date, g in green, r in red, non-detections as small down-arrows. */
function LightcurveSvg({ d }: { d: TransientDetail['lightcurve'] }) {
  const pts = d.detections;
  if (!pts.length) return <div className="status">No detections.</div>;
  const nd = d.non_detections;
  const W = 640, H = 220, L = 44, R = 10, T = 12, B = 28;
  const mjds = [...pts.map((p) => p.mjd), ...nd.map((n) => n.mjd)];
  const mags = [...pts.map((p) => p.mag), ...nd.map((n) => n.limit)];
  const x0 = Math.min(...mjds), x1 = Math.max(...mjds) || x0 + 1;
  const y0 = Math.min(...mags) - 0.3, y1 = Math.max(...mags) + 0.3;
  const sx = (m: number) => L + ((m - x0) / Math.max(x1 - x0, 1)) * (W - L - R);
  const sy = (m: number) => T + ((m - y0) / Math.max(y1 - y0, 0.1)) * (H - T - B);
  const color = (b: string) => (b === 'g' ? '#7fc97f' : b === 'r' ? '#d9534f' : '#cfa84f');
  const ticks = [y0 + 0.3, (y0 + y1) / 2, y1 - 0.3];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="light curve">
      {ticks.map((m) => (
        <g key={m}>
          <line x1={L} x2={W - R} y1={sy(m)} y2={sy(m)} stroke="rgba(233,224,204,.12)" />
          <text x={L - 6} y={sy(m) + 4} textAnchor="end" fontSize="11" fill="#8b94a7">
            {m.toFixed(1)}
          </text>
        </g>
      ))}
      {nd.map((n, i) => (
        <text key={`n${i}`} x={sx(n.mjd)} y={sy(n.limit)} fontSize="9" fill={color(n.band)} opacity="0.45" textAnchor="middle">
          ▽
        </text>
      ))}
      {pts.map((p) => (
        <g key={p.candid}>
          <line x1={sx(p.mjd)} x2={sx(p.mjd)} y1={sy(p.mag - p.err)} y2={sy(p.mag + p.err)} stroke={color(p.band)} opacity="0.6" />
          <circle cx={sx(p.mjd)} cy={sy(p.mag)} r="3" fill={color(p.band)} />
        </g>
      ))}
      <text x={L} y={H - 8} fontSize="11" fill="#8b94a7">
        {fmtDate(pts[0].date)}
      </text>
      <text x={W - R} y={H - 8} fontSize="11" fill="#8b94a7" textAnchor="end">
        {fmtDate(pts[pts.length - 1].date)}
      </text>
      <text x={W - R} y={T + 10} fontSize="11" fill="#8b94a7" textAnchor="end">
        mag (brighter ↑) · g green · r red · ▽ not detected
      </text>
    </svg>
  );
}

export default function Transients() {
  const { lat, lon } = useApp();
  const w = { lat, lon };
  const [cls, setCls] = useState('SNIa');
  const [minP, setMinP] = useState(0.7);
  const [ra, setRa] = useState('10.68');
  const [dec, setDec] = useState('41.27');
  const [coneOn, setConeOn] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [sub, setSub] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: SubtractionResult; error?: Error }>({ status: 'idle' });

  const recent = useApi((s) => api.transients.recent(cls, minP, 25, w, s), [cls, minP, lat, lon]);
  const cone = useApi((s) => api.transients.near(Number(ra), Number(dec), 600, 25, s), [coneOn, ra, dec], coneOn);
  const detail = useApi((s) => api.transients.object(sel as string, w, s), [sel, lat, lon], !!sel);

  useEffect(() => {
    setSub({ status: 'idle' });
    if (sel) setTimeout(() => document.getElementById('object-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [sel]);

  const runSubtract = async (oid: string, candid: string) => {
    setSub({ status: 'loading' });
    try {
      setSub({ status: 'ok', data: await api.transients.subtract(oid, candid) });
    } catch (e) {
      setSub({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  };

  const ObjTable = ({ objs }: { objs: TransientObject[] }) => (
    <table className="t">
      <thead>
        <tr>
          <th>Object</th>
          <th>Class</th>
          <th>P</th>
          <th>Det</th>
          <th>Last seen</th>
          <th>Tonight from here</th>
        </tr>
      </thead>
      <tbody>
        {objs.map((o) => (
          <tr key={o.oid} className={o.oid === sel ? 'sel' : ''} onClick={() => setSel(o.oid)} style={{ cursor: 'pointer' }}>
            <td>
              <code>{o.oid}</code>
            </td>
            <td>{o.class ?? '—'}</td>
            <td>{o.probability !== null ? fmtNum(o.probability, 2) : '—'}</td>
            <td>{o.ndet}</td>
            <td>{o.last_detection ? fmtDate(o.last_detection) : '—'}</td>
            <td>
              {o.visibility ? (
                o.visibility.observable_tonight ? (
                  <Chip tone="ok">
                    up to {fmtNum(o.visibility.max_altitude, 0, '°')} at {o.visibility.at_local}
                  </Chip>
                ) : (
                  <Chip tone="mist">max {fmtNum(o.visibility.max_altitude, 0, '°')}</Chip>
                )
              ) : (
                '—'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <main className="page">
      <div className="page-title">
        <h1>Transients</h1>
        <span className="jp">変光</span>
        <span className="sub">live ZTF alerts · light curves · our own subtraction</span>
      </div>
      <Controls />

      <Card en="Live feed" jp="速報" right="ALeRCE broker · ZTF">
        <div className="row">
          <label>
            class{' '}
            <select value={cls} onChange={(e) => setCls(e.target.value)}>
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            min probability{' '}
            <input type="number" step="0.1" min="0" max="1" value={minP} onChange={(e) => setMinP(Number(e.target.value))} style={{ width: 70 }} />
          </label>
          <span className="muted small">most recently detected first · click a row</span>
        </div>
        <Await q={recent} what="Asking the broker">{(r) => <ObjTable objs={r.objects} />}</Await>
      </Card>

      {sel && (
        <div id="object-card">
        <Card en={`Object ${sel}`} jp="天体" right={<a href={`https://alerce.online/object/${sel}`} target="_blank" rel="noreferrer">open on ALeRCE ↗</a>}>
          <Await q={detail} what="Loading the light curve">
            {(r) => (
                <div>
                  <KV
                    rows={[
                      ['Position', `RA ${fmtNum(r.ra ?? 0, 5, '°')} · Dec ${fmtNum(r.dec ?? 0, 5, '°')}`],
                      ['Detections', `${r.ndet} over ${fmtNum(r.days_active ?? 0, 0)} days`],
                      ['Peak', r.lightcurve.peak ? `${r.lightcurve.peak.mag} ${r.lightcurve.peak.band} on ${fmtDate(r.lightcurve.peak.date)}` : '—'],
                      ['Classifier', r.probabilities.map((p) => `${p.class} ${fmtNum(p.probability * 100, 0, '%')}`).join(' · ') || '—'],
                      ['Tonight', r.visibility ? `${r.visibility.observable_tonight ? 'observable' : 'too low'} · max ${fmtNum(r.visibility.max_altitude, 0, '°')} at ${r.visibility.at_local} (dark ${r.visibility.dusk_local}–${r.visibility.dawn_local})` : '—'],
                    ]}
                  />
                  <LightcurveSvg d={r.lightcurve} />
                  <div className="muted small">{r.lightcurve.note}</div>
                  {(() => {
                    const withStamp = [...r.lightcurve.detections].reverse().find((d) => d.has_stamp) ?? r.lightcurve.detections[r.lightcurve.detections.length - 1];
                    if (!withStamp) return null;
                    return (
                      <div style={{ marginTop: 14 }}>
                        <Label en="Real ZTF stamps" jp="切抜" right={`candid ${withStamp.candid} · ${fmtDate(withStamp.date)}`} />
                        <div className="row" style={{ alignItems: 'flex-start' }}>
                          {(['template', 'science', 'difference'] as const).map((k) => (
                            <figure key={k} style={{ margin: 0 }}>
                              <img src={api.transients.stampUrl(r.oid, withStamp.candid, k)} width={126} height={126} alt={k} style={{ imageRendering: 'pixelated', background: '#000' }} />
                              <figcaption className="muted small" style={{ textAlign: 'center' }}>
                                {k === 'template' ? 'earlier (template)' : k === 'science' ? 'later (science)' : 'ZTF difference'}
                              </figcaption>
                            </figure>
                          ))}
                          <div style={{ minWidth: 0 }}>
                            <button className="btn small" onClick={() => void runSubtract(r.oid, withStamp.candid)} disabled={sub.status === 'loading'} type="button">
                              {sub.status === 'loading' ? 'Subtracting…' : 'Run our subtraction'}
                            </button>
                            <div className="muted small">align → match blur → match flux → subtract → reject dipoles/edges</div>
                          </div>
                        </div>
                        {sub.status === 'error' && sub.error && <ErrorBox error={sub.error} onRetry={() => void runSubtract(r.oid, withStamp.candid)} />}
                        {sub.status === 'ok' && sub.data && (
                          <div style={{ marginTop: 10 }}>
                            <div className="row" style={{ alignItems: 'flex-start' }}>
                              <figure style={{ margin: 0 }}>
                                <img src={sub.data.images.our_difference} width={126} height={126} alt="our difference" style={{ imageRendering: 'pixelated' }} />
                                <figcaption className="muted small" style={{ textAlign: 'center' }}>
                                  our difference (red +, blue −)
                                </figcaption>
                              </figure>
                              <div style={{ minWidth: 0 }}>
                                <KV
                                  rows={[
                                    ['Candidates', `${sub.data.real_candidates} real of ${sub.data.candidates.length} blobs above ${sub.data.nsigma}σ`],
                                    ['Alignment', `new epoch offset (${sub.data.shift_px[0]}, ${sub.data.shift_px[1]}) px`],
                                    ['PSF match', `${sub.data.fwhm_px.old} → ${sub.data.fwhm_px.new} px`],
                                    ['Flux scale', String(sub.data.flux_scale)],
                                  ]}
                                />
                                <ul className="small muted">
                                  {sub.data.steps.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            {sub.data.candidates.length > 0 && (
                              <table className="t">
                                <thead>
                                  <tr>
                                    <th>x, y</th>
                                    <th>sign</th>
                                    <th>SNR</th>
                                    <th>pixels</th>
                                    <th>verdict</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sub.data.candidates.map((c, i) => (
                                    <tr key={i}>
                                      <td>
                                        {c.x}, {c.y}
                                      </td>
                                      <td>{c.sign}</td>
                                      <td>{c.snr}</td>
                                      <td>{c.npix}</td>
                                      <td>{c.real_candidate ? <Chip tone="ok">candidate</Chip> : <Chip tone="mist">{c.flags.join(', ')}</Chip>}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )
            }
          </Await>
        </Card>
        </div>
      )}

      <Card en="Cone search" jp="探索">
        <div className="row">
          <label>
            RA° <input type="number" value={ra} onChange={(e) => setRa(e.target.value)} style={{ width: 90 }} />
          </label>
          <label>
            Dec° <input type="number" value={dec} onChange={(e) => setDec(e.target.value)} style={{ width: 90 }} />
          </label>
          <button className="btn small" onClick={() => setConeOn(true)} type="button">
            Search 10′ around
          </button>
          <span className="muted small">default: the Andromeda field, same as the Lens sample</span>
        </div>
        {coneOn && <Await q={cone} what="Searching the cone">{(r) => <ObjTable objs={r.objects} />}</Await>}
      </Card>

      <ProvenanceFooter lists={[recent.provenance, detail.provenance]} />
    </main>
  );
}
