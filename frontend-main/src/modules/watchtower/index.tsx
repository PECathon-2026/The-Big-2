/** /watchtower — 見張り "where and whether" (§9.2). Real data: /api/watchtower/score (shared) + /spots (page). */
import { lazy, Suspense, useMemo, useState } from 'react';
import { api, type Spot, type VerdictKind } from '@/data/api';
import { useTonight } from '@/data/tonight';
import { fmtNum } from '@/data/format';
import { useApp } from '@/state/store';
import { Card, Chip, Divider, InfoPopover, Kanji, Stamp, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { DataState, Num, ProvenanceFooter, Reveal, SectionHead } from '../_ui/kit';
import { usePageData } from '../_ui/usePageData';
import { Gauge, Timeline, Waterfall } from './charts';
import { glyphOf } from './glyph';
import './watchtower.css';

const SpotsMap = lazy(() => import('./SpotsMap'));

const VERDICT: Record<VerdictKind, { kanji: string; en: string; romaji: string }> = {
  go: { kanji: '行', en: 'GO', romaji: 'iku · go out' },
  maybe: { kanji: '迷', en: 'MAYBE', romaji: 'mayou · undecided' },
  stay_in: { kanji: '留', en: 'STAY IN', romaji: 'tomaru · stay' },
};

function verdictOf(v: string): { kanji: string; en: string; romaji: string } {
  return VERDICT[v as VerdictKind] ?? { kanji: '？', en: v.toUpperCase(), romaji: '' };
}

function SpotRow({ s, i, hi, sel, onHi, onSel }: { s: Spot; i: number; hi: boolean; sel: boolean; onHi: (id: string | null) => void; onSel: (id: string) => void }) {
  const v = verdictOf(s.verdict);
  return (
    <li
      className={`wt-spot ${hi ? 'hi' : ''} ${sel ? 'sel' : ''}`}
      onMouseEnter={() => onHi(s.osm_id)}
      onMouseLeave={() => onHi(null)}
    >
      <button className="wt-spot-btn" onClick={() => onSel(s.osm_id)} onFocus={() => onHi(s.osm_id)} onBlur={() => onHi(null)} aria-expanded={sel}>
        <span className="wt-spot-glyph" lang="ja" aria-hidden="true">
          {glyphOf(s)}
        </span>
        <span className="wt-spot-main">
          <span className="wt-spot-name">{s.name}</span>
          <span className="wt-spot-meta num">
            {s.kind} · {fmtNum(s.distance_km, 1)} km · Bortle {fmtNum(s.bortle, 1)} · {s.best_window ? `best ${s.best_window}` : 'no clear window'}
            {s.elevation_m != null && ` · ${Math.round(s.elevation_m)} m`}
          </span>
        </span>
        <span className="wt-spot-score">
          <span className="num">{s.rank_score.toFixed(1)}</span>
          <span className={`wt-verdict-mini ${s.verdict}`}>
            <Kanji>{v.kanji}</Kanji> {v.en}
          </span>
        </span>
        <span className="tw-tag num" aria-hidden="true">
          № {String(i + 1).padStart(2, '0')}
        </span>
      </button>
      {sel && (
        <div className="wt-spot-detail">
          <dl className="pg-kv">
            <dt>Night score</dt>
            <dd>{fmtNum(s.night_score, 1)}</dd>
            {Object.entries(s.rank_trace).map(([k, val]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k.replace(/_/g, ' ')}</dt>
                <dd>{fmtNum(val, 3)}</dd>
              </div>
            ))}
            <dt>Where</dt>
            <dd>
              {s.lat.toFixed(4)}, {s.lon.toFixed(4)}{' '}
              <a className="pg-link" href={`https://www.openstreetmap.org/${s.osm_id}`} target="_blank" rel="noreferrer">
                OSM ↗
              </a>
            </dd>
          </dl>
          {s.warnings.length > 0 && (
            <div className="wt-warns">
              {s.warnings.map((w) => (
                <span className="pg-warn" key={w}>
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function Watchtower() {
  const score = useTonight((s) => s.score);
  const place = useApp((s) => s.place);
  const [sel, setSel] = useState<number | null>(null);
  const [hi, setHi] = useState<string | null>(null);
  const [selSpot, setSelSpot] = useState<string | null>(null);
  const spots = usePageData(place ? 'watchtower/spots' : null, () => api.watchtower.spots(place!, 60, 12), 30 * 60_000);

  const n = score.data;
  const v = n ? verdictOf(n.verdict.verdict) : null;
  const hour = n && sel != null ? n.hours[sel] : null;
  const contributions = hour ? hour.contributions : (n?.trace.contributions ?? []);
  const bestHour = useMemo(() => (n?.hours.length ? n.hours.reduce((a, b) => (b.score > a.score ? b : a)) : null), [n]);

  return (
    <PageFrame
      seal="見"
      eyebrow="二 · 見張り Mihari · The Watchtower"
      title={
        <>
          Where, and <em>whether</em>.
        </>
      }
      lede="Tonight's verdict for your sky, scored hour by hour from the real forecast, the Moon and the light of the nearest towns, then the best places within an hour's drive."
    >
      <DataState status={score.status} error={score.error} stale={score.stale} hasData={!!n} what="Reading tonight's forecast…" />
      {n && v && (
        <>
          <div className="pg-grid hero">
            <Reveal i={0}>
              <Card spotlight brand={{ kanji: '判', text: 'Tonight’s verdict' }} tag="№ 01" className="wt-verdict">
                <div className="wt-verdict-row">
                  <div className={`wt-seal ${n.verdict.verdict}`}>
                    <Stamp kanji={v.kanji} size={128} animate label={`${v.kanji} ${v.en}`} />
                    <span className="wt-seal-en">{v.en}</span>
                    <span className="wt-seal-romaji">{v.romaji}</span>
                  </div>
                  <div>
                    <h2 className="pg-name wt-headline">{n.verdict.headline}</h2>
                    <span className="tw-brush" style={{ margin: '10px 0 14px' }} aria-hidden="true" />
                    <p className="wt-reason">
                      {n.verdict.reason}
                      <InfoPopover title="Tonight's verdict" trace={n.trace} provenance={score.provenance} computedAt={score.computedAt} />
                    </p>
                    <div className="wt-warns">
                      {n.warnings.length ? n.warnings.map((w) => <span className="pg-warn" key={w}>{w}</span>) : <Chip variant="provenance">no dew or cold warnings</Chip>}
                    </div>
                  </div>
                </div>
              </Card>
            </Reveal>
            <Reveal i={1}>
              <Card brand={{ kanji: '誉', text: 'Night Honor Score' }} tag="№ 02" className="wt-score-card">
                <Gauge score={n.verdict.score} label="Night Honor Score" />
                <Divider />
                <div className="pg-stats">
                  <div className="pg-stat">
                    <span className="pg-label">Bortle</span>
                    <span className="v">
                      <Num value={n.bortle} decimals={1} />
                      <InfoPopover title="Bortle class (estimated)" provenance={score.provenance.filter((p) => p.source.includes('gibs') || p.source === 'computed')} notes="Estimated from NASA VIIRS Black Marble radiance at your place." />
                    </span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Best window</span>
                    <span className="v">
                      {n.best_window ? (
                        <span className="num">
                          {n.best_window.start_local}–{n.best_window.end_local}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  {n.best_window && (
                    <div className="pg-stat">
                      <span className="pg-label">Window mean</span>
                      <span className="v">
                        <Num value={n.best_window.mean_score} decimals={1} />
                      </span>
                    </div>
                  )}
                </div>
                {n.best_window && <p className="pg-quiet" style={{ marginTop: 10 }}>Why that window: {n.best_window.reason}.</p>}
              </Card>
            </Reveal>
          </div>

          <section className="pg-section" id="timeline">
            <SectionHead jp="今宵" eyebrow="Tonight, hour by hour" right={<Chip variant="provenance">gold band = best window · crimson = sky time</Chip>}>
              The night in <em>hours</em>.
            </SectionHead>
            <Reveal>
              <Card plain className="wt-chart-card">
                <Timeline n={n} sel={sel} onSel={setSel} />
                {hour ? (
                  <p className="pg-quiet num wt-hour-line">
                    <strong style={{ color: 'var(--kinu)' }}>{hour.time_local}</strong> · score {hour.score.toFixed(1)} · Sun {fmtNum(hour.sun_alt, 1)}° · Moon {hour.moon_alt != null && hour.moon_alt > 0 ? `${fmtNum(hour.moon_alt, 0)}° up, ${fmtNum((hour.moon_illum ?? 0) * 100, 0)}% lit` : 'down'} · cloud {fmtNum(hour.cloud_low, 0)}/{fmtNum(hour.cloud_mid, 0)}/{fmtNum(hour.cloud_high, 0)}% · humidity {fmtNum(hour.humidity, 0)}% · {fmtNum(hour.temperature, 1)} °C, dew {fmtNum(hour.dew_point, 1)} °C · wind {fmtNum(hour.wind_kmh, 0)} km/h
                    <button className="tw-btn secondary" style={{ minHeight: 28, marginLeft: 8 }} onClick={() => setSel(null)}>
                      show the whole night
                    </button>
                  </p>
                ) : (
                  <p className="pg-quiet">Hover, focus or click an hour to see what shaped it{bestHour ? ` · the best hour is ${bestHour.time_local}` : ''}.</p>
                )}
              </Card>
            </Reveal>
          </section>

          <section className="pg-section" id="why">
            <SectionHead jp="理由" eyebrow={hour ? `Why ${hour.time_local} scored ${hour.score.toFixed(0)}` : 'Why this score'} right={<InfoPopover title="Night Honor formula" trace={n.trace} provenance={score.provenance} computedAt={score.computedAt} />}>
              What the sky <em>cost</em> you.
            </SectionHead>
            <Reveal>
              <Card plain className="wt-chart-card">
                <Waterfall contributions={contributions} hour={hour} />
                <p className="pg-quiet formula-line">{n.trace.formula}</p>
              </Card>
            </Reveal>
          </section>
        </>
      )}

      <section className="pg-section" id="spots">
        <SectionHead
          jp="観測地"
          eyebrow="Watchtowers near you"
          right={
            spots.data && (
              <>
                <Tag>
                  <span className="num">{spots.data.candidates_found}</span>&nbsp;found within {spots.data.radius_km} km
                </Tag>
                <InfoPopover title="Spot ranking" trace={{ formula: spots.data.formula }} provenance={spots.provenance} computedAt={spots.computedAt} />
              </>
            )
          }
        >
          Where to <em>stand</em>.
        </SectionHead>
        <DataState status={spots.status} error={spots.error} stale={spots.stale} hasData={!!spots.data} what="Searching the mountains… (OpenStreetMap, then a score for every spot; this can take a while)" onRetry={spots.reload} />
        {spots.data && place && (
          <Reveal className="wt-spots">
            <Card plain className="wt-spots-list-card">
              {spots.data.spots.length === 0 ? (
                <p className="pg-quiet">No viewpoints, peaks or shrines found within {spots.data.radius_km} km.</p>
              ) : (
                <ol className="wt-spot-list">
                  {spots.data.spots.map((s, i) => (
                    <SpotRow key={s.osm_id} s={s} i={i} hi={hi === s.osm_id} sel={selSpot === s.osm_id} onHi={setHi} onSel={(id) => setSelSpot((c) => (c === id ? null : id))} />
                  ))}
                </ol>
              )}
            </Card>
            <Suspense fallback={<div className="wt-map wt-map-wait pg-loading">Unrolling the map…</div>}>
              <SpotsMap lat={place.lat} lon={place.lon} spots={spots.data.spots} hi={hi} sel={selSpot} onHi={setHi} onSel={(id) => setSelSpot(id)} />
            </Suspense>
          </Reveal>
        )}
      </section>

      <ProvenanceFooter lists={[score.provenance, spots.provenance]} computedAt={[score.computedAt, spots.computedAt]} />
    </PageFrame>
  );
}
