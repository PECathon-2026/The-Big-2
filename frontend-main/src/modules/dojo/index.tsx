/**
 * /dojo/:id — 道場 the Dojo (§9.4): the full Katana slider on a Spirit Lens job. Modes 原 Original ·
 * 修 Restored · 誠 Honesty (residual heat map + kintsugi seams). Detections only on the restored side,
 * with an inspector drawer. Honesty metrics, PSF, plate solve and the synthetic-star benchmark.
 * `/dojo/mock-<seed>` runs the labelled browser mock (only offered when the Lens API is down).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, type Benchmark, type Detection, type LensJob, type LensResult } from '@/data/api';
import { makeMockLens, MOCK_PROVENANCE, type MockLens } from '@/data/mocks/lens';
import { fmtNum, fmtPct } from '@/data/format';
import { Button, Card, Chip, Divider, InfoPopover, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import KatanaSlider from '../_ui/KatanaSlider';
import { Num, Reveal, SectionHead } from '../_ui/kit';
import { Detections, HonestyCanvas, Kintsugi, Stages } from '../lens/shared';
import '../lens/lens.css';

type Mode = 'original' | 'restored' | 'honesty';
const MODES: { id: Mode; jp: string; en: string }[] = [
  { id: 'original', jp: '原', en: 'Original' },
  { id: 'restored', jp: '修', en: 'Restored' },
  { id: 'honesty', jp: '誠', en: 'Honesty' },
];

function Metric({ label, value, decimals = 2, suffix = '', mock, note }: { label: string; value: number | null | undefined; decimals?: number; suffix?: string; mock: boolean; note?: string }) {
  return (
    <div className="pg-stat" title={note}>
      <span className="pg-label">{label}</span>
      <span className="v">
        <Num value={value ?? null} decimals={decimals} suffix={suffix} />
      </span>
      {mock && <Chip variant="mock">MOCK</Chip>}
    </div>
  );
}

function Inspector({ d, onClose, mock }: { d: Detection; onClose: () => void; mock: boolean }) {
  return (
    <aside className="dj-drawer" aria-label={`Detection ${d.id}`}>
      <div className="dj-drawer-head">
        <span className={`sc-ev-glyph ${d.kind === 'star' ? 'meteor' : d.kind === 'galaxy' ? 'satellite' : 'eclipse'}`} lang="ja" aria-hidden="true">
          {d.kind === 'star' ? '星' : d.kind === 'galaxy' ? '雲' : '謎'}
        </span>
        <div>
          <h3 className="pg-name">{d.name ?? `Detection ${d.id}`}</h3>
          <span className="pg-quiet">
            {d.kind} {mock && <Chip variant="mock">MOCK</Chip>}
          </span>
        </div>
        <button className="tw-icon-btn" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </div>
      <dl className="pg-kv">
        <dt>Position</dt>
        <dd>
          x {fmtNum(d.x, 1)} · y {fmtNum(d.y, 1)} px
        </dd>
        {d.ra != null && d.dec != null && (
          <>
            <dt>RA · Dec</dt>
            <dd>
              {fmtNum(d.ra, 4)}° · {fmtNum(d.dec, 4)}°
            </dd>
          </>
        )}
        <dt>Flux</dt>
        <dd>{fmtNum(d.flux, 1)}</dd>
        <dt>Instr. magnitude</dt>
        <dd>{fmtNum(d.mag_instrumental, 2)}</dd>
        <dt>FWHM</dt>
        <dd>{fmtNum(d.fwhm_px, 2)} px</dd>
        <dt>SNR</dt>
        <dd>{fmtNum(d.snr, 1)}</dd>
        <dt>Shape a · b · θ</dt>
        <dd>
          {fmtNum(d.a, 2)} · {fmtNum(d.b, 2)} · {fmtNum(d.theta_deg, 0)}°
        </dd>
        <dt>Ellipticity</dt>
        <dd>{fmtNum(d.ellipticity, 2)}</dd>
      </dl>
    </aside>
  );
}

export default function Dojo() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const isMock = id.startsWith('mock-');
  const [job, setJob] = useState<LensJob | null>(null);
  const [mock, setMock] = useState<MockLens | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('restored');
  const [sel, setSel] = useState<number | null>(null);
  const [showDets, setShowDets] = useState(true);
  const [seams, setSeams] = useState<{ seamPx: number; hotFrac: number } | null>(null);
  const [bench, setBench] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: Benchmark; error?: string }>({ status: 'idle' });
  const [skyErr, setSkyErr] = useState(false);

  useEffect(() => {
    if (isMock) {
      setMock(makeMockLens(Number(id.slice(5)) || 42));
      return;
    }
    let alive = true;
    let h = 0;
    const tick = async () => {
      try {
        const j = await api.lens.job(id);
        if (!alive) return;
        setJob(j);
        setErr(null);
        if (j.status === 'done' || j.status === 'failed') return;
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      h = window.setTimeout(tick, 800);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [id, isMock]);

  const r: LensResult | null = isMock ? (mock?.result ?? null) : job?.status === 'done' ? job.result : null;
  const src = useMemo(() => {
    if (isMock && mock) return { original: mock.original, restored: mock.restored, residual: null as string | null };
    if (job) return { original: api.lens.imageUrl(job.job_id, 'original'), restored: api.lens.imageUrl(job.job_id, 'restored'), residual: api.lens.imageUrl(job.job_id, 'residual') };
    return null;
  }, [isMock, mock, job]);
  const det = r?.detections.find((d) => d.id === sel) ?? null;
  const prov = isMock ? MOCK_PROVENANCE : [{ source: 'spirit-lens pipeline', url: null, fetched_at: job?.created_at ?? null, stale: false, cached: false, note: r?.units_note ?? null }];

  const runBench = async () => {
    if (!job) return;
    setBench({ status: 'loading' });
    try {
      setBench({ status: 'ok', data: await api.lens.benchmark(job.job_id, 40) });
    } catch (e) {
      setBench({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const h = r?.honesty;
  const fm = h?.forward_model;

  return (
    <PageFrame
      seal="道"
      eyebrow="四 · 道場 Dōjō · The Katana cut"
      title={
        <>
          Cut between <em>before</em> and after.
        </>
      }
      lede="Drag the katana, click anywhere to cut there, or use the arrow keys. Wheel to zoom, drag to pan once zoomed. Detections live only on the restored side."
      wide
      actions={isMock ? <Chip variant="mock" /> : undefined}
    >
      {err && !job && (
        <Card plain>
          <p className="pg-error">This job is not on the Lens server ({err}). Jobs live in the server's memory, so a restart forgets them.</p>
          <Button variant="gold" onClick={() => nav('/lens')}>
            Back to the Lens
          </Button>
        </Card>
      )}
      {job && job.status !== 'done' && (
        <Card plain className="ln-stage-card">
          <Stages stages={job.stages} />
          <Kintsugi running={job.status !== 'failed'} label={job.status === 'failed' ? `Failed: ${job.error ?? ''}` : 'Restoring · 修復中'} />
        </Card>
      )}

      {r && src && (
        <>
          <div className="dj-modes" role="tablist" aria-label="View mode">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={mode === m.id} className="pg-filter" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} disabled={m.id === 'honesty' && !src.residual}>
                <Kanji>{m.jp}</Kanji> {m.en}
              </button>
            ))}
            <label className="dj-toggle">
              <input type="checkbox" checked={showDets} onChange={(e) => setShowDets(e.target.checked)} /> detections
            </label>
            {mode === 'honesty' && <span className="pg-quiet">Residual: sumi = no change, crimson → gold = up to 3σ. Gold seams trace where the change exceeds ~2σ.</span>}
          </div>

          <div className="dj-stage">
            <Reveal>
              <KatanaSlider
                width={r.image.width}
                height={r.image.height}
                only={mode === 'original' ? 'left' : null}
                left={<img src={src.original} alt="Original" />}
                right={mode === 'honesty' && src.residual ? <HonestyCanvas src={src.residual} onStats={setSeams} /> : <img src={src.restored} alt="Restored" />}
                rightLabel={mode === 'honesty' ? '誠 Honesty' : '修 Restored'}
                leftLabel={isMock ? '原 Original · simulated degradation · mock' : '原 Original'}
                rightOverlay={showDets && mode === 'restored' ? <Detections list={r.detections} width={r.image.width} height={r.image.height} sel={sel} onSel={setSel} /> : undefined}
                badge={isMock ? <Chip variant="mock" /> : undefined}
              />
            </Reveal>
            {det && <Inspector d={det} onClose={() => setSel(null)} mock={isMock} />}
          </div>

          <div className="pg-grid three" style={{ marginTop: 8 }}>
            <Reveal i={0}>
              <Card brand={{ kanji: '誠', text: 'Proof of honesty' }} tag={fm?.verdict ?? '—'} className="dj-card">
                <div className="pg-stats">
                  <Metric label="SSIM" value={h?.ssim} decimals={3} mock={isMock} />
                  <Metric label="PSNR" value={h?.psnr_db} decimals={1} suffix=" dB" mock={isMock} />
                  <Metric label="χ² reduced" value={fm?.chi2_reduced} mock={isMock} />
                  <Metric label="Flux kept" value={h?.flux_conservation.median_ratio} decimals={3} mock={isMock} note="median restored / original flux on the brightest unsaturated sources" />
                  <Metric label="Invented px" value={h?.invented_pixels} decimals={0} mock={isMock} />
                </div>
                <Divider />
                {seams && mode === 'honesty' && (
                  <p className="pg-quiet num">
                    Seams in view: {seams.seamPx.toLocaleString('en-US')} px · {fmtPct(seams.hotFrac, 2)} of pixels changed by more than ~2σ (measured from the residual image in your browser).
                  </p>
                )}
                <ul className="dj-notes">
                  {h?.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                <InfoPopover title="Honesty formula" trace={{ formula: r.trace.formula, notes: r.trace.notes }} provenance={prov} />
              </Card>
            </Reveal>
            <Reveal i={1}>
              <Card brand={{ kanji: '点', text: 'The blur we measured' }} tag={r.psf.method} className="dj-card">
                <div className="pg-stats">
                  <Metric label="PSF FWHM" value={r.psf.fwhm_px} suffix=" px" mock={isMock} />
                  <Metric label="Stars used" value={r.psf.n_stars_used} decimals={0} mock={isMock} />
                  <Metric label="Noise σ" value={r.noise.background_sigma} mock={isMock} />
                </div>
                {!isMock && job && <img className="dj-psf" src={api.lens.imageUrl(job.job_id, 'psf', 'linear')} alt="Measured PSF kernel" />}
                <p className="pg-quiet">
                  {r.restoration.denoise.method} (strength {r.restoration.denoise.strength}) · {r.restoration.deblur.method}, {r.restoration.deblur.iterations} iterations{r.restoration.deblur.applied ? '' : ' (not applied)'}
                  {r.restoration.deblur.reason ? ` · ${r.restoration.deblur.reason}` : ''}
                </p>
                <p className="pg-quiet">{r.noise.method}</p>
              </Card>
            </Reveal>
            <Reveal i={2}>
              <Card brand={{ kanji: '図', text: 'Where in the sky' }} tag={r.wcs.solved ? 'solved' : 'unsolved'} className="dj-card">
                {r.wcs.solved ? (
                  <>
                    <dl className="pg-kv">
                      <dt>Method</dt>
                      <dd>{r.wcs.method}</dd>
                      <dt>Centre</dt>
                      <dd>
                        RA {fmtNum(r.wcs.ra_center, 3)}° · Dec {fmtNum(r.wcs.dec_center, 3)}°
                      </dd>
                      <dt>Field</dt>
                      <dd>{fmtNum(r.wcs.fov_deg, 3)}°</dd>
                      <dt>Scale</dt>
                      <dd>{fmtNum(r.wcs.pixel_scale_arcsec, 3)} ″/px</dd>
                    </dl>
                    {job && !skyErr && (
                      <figure className="dj-skyview">
                        <img src={api.lens.skyviewUrl(job.job_id, 'DSS2 Red')} alt="NASA SkyView DSS2 Red survey cutout of the same field" onError={() => setSkyErr(true)} loading="lazy" />
                        <figcaption className="pg-quiet">NASA SkyView · DSS2 Red, the same patch of sky</figcaption>
                      </figure>
                    )}
                  </>
                ) : (
                  <p className="pg-quiet">No sky coordinates: the image carries no FITS WCS or AVM tags{isMock ? ' (mock)' : ''}.</p>
                )}
                <Divider />
                <p className="pg-quiet">
                  {r.counts.stars} stars · {r.counts.galaxies} galaxies · {r.counts.unknown} unknown {isMock && <Chip variant="mock">MOCK</Chip>}
                </p>
              </Card>
            </Reveal>
          </div>

          {!isMock && job && (
            <section className="pg-section" id="benchmark">
              <SectionHead jp="試" eyebrow="Tameshi · test the method" right={<Tag>40 synthetic stars</Tag>}>
                Put it to the <em>test</em>.
              </SectionHead>
              <Card plain className="dj-bench">
                <p className="pg-quiet">Injects stars of known brightness into this very image, runs detection again and measures what came back.</p>
                <Button variant="primary" onClick={() => void runBench()} disabled={bench.status === 'loading'}>
                  {bench.status === 'loading' ? 'Injecting stars…' : 'Run the benchmark'}
                </Button>
                {bench.status === 'error' && <p className="pg-error">{bench.error}</p>}
                {bench.data && (
                  <div className="pg-stats" style={{ marginTop: 16 }}>
                    <Metric label="Recovered" value={bench.data.recovery_rate * 100} decimals={0} suffix="%" mock={false} />
                    <Metric label="False positives" value={bench.data.false_positives} decimals={0} mock={false} />
                    <Metric label="Mag error RMS" value={bench.data.magnitude_error_rms} decimals={3} mock={false} />
                    <Metric label="Position RMS" value={bench.data.position_error_rms_px} decimals={2} suffix=" px" mock={false} />
                  </div>
                )}
                {bench.data?.note && <p className="pg-quiet">{bench.data.note}</p>}
              </Card>
            </section>
          )}
        </>
      )}
    </PageFrame>
  );
}
