import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import api, { type Contribution, type HourScore, type NightScore, type Spot } from '../api';
import { Card, Chip, KV } from '../components/Card';
import { Controls } from '../components/Controls';
import { ProvenanceFooter } from '../components/Provenance';
import { Await } from '../components/Status';
import { useApp } from '../context/AppContext';
import { fmtNum, verdictClass } from '../format';
import { useApi } from '../hooks/useApi';

// ---------------------------------------------------------------------------
// Hourly score chart (SVG)
// ---------------------------------------------------------------------------

function ScoreChart({ n, selected, onSelect }: { n: NightScore; selected: number | null; onSelect: (i: number | null) => void }) {
  const W = 760;
  const H = 220;
  const padL = 30;
  const padR = 10;
  const padT = 12;
  const padB = 28;
  const hours = n.hours;
  if (hours.length === 0) return <div className="status">No hourly scores returned.</div>;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const bw = iw / hours.length;
  const y = (v: number) => padT + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const bwStart = n.best_window ? new Date(n.best_window.start).getTime() : null;
  const bwEnd = n.best_window ? new Date(n.best_window.end).getTime() : null;
  const inBest = (h: HourScore) => {
    if (bwStart === null || bwEnd === null) return false;
    const t = new Date(h.time).getTime();
    return t >= bwStart - 1 && t < bwEnd;
  };
  const cloudPath = hours
    .map((h, i) => {
      const cx = padL + i * bw + bw / 2;
      const v = h.cloud_low ?? 0;
      return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${y(v).toFixed(1)}`;
    })
    .join(' ');
  const labelEvery = hours.length > 16 ? 2 : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="hourly night score">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line className="grid" x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} />
          <text className="ax" x={padL - 4} y={y(g) + 3} textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {hours.map((h, i) => {
        const x = padL + i * bw + 1;
        const cls = `bar ${inBest(h) ? 'best' : ''} ${selected === i ? 'sel' : ''}`;
        return (
          <g key={h.time}>
            <rect className={cls} x={x} y={y(h.score)} width={Math.max(1, bw - 2)} height={padT + ih - y(h.score)} onMouseEnter={() => onSelect(i)} onClick={() => onSelect(i)}>
              <title>
                {h.time_local} · score {h.score.toFixed(1)} · low cloud {fmtNum(h.cloud_low, 0, '%')} · moon {h.moon_alt !== null && h.moon_alt > 0 ? 'up' : 'down'}
              </title>
            </rect>
            {i % labelEvery === 0 && (
              <text className="ax" x={x + bw / 2} y={H - 10} textAnchor="middle">
                {h.time_local}
              </text>
            )}
          </g>
        );
      })}
      <path className="cloud" d={cloudPath} />
      <text className="ax" x={W - padR} y={padT + 2} textAnchor="end">
        ┈ low cloud %
      </text>
    </svg>
  );
}

function Contributions({ list }: { list: Contribution[] }) {
  const max = Math.max(1, ...list.map((c) => c.weight * 100));
  return (
    <div className="contrib">
      {list.map((c) => (
        <div key={c.factor} style={{ display: 'contents' }}>
          <div className="lbl">
            {c.label}
            <span className="muted small">
              {' '}
              · {c.value === null ? '—' : fmtNum(c.value, 1)} {c.unit ?? ''} · w {c.weight}
              {c.note ? ` · ${c.note}` : ''}
            </span>
          </div>
          <div className="num">
            <span className="gold">+{fmtNum(c.contribution, 1)}</span> <span className="verm">−{fmtNum(c.penalty, 1)}</span>
          </div>
          <div className="bar-wrap" title={`contribution ${c.contribution} of max ${(c.weight * 100).toFixed(0)}; penalty ${c.penalty}`}>
            <div className="c" style={{ width: `${(c.contribution / max) * 100}%` }} />
            <div className="p" style={{ left: `${(c.contribution / max) * 100}%`, width: `${(c.penalty / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function glyphIcon(glyph: string, hi: boolean, origin = false) {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="glyph-marker ${hi ? 'hi' : ''} ${origin ? 'origin' : ''}">${glyph}</div>`,
    iconSize: origin ? [18, 18] : [28, 28],
    iconAnchor: origin ? [9, 9] : [14, 14],
  });
}

function Recenter({ lat, lon, spots }: { lat: number; lon: number; spots: Spot[] }) {
  const map = useMap();
  useEffect(() => {
    if (spots.length) {
      const b = L.latLngBounds([[lat, lon], ...spots.map((s) => [s.lat, s.lon] as [number, number])]);
      map.fitBounds(b.pad(0.15), { animate: false });
    } else map.setView([lat, lon], 9, { animate: false });
  }, [lat, lon, spots, map]);
  return null;
}

function SpotsMap({ lat, lon, spots, hi, setHi }: { lat: number; lon: number; spots: Spot[]; hi: string | null; setHi: (id: string | null) => void }) {
  return (
    <div className="map">
      <MapContainer center={[lat, lon]} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter lat={lat} lon={lon} spots={spots} />
        <Marker position={[lat, lon]} icon={glyphIcon('●', false, true)}>
          <Tooltip>you · origin</Tooltip>
        </Marker>
        {spots.map((s) => (
          <Marker
            key={s.osm_id}
            position={[s.lat, s.lon]}
            icon={glyphIcon(s.glyph, hi === s.osm_id)}
            zIndexOffset={hi === s.osm_id ? 1000 : 0}
            eventHandlers={{ mouseover: () => setHi(s.osm_id), mouseout: () => setHi(null), click: () => setHi(s.osm_id) }}
          >
            <Tooltip>
              {s.name} · {s.kind} · rank {fmtNum(s.rank_score, 1)}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function SpotRow({ s, hi, setHi }: { s: Spot; hi: boolean; setHi: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`spot-row ${hi ? 'hi' : ''}`} onMouseEnter={() => setHi(s.osm_id)} onMouseLeave={() => setHi(null)} onClick={() => setOpen((o) => !o)}>
      <div className="head">
        <span className="g">{s.glyph}</span>
        <span className="n">
          {s.name}
          <span className="k">{s.kind}</span>
        </span>
        <span className="rk num" title="rank_score">
          {fmtNum(s.rank_score, 1)}
        </span>
      </div>
      <div className="meta num">
        <span>{fmtNum(s.distance_km, 1)} km</span>
        <span>Bortle {fmtNum(s.bortle, 1)}</span>
        <span>night {fmtNum(s.night_score, 1)}</span>
        <span>{s.best_window ? `best ${s.best_window}` : 'no window'}</span>
        {s.elevation_m !== null && <span>{Math.round(s.elevation_m)} m</span>}
        <Chip tone={verdictClass(s.verdict)}>{s.verdict.replace('_', ' ')}</Chip>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <KV rows={Object.entries(s.rank_trace).map(([k, v]) => [k, fmtNum(v, 3)])} />
          {s.warnings.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              {s.warnings.map((w, i) => (
                <div className="warn" key={i}>
                  {w}
                </div>
              ))}
            </div>
          )}
          <div className="muted small">
            osm {s.osm_id} · {fmtNum(s.lat, 4)}, {fmtNum(s.lon, 4)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Watchtower() {
  const { lat, lon, atIso } = useApp();
  const w = { lat, lon };
  const [windowHours, setWindowHours] = useState(2);
  const [radius, setRadius] = useState(60);
  const [limit, setLimit] = useState(12);
  const [sel, setSel] = useState<number | null>(null);
  const [hi, setHi] = useState<string | null>(null);

  const score = useApi((s) => api.watchtower.score(w, atIso, windowHours, true, s), [lat, lon, atIso, windowHours]);
  const lp = useApi((s) => api.watchtower.lightPollution(w, s), [lat, lon]);
  const spots = useApi((s) => api.watchtower.spots(w, radius, limit, atIso, s), [lat, lon, atIso, radius, limit]);

  const selectedHour = useMemo(() => {
    const hours = score.data?.hours ?? [];
    if (!hours.length) return null;
    if (sel !== null && hours[sel]) return hours[sel];
    // default: the hour with the best score
    return hours.reduce((a, b) => (b.score > a.score ? b : a));
  }, [score.data, sel]);

  return (
    <main className="page">
      <div className="page-title">
        <h1>Watchtower</h1>
        <span className="jp">物見櫓</span>
        <span className="sub">score · breakdown · light pollution · spots</span>
      </div>
      <Controls />

      <div className="grid two">
        <Card
          en="Night Honor · hourly"
          jp="夜の誉"
          className="span-2"
          hair
          right={
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              window
              <select value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))} style={{ minHeight: 26, padding: '2px 6px' }}>
                {[1, 2, 3, 4].map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <Await q={score} what="Scoring every hour">
            {(n) => (
              <div className="stack">
                <div className="row" style={{ gap: 16 }}>
                  <div className="big">{Math.round(n.verdict.score)}</div>
                  <div>
                    <Chip tone={verdictClass(n.verdict.verdict)}>{n.verdict.verdict.replace('_', ' ')}</Chip>
                    <div className="moon" style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                      {n.verdict.headline}
                    </div>
                    <div className="sub">{n.verdict.reason}</div>
                  </div>
                  <div className="sub" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    {n.best_window ? (
                      <>
                        <span className="gold">best window</span> {n.best_window.start_local} – {n.best_window.end_local}
                        <div className="muted small">
                          mean {fmtNum(n.best_window.mean_score, 1)} · {n.best_window.reason}
                        </div>
                      </>
                    ) : (
                      <span className="muted">no best window</span>
                    )}
                  </div>
                </div>
                <ScoreChart n={n} selected={sel} onSelect={setSel} />
                {n.warnings.map((wn, i) => (
                  <div className="warn" key={i}>
                    {wn}
                  </div>
                ))}
              </div>
            )}
          </Await>
        </Card>

        <Card en="Hour breakdown" jp="内訳" right={selectedHour ? `${selectedHour.time_local} · score ${fmtNum(selectedHour.score, 1)}` : undefined}>
          {selectedHour ? (
            <div className="stack">
              <div className="inline-list num muted small">
                <span>darkness {fmtNum(selectedHour.darkness, 2)}</span>
                <span>sun {fmtNum(selectedHour.sun_alt, 1, '°')}</span>
                <span>moon {fmtNum(selectedHour.moon_alt, 1, '°')}</span>
                <span>illum {selectedHour.moon_illum === null ? '—' : `${(selectedHour.moon_illum * 100).toFixed(0)}%`}</span>
                <span>cloud {fmtNum(selectedHour.cloud_low, 0)}/{fmtNum(selectedHour.cloud_mid, 0)}/{fmtNum(selectedHour.cloud_high, 0)}%</span>
                <span>RH {fmtNum(selectedHour.humidity, 0, '%')}</span>
                <span>vis {selectedHour.visibility_m === null ? '—' : `${(selectedHour.visibility_m / 1000).toFixed(1)} km`}</span>
                <span>AOD {fmtNum(selectedHour.aod, 2)}</span>
                <span>
                  {fmtNum(selectedHour.temperature, 1, '°C')} / dew {fmtNum(selectedHour.dew_point, 1, '°C')}
                </span>
                <span>wind {fmtNum(selectedHour.wind_kmh, 0, ' km/h')}</span>
                <span>spread {fmtNum(selectedHour.cloud_spread, 1)}</span>
              </div>
              <Contributions list={selectedHour.contributions} />
              <div className="muted small">Hover or click a bar to inspect that hour. Gold = contribution, vermilion = penalty.</div>
            </div>
          ) : (
            <div className="status">Select an hour on the chart.</div>
          )}
        </Card>

        <Card en="Trace" jp="算式">
          <Await q={score} what="Loading trace">
            {(n) => (
              <div className="stack">
                <code style={{ whiteSpace: 'pre-wrap', color: 'var(--moon)' }}>{n.trace.formula}</code>
                <KV rows={Object.entries(n.trace.inputs).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])} />
                <ul className="notes">
                  {n.trace.notes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </Await>
        </Card>

        <Card en="Light pollution" jp="光害">
          <Await q={lp} what="Reading the Black Marble">
            {(l) => (
              <div className="stack">
                <div className="row" style={{ gap: 16 }}>
                  <div>
                    <div className="big">{fmtNum(l.bortle, 1)}</div>
                    <div className="sub">Bortle (estimated)</div>
                  </div>
                  <div>
                    <div className="big sm">{fmtNum(l.brightness, 0)}</div>
                    <div className="sub">radiance · peak {fmtNum(l.brightness_peak, 0)}</div>
                  </div>
                </div>
                <KV
                  rows={[
                    ['Layer', `${l.layer} (${l.date})`],
                    ['Tile', `z${l.tile.z} x${l.tile.x} y${l.tile.y}`],
                  ]}
                />
                <div className="muted small">{l.note}</div>
              </div>
            )}
          </Await>
        </Card>

        <Card
          en="Observing spots"
          jp="観測地"
          className="span-2"
          right={
            <span className="row" style={{ gap: 8 }}>
              radius
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ minHeight: 26, padding: '2px 6px' }}>
                {[30, 60, 100, 150].map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
              limit
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minHeight: 26, padding: '2px 6px' }}>
                {[6, 12, 20].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </span>
          }
        >
          <Await q={spots} what="Searching OpenStreetMap and scoring each spot (this can take a while)">
            {(r) => (
              <div className="stack">
                <div className="muted small num">
                  {r.candidates_found} candidates within {r.radius_km} km · showing {r.spots.length}
                  {r.formula && (
                    <>
                      {' '}
                      · <code>{r.formula}</code>
                    </>
                  )}
                </div>
                <div className="grid two" style={{ alignItems: 'start' }}>
                  <SpotsMap lat={lat} lon={lon} spots={r.spots} hi={hi} setHi={setHi} />
                  <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                    {r.spots.length === 0 ? (
                      <div className="status">No spots found. Try a larger radius.</div>
                    ) : (
                      r.spots.map((s) => <SpotRow key={s.osm_id} s={s} hi={hi === s.osm_id} setHi={setHi} />)
                    )}
                  </div>
                </div>
              </div>
            )}
          </Await>
        </Card>
      </div>

      <ProvenanceFooter lists={[score.provenance, lp.provenance, spots.provenance]} computedAt={[score.state.computedAt, lp.state.computedAt, spots.state.computedAt]} />
    </main>
  );
}
