/**
 * /dojo — 道場 the Dojo dashboard: every Spirit Lens job the server has kept (GET /api/lens/jobs, newest
 * first), each with its honesty headline numbers. Pick one to open the full katana cut at /dojo/:id.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type LensJobSummary } from '@/data/api';
import { fmtNum } from '@/data/format';
import { Button, Card, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { DataState, Num, Reveal, SectionHead } from '../_ui/kit';
import '../lens/lens.css';

const VERDICT_JP: Record<string, string> = { 'noise-like': '誠', structured: '疑' };

/** Restored thumbnail; jobs from an older server build may have no arrays left to render, so fall back to a seal. */
function Thumb({ job }: { job: LensJobSummary }) {
  const [broken, setBroken] = useState(false);
  if (job.status === 'done' && !broken) return <img src={api.lens.imageUrl(job.job_id, 'restored', 'linear')} alt="" loading="lazy" onError={() => setBroken(true)} />;
  const [k, label] = job.status === 'failed' ? ['否', 'failed'] : job.status === 'done' ? ['無', 'image not kept'] : ['待', job.status];
  return (
    <span className="dj-job-empty">
      <span lang="ja" aria-hidden="true">
        {k}
      </span>
      <small>{label}</small>
    </span>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DojoDashboard() {
  const nav = useNavigate();
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; list: LensJobSummary[]; error: string | null }>({ status: 'loading', list: [], error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api.lens
      .jobs(60)
      .then((list) => setState({ status: 'ok', list, error: null }))
      .catch((e) => setState({ status: 'error', list: [], error: e instanceof Error ? e.message : String(e) }));
  }, []);
  useEffect(load, [load]);

  const done = state.list.filter((j) => j.status === 'done');
  const honest = done.filter((j) => j.verdict === 'noise-like').length;
  const stars = done.reduce((n, j) => n + (j.stars ?? 0), 0);

  return (
    <PageFrame
      seal="道"
      eyebrow="五 · 道場 Dōjō · Every cut you have made"
      title={
        <>
          The <em>Dojo</em>.
        </>
      }
      lede="Every photo the Spirit Lens has restored, with its proof of honesty. Open one to cut between before and after, read the residual heat map and test the method."
      wide
      actions={
        <Button variant="gold" onClick={() => nav('/lens')}>
          Restore a new photo →
        </Button>
      }
    >
      <DataState status={state.status} error={state.error} stale={false} hasData={state.list.length > 0} what="Reading the Dojo's records…" onRetry={load} />

      {state.status === 'ok' && (
        <>
          <Reveal>
            <Card plain className="dj-summary">
              <div className="pg-stats">
                <div className="pg-stat">
                  <span className="pg-label">Jobs kept</span>
                  <span className="v">
                    <Num value={state.list.length} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Restored</span>
                  <span className="v">
                    <Num value={done.length} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Residual looks like noise</span>
                  <span className="v">
                    <Num value={honest} suffix={` / ${done.length}`} />
                  </span>
                </div>
                <div className="pg-stat">
                  <span className="pg-label">Stars detected</span>
                  <span className="v">
                    <Num value={stars} />
                  </span>
                </div>
              </div>
            </Card>
          </Reveal>

          <section className="pg-section">
            <SectionHead jp="記録" eyebrow="Kiroku · the records">
              Choose a <em>cut</em>.
            </SectionHead>
            {state.list.length === 0 ? (
              <Card plain>
                <p className="pg-quiet">No jobs yet. Restore a sample or your own photo on the Spirit Lens and it will appear here.</p>
              </Card>
            ) : (
              <ul className="dj-jobs">
                {state.list.map((j, i) => (
                  <Reveal as="li" key={j.job_id} i={Math.min(i, 8)}>
                    <button className={`dj-job ${j.status}`} onClick={() => nav(`/dojo/${j.job_id}`)} disabled={j.status !== 'done'} aria-label={`Open job ${j.job_id}, ${j.filename}`}>
                      <span className="dj-job-thumb">
                        <Thumb job={j} />
                        {j.verdict && (
                          <span className={`dj-job-seal ${j.verdict === 'noise-like' ? 'ok' : 'warn'}`} lang="ja" title={`Residual: ${j.verdict}`}>
                            {VERDICT_JP[j.verdict] ?? '?'}
                          </span>
                        )}
                      </span>
                      <span className="dj-job-body">
                        <span className="dj-job-name">{j.filename}</span>
                        <span className="pg-quiet num">
                          {when(j.created_at)} · {j.job_id}
                        </span>
                        {j.status === 'done' ? (
                          <>
                            <span className="dj-job-meta">
                              {j.width}×{j.height} · {j.stars} stars · {j.galaxies} galaxies
                            </span>
                            <span className="dj-job-tags">
                              <Tag num>SSIM {fmtNum(j.ssim, 3)}</Tag>
                              <Tag num>χ² {fmtNum(j.chi2_reduced, 2)}</Tag>
                              <Tag num>PSF {fmtNum(j.psf_fwhm_px, 1)} px</Tag>
                              {j.wcs_solved && <Tag>sky coords</Tag>}
                            </span>
                          </>
                        ) : (
                          <span className={j.status === 'failed' ? 'pg-error' : 'pg-quiet'}>{j.status === 'failed' ? (j.error ?? 'failed') : j.status}</span>
                        )}
                      </span>
                    </button>
                  </Reveal>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageFrame>
  );
}
