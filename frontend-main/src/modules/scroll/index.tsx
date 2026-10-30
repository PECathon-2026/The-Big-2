/**
 * /scroll — 巻物 "what and when" (§9.3). Anchors: #moon #calendar #events #passes #meteors #planets
 * #eclipses #launches. Moon/events/passes/meteors/planets come from the shared per-place store;
 * calendar, eclipses and launches are page-only fetches through the memo cache.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, EVENT_KINDS, type EventKind, type SkyEvent } from '@/data/api';
import { useTonight } from '@/data/tonight';
import { compass, fmtDate, fmtNum, fmtTime, kindGlyph } from '@/data/format';
import { useApp } from '@/state/store';
import { BrushLine, Button, Card, Chip, Divider, InfoPopover, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { DataState, MoonDisc, Num, ProvenanceFooter, Reveal, SectionHead } from '../_ui/kit';
import { usePageData } from '../_ui/usePageData';
import { EmakiCalendar } from './Calendar';
import { CompassRose, Countdown, RemindMe, Sparkline } from './parts';
import { SeasonCard, TestPush } from './Season';
import './scroll.css';

const KIND_LABEL: Record<EventKind, string> = { moon: 'Moon', meteor: 'Meteors', eclipse: 'Eclipses', satellite: 'ISS', launch: 'Launches', planet: 'Planets' };

/** Filters live in the hash: #events&kinds=moon,meteor */
function readKinds(): EventKind[] {
  const m = /kinds=([a-z,]+)/.exec(location.hash);
  return m ? (m[1].split(',').filter((k) => (EVENT_KINDS as string[]).includes(k)) as EventKind[]) : [];
}

function MoonHero() {
  const moon = useTonight((s) => s.moon);
  const tz = useApp((s) => s.tz);
  const m = moon.data;
  return (
    <section className="pg-section sc-first" id="moon">
      <DataState status={moon.status} error={moon.error} stale={moon.stale} hasData={!!m} what="Finding tonight's Moon…" />
      {m && (
        <Reveal>
          <Card spotlight brand={{ kanji: '月', text: 'Tonight’s Moon' }} tag="№ 01" className="sc-moon">
            <div className="sc-moon-grid">
              <div className="sc-moon-disc">
                <MoonDisc ageDays={m.age_days} size={240} label={`${m.phase_name}, ${Math.round(m.illumination * 100)}% illuminated`} />
                <p className="pg-quiet" style={{ textAlign: 'center' }}>
                  drawn from the phase · age {fmtNum(m.age_days, 1)} d
                </p>
              </div>
              <div>
                <p className="sc-moon-kanji" lang="ja">
                  {m.name.kanji}
                </p>
                <p className="sc-moon-romaji">{m.name.romaji}</p>
                <BrushLine />
                <p className="sc-moon-meaning">{m.name.meaning}</p>
                <Divider />
                <div className="pg-stats">
                  <div className="pg-stat">
                    <span className="pg-label">Illuminated</span>
                    <span className="v">
                      <Num value={m.illumination * 100} suffix="%" />
                      <InfoPopover title="Moon tonight" provenance={moon.provenance} computedAt={moon.computedAt} notes={`Phase angle ${fmtNum(m.phase_deg, 1)}°, ${m.phase_name}. Distance ${fmtNum(m.distance_km / 1000, 1)} thousand km, ${fmtNum(m.angular_diameter_deg, 3)}° across.`} />
                    </span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Rises</span>
                    <span className="v num">{m.rise ? fmtTime(m.rise, tz) : '—'}</span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Sets</span>
                    <span className="v num">{m.set ? fmtTime(m.set, tz) : '—'}</span>
                  </div>
                  <div className="pg-stat">
                    <span className="pg-label">Now</span>
                    <span className="v num">
                      {fmtNum(m.altitude, 0)}° {compass(m.azimuth)}
                    </span>
                  </div>
                </div>
                <ul className="sc-quarters">
                  {m.next_quarters.map((q) => (
                    <li key={q.time}>
                      <span className="pg-label">{q.name}</span>
                      <span className="num">{fmtTime(q.time, tz, true)}</span>
                    </li>
                  ))}
                </ul>
                {m.alert && <p className="sc-alert">{m.alert}</p>}
              </div>
            </div>
          </Card>
        </Reveal>
      )}
    </section>
  );
}

