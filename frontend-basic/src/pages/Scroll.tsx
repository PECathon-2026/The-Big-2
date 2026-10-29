import { useMemo, useState } from 'react';
import api, { EVENT_KINDS, type CalendarDay, type EventKind, type Pass, type Shower } from '../api';
import { Card, Chip, Section } from '../components/Card';
import { Controls } from '../components/Controls';
import { MoonGlyph } from '../components/MoonGlyph';
import { NotifyButton } from '../components/Notify';
import { ProvenanceFooter } from '../components/Provenance';
import { Await } from '../components/Status';
import { useApp } from '../context/AppContext';
import { fmtDate, fmtNum, fmtPct, fmtTime, kindGlyph } from '../format';
import { useApi } from '../hooks/useApi';

// ---------------------------------------------------------------------------
// Small SVG pieces
// ---------------------------------------------------------------------------

function Sparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="rate per hour">
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="1.3" />
    </svg>
  );
}

/** Polar sky plot: zenith at centre, horizon at the rim, azimuth clockwise from north. */
function PolarTrack({ p }: { p: Pass }) {
  const R = 100;
  const pt = (alt: number, az: number) => {
    const rr = ((90 - Math.max(0, alt)) / 90) * R;
    const a = (az * Math.PI) / 180;
    return [rr * Math.sin(a), -rr * Math.cos(a)] as const;
  };
  const sunlit = p.track.filter((t) => t.sunlit);
  const path = (pts: typeof p.track) => pts.map((t, i) => `${i === 0 ? 'M' : 'L'}${pt(t.alt, t.az).map((v) => v.toFixed(1)).join(',')}`).join(' ');
  const [mx, my] = (() => {
    const m = p.track.reduce((a, b) => (b.alt > a.alt ? b : a), p.track[0] ?? { alt: 0, az: 0, time: '', sunlit: false });
    return pt(m.alt, m.az);
  })();
  return (
    <svg className="polar" viewBox="-115 -115 230 230" role="img" aria-label={`sky track of ${p.satellite}`}>
      {[90, 60, 30].map((alt) => (
        <circle key={alt} className="ring" r={((90 - alt) / 90) * R || 1.5} />
      ))}
      <circle className="ring" r={R} />
      <line className="ring" x1={-R} x2={R} y1={0} y2={0} />
      <line className="ring" x1={0} x2={0} y1={-R} y2={R} />
      <text className="lbl" x={0} y={-R - 5} textAnchor="middle">
        N
      </text>
      <text className="lbl" x={R + 6} y={3}>
        E
      </text>
      <text className="lbl" x={0} y={R + 11} textAnchor="middle">
        S
      </text>
      <text className="lbl" x={-R - 11} y={3}>
        W
      </text>
      <path className="trk dark" d={path(p.track)} />
      {sunlit.length > 1 && <path className="trk" d={path(sunlit)} />}
      {p.track.length > 0 && <circle cx={mx} cy={my} r={3} fill="var(--moon)" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarGrid({ days }: { days: CalendarDay[] }) {
  if (!days.length) return <div className="status">No days.</div>;
  const offset = days[0].weekday; // Monday = 0
  const cells: (CalendarDay | null)[] = [...Array<null>(offset).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="cal">
      {['月', '火', '水', '木', '金', '土', '日'].map((d, i) => (
        <div className="dh" key={i}>
          {d}
        </div>
      ))}
      {cells.map((d, i) =>
        d ? (
          <div className={`cell ${d.is_today ? 'today' : ''} ${d.is_new_moon ? 'new' : ''} ${d.is_full_moon ? 'full' : ''}`} key={d.date}>
            <span className="dn num">{Number(d.date.slice(-2))}</span>
            <MoonGlyph phaseDeg={d.phase_deg} size={24} />
            <span className="ld num">
              {d.lunar_month}/{d.lunar_day}
            </span>
            <div className="tip">
              <b>{d.moon_name.kanji}</b> <span className="muted">{d.moon_name.romaji}</span>
              <div className="small">{d.moon_name.meaning}</div>
              <div className="small num" style={{ marginTop: 4 }}>
                age {fmtNum(d.moon_age, 1)} d · {fmtPct(d.illumination, 0)} · {fmtNum(d.phase_deg, 0, '°')}
              </div>
              <div className="small">
                <b>{d.sekki.kanji}</b> {d.sekki.romaji} · <b>{d.ko.kanji}</b> {d.ko.meaning}
              </div>
              {d.is_new_moon && <div className="gold small">new moon</div>}
              {d.is_full_moon && <div className="gold small">full moon</div>}
            </div>
          </div>
        ) : (
          <div className="cell empty" key={`e${i}`} />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Scroll() {
  const { lat, lon, atIso } = useApp();
  const w = { lat, lon };
  const [kinds, setKinds] = useState<EventKind[]>([]);
  const [days, setDays] = useState(7);
  const [satDays, setSatDays] = useState(3);
  const [sat, setSat] = useState('ISS');
  const ref = useMemo(() => new Date(atIso), [atIso]);
  const [calYM, setCalYM] = useState<{ y: number; m: number } | null>(null);
  const cal = calYM ?? { y: ref.getFullYear(), m: ref.getMonth() + 1 };

  const events = useApi((s) => api.scroll.events(w, days, kinds, atIso, undefined, s), [lat, lon, atIso, days, kinds.join(',')]);
  const meteors = useApi((s) => api.scroll.meteors(w, atIso, undefined, s), [lat, lon, atIso]);
  const passes = useApi((s) => api.scroll.passes(w, satDays, sat, 10, atIso, s), [lat, lon, atIso, satDays, sat]);
  const launches = useApi((s) => api.scroll.launches(w, 20, s), [lat, lon]);
  const planets = useApi((s) => api.scroll.planets(w, atIso, s), [lat, lon, atIso]);
  const eclipses = useApi((s) => api.scroll.eclipses(w, atIso, 3, 2, s), [lat, lon, atIso]);
  const calendar = useApi((s) => api.scroll.calendar(w, cal.y, cal.m, s), [lat, lon, cal.y, cal.m]);

  const toggleKind = (k: EventKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const shiftMonth = (d: number) => {
    const m = cal.m + d;
    if (m < 1) setCalYM({ y: cal.y - 1, m: 12 });
    else if (m > 12) setCalYM({ y: cal.y + 1, m: 1 });
    else setCalYM({ y: cal.y, m });
  };

  return (
    <main className="page">
      <div className="page-title">
        <h1>Celestial Scroll</h1>
        <span className="jp">絵巻</span>
        <span className="sub">events · meteors · ISS · launches · planets · eclipses · 旧暦</span>
      </div>
      <Controls />

      <Card en="Events" jp="天象" hair right={events.data ? `${events.data.length} events` : undefined}>
        <div className="row" style={{ marginBottom: 10 }}>
          {EVENT_KINDS.map((k) => (
            <Chip key={k} tone={kinds.includes(k) ? 'on' : ''} onClick={() => toggleKind(k)}>
              {kindGlyph(k)} {k}
            </Chip>
          ))}
          {kinds.length > 0 && (
            <Chip tone="mist" onClick={() => setKinds([])}>
              clear
            </Chip>
          )}
          <span style={{ marginLeft: 'auto' }} className="row">
            <span className="muted small">days</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ minHeight: 28, padding: '2px 6px' }}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </span>
        </div>
        <Await q={events} what="Unrolling the scroll" isEmpty={(e) => e.length === 0} emptyText="No events match these filters.">
          {(evs) => (
            <div>
              {evs.map((e) => (
                <div className="ev" key={e.id}>
                  <div className="k" title={e.kind}>
                    {kindGlyph(e.kind)}
                  </div>
                  <div className="t">
                    {e.title}
                    {e.jp && <span className="jp">{e.jp}</span>}{' '}
                    {e.visible_from_here ? <Chip tone="ok">visible</Chip> : <Chip tone="mist">not visible here</Chip>}
                    {e.alert && <div className="gold small">{e.alert}</div>}
                  </div>
                  <div className="when">
                    {e.start_local}
                    {e.end && <div className="muted">→ {fmtTime(e.end, undefined, true)}</div>}
                    {e.direction && <div className="muted">{e.direction}</div>}
                    {e.altitude_max !== null && <div className="muted">max {fmtNum(e.altitude_max, 0, '°')}</div>}
                  </div>
                  {e.detail && (
                    <div className="d">
                      {e.detail}
                      {e.source && <span className="muted small"> · {e.source}</span>}
                    </div>
                  )}
                  <div className="actions">
                    <a
                      className="btn small ghost"
                      href={api.scroll.icsUrl({ title: e.title, start: e.start, end: e.end, description: e.detail, location: `${lat},${lon}` })}
                      download={`${e.id}.ics`}
                    >
                      Add to calendar
                    </a>
                    <NotifyButton
                      schedule={async (endpoint) => {
                        const r = await api.alerts.scheduleEvent({ endpoint, lat, lon, event_id: e.id, lead_minutes: 15 });
                        return `push at ${fmtTime(r.fire_at, undefined, true)}: “${r.body}”`;
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Await>
      </Card>

      <div style={{ height: 14 }} />

      <Section en="Meteor showers" jp="流星群" open right={meteors.data ? `${meteors.data.length} active` : undefined}>
        <Await q={meteors} what="Counting meteors" isEmpty={(m) => m.length === 0} emptyText="No active showers.">
          {(showers: Shower[]) => (
            <div className="scroll-x">
              <table className="t">
                <thead>
                  <tr>
                    <th>Shower</th>
                    <th>Active</th>
                    <th>Peak</th>
                    <th className="r">ZHR peak / now</th>
                    <th>Best hour</th>
                    <th className="r">Rate /h</th>
                    <th>Tonight</th>
                  </tr>
                </thead>
                <tbody>
                  {showers.map((s) => (
                    <tr key={s.code} className={s.is_peak_night ? 'hi' : ''}>
                      <td>
                        <span className="moon">{s.name}</span> <span className="jp muted small">{s.jp}</span>
                        <div className="muted small num">
                          {s.code} · v {s.velocity_kms} km/s · r {s.population_index}
                        </div>
                      </td>
                      <td className="num small">
                        {fmtDate(s.active_from)} – {fmtDate(s.active_to)}
                      </td>
                      <td className="num small">
                        {fmtDate(s.peak)}
                        <div className="muted">{fmtNum(s.days_from_peak, 1)} d</div>
                        {s.is_peak_night && <Chip tone="gold">peak night</Chip>}
                      </td>
                      <td className="r num">
                        {s.zhr_peak} / {fmtNum(s.zhr_now, 1)}
                      </td>
                      <td className="num">
                        {s.best_hour ? (
                          <>
                            {s.best_hour.time_local}
                            <div className="muted small">
                              radiant {fmtNum(s.best_hour.radiant_alt, 0, '°')} · lm {fmtNum(s.best_hour.limiting_magnitude, 1)}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="r num gold">{s.best_hour ? fmtNum(s.best_hour.rate_per_hour, 1) : '—'}</td>
                      <td>
                        <Sparkline values={s.hours.map((h) => h.rate_per_hour)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Await>
      </Section>

      <Section
        en="Satellite passes"
        jp="人工衛星"
        open
        right={
          <span className="row" style={{ gap: 6 }}>
            <select value={sat} onChange={(e) => setSat(e.target.value)} style={{ minHeight: 26, padding: '2px 6px' }}>
              {['ISS', 'TIANGONG', 'HUBBLE'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={satDays} onChange={(e) => setSatDays(Number(e.target.value))} style={{ minHeight: 26, padding: '2px 6px' }}>
              {[1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d} d
                </option>
              ))}
            </select>
          </span>
        }
      >
        <Await q={passes} what="Propagating orbits" isEmpty={(p) => p.length === 0} emptyText="No passes above 10° in this window.">
          {(ps) => (
            <div className="stack">
              <div className="scroll-x">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>End</th>
                      <th className="r">Dur</th>
                      <th className="r">Max alt</th>
                      <th>Path</th>
                      <th>Visible</th>
                      <th>Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map((p, i) => (
                      <tr key={`${p.norad_id}-${p.start}`} className={p.visible ? 'hi' : 'dim'}>
                        <td className="num">{p.start_local}</td>
                        <td className="num">{p.end_local}</td>
                        <td className="r num">{Math.round(p.duration_s / 60)} min</td>
                        <td className="r num">{fmtNum(p.max_alt, 0, '°')}</td>
                        <td className="num small">
                          {p.start_compass} ({fmtNum(p.start_az, 0, '°')}) → max {fmtNum(p.max_az, 0, '°')} → {p.end_compass} ({fmtNum(p.end_az, 0, '°')})
                        </td>
                        <td>
                          {p.visible ? <Chip tone="ok">{p.visible_seconds}s sunlit</Chip> : <Chip tone="mist">in shadow</Chip>}
                          {p.alert && <div className="gold small">{p.alert}</div>}
                        </td>
                        <td className="small muted">
                          {p.brightness_hint}
                          {i === 0 && <div className="muted small">(track below)</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {ps.slice(0, 3).map((p) => (
                  <div key={p.start} style={{ textAlign: 'center' }}>
                    <PolarTrack p={p} />
                    <div className="muted small num">
                      {p.satellite} · {p.start_local} · max {fmtNum(p.max_alt, 0, '°')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Await>
      </Section>

      <Section en="Launches" jp="打ち上げ" right={launches.data ? `${launches.data.length}` : undefined}>
        <Await q={launches} what="Checking the launch manifest" isEmpty={(l) => l.length === 0} emptyText="No upcoming launches reported.">
          {(ls) => (
            <div className="grid">
              {ls.map((l) => (
                <div className="card" key={l.id}>
                  <div className="moon" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
                    {l.name}
                  </div>
                  <div className="sub">
                    {l.provider} · {l.rocket}
                    {l.status && (
                      <>
                        {' '}
                        <Chip tone="mist">{l.status}</Chip>
                      </>
                    )}
                  </div>
                  <div className="num small" style={{ marginTop: 4 }}>
                    NET {l.net_local ?? fmtTime(l.net, undefined, true)}
                    {l.window_start && l.window_end && (
                      <span className="muted">
                        {' '}
                        · window {fmtTime(l.window_start, undefined, true)} → {fmtTime(l.window_end)}
                      </span>
                    )}
                  </div>
                  <div className="muted small">
                    {l.pad}
                    {l.location ? ` · ${l.location}` : ''}
                    {l.distance_km !== null ? ` · ${Math.round(l.distance_km).toLocaleString('en-US')} km away` : ''}
                  </div>
                  {l.mission && <div className="small" style={{ marginTop: 4 }}>{l.mission}</div>}
                  {l.visible_trail_hint && <div className="gold small">{l.visible_trail_hint}</div>}
                  {l.webcast && (
                    <a className="small" href={l.webcast} target="_blank" rel="noreferrer">
                      webcast
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Await>
      </Section>

      <Section en="Planets" jp="惑星" right={planets.data ? `${planets.data.filter((p) => p.up_now).length} up now` : undefined}>
        <Await q={planets} what="Placing the planets" isEmpty={(p) => p.length === 0}>
          {(ps) => (
            <div className="scroll-x">
              <table className="t">
                <thead>
                  <tr>
                    <th>Planet</th>
                    <th className="r">Alt</th>
                    <th className="r">Az</th>
                    <th className="r">Mag</th>
                    <th className="r">Elong</th>
                    <th className="r">RA / Dec</th>
                    <th>Rise</th>
                    <th>Set</th>
                    <th className="r">Moon sep</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ps.map((p) => (
                    <tr key={p.name} className={p.up_now ? '' : 'dim'}>
                      <td>
                        <span className="moon">{p.name}</span> <span className="jp muted small">{p.jp}</span>
                      </td>
                      <td className="r num">{fmtNum(p.altitude, 1, '°')}</td>
                      <td className="r num">{fmtNum(p.azimuth, 1, '°')}</td>
                      <td className="r num">{fmtNum(p.magnitude, 2)}</td>
                      <td className="r num">{fmtNum(p.elongation, 1, '°')}</td>
                      <td className="r num small">
                        {fmtNum(p.ra_hours, 2)}h / {fmtNum(p.dec_deg, 1, '°')}
                      </td>
                      <td className="num">{p.rise_local ?? '—'}</td>
                      <td className="num">{p.set_local ?? '—'}</td>
                      <td className="r num">{fmtNum(p.moon_separation_deg, 0, '°')}</td>
                      <td>
                        {p.up_now && <Chip tone="ok">up</Chip>} {p.naked_eye && <Chip tone="gold">naked eye</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Await>
      </Section>

      <Section en="Eclipses" jp="食" right={eclipses.data ? `${eclipses.data.length}` : undefined}>
        <Await q={eclipses} what="Aligning the shadows" isEmpty={(e) => e.length === 0} emptyText="No eclipses found.">
          {(es) => (
            <div className="scroll-x">
              <table className="t">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Peak (local)</th>
                    <th>Begins → ends</th>
                    <th className="r">Duration</th>
                    <th className="r">Obscuration</th>
                    <th className="r">Peak alt</th>
                    <th>Here?</th>
                  </tr>
                </thead>
                <tbody>
                  {es.map((e, i) => (
                    <tr key={i} className={e.visible_from_here ? '' : 'dim'}>
                      <td>
                        <span className="moon">
                          {e.type} · {e.kind}
                        </span>
                        {e.note && <div className="muted small">{e.note}</div>}
                      </td>
                      <td className="num">{e.peak_local}</td>
                      <td className="num small">
                        {fmtTime(e.begins, undefined, true)} → {fmtTime(e.ends, undefined, true)}
                      </td>
                      <td className="r num">{fmtNum(e.duration_minutes, 0)} min</td>
                      <td className="r num">{e.obscuration === null ? '—' : fmtPct(e.obscuration, 0)}</td>
                      <td className="r num">{fmtNum(e.peak_altitude, 1, '°')}</td>
                      <td>{e.visible_from_here ? <Chip tone="ok">visible</Chip> : <Chip tone="mist">not visible</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Await>
      </Section>

      <Section
        en="Lunar calendar"
        jp="旧暦"
        open
        right={
          <span className="row" style={{ gap: 6 }}>
            <button className="btn small ghost" onClick={() => shiftMonth(-1)} type="button">
              ‹
            </button>
            <span className="num">
              {cal.y}-{String(cal.m).padStart(2, '0')}
            </span>
            <button className="btn small ghost" onClick={() => shiftMonth(1)} type="button">
              ›
            </button>
            <button className="btn small ghost" onClick={() => setCalYM(null)} type="button">
              ref month
            </button>
          </span>
        }
      >
        <Await q={calendar} what="Drawing the month">
          {(c) => (
            <div className="stack">
              <CalendarGrid days={c.days} />
              <div className="muted small">
                {c.timezone} · lunar months:{' '}
                {c.lunar_months.map((m) => `${m.number} (new moon ${fmtDate(m.new_moon, c.timezone)})`).join(' · ')}
              </div>
              <div className="muted small">{c.note}</div>
            </div>
          )}
        </Await>
      </Section>

      <ProvenanceFooter
        lists={[events.provenance, meteors.provenance, passes.provenance, launches.provenance, planets.provenance, eclipses.provenance, calendar.provenance]}
        computedAt={[events.state.computedAt, meteors.state.computedAt, passes.state.computedAt, planets.state.computedAt, eclipses.state.computedAt, calendar.state.computedAt]}
      />
    </main>
  );
}
