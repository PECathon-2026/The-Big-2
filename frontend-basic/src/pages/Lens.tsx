import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { LENS_STAGES, type Benchmark, type CatalogMatch, type Detection, type LensJob, type LensResult, type LensSample } from '../api';
import { Card, Chip, KV, Label } from '../components/Card';
import { JsonView } from '../components/JsonView';
import { SpectrumView } from '../components/SpectrumView';
import { ErrorBox, Loading } from '../components/Status';
import { fmtInt, fmtNum, fmtPct, fmtTime } from '../format';
import { asEnvelope, useApi } from '../hooks/useApi';
import { Await } from '../components/Status';

const POLL_MS = 800;

// ---------------------------------------------------------------------------
// Before / after comparison with a draggable gold blade
// ---------------------------------------------------------------------------

function Compare({ left, right, leftLabel, rightLabel }: { left: string; right: string; leftLabel: string; rightLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(50);
  const dragging = useRef(false);

  const update = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    setCut(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    <div
      className="compare"
      ref={ref}
      style={{ ['--cut' as string]: `${cut}%` }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setCut((c) => Math.max(0, c - 2));
        if (e.key === 'ArrowRight') setCut((c) => Math.min(100, c + 2));
      }}
      tabIndex={0}
      role="slider"
      aria-valuenow={Math.round(cut)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="before/after divider"
    >
      <img src={left} alt={leftLabel} draggable={false} />
      <img className="after" src={right} alt={rightLabel} draggable={false} />
      <div className="blade" />
      <span className="lab l">{leftLabel}</span>
      <span className="lab r">{rightLabel}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detections table
// ---------------------------------------------------------------------------

type SortKey = 'flux' | 'snr' | 'peak' | 'fwhm_px' | 'size_px' | 'mag_instrumental' | 'id';

function Detections({ list }: { list: Detection[] }) {
  const [key, setKey] = useState<SortKey>('flux');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [limit, setLimit] = useState(50);
  const sorted = useMemo(() => {
    const arr = [...list];
    arr.sort((a, b) => {
      const av = a[key] ?? -Infinity;
      const bv = b[key] ?? -Infinity;
      return (av === bv ? a.id - b.id : av < bv ? -1 : 1) * dir;
    });
    return arr;
  }, [list, key, dir]);
  const th = (k: SortKey, label: string, cls = 'r') => (
    <th className={`${cls} sortable`} onClick={() => (key === k ? setDir((d) => (d === 1 ? -1 : 1)) : (setKey(k), setDir(-1)))}>
      {label}
      {key === k ? (dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  );
  const hasRadec = list.some((d) => d.ra !== null && d.dec !== null);
  if (!list.length) return <div className="status">No detections.</div>;
  return (
    <div className="scroll-x">
      <table className="t">
        <thead>
          <tr>
            {th('id', '#', '')}
            <th>Kind</th>
            <th className="r">x, y</th>
            {th('flux', 'Flux')}
            {th('peak', 'Peak')}
            {th('snr', 'SNR')}
            {th('fwhm_px', 'FWHM px')}
            {th('size_px', 'Size px')}
            <th className="r">a / b / θ</th>
            <th className="r">e</th>
            {th('mag_instrumental', 'm_inst')}
            {hasRadec && <th className="r">RA / Dec</th>}
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((d) => (
            <tr key={d.id}>
              <td className="num">{d.id}</td>
              <td>
                <Chip tone={d.kind === 'star' ? 'gold' : d.kind === 'galaxy' ? 'mist' : ''}>{d.kind}</Chip>
              </td>
              <td className="r num small">
                {fmtNum(d.x, 1)}, {fmtNum(d.y, 1)}
              </td>
              <td className="r num">{fmtNum(d.flux, 1)}</td>
              <td className="r num">{fmtNum(d.peak, 1)}</td>
              <td className="r num">{fmtNum(d.snr, 1)}</td>
              <td className="r num">{fmtNum(d.fwhm_px, 2)}</td>
              <td className="r num">{fmtNum(d.size_px, 1)}</td>
              <td className="r num small">
                {fmtNum(d.a, 2)} / {fmtNum(d.b, 2)} / {fmtNum(d.theta_deg, 0)}°
              </td>
              <td className="r num">{fmtNum(d.ellipticity, 2)}</td>
              <td className="r num">{fmtNum(d.mag_instrumental, 2)}</td>
              {hasRadec && (
                <td className="r num small">
                  {d.ra !== null && d.dec !== null ? `${fmtNum(d.ra, 4)}, ${fmtNum(d.dec, 4)}` : '—'}
                </td>
              )}
              <td className="small">{d.name ?? <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > limit && (
        <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setLimit((l) => l + 100)} type="button">
          Show more ({list.length - limit} hidden)
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ job, onSolve, solving }: { job: LensJob; onSolve: () => void; solving: boolean }) {
  const r = job.result as LensResult;
  const id = job.job_id;
  const [overlay, setOverlay] = useState(false);
  const [residual, setResidual] = useState(false);
  const [stretch, setStretch] = useState<'asinh' | 'linear'>('asinh');
  const [bench, setBench] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: Benchmark; error?: Error }>({ status: 'idle' });
  const [catalog, setCatalog] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: CatalogMatch[] | unknown; error?: Error }>({ status: 'idle' });
  const [skyviewErr, setSkyviewErr] = useState(false);

  const runBench = async () => {
    setBench({ status: 'loading' });
    try {
      setBench({ status: 'ok', data: await api.lens.benchmark(id, 40) });
    } catch (e) {
      setBench({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  };
  const loadCatalog = useCallback(async () => {
    setCatalog({ status: 'loading' });
    try {
      setCatalog({ status: 'ok', data: await api.lens.catalog(id) });
    } catch (e) {
      setCatalog({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, [id]);

  useEffect(() => {
    if (r.wcs.solved) void loadCatalog();
  }, [r.wcs.solved, loadCatalog]);

  const fm = r.honesty.forward_model;
  const verdictTone = fm.verdict === 'noise-like' ? 'ok' : 'verm';
  const wcsStage = job.stages.find((s) => s.name === 'wcs');

  return (
    <div className="grid two" style={{ marginTop: 14 }}>
      <Card
        en="Before / after"
        jp="刃"
        className="span-2"
        hair
        right={
          <span className="row" style={{ gap: 6 }}>
            <select value={stretch} onChange={(e) => setStretch(e.target.value as 'asinh' | 'linear')} style={{ minHeight: 26, padding: '2px 6px' }}>
              <option value="asinh">asinh</option>
              <option value="linear">linear</option>
            </select>
            <Chip tone={overlay ? 'on' : ''} onClick={() => setOverlay((o) => !o)}>
              overlay
            </Chip>
            <Chip tone={residual ? 'on' : ''} onClick={() => setResidual((o) => !o)}>
              residual
            </Chip>
          </span>
        }
      >
        <div className="grid two">
          <Compare left={api.lens.imageUrl(id, 'original', stretch)} right={api.lens.imageUrl(id, 'restored', stretch)} leftLabel="Original" rightLabel="Restored" />
          <div className="stack">
            {overlay && (
              <div>
                <Label en="Overlay" jp="検出" />
                <div className="img-box">
                  <img src={api.lens.imageUrl(id, 'overlay', stretch)} alt="detections overlay" />
                </div>
              </div>
            )}
            {residual && (
              <div>
                <Label en="Residual" jp="残差" />
                <div className="img-box">
                  <img src={api.lens.imageUrl(id, 'residual', stretch)} alt="residual (original − forward model)" />
                </div>
              </div>
            )}
            {!overlay && !residual && <div className="status">Toggle overlay or residual to view them here. Drag the gold blade to compare.</div>}
            <div className="muted small">
              {r.image.source_filename} · {r.image.width}×{r.image.height} · {r.image.channels} ch · {r.image.format}
              {r.image.is_fits ? ' · FITS' : ''}
            </div>
            <div className="muted small">{r.units_note}</div>
          </div>
        </div>
      </Card>

      <Card en="Proof of honesty" jp="誠" hair right={<Chip tone={verdictTone}>{fm.verdict}</Chip>}>
        <div className="metrics">
          <div className="m">
            <span>SSIM</span>
            <b>{fmtNum(r.honesty.ssim, 3)}</b>
          </div>
          <div className="m">
            <span>PSNR dB</span>
            <b>{fmtNum(r.honesty.psnr_db, 1)}</b>
          </div>
          <div className="m">
            <span>χ² reduced</span>
            <b>{fmtNum(fm.chi2_reduced, 2)}</b>
          </div>
          <div className="m">
            <span>Structure</span>
            <b>{fmtNum(fm.structure_score, 3)}</b>
          </div>
          <div className="m">
            <span>Residual RMS</span>
            <b>{fmtNum(fm.residual_rms, 3)}</b>
          </div>
          <div className="m">
            <span>Invented px</span>
            <b className={r.honesty.invented_pixels > 0 ? 'verm' : ''}>{fmtInt(r.honesty.invented_pixels)}</b>
          </div>
        </div>
        <hr className="hr" />
        <KV
          rows={[
            [
              'Flux conservation',
              `${r.honesty.flux_conservation.n_stars} stars · median ratio ${fmtNum(r.honesty.flux_conservation.median_ratio, 3)} · max dev ${fmtNum(r.honesty.flux_conservation.max_abs_dev_pct, 1, '%')} · within 5%: ${fmtPct(r.honesty.flux_conservation.within_5pct_fraction, 0)}`,
            ],
            [
              'Position shift',
              `${r.honesty.position_shift.n_stars} stars · median ${fmtNum(r.honesty.position_shift.median_shift_px, 3)} px · max ${fmtNum(r.honesty.position_shift.max_shift_px, 3)} px`,
            ],
            ['Noise', `bg ${fmtNum(r.noise.background_median, 2)} · σ ${fmtNum(r.noise.background_sigma, 3)} · ${r.noise.method}`],
            ['Denoise', `${r.restoration.denoise.method} · strength ${r.restoration.denoise.strength}`],
            [
              'Deblur',
              `${r.restoration.deblur.method} · ${r.restoration.deblur.iterations} it · ${r.restoration.deblur.applied ? 'applied' : 'not applied'}${r.restoration.deblur.reason ? ` (${r.restoration.deblur.reason})` : ''}`,
            ],
          ]}
        />
        {r.honesty.notes.length > 0 && (
          <ul className="notes">
            {r.honesty.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <hr className="hr" />
        <code style={{ whiteSpace: 'pre-wrap', color: 'var(--paper-3)' }}>{r.trace.formula}</code>
        {r.trace.notes.length > 0 && (
          <ul className="notes">
            {r.trace.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      <div className="stack">
        <Card en="PSF" jp="点像" right={`${r.psf.method} · ${r.psf.n_stars_used} stars`}>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <img className="thumb" src={api.lens.imageUrl(id, 'psf', 'linear')} alt="PSF kernel" />
            <div>
              <div className="big">{fmtNum(r.psf.fwhm_px, 2)}</div>
              <div className="sub">FWHM px · kernel {r.psf.kernel_size}</div>
            </div>
            <img className="thumb" src={api.lens.imageUrl(id, 'noise', 'linear')} alt="noise map" title="noise map" style={{ maxWidth: 100 }} />
          </div>
        </Card>

        <Card en="Counts" jp="数">
          <div className="metrics">
            <div className="m">
              <span>Stars</span>
              <b>{r.counts.stars}</b>
            </div>
            <div className="m">
              <span>Galaxies</span>
              <b>{r.counts.galaxies}</b>
            </div>
            <div className="m">
              <span>Unknown</span>
              <b>{r.counts.unknown}</b>
            </div>
          </div>
        </Card>

        <Card
          en="Benchmark"
          jp="試"
          right={
            <button className="btn small" onClick={() => void runBench()} disabled={bench.status === 'loading'} type="button">
              {bench.status === 'loading' ? 'Running…' : 'Run benchmark'}
            </button>
          }
        >
          {bench.status === 'idle' && <div className="muted small">Injects 40 synthetic stars and measures recovery.</div>}
          {bench.status === 'loading' && <Loading what="Injecting synthetic stars" />}
          {bench.status === 'error' && bench.error && <ErrorBox error={bench.error} onRetry={() => void runBench()} />}
          {bench.status === 'ok' && bench.data && (
            <div className="stack">
              <div className="metrics">
                <div className="m">
                  <span>Recovery</span>
                  <b>{fmtPct(bench.data.recovery_rate, 0)}</b>
                </div>
                <div className="m">
                  <span>Recovered</span>
                  <b>
                    {bench.data.recovered}/{bench.data.injected}
                  </b>
                </div>
                <div className="m">
                  <span>False +</span>
                  <b>{bench.data.false_positives}</b>
                </div>
                <div className="m">
                  <span>Mag RMS</span>
                  <b>{fmtNum(bench.data.magnitude_error_rms, 3)}</b>
                </div>
                <div className="m">
                  <span>Pos RMS px</span>
                  <b>{fmtNum(bench.data.position_error_rms_px, 3)}</b>
                </div>
              </div>
              {bench.data.note && <div className="muted small">{bench.data.note}</div>}
            </div>
          )}
        </Card>
      </div>

      <Card
        en="WCS · plate solve"
        jp="天図"
        className="span-2"
        right={
          <span className="row" style={{ gap: 8 }}>
            {r.wcs.solved ? <Chip tone="ok">solved · {r.wcs.method}</Chip> : <Chip tone="mist">unsolved</Chip>}
            {wcsStage && <Chip tone={wcsStage.status === 'running' ? 'gold' : ''}>wcs stage: {wcsStage.status}</Chip>}
            <button className="btn small" onClick={onSolve} disabled={solving} type="button">
              {solving ? 'Solving…' : 'Solve'}
            </button>
          </span>
        }
      >
        <div className="grid two">
          <div className="stack">
            <KV
              rows={[
                ['Solved', r.wcs.solved ? 'yes' : 'no'],
                ['Method', r.wcs.method ?? '—'],
                ['Center', r.wcs.ra_center !== null ? `RA ${fmtNum(r.wcs.ra_center, 4)}° · Dec ${fmtNum(r.wcs.dec_center, 4)}°` : '—'],
                ['FOV', fmtNum(r.wcs.fov_deg, 3, '°')],
                ['Scale', fmtNum(r.wcs.pixel_scale_arcsec, 3, ' ″/px')],
                ['Orientation', fmtNum(r.wcs.orientation_deg, 2, '°')],
              ]}
            />
            {wcsStage?.detail && <div className="muted small">{wcsStage.detail}</div>}
            {r.wcs.solved && <FieldAlerts id={id} />}
            {r.wcs.solved && r.wcs.ra_center !== null && (
              <div style={{ marginBottom: 12 }}>
                <SpectrumView ra={Number(r.wcs.ra_center.toFixed(5))} dec={Number((r.wcs.dec_center as number).toFixed(5))} />
              </div>
            )}
            {r.wcs.solved && (
              <div>
                <Label en="Catalog matches" jp="名" right={<button className="btn small ghost" onClick={() => void loadCatalog()} type="button">Reload</button>} />
                {catalog.status === 'loading' && <Loading what="Querying SIMBAD" />}
                {catalog.status === 'error' && catalog.error && <ErrorBox error={catalog.error} onRetry={() => void loadCatalog()} />}
                {catalog.status === 'ok' && Array.isArray(catalog.data) && catalog.data.length === 0 && <div className="status">No catalogue matches.</div>}
                {catalog.status === 'ok' && Array.isArray(catalog.data) && catalog.data.length > 0 && (
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Det</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th className="r">RA / Dec</th>
                        <th className="r">Sep ″</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(catalog.data as CatalogMatch[]).map((m, i) => (
                        <tr key={i}>
                          <td className="num">{m.detection_id ?? m.id ?? '—'}</td>
                          <td className="moon">{m.name ?? '—'}</td>
                          <td className="small">{m.otype ?? '—'}</td>
                          <td className="r num small">
                            {m.ra !== null && m.ra !== undefined ? `${fmtNum(m.ra, 4)}, ${fmtNum(m.dec, 4)}` : '—'}
                          </td>
                          <td className="r num">{fmtNum(m.separation_arcsec ?? null, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {catalog.status === 'ok' && !Array.isArray(catalog.data) && <JsonView value={catalog.data} label="catalog" />}
              </div>
            )}
          </div>
          <div>
            {r.wcs.solved ? (
              <div className="grid two">
                <div>
                  <Label en="Original" jp="原" />
                  <div className="img-box">
                    <img src={api.lens.imageUrl(id, 'original', stretch)} alt="original" />
                  </div>
                </div>
                <div>
                  <Label en="SkyView · DSS2 Red" jp="鏡" />
                  <div className="img-box">
                    {skyviewErr ? (
                      <div className="muted small" style={{ padding: 12 }}>
                        SkyView cutout unavailable (404 until the WCS is known, or NASA SkyView did not answer).
                      </div>
                    ) : (
                      <img src={api.lens.skyviewUrl(id, 'DSS2 Red')} alt="SkyView DSS2 Red cutout" onError={() => setSkyviewErr(true)} />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="status">
                Not solved. Press <b>Solve</b> to submit to astrometry.net (needs a key on the backend; health reports <code>astrometry_enabled</code>). FITS headers and AVM tags are
                read automatically.
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card en="Detections" jp="検出" className="span-2" right={`${r.detections.length} objects · click a header to sort`}>
        <Detections list={r.detections} />
      </Card>

      <Card en="Raw result" jp="生" className="span-2">
        <JsonView value={job} open={false} label="job JSON" />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function stageTone(s: string): string {
  if (s === 'done') return 'ok';
  if (s === 'running') return 'gold';
  if (s === 'failed') return 'verm';
  if (s === 'skipped') return 'mist';
  return '';
}

export default function Lens() {
  const samples = useApi((s) => asEnvelope(api.lens.samples(s)), []);
  const [sampleId, setSampleId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [denoise, setDenoise] = useState(0.5);
  const [deblur, setDeblur] = useState(0);
  const [sigma, setSigma] = useState(3.0);
  const [job, setJob] = useState<LensJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollErr, setPollErr] = useState<Error | null>(null);
  const [solving, setSolving] = useState(false);
  const [polling, setPolling] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sampleId && samples.data && samples.data.length) setSampleId(samples.data[0].id);
  }, [samples.data, sampleId]);

  // Poll the job every 800 ms while it is queued/running (or while a solve is in flight).
  useEffect(() => {
    if (!jobId || !polling) return;
    let alive = true;
    const tick = async () => {
      try {
        const j = await api.lens.job(jobId);
        if (!alive) return;
        setJob(j);
        setPollErr(null);
        const wcs = j.stages.find((s) => s.name === 'wcs');
        const terminal = j.status === 'done' || j.status === 'failed';
        const wcsBusy = solving && wcs && (wcs.status === 'running' || wcs.status === 'queued');
        if (terminal && !wcsBusy) {
          setPolling(false);
          if (solving) setSolving(false);
        }
      } catch (e) {
        if (!alive) return;
        setPollErr(e instanceof Error ? e : new Error(String(e)));
        setPolling(false);
      }
    };
    void tick();
    const h = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [jobId, polling, solving]);

  const submit = async () => {
    setSubmitErr(null);
    setSubmitting(true);
    setJob(null);
    try {
      const created = await api.lens.createJob({
        file: file,
        sample_id: file ? null : sampleId || null,
        denoise_strength: denoise,
        deblur_iterations: deblur,
        detect_sigma: sigma,
      });
      setJobId(created.job_id);
      setPolling(true);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const solve = async () => {
    if (!jobId) return;
    setSolving(true);
    try {
      await api.lens.solve(jobId);
      setPolling(true);
      // give the wcs stage a few seconds to flip to running before polling can stop
      setTimeout(() => setPolling(true), POLL_MS);
    } catch (e) {
      setSolving(false);
      setPollErr(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const selectedSample: LensSample | undefined = samples.data?.find((s) => s.id === sampleId);

  return (
    <main className="page">
      <div className="page-title">
        <h1>Spirit Lens</h1>
        <span className="jp">鏡</span>
        <span className="sub">honest restoration · detections · plate solve</span>
      </div>

      <div className="grid two">
        <Card en="Source" jp="原">
          <div className="stack">
            <Await q={samples} what="Listing samples" isEmpty={(s) => s.length === 0} emptyText="No samples served by the backend; upload a file instead.">
              {(list) => (
                <label className="stack" style={{ gap: 4 }}>
                  <span className="muted small">Sample</span>
                  <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} disabled={!!file}>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.kind}
                        {s.has_wcs ? ' · WCS' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedSample && (
                    <span className="muted small">
                      {selectedSample.description}{' '}
                      <a href={api.lens.sampleUrl(selectedSample.id)} target="_blank" rel="noreferrer">
                        open image
                      </a>
                    </span>
                  )}
                </label>
              )}
            </Await>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted small">…or upload (JPG / PNG / TIFF / FITS)</span>
              <span className="row">
                <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.tif,.tiff,.fits,.fit,.fts,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && (
                  <button
                    className="btn small ghost"
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                  >
                    clear
                  </button>
                )}
              </span>
            </label>
          </div>
        </Card>

        <Card en="Parameters" jp="調整">
          <div className="stack">
            <label className="row">
              <span style={{ width: 150 }} className="muted small">
                denoise_strength
              </span>
              <input type="range" min={0} max={1} step={0.05} value={denoise} onChange={(e) => setDenoise(Number(e.target.value))} />
              <span className="num">{denoise.toFixed(2)}</span>
            </label>
            <label className="row">
              <span style={{ width: 150 }} className="muted small">
                deblur_iterations
              </span>
              <input type="number" min={0} max={200} step={1} value={deblur} onChange={(e) => setDeblur(Math.max(0, Math.round(Number(e.target.value))))} />
              <span className="muted small">0 = auto</span>
            </label>
            <label className="row">
              <span style={{ width: 150 }} className="muted small">
                detect_sigma
              </span>
              <input type="number" min={0.5} max={20} step={0.5} value={sigma} onChange={(e) => setSigma(Number(e.target.value))} />
            </label>
            <div className="row">
              <button className="btn primary" onClick={() => void submit()} disabled={submitting || polling || (!file && !sampleId)} type="button">
                {submitting ? 'Submitting…' : polling ? 'Processing…' : 'Restore'}
              </button>
              {jobId && (
                <span className="muted small num">
                  job <code>{jobId}</code>
                </span>
              )}
            </div>
            {submitErr && <ErrorBox error={submitErr} onRetry={() => void submit()} />}
          </div>
        </Card>
      </div>

      {jobId && (
        <Card en="Stages" jp="工程" className="span-2" right={job ? `${job.status} · created ${fmtTime(job.created_at, undefined, true)}` : 'waiting…'}>
          <div className="stages">
            {LENS_STAGES.map((name) => {
              const st = job?.stages.find((s) => s.name === name);
              const status = st?.status ?? 'pending';
              const dur = st?.started_at && st.ended_at ? `${((new Date(st.ended_at).getTime() - new Date(st.started_at).getTime()) / 1000).toFixed(1)}s` : '';
              return (
                <Chip key={name} tone={stageTone(status)} title={st?.detail ?? ''}>
                  {name} · {status}
                  {dur && <span className="num muted"> {dur}</span>}
                </Chip>
              );
            })}
            {job?.stages
              .filter((s) => !(LENS_STAGES as readonly string[]).includes(s.name))
              .map((s) => (
                <Chip key={s.name} tone={stageTone(s.status)} title={s.detail ?? ''}>
                  {s.name} · {s.status}
                </Chip>
              ))}
          </div>
          {job?.stages.some((s) => s.detail) && (
            <ul className="notes">
              {job.stages
                .filter((s) => s.detail)
                .map((s) => (
                  <li key={s.name}>
                    <span className="gold">{s.name}</span>: {s.detail}
                  </li>
                ))}
            </ul>
          )}
          {pollErr && (
            <div style={{ marginTop: 8 }}>
              <ErrorBox error={pollErr} onRetry={() => setPolling(true)} />
            </div>
          )}
          {job?.status === 'failed' && <div className="warn" style={{ marginTop: 8 }}>Job failed: {job.error ?? 'no error message'}</div>}
          {polling && !job && <Loading what="Waiting for the first status" />}
        </Card>
      )}

      {job?.status === 'done' && job.result && <Results job={job} onSolve={() => void solve()} solving={solving} />}
      {job?.status === 'done' && !job.result && <div className="status" style={{ marginTop: 14 }}>Job is done but carried no result.</div>}
    </main>
  );
}

/** ZTF alert objects inside this job's field of view (needs a solved WCS). Links to the Transients page. */
function FieldAlerts({ id }: { id: string }) {
  const q = useApi((s) => api.transients.field(id, s), [id]);
  return (
    <div style={{ marginBottom: 12 }}>
      <Label en="Alerts in this field" jp="変光" right={q.data ? `${q.data.objects.length} ZTF objects within ${Math.round(q.data.radius_arcsec / 60)}′` : undefined} />
      <Await q={q} what="Asking the ALeRCE broker" isEmpty={(d) => d.objects.length === 0} emptyText="No ZTF alert objects in this field.">
        {(d) => (
          <div className="small">
            {d.objects.slice(0, 8).map((o) => (
              <div key={o.oid}>
                <code>{o.oid}</code> · {o.ndet} detections · {o.class ?? 'unclassified'} ·{' '}
                <a href={`/transients`} className="gold">
                  light curve ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </Await>
    </div>
  );
}
