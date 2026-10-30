/**
 * /science extras: try the backend's own science by hand. An SDSS spectrum near any position
 * (/api/spectra/at), ZTF transients near a position (/api/transients/near), and our own two-image
 * subtraction of an ALeRCE alert (/api/transients/{oid}/subtract). Every number is the server's.
 */
import { useEffect, useState } from 'react';
import { API_BASE, api, type Envelope, type LightcurvePoint, type Spectrum, type SubtractionResult, type TransientObject } from '@/data/api';
import { fmtDate, fmtNum } from '@/data/format';
import { useApp } from '@/state/store';
import { Button, Card, Chip, InfoPopover, Tag } from '@/ui';
import { Reveal, SectionHead } from '../_ui/kit';

type Req<T> = { status: 'idle' | 'loading' | 'ok' | 'error'; env?: Envelope<T>; error?: string };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// Spectra
// ---------------------------------------------------------------------------

const PICKS: { name: string; jp: string; ra: number; dec: number; note: string }[] = [
  { name: 'NGC 5548', jp: '活', ra: 214.4981, dec: 25.1368, note: 'Seyfert galaxy · broad emission lines' },
  { name: 'M87', jp: '巨', ra: 187.7059, dec: 12.3911, note: 'giant elliptical · weak lines' },
  { name: 'eBOSS galaxy', jp: '遠', ra: 184.99015, dec: 12.190777, note: 'distant galaxy, z ≈ 0.54' },
];

const C_KMS = 299_792.458;