function EventCard({ e, i }: { e: SkyEvent; i: number }) {
  const place = useApp((s) => s.place);
  return (
    <Reveal i={i % 6} as="li">
      <Card plain className={`sc-ev ${e.visible_from_here ? 'vis' : ''}`}>
        <div className="sc-ev-head">
          <span className={`sc-ev-glyph ${e.kind}`} lang="ja" aria-hidden="true">
            {kindGlyph(e.kind)}
          </span>
          <div>
            <h3 className="sc-ev-title">{e.title}</h3>
            {e.jp && <Kanji className="sc-ev-jp">{e.jp}</Kanji>}
          </div>
          <span className="sc-ev-when num">{e.start_local}</span>
        </div>
        <div className="sc-ev-meta">
          {e.visible_from_here ? <span className="tw-chip live">visible from here</span> : <Chip variant="provenance">not visible from here</Chip>}
          {e.direction && (
            <Tag>
              <span aria-hidden="true">↗</span> {e.direction}
            </Tag>
          )}
          {e.altitude_max != null && <Tag num>max {fmtNum(e.altitude_max, 0)}°</Tag>}
          {e.end && <span className="pg-quiet num">until {fmtTime(e.end, useApp.getState().tz, true)}</span>}
        </div>
        {e.detail && <p className="sc-ev-detail">{e.detail}</p>}
        <div className="sc-ev-actions">
          <a className="tw-btn secondary" href={api.scroll.icsUrl({ title: e.title, start: e.start, end: e.end, description: e.detail, location: place ? `${place.lat},${place.lon}` : null })} download={`${e.id}.ics`}>
            Add to calendar
          </a>
          {new Date(e.start).getTime() > Date.now() + 16 * 60_000 && <RemindMe eventId={e.id} />}
          {e.source && <span className="pg-quiet">source: {e.source}</span>}
        </div>
      </Card>
    </Reveal>
  );
}

