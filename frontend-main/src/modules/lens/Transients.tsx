/**
 * Transients (ZTF alerts via ALeRCE, /api/transients): alerts inside a plate-solved Lens field, and recent
 * supernovae observable tonight from here. Clicking an object loads its record and shows the real ZTF
 * science / template / difference cutouts of its latest stamped detection.
 */
import { useEffect, useState } from 'react';
import { api, type Provenance, type TransientDetail, type TransientObject } from '@/data/api';
import { fmtDate, fmtNum } from '@/data/format';
import { useApp } from '@/state/store';
import { Card, Chip, InfoPopover, Tag } from '@/ui';
import { DataState, SectionHead } from '../_ui/kit';
import { usePageData } from '../_ui/usePageData';

function Stamps({ oid }: { oid: string }) {
  const place = useApp((s) => s.place);
  const [d, setD] = useState<{ data: TransientDetail | null; err: string | null; prov: Provenance[] }>({ data: null, err: null, prov: [] });
  useEffect(() => {
    let alive = true;
    api.transients
      .object(oid, place ?? undefined)
      .then((env) => alive && setD({ data: env.data, err: null, prov: env.provenance }))
      .catch((e) => alive && setD({ data: null, err: e instanceof Error ? e.message : String(e), prov: [] }));
    return () => {
      alive = false;
    };
  }, [oid, place]);
  if (d.err) return <p className="pg-error">Could not load {oid}: {d.err}</p>;
  if (!d.data) return <p className="pg-loading">Fetching the light curve and cutouts…</p>;
  const lc = d.data.lightcurve;
  const stamped = [...lc.detections].reverse().find((p) => p.has_stamp);
  return (
    <div className="tr-detail">
      <p className="pg-quiet num">
        {lc.detections.length} detections
        {lc.peak && ` · peak ${fmtNum(lc.peak.mag, 2)} mag (${lc.peak.band}) on ${fmtDate(lc.peak.date)}`}
        {d.data.probabilities[0] && ` · ${d.data.probabilities[0].class} ${Math.round(d.data.probabilities[0].probability * 100)}% (${d.data.probabilities[0].classifier})`}
        <InfoPopover title={oid} provenance={d.prov} notes={lc.note} />
      </p>
      {stamped ? (
        <div className="tr-stamps">
          {(['science', 'template', 'difference'] as const).map((k) => (
            <figure key={k}>
              <img src={api.transients.stampUrl(oid, stamped.candid, k)} alt={`ZTF ${k} cutout of ${oid}`} loading="lazy" />
              <figcaption>{k === 'science' ? '新 new' : k === 'template' ? '旧 old' : '差 difference'}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="pg-quiet">ZTF keeps cutouts only for recent alerts; this object has none.</p>
      )}
    </div>
  );
}

function ObjectList({ list, showVis }: { list: TransientObject[]; showVis?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return <p className="pg-quiet">No alerts here.</p>;
  return (
    <ul className="pg-rows tr-list">
      {list.map((o) => (
        <li key={o.oid}>
          <button className="tr-row" onClick={() => setOpen((c) => (c === o.oid ? null : o.oid))} aria-expanded={open === o.oid}>
            <span className="tr-oid num">{o.oid}</span>
            <span className="pg-quiet num">
              {o.class ? `${o.class}${o.probability != null ? ` ${Math.round(o.probability * 100)}%` : ''}` : 'unclassified'} · {o.ndet ?? '—'} detections · last {o.last_detection ? fmtDate(o.last_detection) : '—'}
            </span>
            {showVis && o.visibility && (o.visibility.observable_tonight ? <span className="tw-chip live">up {fmtNum(o.visibility.max_altitude, 0)}° at {o.visibility.at_local}</span> : <Chip variant="provenance">not tonight</Chip>)}
            <a className="pg-link" href={o.alerce_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              ALeRCE ↗
            </a>
          </button>
          {open === o.oid && <Stamps oid={o.oid} />}
        </li>
      ))}
    </ul>
  );
}

/** Alerts inside a plate-solved Lens job's field (/field/{job_id}). */
export function FieldTransients({ jobId }: { jobId: string }) {
  const q = usePageData(`transients/field/${jobId}`, () => api.transients.field(jobId), 30 * 60_000);
  return (
    <section className="pg-section" id="transients">
      <SectionHead jp="変光" eyebrow="Henkō · ZTF alerts in this field" right={q.data && <InfoPopover title="ZTF alerts in this field" provenance={q.provenance} computedAt={q.computedAt} />}>
        What <em>changed</em> here.
      </SectionHead>
      <DataState status={q.status} error={q.error} stale={q.stale} hasData={!!q.data} what="Asking ALeRCE for alerts in this field…" onRetry={q.reload} />
      {q.data && (
        <Card plain className="tr-card">
          <p className="pg-quiet num">
            {q.data.objects.length} objects within {fmtNum(q.data.radius_arcsec / 60, 1)}′ of RA {fmtNum(q.data.ra, 3)}° Dec {fmtNum(q.data.dec, 3)}°
          </p>
          <ObjectList list={q.data.objects.slice(0, 12)} />
        </Card>
      )}
    </section>
  );
}

/** Recent supernovae (SN Ia by default) with tonight's visibility from here (/recent?lat&lon). */
export function RecentSupernovae() {
  const place = useApp((s) => s.place);
  const q = usePageData(place ? 'transients/recent/SNIa' : null, () => api.transients.recent('SNIa', 0.5, 12, place!), 30 * 60_000);
  const list = (q.data?.objects ?? []).slice().sort((a, b) => Number(b.visibility?.observable_tonight ?? 0) - Number(a.visibility?.observable_tonight ?? 0));
  return (
    <section className="pg-section" id="supernovae">
      <SectionHead jp="超新星" eyebrow="Chōshinsei · recent supernovae" right={q.data && <><Tag>SN Ia ≥ 50%</Tag><InfoPopover title="Recent supernovae" provenance={q.provenance} computedAt={q.computedAt} /></>}>
        Stars that just <em>died</em>.
      </SectionHead>
      <DataState status={q.status} error={q.error} stale={q.stale} hasData={!!q.data} what="Reading the ZTF alert stream…" onRetry={q.reload} />
      {q.data && (
        <Card plain className="tr-card">
          <p className="pg-quiet">Most recently detected type Ia supernova candidates (ALeRCE light-curve classifier). Most are fainter than magnitude 17, so you need a telescope and a camera.</p>
          <ObjectList list={list} showVis />
        </Card>
      )}
    </section>
  );
}