function SpectrumChart({ s }: { s: Spectrum }) {
  const W = 900, H = 300, L = 54, R = 14, T = 40, B = 34;
  const n = s.wavelength.length;
  if (n < 2) return <p className="pg-quiet">The server returned no spectrum samples.</p>;
  const x0 = s.wavelength[0], x1 = s.wavelength[n - 1];
  const vals = s.flux.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const y0 = vals[Math.floor(vals.length * 0.005)] ?? 0;
  const y1 = vals[Math.floor(vals.length * 0.995)] ?? 1;
  const sx = (w: number) => L + ((w - x0) / (x1 - x0)) * (W - L - R);
  const sy = (f: number) => T + (1 - (Math.min(y1, Math.max(y0, f)) - y0) / Math.max(y1 - y0, 1e-6)) * (H - T - B);
  const path = (arr: number[]) =>
    arr
      .map((f, i) => (Number.isFinite(f) ? `${i ? 'L' : 'M'}${sx(s.wavelength[i]).toFixed(1)},${sy(f).toFixed(1)}` : ''))
      .join(' ');
  const ticks = [4000, 5000, 6000, 7000, 8000, 9000, 10000].filter((w) => w > x0 && w < x1);
  const yTicks = [y0, (y0 + y1) / 2, y1];
  const measured = [...s.lines_measured].sort((a, b) => (b.significance ?? 0) - (a.significance ?? 0)).slice(0, 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sci-spec" role="img" aria-label={`SDSS spectrum, ${s.class} at z = ${s.z.toFixed(4)}, ${measured.length} labelled lines`}>
      {ticks.map((w) => (
        <g key={w}>
          <line x1={sx(w)} x2={sx(w)} y1={T} y2={H - B} className="sci-spec-grid" />
          <text x={sx(w)} y={H - 12} textAnchor="middle" className="sci-s">
            {w.toLocaleString('en-US')} Å
          </text>
        </g>
      ))}
      {yTicks.map((f, i) => (
        <text key={i} x={L - 8} y={sy(f) + 4} textAnchor="end" className="sci-s num">
          {f.toFixed(f > 100 ? 0 : 1)}
        </text>
      ))}
      <line x1={L} x2={L} y1={T} y2={H - B} className="sci-spec-axis" />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="sci-spec-axis" />
      {s.lines_expected.map((l) => (
        <line key={`e${l.name}`} x1={sx(l.observed_wavelength)} x2={sx(l.observed_wavelength)} y1={T} y2={H - B} className="sci-spec-exp">
          <title>
            {l.name}: rest {l.rest_wavelength} Å, expected at {l.observed_wavelength} Å for z = {s.z.toFixed(4)}
          </title>
        </line>
      ))}
      {s.model.length === n && <path d={path(s.model)} className="sci-spec-model" />}
      <path d={path(s.flux)} className="sci-spec-flux" />
      {measured.map((l, i) => {
        const x = sx(l.observed_wavelength);
        const right = x > W - 110;
        return (
          <g key={l.name} className={l.emission === false ? 'abs' : 'emi'}>
            <line x1={x} x2={x} y1={T - 6} y2={H - B} className="sci-spec-line" />
            <text x={right ? x - 4 : x + 4} y={T - 18 + (i % 3) * 11} textAnchor={right ? 'end' : 'start'} className="sci-spec-lbl">
              {l.name}
            </text>
            <title>
              {l.name}: observed {l.observed_wavelength} Å{l.equivalent_width != null ? ` · EW ${l.equivalent_width} Å` : ''}
              {l.significance != null ? ` · ${l.significance}σ` : ''}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

export function SpectraSection() {
  const [ra, setRa] = useState(String(PICKS[0].ra));
  const [dec, setDec] = useState(String(PICKS[0].dec));
  const [st, setSt] = useState<Req<Spectrum>>({ status: 'idle' });

  const load = async (r: number, d: number) => {
    if (!Number.isFinite(r) || !Number.isFinite(d) || r < 0 || r > 360 || d < -90 || d > 90) {
      setSt({ status: 'error', error: 'RA must be 0–360° and Dec −90…+90°.' });
      return;
    }
    setSt((s) => ({ ...s, status: 'loading', error: undefined }));
    try {
      setSt({ status: 'ok', env: await api.spectra.at(r, d, 1) });
    } catch (e) {
      setSt({ status: 'error', error: errText(e) });
    }
  };
  useEffect(() => {
    void load(PICKS[0].ra, PICKS[0].dec);
  }, []);

  const s = st.env?.data;
  const busy = st.status === 'loading';
  const measured = s ? [...s.lines_measured].sort((a, b) => (b.significance ?? 0) - (a.significance ?? 0)) : [];

  return (
    <section className="pg-section" id="spectra">
      <SectionHead jp="分光" eyebrow="Bunkō · SDSS spectra, read by the server" right={st.env && <InfoPopover title="SDSS spectrum" provenance={st.env.provenance} computedAt={st.env.computed_at} notes={s?.note} />}>
        Light, split into its <em>colours</em>.
      </SectionHead>
      <Reveal>
        <Card brand={{ kanji: '光', text: 'Nearest SDSS spectrum' }} tag="/spectra/at">
          <div className="sci-controls">
            <div className="sci-picks" role="group" aria-label="Sample objects">
              {PICKS.map((p) => (
                <button
                  key={p.name}
                  className="pg-filter"
                  aria-pressed={Number(ra) === p.ra && Number(dec) === p.dec}
                  title={p.note}
                  disabled={busy}
                  onClick={() => {
                    setRa(String(p.ra));
                    setDec(String(p.dec));
                    void load(p.ra, p.dec);
                  }}
                >
                  <span className="jp" aria-hidden="true">
                    {p.jp}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <form
              className="sci-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void load(Number(ra), Number(dec));
              }}
            >
              <label className="sci-field">
                <span className="pg-label">RA °</span>
                <input value={ra} onChange={(e) => setRa(e.target.value)} inputMode="decimal" className="num" />
              </label>
              <label className="sci-field">
                <span className="pg-label">Dec °</span>
                <input value={dec} onChange={(e) => setDec(e.target.value)} inputMode="decimal" className="num" />
              </label>
              <Button type="submit" variant="secondary" disabled={busy}>
                {busy ? 'Fetching…' : 'Find spectrum'}
              </Button>
            </form>
          </div>

          {busy && (
            <p className="pg-loading" role="status">
              <span className="pg-brush-dot" aria-hidden="true" /> Asking SDSS SkyServer, then reading the FITS file…
            </p>
          )}
          {st.status === 'error' && (
            <p className="pg-error" role="alert">
              No spectrum: {st.error}
            </p>
          )}

          {s && (
            <div className={busy ? 'sci-dim' : ''}>
              <div className="pg-stats sci-spec-stats">
                <div className="pg-stat">
                  <span className="pg-label">Class</span>
                  <span className="v">{s.class}</span>
                  {s.subclass && <span className="pg-quiet">{s.subclass.toLowerCase()}</span>}
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Redshift z</span>
                  <span className="v num">{s.z.toFixed(5)}</span>
                  <span className="pg-quiet num">± {s.z_err.toExponential(1)}</span>
                </div>
                {s.z < 0.1 && (
                  <div className="pg-stat">
                    <span className="pg-label">Recession cz</span>
                    <span className="v num">
                      {Math.round(s.z * C_KMS).toLocaleString('en-US')}
                      <small>km/s</small>
                    </span>
                    <span className="pg-quiet">z × c, low-z approximation</span>
                  </div>
                )}
                <div className="pg-stat">
                  <span className="pg-label">Median S/N</span>
                  <span className="v num">{fmtNum(s.sn_median, 1)}</span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Lines &gt; 3σ</span>
                  <span className="v num">{s.lines_measured.length}</span>
                </div>
              </div>
              <SpectrumChart s={s} />
              <p className="pg-quiet sci-legend">
                <i className="sw flux" /> flux ({s.flux_unit}) · <i className="sw model" /> pipeline model · <i className="sw emi" /> measured emission · <i className="sw abs" /> absorption · dashed = where familiar lines fall at this z · {s.n_pixels.toLocaleString('en-US')} pixels binned to {s.binned_to}
              </p>
              <dl className="pg-kv">
                <dt>Plate · MJD · fibre</dt>
                <dd>
                  {s.plate} · {s.mjd} · {s.fiberid}
                </dd>
                <dt>Fibre position</dt>
                <dd>
                  RA {s.ra.toFixed(4)}°, Dec {s.dec >= 0 ? '+' : ''}
                  {s.dec.toFixed(4)}°{s.separation_arcsec != null && ` · ${fmtNum(s.separation_arcsec, 2)}″ from your position`}
                </dd>
                <dt>Exposure</dt>
                <dd>{fmtNum(s.exptime_s / 60, 1)} min</dd>
              </dl>
              {measured.length > 0 && (
                <table className="sci-table sci-lines">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Observed λ</th>
                      <th>EW</th>
                      <th>Width σ</th>
                      <th>Signif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measured.slice(0, 8).map((l) => (
                      <tr key={l.name}>
                        <td>
                          <strong>{l.name}</strong> {l.emission === false && <Chip variant="provenance">absorption</Chip>}
                        </td>
                        <td className="num">{fmtNum(l.observed_wavelength, 1, ' Å')}</td>
                        <td className="num">{fmtNum(l.equivalent_width, 1, ' Å')}</td>
                        <td className="num">{fmtNum(l.sigma_kms, 0, ' km/s')}</td>
                        <td className="num">{fmtNum(l.significance, 0, 'σ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <p className="pg-quiet">SDSS covers mostly the northern sky away from the Milky Way; elsewhere the server says so instead of guessing.</p>
        </Card>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Transients: near a position, and our own subtraction
// ---------------------------------------------------------------------------

function Stamp({ src, label, w, h, cands }: { src: string; label: string; w?: number; h?: number; cands?: SubtractionResult['candidates'] }) {
  return (
    <figure className="sci-stamp">
      <div className="sci-stamp-img">
        <img src={src} alt={label} />
        {cands && w && h && (
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
            {cands.map((c, i) => (
              <circle key={i} cx={c.x + 0.5} cy={c.y + 0.5} r={Math.max(2.5, Math.sqrt(c.npix / Math.PI) + 1.5)} className={c.real_candidate ? 'real' : 'rej'} />
            ))}
          </svg>
        )}
      </div>
      <figcaption className="pg-label">{label}</figcaption>
    </figure>
  );
}

export function TransientTools() {
  const tz = useApp((s) => s.tz);
  const [ra, setRa] = useState('10.68');
  const [dec, setDec] = useState('41.27');
  const [radius, setRadius] = useState('600');
  const [cone, setCone] = useState<Req<{ ra: number; dec: number; radius_arcsec: number; objects: TransientObject[] }>>({ status: 'idle' });
  const [oid, setOid] = useState('');
  const [dets, setDets] = useState<Req<LightcurvePoint[]>>({ status: 'idle' });
  const [candid, setCandid] = useState('');
  // post() unwraps the envelope, so the subtraction arrives without its provenance list
  const [sub, setSub] = useState<{ status: Req<unknown>['status']; data?: SubtractionResult; error?: string }>({ status: 'idle' });

  const search = async () => {
    const r = Number(ra), d = Number(dec), rad = Number(radius);
    if (!Number.isFinite(r) || !Number.isFinite(d) || !Number.isFinite(rad)) return setCone({ status: 'error', error: 'RA, Dec and radius must be numbers.' });
    setCone({ status: 'loading' });
    try {
      setCone({ status: 'ok', env: await api.transients.near(r, d, rad, 25) });
    } catch (e) {
      setCone({ status: 'error', error: errText(e) });
    }
  };

  const pick = async (id: string) => {
    const o = id.trim();
    if (!o) return;
    setOid(o);
    setSub({ status: 'idle' });
    setCandid('');
    setDets({ status: 'loading' });
    try {
      const env = await api.transients.object(o);
      const withStamps = env.data.lightcurve.detections.filter((p) => p.has_stamp).sort((a, b) => b.mjd - a.mjd);
      setDets({ status: 'ok', env: { ...env, data: withStamps } });
      if (withStamps[0]) setCandid(withStamps[0].candid);
    } catch (e) {
      setDets({ status: 'error', error: errText(e) });
    }
  };

  const subtract = async () => {
    if (!oid || !candid) return;
    setSub({ status: 'loading' });
    try {
      setSub({ status: 'ok', data: await api.transients.subtract(oid, candid) });
    } catch (e) {
      setSub({ status: 'error', error: errText(e) });
    }
  };

  const objs = cone.env?.data.objects ?? [];
  const r = sub.data;
  const [h, w] = r?.shape ?? [0, 0];
  const ztfDiff = r?.images.ztf_difference_url ? (r.images.ztf_difference_url.startsWith('http') ? r.images.ztf_difference_url : `${API_BASE}${r.images.ztf_difference_url}`) : null;

  return (
    <section className="pg-section" id="transients">
      <SectionHead jp="変光" eyebrow="Henkō · ZTF alerts via ALeRCE · our own subtraction">
        What <em>changed</em> in the sky.
      </SectionHead>
      <div className="pg-grid two">
        <Reveal i={0}>
          <Card brand={{ kanji: '探', text: 'Near a position' }} tag="/transients/near" className="sci-tr-card">
            <form
              className="sci-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <label className="sci-field">
                <span className="pg-label">RA °</span>
                <input value={ra} onChange={(e) => setRa(e.target.value)} inputMode="decimal" className="num" />
              </label>
              <label className="sci-field">
                <span className="pg-label">Dec °</span>
                <input value={dec} onChange={(e) => setDec(e.target.value)} inputMode="decimal" className="num" />
              </label>
              <label className="sci-field">
                <span className="pg-label">Radius ″</span>
                <input value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="decimal" className="num" />
              </label>
              <Button type="submit" variant="secondary" disabled={cone.status === 'loading'}>
                {cone.status === 'loading' ? 'Searching…' : 'Search'}
              </Button>
              {cone.env && <InfoPopover title="Transients near a position" provenance={cone.env.provenance} computedAt={cone.env.computed_at} />}
            </form>
            <p className="pg-quiet">Default is the Andromeda galaxy (M31). Pick an object to load its alert stamps.</p>
            {cone.status === 'loading' && (
              <p className="pg-loading" role="status">
                <span className="pg-brush-dot" aria-hidden="true" /> Asking the ALeRCE broker…
              </p>
            )}
            {cone.status === 'error' && (
              <p className="pg-error" role="alert">
                Search failed: {cone.error}
              </p>
            )}
            {cone.status === 'ok' && objs.length === 0 && <p className="pg-quiet">ZTF has no alert objects within {radius}″ of that position.</p>}
            {objs.length > 0 && (
              <div className="sci-tr-scroll">
                <table className="sci-table">
                  <thead>
                    <tr>
                      <th>Object</th>
                      <th>Class</th>
                      <th>Det.</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objs.map((o) => (
                      <tr key={o.oid} className={`sci-tr-row ${o.oid === oid ? 'sel' : ''}`} onClick={() => void pick(o.oid)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && void pick(o.oid)} aria-selected={o.oid === oid}>
                        <td>
                          <strong className="num">{o.oid}</strong>
                        </td>
                        <td>{o.class ? `${o.class}${o.probability != null ? ` · ${fmtNum(o.probability, 2)}` : ''}` : '—'}</td>
                        <td className="num">{o.ndet ?? '—'}</td>
                        <td className="num">{fmtDate(o.last_detection, tz)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Reveal>

        <Reveal i={1}>
          <Card brand={{ kanji: '差', text: 'Our own subtraction' }} tag="/transients/{oid}/subtract" className="sci-tr-card">
            <form
              className="sci-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void pick(oid);
              }}
            >
              <label className="sci-field grow">
                <span className="pg-label">ZTF object</span>
                <input value={oid} onChange={(e) => setOid(e.target.value)} placeholder="ZTF18abiiaxk" className="num" />
              </label>
              <Button type="submit" variant="secondary" disabled={!oid.trim() || dets.status === 'loading'}>
                {dets.status === 'loading' ? 'Loading…' : 'Load'}
              </Button>
            </form>
            {dets.status === 'error' && (
              <p className="pg-error" role="alert">
                Could not load {oid}: {dets.error}
              </p>
            )}
            {dets.status === 'ok' && dets.env && dets.env.data.length === 0 && <p className="pg-quiet">{oid} has no detections with image stamps.</p>}
            {dets.env && dets.env.data.length > 0 && (
              <div className="sci-fields">
                <label className="sci-field grow">
                  <span className="pg-label">Alert ({dets.env.data.length} with stamps)</span>
                  <select value={candid} onChange={(e) => setCandid(e.target.value)} className="num">
                    {dets.env.data.slice(0, 60).map((p) => (
                      <option key={p.candid} value={p.candid}>
                        {fmtDate(p.date, tz)} · {p.band} {fmtNum(p.mag, 2)} mag{p.real_bogus != null ? ` · rb ${fmtNum(p.real_bogus, 2)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="primary" onClick={() => void subtract()} disabled={!candid || sub.status === 'loading'}>
                  {sub.status === 'loading' ? 'Subtracting…' : 'Run our subtraction'}
                </Button>
              </div>
            )}
            {!oid && <p className="pg-quiet">Align → match blur → match flux → subtract → reject dipoles and edges, on the alert's own science and reference stamps.</p>}
            {sub.status === 'error' && (
              <p className="pg-error" role="alert">
                Subtraction failed: {sub.error}
              </p>
            )}
            {r && (
              <div className={sub.status === 'loading' ? 'sci-dim' : ''}>
                <div className="sci-stamps">
                  {r.images.science && <Stamp src={r.images.science} label="Science · alert epoch" />}
                  {r.images.template && <Stamp src={r.images.template} label="Reference · older" />}
                  {r.images.our_difference && <Stamp src={r.images.our_difference} label="Our difference" w={w} h={h} cands={r.candidates} />}
                  {ztfDiff && <Stamp src={ztfDiff} label="ZTF's difference" />}
                </div>
                <div className="pg-stats">
                  <div className="pg-stat">
                    <span className="pg-label">Real candidates</span>
                    <span className="v num">
                      {r.real_candidates}
                      <small>of {r.candidates.length}</small>
                    </span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Noise σ</span>
                    <span className="v num">{fmtNum(r.sigma, 2)}</span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">FWHM matched</span>
                    <span className="v num">
                      {fmtNum(r.fwhm_px.matched, 2)}
                      <small>px</small>
                    </span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Flux scale</span>
                    <span className="v num">{fmtNum(r.flux_scale, 3)}</span>
                  </div>
                  <InfoPopover title="Our subtraction" provenance={[{ source: 'computed', url: null, fetched_at: null, stale: false, cached: false, note: 'app/transients/subtract.py on the ZTF alert stamps from ALeRCE' }]} trace={{ notes: r.steps }} notes={r.note} />
                </div>
                <p className="pg-quiet">
                  <i className="sw real" /> kept as real · <i className="sw rej" /> rejected (dipole, edge or known source) · threshold {fmtNum(r.nsigma, 0)}σ · shift {r.shift_px.map((v) => v.toFixed(2)).join(', ')} px
                </p>
                {r.candidates.length > 0 && (
                  <div className="sci-tr-scroll short">
                    <table className="sci-table">
                      <thead>
                        <tr>
                          <th>x, y</th>
                          <th>Sign</th>
                          <th>S/N</th>
                          <th>Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...r.candidates]
                          .sort((a, b) => Number(b.real_candidate) - Number(a.real_candidate) || b.snr - a.snr)
                          .map((c, i) => (
                            <tr key={i}>
                              <td className="num">
                                {c.x.toFixed(1)}, {c.y.toFixed(1)}
                              </td>
                              <td>{c.sign}</td>
                              <td className="num">{fmtNum(c.snr, 1)}</td>
                              <td>{c.real_candidate ? <Tag>real</Tag> : <span className="pg-quiet">{c.flags.join(', ') || 'rejected'}</span>}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
