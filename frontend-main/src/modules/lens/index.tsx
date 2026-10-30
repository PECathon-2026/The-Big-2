/**
 * /lens — 鏡 Spirit Lens (§9.4). The backend pipeline is live: pick a sample (or upload into the misted
 * mirror), run an async job, watch its stages with the kintsugi loader, then cut between before and after
 * with the katana and enter the Dojo. Only if /api/lens/samples fails does it fall back to the labelled
 * browser mock (data/mocks/lens.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, type LensJob, type LensSample } from '@/data/api';
import { MOCK_PROVENANCE } from '@/data/mocks/lens';
import { fmtNum } from '@/data/format';
import { Button, Card, Chip, Divider, InfoPopover, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import KatanaSlider from '../_ui/KatanaSlider';
import { DataState, Num, Reveal, SectionHead } from '../_ui/kit';
import { HonestyCanvas, Kintsugi, Stages } from './shared';
import { RecentSupernovae } from './Transients';
import './lens.css';

const POLL_MS = 800;

function matchTarget(list: LensSample[], target: string | null): LensSample | null {
  if (!target) return null;
  const t = target.toLowerCase().replace(/\s+/g, '');
  const aliases: Record<string, string[]> = { m31: ['m31', 'andromeda'], m42: ['m42', 'orion'], m45: ['m45', 'pleiades'] };
  const keys = aliases[t] ?? [t];
  return list.find((s) => keys.some((k) => `${s.id} ${s.name} ${s.description}`.toLowerCase().replace(/\s+/g, '').includes(k))) ?? null;
}

/** Frosted glass that clears where the cursor moves; a drop zone + file input. */
function MistedMirror({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLLabelElement>(null);
  const [over, setOver] = useState(false);
  return (
    <label
      ref={ref}
      className={`ln-mirror ${over ? 'over' : ''}`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <input type="file" accept=".jpg,.jpeg,.png,.tif,.tiff,.fits,.fit,.fts,image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className="ln-mirror-mist" aria-hidden="true" />
      <span className="ln-mirror-text">
        <span className="ln-mirror-kanji" lang="ja">
          鏡
        </span>
        {file ? (
          <>
            <strong>{file.name}</strong>
            <span className="pg-quiet">{(file.size / 1e6).toFixed(1)} MB · click to choose another</span>
          </>
        ) : (
          <>
            <strong>Breathe on the mirror</strong>
            <span className="pg-quiet">Drop your own sky photo here, or click to choose one · JPG, PNG, TIFF or FITS</span>
          </>
        )}
      </span>
    </label>
  );
}

export default function Lens() {
  const [params] = useSearchParams();
  const target = params.get('target');
  const nav = useNavigate();
  const [samples, setSamples] = useState<{ status: 'loading' | 'ok' | 'error'; list: LensSample[]; error?: string }>({ status: 'loading', list: [] });
  const [sampleId, setSampleId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [denoise, setDenoise] = useState(0.5);
  const [deblur, setDeblur] = useState(0);
  const [sigma, setSigma] = useState(3);
  const [job, setJob] = useState<LensJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'restored' | 'heat'>('restored');
  const [seams, setSeams] = useState<{ seamPx: number; hotFrac: number } | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    api.lens
      .samples()
      .then((list) => alive && setSamples({ status: 'ok', list }))
      .catch((e) => alive && setSamples({ status: 'error', list: [], error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  const matched = useMemo(() => matchTarget(samples.list, target), [samples.list, target]);
  useEffect(() => {
    if (sampleId || !samples.list.length) return;
    setSampleId((matched ?? samples.list.find((s) => s.kind === 'real') ?? samples.list[0]).id);
  }, [samples.list, matched, sampleId]);

  // poll the job while it runs
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let h = 0;
    const tick = async () => {
      try {
        const j = await api.lens.job(jobId);
        if (!alive) return;
        setJob(j);
        if (j.status === 'done') {
          try {
            localStorage.setItem('tsukuyomi-last-lens-job', j.job_id); // offered on /honor for the photo bonus
          } catch {
            /* storage unavailable */
          }
        }
        if (j.status === 'done') {
          // bring the before/after into view once it exists
          window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
          return;
        }
        if (j.status === 'failed') return;
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
        return; // a 404 means the server forgot the job; polling again will not bring it back
      }
      h = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [jobId]);

  const run = async () => {
    setErr(null);
    setBusy(true);
    setJob(null);
    setJobId(null);
    setView('restored');
    setSeams(null);
    try {
      const created = await api.lens.createJob({ file, sample_id: file ? null : sampleId || null, denoise_strength: denoise, deblur_iterations: deblur, detect_sigma: sigma });
      setJobId(created.job_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const running = !!jobId && (!job || job.status === 'queued' || job.status === 'running');
  const r = job?.status === 'done' ? job.result : null;
  const sel = samples.list.find((s) => s.id === sampleId);

  return (
    <PageFrame
      seal="鏡"
      eyebrow="四 · 鏡 Kagami · The Spirit Lens"
      title={
        <>
          Look <em>closer</em>.
        </>
      }
      lede="Restore a sky photo honestly: measure the noise and the blur, sharpen only as far as the data allows, then prove it. Every change is checked against the original."
      wide
    >
      {samples.status === 'error' && (
        <Card plain className="ln-mockbar">
          <Chip variant="mock" />
          <p>
            The Lens server did not answer ({samples.error}). You can still see how the Dojo works on a procedural field generated in your browser. It is a simulation, labelled MOCK everywhere.
          </p>
          <Button variant="gold" onClick={() => nav('/dojo/mock-42')}>
            Open the mock Dojo
          </Button>
        </Card>
      )}

      <div className="pg-grid hero">
        <Reveal i={0}>
          <Card brand={{ kanji: '選', text: 'Choose a sky' }} tag="№ 01">
            <DataState status={samples.status === 'loading' ? 'loading' : 'ok'} error={null} stale={false} hasData={false} what="Listing the samples…" />
            {target && samples.status === 'ok' && (
              <p className="ln-target">
                {matched ? (
                  <>
                    You dove in from <strong>{target}</strong>: the {matched.name} sample is ready.
                  </>
                ) : (
                  <>
                    You dove in from <strong>{target}</strong>. The server has no {target} photo yet, so pick one of these, or bring your own.
                  </>
                )}
              </p>
            )}
            <div className="ln-samples" role="radiogroup" aria-label="Sample images">
              {samples.list.map((s) => (
                <button key={s.id} role="radio" aria-checked={!file && sampleId === s.id} className={`ln-sample ${!file && sampleId === s.id ? 'on' : ''}`} onClick={() => (setFile(null), setSampleId(s.id))}>
                  <img src={api.lens.sampleUrl(s.id)} alt="" loading="lazy" />
                  <span className="ln-sample-name">{s.name}</span>
                  <span className="ln-sample-meta">
                    {s.kind === 'synthetic' ? <Tag>known truth</Tag> : <Tag>real</Tag>}
                    {s.has_wcs && <Tag>sky coords</Tag>}
                  </span>
                </button>
              ))}
            </div>
            {sel && !file && <p className="pg-quiet">{sel.description}</p>}
            <Divider />
            <MistedMirror file={file} onFile={setFile} />
          </Card>
        </Reveal>

        <Reveal i={1}>
          <Card brand={{ kanji: '術', text: 'The method' }} tag="№ 02" className="ln-method">
            <label className="ln-param">
              <span>
                Denoise strength <span className="num">{denoise.toFixed(2)}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={denoise} onChange={(e) => setDenoise(+e.target.value)} />
            </label>
            <label className="ln-param">
              <span>
                Deblur iterations <span className="num">{deblur === 0 ? 'auto' : deblur}</span>
              </span>
              <input type="range" min={0} max={60} step={1} value={deblur} onChange={(e) => setDeblur(+e.target.value)} />
            </label>
            <label className="ln-param">
              <span>
                Detection threshold <span className="num">{sigma.toFixed(1)} σ</span>
              </span>
              <input type="range" min={1.5} max={8} step={0.5} value={sigma} onChange={(e) => setSigma(+e.target.value)} />
            </label>
            <p className="pg-quiet">Wavelet denoise, then Richardson–Lucy with the PSF measured from your own stars. 0 iterations lets the pipeline choose.</p>
            <Button variant="gold" onClick={() => void run()} disabled={busy || running || (!file && !sampleId) || samples.status !== 'ok'}>
              {busy ? 'Sending…' : running ? 'Restoring…' : 'Restore · 修復'}
            </Button>
            {err && (
              <p className="pg-error" role="alert">
                {err}
              </p>
            )}
          </Card>
        </Reveal>
      </div>

      {jobId && (
        <section className="pg-section" id="stages">
          <SectionHead jp="工程" eyebrow={`Job ${jobId} · ${job?.status ?? 'queued'}`}>
            The <em>stages</em>.
          </SectionHead>
          <Card plain className="ln-stage-card">
            <Stages stages={job?.stages ?? []} />
            {(running || r) && <Kintsugi running={running} label={running ? 'Restoring · 修復中' : 'Restored · 修復完了 · gold where it was broken'} />}
            {job?.status === 'failed' && <p className="pg-error">The pipeline failed: {job.error ?? 'no message'}</p>}
          </Card>
        </section>
      )}

      {r && job && (
        <section className="pg-section" id="result" ref={resultRef}>
          <SectionHead
            jp="刃"
            eyebrow="First cut"
            right={
              <Button variant="gold" onClick={() => nav(`/dojo/${job.job_id}`)}>
                Enter the Dojo →
              </Button>
            }
          >
            Draw the <em>blade</em>.
          </SectionHead>
          <div className="ln-view-modes" role="tablist" aria-label="Right side of the katana">
            <button role="tab" className="pg-filter" aria-selected={view === 'restored'} aria-pressed={view === 'restored'} onClick={() => setView('restored')}>
              <Kanji>修</Kanji> Restored
            </button>
            <button role="tab" className="pg-filter" aria-selected={view === 'heat'} aria-pressed={view === 'heat'} onClick={() => setView('heat')}>
              <Kanji>熱</Kanji> Heat difference
            </button>
            {view === 'heat' && (
              <span className="ln-heat-legend">
                no change <i aria-hidden="true" /> 3σ change
                <InfoPopover
                  title="What the heat map shows"
                  trace={{ formula: 'heat = |original − PSF ⊗ restored| / 3σ', notes: ['Proof of honesty: the restored image is blurred again with the measured PSF and compared with the original. Where only noise was removed the residual is dark; bright crimson and gold mark where the restoration changed the data by more than the noise allows. Gold seams trace ~2σ.'] }}
                  provenance={[{ source: 'spirit-lens pipeline', url: null, fetched_at: job.created_at, stale: false, cached: false, note: r.units_note }]}
                />
              </span>
            )}
          </div>
          <div className="ln-result">
            <KatanaSlider
              width={r.image.width}
              height={r.image.height}
              left={<img src={api.lens.imageUrl(job.job_id, 'original', r.image.is_fits ? 'asinh' : 'linear')} alt="Original" />}
              right={view === 'heat' ? <HonestyCanvas src={api.lens.imageUrl(job.job_id, 'residual')} onStats={setSeams} /> : <img src={api.lens.imageUrl(job.job_id, 'restored', r.image.is_fits ? 'asinh' : 'linear')} alt="Restored" />}
              rightLabel={view === 'heat' ? '熱 Heat difference' : '修 Restored'}
            />
            <Card plain className="ln-summary">
              <div className="pg-stats">
                <div className="pg-stat">
                  <span className="pg-label">Stars</span>
                  <span className="v">
                    <Num value={r.counts.stars} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Galaxies</span>
                  <span className="v">
                    <Num value={r.counts.galaxies} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">PSF FWHM</span>
                  <span className="v">
                    <Num value={r.psf.fwhm_px} decimals={2} suffix=" px" />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Verdict</span>
                  <span className="v" style={{ fontSize: 18 }}>
                    {r.honesty.forward_model.verdict}
                    <InfoPopover title="Proof of honesty" trace={{ formula: r.trace.formula, notes: r.honesty.notes }} provenance={[{ source: 'spirit-lens pipeline', url: null, fetched_at: job.created_at, stale: false, cached: false, note: r.units_note }]} />
                  </span>
                </div>
              </div>
              <p className="pg-quiet">
                SSIM {fmtNum(r.honesty.ssim, 3)} · PSNR {fmtNum(r.honesty.psnr_db, 1)} dB · χ² {fmtNum(r.honesty.forward_model.chi2_reduced, 2)} · {r.honesty.invented_pixels} invented px. The Dojo shows where and why.
              </p>
              {seams && view === 'heat' && (
                <p className="pg-quiet num">
                  {(seams.hotFrac * 100).toFixed(2)}% of pixels changed by more than ~2σ ({seams.seamPx.toLocaleString('en-US')} seam px).
                </p>
              )}
              <Divider />
              <Button variant="primary" onClick={() => nav('/dojo')}>
                All past cuts · 道場
              </Button>
            </Card>
          </div>
        </section>
      )}
      <RecentSupernovae />
      {samples.status === 'error' && <p className="pg-quiet" style={{ marginTop: 40 }}>Provenance: {MOCK_PROVENANCE[0].note}.</p>}
    </PageFrame>
  );
}