export default function Scroll() {
  const nav = useNavigate();
  const place = useApp((s) => s.place);
  const tz = useApp((s) => s.tz);
  const events = useTonight((s) => s.events);
  const passes = useTonight((s) => s.passes);
  const meteors = useTonight((s) => s.meteors);
  const planets = useTonight((s) => s.planets);
  const moon = useTonight((s) => s.moon);

  const now = new Date();
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const tzNow = useMemo(() => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: 'numeric' }).formatToParts(now);
    return { y: +(p.find((x) => x.type === 'year')?.value ?? now.getFullYear()), m: +(p.find((x) => x.type === 'month')?.value ?? now.getMonth() + 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);
  const cal = ym ?? tzNow;
  const calendar = usePageData(place ? `scroll/calendar/${cal.y}-${cal.m}` : null, () => api.scroll.calendar(place!, cal.y, cal.m), 6 * 3600_000);
  const eclipses = usePageData(place ? 'scroll/eclipses' : null, () => api.scroll.eclipses(place!), 6 * 3600_000);
  const launches = usePageData(place ? 'scroll/launches' : null, () => api.scroll.launches(place!, 12), 30 * 60_000);
  const season = usePageData(place ? 'scroll/season' : null, () => api.scroll.season(), 30 * 60_000);

  const [kinds, setKinds] = useState<EventKind[]>(readKinds);
  useEffect(() => {
    if (!kinds.length && !/kinds=/.test(location.hash)) return;
    const base = location.hash.replace(/&?kinds=[a-z,]*/, '') || '#events';
    const next = kinds.length ? `${base}&kinds=${kinds.join(',')}` : base;
    if (next !== location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${next}`);
  }, [kinds]);
  const toggle = (k: EventKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const shown = (events.data ?? []).filter((e) => !kinds.length || kinds.includes(e.kind));

  const shift = (d: number) => {
    let m = cal.m + d;
    let y = cal.y;
    if (m < 1) (m = 12), y--;
    if (m > 12) (m = 1), y++;
    setYm({ y, m });
  };

  return (
    <PageFrame
      seal="巻"
      eyebrow="三 · 巻物 Makimono · The Celestial Scroll"
      title={
        <>
          What is coming, and <em>when</em>.
        </>
      }
      lede={moon.data ? `Tonight is ${moon.data.name.romaji}, ${moon.data.name.meaning.replace(/\.$/, '').toLowerCase()}. Below: the month in lunar days, then every event your sky will hold this week.` : 'The Moon, the lunar month, and every event your sky will hold this week.'}
      actions={
        <nav className="sc-toc" aria-label="Sections">
          {['moon', 'calendar', 'events', 'passes', 'meteors', 'planets', 'eclipses', 'launches'].map((a) => (
            <a
              key={a}
              href={`#${a}`}
              className="sc-toc-a"
              onClick={(ev) => {
                ev.preventDefault();
                nav({ hash: a }, { replace: true });
              }}
            >
              {a}
            </a>
          ))}
        </nav>
      }
    >
      <MoonHero />

      <section className="pg-section" id="calendar">
        <SectionHead
          jp="旧暦"
          eyebrow={`Kyūreki · lunar calendar · ${new Date(Date.UTC(cal.y, cal.m - 1, 15)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`}
          right={
            <>
              <button className="tw-icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
                ‹
              </button>
              <button className="tw-icon-btn" onClick={() => shift(1)} aria-label="Next month">
                ›
              </button>
              {ym && (
                <Button variant="secondary" onClick={() => setYm(null)} style={{ minHeight: 32 }}>
                  this month
                </Button>
              )}
              {calendar.data && <InfoPopover title="Lunar calendar" provenance={calendar.provenance} computedAt={calendar.computedAt} notes={calendar.data.note} />}
            </>
          }
        >
          The month as a <em>scroll</em>.
        </SectionHead>
        <DataState status={calendar.status} error={calendar.error} stale={calendar.stale} hasData={!!calendar.data} what="Unrolling the month…" onRetry={calendar.reload} />
        {calendar.data && (
          <Reveal>
            <EmakiCalendar cal={calendar.data} events={events.data ?? []} eclipses={eclipses.data ?? []} tz={tz} />
            <p className="pg-quiet sc-legend">
              Drag, scroll or use ← → · <i className="seal meteor" /> meteor shower · <i className="seal iss" /> ISS pass · <i className="seal eclipse" /> eclipse · crimson ring = today · 24 sekki and 72 kō from the Sun's longitude
            </p>
          </Reveal>
        )}
        <SeasonCard season={season} />
      </section>

      <section className="pg-section" id="events">
        <SectionHead
          jp="天象"
          eyebrow={events.data ? `Tenshō · ${shown.length} of ${events.data.length} events · next 7 days` : 'Tenshō · events'}
          right={<InfoPopover title="Sky events" provenance={events.provenance} computedAt={events.computedAt} />}
        >
          The week <em>ahead</em>.
        </SectionHead>
        <div className="sc-filters" role="group" aria-label="Filter events by kind">
          {EVENT_KINDS.map((k) => (
            <button key={k} className="pg-filter" aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>
              <span className="jp" aria-hidden="true">
                {kindGlyph(k)}
              </span>
              {KIND_LABEL[k]}
            </button>
          ))}
          {kinds.length > 0 && (
            <button className="tw-btn secondary" onClick={() => setKinds([])} style={{ minHeight: 34 }}>
              show all
            </button>
          )}
        </div>
        <p className="pg-quiet">
          “Remind me” asks your browser for notification permission, then our server sends a Web Push 15 minutes before the event. It works with this tab closed as long as the browser keeps running.
        </p>
        <TestPush />
        <DataState status={events.status} error={events.error} stale={events.stale} hasData={!!events.data} what="Reading the week's sky… (meteors, passes, launches and eclipses)" />
        {events.data && (shown.length ? <ul className="sc-ev-list">{shown.map((e, i) => <EventCard key={e.id} e={e} i={i} />)}</ul> : <p className="pg-quiet">No events of this kind in the next 7 days.</p>)}
      </section>

      <section className="pg-section" id="passes">
        <SectionHead jp="人工衛星" eyebrow="Jinkō eisei · ISS passes · next 3 days" right={<InfoPopover title="Satellite passes" provenance={passes.provenance} computedAt={passes.computedAt} />}>
          The station <em>overhead</em>.
        </SectionHead>
        <DataState status={passes.status} error={passes.error} stale={passes.stale} hasData={!!passes.data} what="Propagating the orbit…" />
        {passes.data && (
          <div className="pg-grid cards">
            {passes.data.length === 0 && <p className="pg-quiet">No passes above 10° in the next 3 days.</p>}
            {[...passes.data]
              .sort((a, b) => Number(b.visible) - Number(a.visible) || a.start.localeCompare(b.start))
              .slice(0, 6)
              .map((p, i) => (
                <Reveal key={p.start} i={i}>
                  <Card plain className={`sc-pass ${p.visible ? 'vis' : ''}`}>
                    <CompassRose p={p} size={200} />
                    <div className="sc-pass-info">
                      <span className="sc-pass-when num">{fmtTime(p.start, tz, true)}</span>
                      <span className="pg-quiet num">
                        {p.start_compass} → {p.end_compass} · max {fmtNum(p.max_alt, 0)}° · {Math.round(p.duration_s / 60)} min
                      </span>
                      {p.visible ? <span className="tw-chip live">{p.visible_seconds}s sunlit · look up</span> : <Chip variant="provenance">in shadow or daylight</Chip>}
                      {p.brightness_hint && <span className="pg-quiet">{p.brightness_hint}</span>}
                    </div>
                  </Card>
                </Reveal>
              ))}
          </div>
        )}
      </section>

      <section className="pg-section" id="meteors">
        <SectionHead jp="流星群" eyebrow="Ryūseigun · meteor showers" right={<InfoPopover title="Meteor rates" provenance={meteors.provenance} computedAt={meteors.computedAt} notes="Rates from here: ZHR scaled by radiant altitude and your limiting magnitude." />}>
          Falling <em>stars</em>.
        </SectionHead>
        <DataState status={meteors.status} error={meteors.error} stale={meteors.stale} hasData={!!meteors.data} what="Counting meteors…" />
        {meteors.data && (
          <div className="pg-grid three">
            {meteors.data.length === 0 && <p className="pg-quiet">No shower is active tonight.</p>}
            {meteors.data.map((s, i) => (
              <Reveal key={s.code} i={i}>
                <Card plain className="sc-shower">
                  <h3 className="pg-name">{s.name}</h3>
                  <Kanji className="sc-ev-jp">{s.jp}</Kanji>
                  <div className="pg-stats" style={{ marginTop: 12 }}>
                    <div className="pg-stat">
                      <span className="pg-label">ZHR now</span>
                      <span className="v">
                        <Num value={s.zhr_now} decimals={1} />
                        <InfoPopover title={`${s.name} rate`} trace={s.trace && 'formula' in s.trace ? (s.trace as { formula: string }) : null} provenance={meteors.provenance} />
                      </span>
                    </div>
                    <div className="pg-stat">
                      <span className="pg-label">Best from here</span>
                      <span className="v num">{s.best_hour ? <>{fmtNum(s.best_hour.rate_per_hour, 1)}<small>per hour</small></> : '—'}</span>
                    </div>
                    <div className="pg-stat">
                      <span className="pg-label">Radiant</span>
                      <span className="v num">{s.best_hour ? `${fmtNum(s.best_hour.radiant_alt, 0)}°` : '—'}</span>
                    </div>
                  </div>
                  <Sparkline values={s.hours.map((h) => h.rate_per_hour)} labels={s.hours.map((h) => h.time_local)} />
                  <p className="pg-quiet num">
                    {s.hours[0]?.time_local} → {s.hours[s.hours.length - 1]?.time_local} · peak {fmtDate(s.peak, tz)} ({s.days_from_peak > 0 ? `${fmtNum(s.days_from_peak, 1)} d ago` : `in ${fmtNum(-s.days_from_peak, 1)} d`}) · ZHR at peak {s.zhr_peak}
                  </p>
                  {s.is_peak_night && <span className="tw-chip live">peak night</span>}
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <section className="pg-section" id="planets">
        <SectionHead jp="惑星" eyebrow="Wakusei · planets tonight" right={<InfoPopover title="Planets" provenance={planets.provenance} computedAt={planets.computedAt} />}>
          The <em>wanderers</em>.
        </SectionHead>
        <DataState status={planets.status} error={planets.error} stale={planets.stale} hasData={!!planets.data} what="Placing the planets…" />
        {planets.data && (
          <div className="pg-grid cards">
            {planets.data.map((p, i) => (
              <Reveal key={p.name} i={i}>
                <Card plain className={`sc-planet ${p.up_now ? 'up' : ''}`}>
                  <div className="sc-planet-head">
                    <span className="sc-planet-jp" lang="ja">
                      {p.jp}
                    </span>
                    <h3 className="pg-name">{p.name}</h3>
                  </div>
                  <dl className="pg-kv">
                    <dt>Magnitude</dt>
                    <dd>{fmtNum(p.magnitude, 1)}</dd>
                    <dt>Now</dt>
                    <dd>
                      {fmtNum(p.altitude, 0)}° {compass(p.azimuth)}
                    </dd>
                    <dt>Rises · sets</dt>
                    <dd>
                      {p.rise ? fmtTime(p.rise, tz) : '—'} · {p.set ? fmtTime(p.set, tz) : '—'}
                    </dd>
                    {p.moon_separation_deg != null && (
                      <>
                        <dt>From the Moon</dt>
                        <dd>{fmtNum(p.moon_separation_deg, 0)}°</dd>
                      </>
                    )}
                  </dl>
                  <div className="sc-ev-meta">
                    {p.up_now ? <span className="tw-chip live">up now</span> : <Chip variant="provenance">below the horizon</Chip>}
                    {p.naked_eye && <Tag>naked eye</Tag>}
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <section className="pg-section" id="eclipses">
        <SectionHead jp="食" eyebrow="Shoku · eclipses ahead" right={eclipses.data && <InfoPopover title="Eclipses" provenance={eclipses.provenance} computedAt={eclipses.computedAt} />}>
          When the light is <em>eaten</em>.
        </SectionHead>
        <DataState status={eclipses.status} error={eclipses.error} stale={eclipses.stale} hasData={!!eclipses.data} what="Aligning the shadows…" onRetry={eclipses.reload} />
        {eclipses.data && (
          <ul className="pg-rows sc-rows">
            {eclipses.data.map((e, i) => (
              <Reveal as="li" key={e.peak} i={i} className="sc-row">
                <span className={`sc-ev-glyph eclipse`} lang="ja" aria-hidden="true">
                  {e.type === 'lunar' ? '月' : '日'}
                </span>
                <div>
                  <h3 className="sc-ev-title">
                    {e.type === 'lunar' ? 'Lunar' : 'Solar'} eclipse · {e.kind}
                  </h3>
                  <p className="pg-quiet num">
                    peak {fmtTime(e.peak, tz, true)} {new Date(e.peak).getUTCFullYear()} · {e.duration_minutes != null ? `${Math.round(e.duration_minutes)} min` : ''} {e.obscuration != null && e.obscuration > 0 ? `· ${Math.round(e.obscuration * 100)}% covered` : ''} {e.peak_altitude != null ? `· ${fmtNum(e.peak_altitude, 0)}° up at peak` : ''}
                  </p>
                  {e.note && <p className="pg-quiet">{e.note}</p>}
                </div>
                {e.visible_from_here ? <span className="tw-chip live">visible here</span> : <Chip variant="provenance">not from here</Chip>}
              </Reveal>
            ))}
          </ul>
        )}
      </section>

      <section className="pg-section" id="launches">
        <SectionHead jp="打ち上げ" eyebrow="Uchiage · launches" right={launches.data && <InfoPopover title="Launches" provenance={launches.provenance} computedAt={launches.computedAt} />}>
          Fire into the <em>night</em>.
        </SectionHead>
        <DataState status={launches.status} error={launches.error} stale={launches.stale} hasData={!!launches.data} what="Reading the launch manifest…" onRetry={launches.reload} />
        {launches.data && (
          <div className="pg-grid two">
            {launches.data
              .filter((l) => l.net && new Date(l.net).getTime() > Date.now() - 3600_000)
              .slice(0, 8)
              .map((l, i) => (
                <Reveal key={l.id} i={i}>
                  <Card plain className="sc-launch">
                    <h3 className="pg-name sc-launch-name">{l.name}</h3>
                    <p className="pg-quiet">
                      {l.provider} · {l.rocket} {l.status && <Tag>{l.status}</Tag>}
                    </p>
                    {l.net && <Countdown to={l.net} />}
                    <p className="pg-quiet num">
                      NET {fmtTime(l.net, tz, true)} · {l.location}
                      {l.distance_km != null && ` · ${Math.round(l.distance_km).toLocaleString('en-US')} km away`}
                    </p>
                    {l.visible_trail_hint && <p className="pg-quiet">{l.visible_trail_hint}</p>}
                    {l.webcast && (
                      <a className="tw-btn primary" href={l.webcast} target="_blank" rel="noreferrer" style={{ minHeight: 36, marginTop: 8 }}>
                        Watch the webcast ↗
                      </a>
                    )}
                  </Card>
                </Reveal>
              ))}
          </div>
        )}
      </section>

      <ProvenanceFooter
        lists={[moon.provenance, calendar.provenance, events.provenance, passes.provenance, meteors.provenance, planets.provenance, eclipses.provenance, launches.provenance]}
        computedAt={[moon.computedAt, events.computedAt, calendar.computedAt]}
      />
    </PageFrame>
  );
}
