import api from '../api';
import { Card, Chip, KV } from '../components/Card';
import { Controls } from '../components/Controls';
import { MoonGlyph } from '../components/MoonGlyph';
import { ProvenanceFooter } from '../components/Provenance';
import { Await } from '../components/Status';
import { useApp } from '../context/AppContext';
import { fmtNum, fmtPct, fmtTime, kindGlyph, verdictClass } from '../format';
import { useApi } from '../hooks/useApi';

export default function Tonight() {
  const { lat, lon, atIso } = useApp();
  const w = { lat, lon };
  const moon = useApi((s) => api.scroll.moon(w, atIso, s), [lat, lon, atIso]);
  const sun = useApi((s) => api.scroll.sun(w, atIso, s), [lat, lon, atIso]);
  const score = useApi((s) => api.watchtower.score(w, atIso, 2, true, s), [lat, lon, atIso]);
  const season = useApi((s) => api.scroll.season(atIso, s), [atIso]);
  const events = useApi((s) => api.scroll.events(w, 3, undefined, atIso, undefined, s), [lat, lon, atIso]);

  return (
    <main className="page">
      <div className="page-title">
        <h1>Tonight</h1>
        <span className="jp">今夜</span>
        <span className="sub">moon · sun · verdict · season · next events</span>
      </div>
      <Controls />

      <div className="grid">
        <Card en="Moon" jp="月" right={moon.data?.timezone}>
          <Await q={moon} what="Computing the Moon">
            {(m) => (
              <div className="stack">
                <div className="row" style={{ gap: 14 }}>
                  <MoonGlyph phaseDeg={m.phase_deg} size={64} />
                  <div>
                    <div className="big">{fmtPct(m.illumination, 1)}</div>
                    <div className="sub">
                      {m.phase_name} · age {fmtNum(m.age_days, 1)} d · {m.waxing ? 'waxing' : 'waning'} · {fmtNum(m.phase_deg, 1, '°')}
                    </div>
                  </div>
                </div>
                <div>
                  <span className="jp moon" style={{ fontSize: 26 }}>
                    {m.name.kanji}
                  </span>
                  <span className="gold" style={{ marginLeft: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 13 }}>
                    {m.name.romaji}
                  </span>
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    lunar day {m.name.lunar_day}
                  </span>
                  <div className="sub" style={{ fontStyle: 'italic' }}>{m.name.meaning}</div>
                </div>
                <KV
                  rows={[
                    ['Rise', `${m.rise_local ?? '—'} (${fmtTime(m.rise, m.timezone, true)})`],
                    ['Set', `${m.set_local ?? '—'} (${fmtTime(m.set, m.timezone, true)})`],
                    ['Alt / Az', `${fmtNum(m.altitude, 1, '°')} / ${fmtNum(m.azimuth, 1, '°')}`],
                    ['Distance', `${Math.round(m.distance_km).toLocaleString('en-US')} km · ${fmtNum(m.angular_diameter_deg, 3, '°')}`],
                    [
                      'Libration',
                      `lat ${fmtNum(m.libration.moon_lat, 2, '°')} · lon ${fmtNum(m.libration.moon_lon, 2, '°')} · ecl ${fmtNum(m.libration.ecliptic_lat, 2, '°')} / ${fmtNum(m.libration.ecliptic_lon, 2, '°')}`,
                    ],
                    ['Next', m.next_quarters.slice(0, 2).map((q) => `${q.name} ${fmtTime(q.time, m.timezone, true)}`).join(' · ')],
                  ]}
                />
                {m.alert && <div className="alert">{m.alert}</div>}
              </div>
            )}
          </Await>
        </Card>

        <Card en="Sun" jp="日" right={sun.data?.timezone}>
          <Await q={sun} what="Computing the Sun">
            {(s) => (
              <div className="stack">
                <div className="big">{fmtNum(s.dark_hours, 2)} h</div>
                <div className="sub">of true darkness (astronomical dusk → dawn)</div>
                <KV
                  rows={[
                    ['Sunset', `${s.local.sunset ?? fmtTime(s.sunset, s.timezone)}`],
                    ['Civil dusk', fmtTime(s.civil_dusk, s.timezone)],
                    ['Nautical dusk', fmtTime(s.nautical_dusk, s.timezone)],
                    ['Astro dusk', `${s.local.astronomical_dusk ?? fmtTime(s.astronomical_dusk, s.timezone)}`],
                    ['Astro dawn', `${s.local.astronomical_dawn ?? fmtTime(s.astronomical_dawn, s.timezone)}`],
                    ['Nautical dawn', fmtTime(s.nautical_dawn, s.timezone)],
                    ['Civil dawn', fmtTime(s.civil_dawn, s.timezone)],
                    ['Sunrise', `${s.local.sunrise ?? fmtTime(s.sunrise, s.timezone)}`],
                    ['Alt / Az now', `${fmtNum(s.altitude, 1, '°')} / ${fmtNum(s.azimuth, 1, '°')}`],
                  ]}
                />
              </div>
            )}
          </Await>
        </Card>

        <Card en="Night Honor" jp="夜の誉" hair right={score.data ? `Bortle ${fmtNum(score.data.bortle, 0)}` : undefined}>
          <Await q={score} what="Scoring the night">
            {(n) => (
              <div className="stack">
                <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <div className="big" style={{ fontSize: 56 }}>
                    {Math.round(n.verdict.score)}
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Chip tone={verdictClass(n.verdict.verdict)}>{n.verdict.verdict.replace('_', ' ')}</Chip>
                    <div className="moon" style={{ fontSize: 20, fontFamily: 'var(--font-display)', marginTop: 6 }}>
                      {n.verdict.headline}
                    </div>
                    <div className="sub">{n.verdict.reason}</div>
                  </div>
                </div>
                {n.best_window ? (
                  <KV
                    rows={[
                      ['Best window', `${n.best_window.start_local} – ${n.best_window.end_local} · mean ${fmtNum(n.best_window.mean_score, 1)}`],
                      ['Why', n.best_window.reason],
                      ['Night', `${fmtTime(n.night_start, n.timezone)} → ${fmtTime(n.night_end, n.timezone)} (${n.timezone})`],
                    ]}
                  />
                ) : (
                  <div className="muted">No best window found tonight.</div>
                )}
                {n.warnings.length > 0 && (
                  <div className="stack" style={{ gap: 4 }}>
                    {n.warnings.map((wn, i) => (
                      <div className="warn" key={i}>
                        {wn}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Await>
        </Card>

        <Card en="Season" jp="節気">
          <Await q={season} what="Reading the almanac">
            {(se) => (
              <div className="stack">
                <div>
                  <span className="jp moon" style={{ fontSize: 30 }}>
                    {se.sekki.kanji}
                  </span>
                  <span className="gold" style={{ marginLeft: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 13 }}>
                    {se.sekki.romaji}
                  </span>
                  <span className="muted small"> · sekki {se.sekki.index + 1}/24</span>
                  <div className="sub">{se.sekki.meaning}</div>
                </div>
                <div>
                  <span className="jp moon" style={{ fontSize: 22 }}>
                    {se.ko.kanji}
                  </span>
                  <span className="muted small"> · kō {se.ko.index + 1}/72</span>
                  <div className="sub">{se.ko.meaning}</div>
                </div>
                <div className="muted small num">Sun ecliptic longitude {fmtNum(se.sun_longitude, 3, '°')}</div>
              </div>
            )}
          </Await>
        </Card>

        <Card en="Next events" jp="天象" className="span-2" right="next 3 days · first 5">
          <Await q={events} what="Gathering events" isEmpty={(e) => e.length === 0} emptyText="No events in the next 3 days.">
            {(evs) => (
              <div>
                {evs.slice(0, 5).map((e) => (
                  <div className="ev" key={e.id}>
                    <div className="k" title={e.kind}>
                      {kindGlyph(e.kind)}
                    </div>
                    <div className="t">
                      {e.title}
                      {e.jp && <span className="jp">{e.jp}</span>}
                      {!e.visible_from_here && (
                        <>
                          {' '}
                          <Chip tone="mist">not visible here</Chip>
                        </>
                      )}
                    </div>
                    <div className="when">
                      {e.start_local}
                      {e.direction && <div className="muted">{e.direction}</div>}
                      {e.altitude_max !== null && <div className="muted">max {fmtNum(e.altitude_max, 0, '°')}</div>}
                    </div>
                    {e.detail && <div className="d">{e.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </Await>
        </Card>
      </div>

      <ProvenanceFooter
        lists={[moon.provenance, sun.provenance, score.provenance, season.provenance, events.provenance]}
        computedAt={[moon.state.computedAt, sun.state.computedAt, score.state.computedAt, season.state.computedAt, events.state.computedAt]}
      />
    </main>
  );
}
