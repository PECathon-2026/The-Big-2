/**
 * /science — 学 "is this real?" (§9.6). Architecture, the formulas exactly as the API's traces return
 * them, every data source from the live provenance, the honesty notes, and the credits (read from the
 * CREDITS.md files that ship with the textures, audio and samples).
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import ScrollReveal from '@/vendor/reactbits/ScrollReveal';
import { API_BASE, type Provenance } from '@/data/api';
import { useTonight } from '@/data/tonight';
import { fmtRelative, fmtTime } from '@/data/format';
import { loadCatalog, STAR_STRIDE } from '@/astro/catalog';
import { useApp } from '@/state/store';
import { Card, Chip, Kanji, Tag } from '@/ui';
import PageFrame from '../_ui/PageFrame';
import { Reveal, ScrollerCtx, SectionHead, useCalm } from '../_ui/kit';
import { SpectraSection, TransientTools } from './Explore';
import './science.css';

/** Licences we can state with certainty, by provenance source id. Anything else links to its source. */
const LICENCE: Record<string, string> = {
  'open-meteo': 'CC BY 4.0 · Open-Meteo.com',
  'open-meteo-air-quality': 'CC BY 4.0 · Open-Meteo.com (CAMS)',
  'open-meteo-ensemble': 'CC BY 4.0 · Open-Meteo.com',
  'nasa-gibs': 'NASA EOSDIS GIBS · VIIRS Black Marble, no copyright (NASA data policy)',
  overpass: '© OpenStreetMap contributors · ODbL',
  osm: '© OpenStreetMap contributors · ODbL',
};

function Architecture() {
  return (
    <svg viewBox="0 0 1000 420" className="sci-arch" role="img" aria-labelledby="arch-t arch-d">
      <title id="arch-t">Architecture</title>
      <desc id="arch-d">The browser computes the sky itself from a star catalogue and astronomy-engine; a FastAPI backend fetches forecasts, light pollution, places, satellites and launches, runs the Spirit Lens pipeline, and returns every number with its provenance.</desc>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--gold)" />
        </marker>
      </defs>
      {/* browser */}
      <rect x="20" y="30" width="420" height="360" rx="16" className="sci-box" />
      <text x="44" y="64" className="sci-h">Your browser</text>
      <text x="44" y="84" className="sci-s">React 19 · one persistent three.js canvas</text>
      {[
        ['Sky engine', 'd3-celestial catalogue · astronomy-engine', 'positions, phase, sky colour: offline'],
        ['Time compass', 'sky time = now + offset', 'no refetch while you drag'],
        ['Module pages', 'Watchtower · Scroll · Lens · Honor', 'render the API envelopes'],
        ['Journal', 'localStorage only', 'never leaves the device'],
      ].map(([h, a, b], i) => (
        <g key={h} transform={`translate(44 ${108 + i * 68})`}>
          <rect width="372" height="56" rx="8" className="sci-inner" />
          <text x="14" y="22" className="sci-ih">{h}</text>
          <text x="14" y="40" className="sci-s">
            {a} · {b}
          </text>
        </g>
      ))}
      {/* api */}
      <rect x="560" y="30" width="420" height="360" rx="16" className="sci-box crimson" />
      <text x="584" y="64" className="sci-h">FastAPI backend</text>
      <text x="584" y="84" className="sci-s">{'{ data, provenance[], computed_at }'}</text>
      {[
        ['/watchtower', 'forecast · light pollution · spots', 'Open-Meteo · NASA Black Marble · OSM'],
        ['/scroll', 'moon · sun · events · passes · meteors', 'ephemerides · TLEs · launch manifests'],
        ['/lens', 'jobs · honesty · detections · WCS', 'photutils-style pipeline · SkyView · SIMBAD'],
        ['/alerts', 'Web Push scheduler', 'VAPID · fires 15 min before'],
      ].map(([h, a, b], i) => (
        <g key={h} transform={`translate(584 ${108 + i * 68})`}>
          <rect width="372" height="56" rx="8" className="sci-inner" />
          <text x="14" y="22" className="sci-ih">{h}</text>
          <text x="14" y="40" className="sci-s">
            {a} · {b}
          </text>
        </g>
      ))}
      <path d="M440 170 C 500 170, 500 170, 556 170" className="sci-flow" markerEnd="url(#arr)" />
      <path d="M556 250 C 500 250, 500 250, 444 250" className="sci-flow" markerEnd="url(#arr)" />
      <text x="500" y="160" textAnchor="middle" className="sci-s">lat, lon (2 decimals)</text>
      <text x="500" y="276" textAnchor="middle" className="sci-s">numbers + provenance</text>
    </svg>
  );
}

function Credits({ path, title }: { path: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(path)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => alive && setText(t.trim().startsWith('<') ? null : t))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <Card plain className="sci-credit">
      <h3 className="pg-name">{title}</h3>
      {text ? <pre className="sci-md">{text.replace(/^#+\s*/gm, '').trim()}</pre> : <p className="pg-quiet">No {path} shipped yet.</p>}
    </Card>
  );
}

function LongText({ children }: { children: string }) {
  const root = useContext(ScrollerCtx);
  const calm = useCalm();
  const ref = useRef<HTMLElement | null>(root);
  ref.current = root;
  if (calm || !root) return <p className="sci-long">{children}</p>;
  return (
    <ScrollReveal scrollContainerRef={ref} mode="enter" effect="rise" splitBy="words" enableBlur blurStrength={3} containerClassName="sci-long-wrap" textClassName="sci-long">
      {children}
    </ScrollReveal>
  );
}

export default function Science() {
  const t = useTonight();
  const place = useApp((s) => s.place);
  const tz = useApp((s) => s.tz);
  const [cat, setCat] = useState<{ stars: number; named: number; maxMag: number; constellations: number; dsos: number } | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((c) => {
        let maxMag = -99;
        for (let i = 0; i < c.starCount; i++) maxMag = Math.max(maxMag, c.stars[i * STAR_STRIDE + 2]);
        const anyC = c as unknown as { names?: Record<string, unknown>; constellations?: unknown[]; dsos?: unknown[] };
        setCat({ stars: c.starCount, named: anyC.names ? Object.keys(anyC.names).length : 0, maxMag, constellations: anyC.constellations?.length ?? 0, dsos: anyC.dsos?.length ?? 0 });
      })
      .catch(() => setCat(null));
  }, []);

  const sources = useMemo(() => {
    const m = new Map<string, Provenance & { used: string[] }>();
    const add = (list: Provenance[], used: string) => {
      for (const p of list) {
        const k = `${p.source}|${p.url?.split('?')[0] ?? ''}`;
        const cur = m.get(k);
        if (cur) cur.used.push(used);
        else m.set(k, { ...p, used: [used] });
      }
    };
    add(t.score.provenance, 'Night Honor Score');
    add(t.moon.provenance, 'Moon');
    add(t.sun.provenance, 'Sun');
    add(t.planets.provenance, 'Planets');
    add(t.events.provenance, 'Events');
    add(t.passes.provenance, 'Satellite passes');
    add(t.meteors.provenance, 'Meteor showers');
    return [...m.values()];
  }, [t]);

  const meteorTrace = t.meteors.data?.find((s) => s.trace && 'formula' in (s.trace as object))?.trace as { formula?: string; notes?: string[] } | undefined;

  return (
    <PageFrame
      seal="学"
      eyebrow="学 · Gaku · The Science"
      title={
        <>
          Is this <em>real</em>?
        </>
      }
      lede="Every number in Tsukuyomi Watch is computed or fetched, and each one carries where it came from. This page shows the machinery, the formulas as the server returns them, and the places where we bend the truth for your eyes, and by how much."
    >
      <section className="pg-section sci-first" id="architecture">
        <SectionHead jp="構造" eyebrow="Kōzō · architecture">
          Two halves, one <em>sky</em>.
        </SectionHead>
        <Reveal>
          <Card plain className="sci-arch-card">
            <Architecture />
            <p className="pg-quiet">
              Backend: <code>{API_BASE}</code> · your place is sent rounded to 2 decimals (about a kilometre){place && ` · now ${place.lat.toFixed(2)}, ${place.lon.toFixed(2)} (${place.source})`}.
            </p>
          </Card>
        </Reveal>
      </section>

      <section className="pg-section" id="formulas">
        <SectionHead jp="算式" eyebrow="Sanshiki · formulas, as the server returns them">
          The <em>arithmetic</em>.
        </SectionHead>
        <div className="pg-grid two">
          <Reveal i={0}>
            <Card brand={{ kanji: '誉', text: 'Night Honor Score' }} tag="/watchtower/score" className="sci-formula">
              {t.score.data ? (
                <>
                  <pre className="sci-code">{t.score.data.trace.formula}</pre>
                  <ul className="sci-notes">
                    {t.score.data.trace.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <p className="pg-quiet">inputs: {Object.keys(t.score.data.trace.inputs).join(' · ')}</p>
                </>
              ) : (
                <p className="pg-loading">Reading the trace…</p>
              )}
            </Card>
          </Reveal>
          <Reveal i={1}>
            <Card brand={{ kanji: '流', text: 'Meteor rate from here' }} tag="/scroll/meteors" className="sci-formula">
              {meteorTrace?.formula ? (
                <>
                  <pre className="sci-code">{meteorTrace.formula}</pre>
                  <ul className="sci-notes">
                    {(meteorTrace.notes ?? []).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </>
              ) : t.meteors.data ? (
                <p className="pg-quiet">The server returned no formula with tonight's showers.</p>
              ) : (
                <p className="pg-loading">Reading the trace…</p>
              )}
            </Card>
          </Reveal>
          <Reveal i={2} className="pg-span-2">
            <Card plain className="sci-formula">
              <p className="pg-quiet">
                Every score on the Watchtower also has an <span className="tw-info-btn" aria-hidden="true">i</span> button that opens the same trace with each factor's value, weight and contribution. The Spirit Lens returns its own formula and honesty notes with every job; open one in the Dojo.
              </p>
            </Card>
          </Reveal>
        </div>
      </section>

      <SpectraSection />

      <TransientTools />

      <section className="pg-section" id="sources">
        <SectionHead jp="出典" eyebrow={`Shutten · ${sources.length} live sources this session`}>
          Where the numbers <em>come from</em>.
        </SectionHead>
        <Reveal>
          <Card plain>
            {sources.length === 0 ? (
              <p className="pg-loading">Waiting for tonight's data…</p>
            ) : (
              <table className="sci-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Used for</th>
                    <th>Fetched</th>
                    <th>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((p) => (
                    <tr key={`${p.source}${p.url}`}>
                      <td>
                        <strong>{p.source}</strong>
                        {p.note && <div className="pg-quiet">{p.note}</div>}
                      </td>
                      <td>{[...new Set(p.used)].join(', ')}</td>
                      <td className="num">
                        {p.fetched_at ? `${fmtTime(p.fetched_at, tz, true)} · ${fmtRelative(p.fetched_at)}` : 'computed'}
                        {p.cached && <Chip variant="provenance">cached</Chip>}
                        {p.stale && <Chip variant="stale" />}
                      </td>
                      <td>
                        {LICENCE[p.source] ?? (p.url ? 'see source' : p.source === 'computed' ? 'our code' : '—')}
                        {p.url && (
                          <a className="pg-link" href={p.url} target="_blank" rel="noreferrer">
                            ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Reveal>
      </section>

      <section className="pg-section" id="honesty">
        <SectionHead jp="誠" eyebrow="Makoto · where we bend the truth">
          Honest <em>liberties</em>.
        </SectionHead>
        <div className="pg-washi sci-sheet" data-cursor="off">
          <ol className="sci-honesty">
            <li>
              <Kanji>月</Kanji>
              <LongText>The Moon in the sky is drawn about three times its real size so you can see its phase. Its position, phase and libration are computed exactly.</LongText>
            </li>
            <li>
              <Kanji>流</Kanji>
              <LongText>Shooting stars in the sky are shown more often than the real rate so you notice the shower. The label always states the real rate from the server.</LongText>
            </li>
            <li>
              <Kanji>刻</Kanji>
              <LongText>The wadokei time compass uses twelve equal two-hour koku. Real Edo-period clocks used unequal hours that stretched with the length of day and night.</LongText>
            </li>
            <li>
              <Kanji>位</Kanji>
              <LongText>{`If you did not share your location, we approximate it from your IP address, which can be off by tens of kilometres. ${place?.source === 'ip' ? 'That is the case right now.' : 'Right now your place comes from ' + (place?.source ?? 'nowhere yet') + '.'} You can always choose a place by hand.`}</LongText>
            </li>
            <li>
              <Kanji>星</Kanji>
              <LongText>
                {cat
                  ? `The star catalogue is d3-celestial, built from Hipparcos: ${cat.stars.toLocaleString('en-US')} stars down to magnitude ${cat.maxMag.toFixed(1)}, which is about what dark-sky eyes can see. Fainter stars are not drawn.`
                  : 'The star catalogue is d3-celestial, built from Hipparcos, down to magnitude 6: about what dark-sky eyes can see.'}
              </LongText>
            </li>
            <li>
              <Kanji>歳</Kanji>
              <LongText>Star positions are at epoch J2000. Precession since then moves them by about 0.36° and we do not apply it, which is smaller than the Moon's width.</LongText>
            </li>
            <li>
              <Kanji>鏡</Kanji>
              <LongText>The Spirit Lens runs a real restoration pipeline on the server. Only if that server is down does the Dojo fall back to a simulation generated in your browser, and then every number carries a MOCK label.</LongText>
            </li>
          </ol>
        </div>
      </section>

      <section className="pg-section" id="credits">
        <SectionHead jp="謝辞" eyebrow="Shaji · credits">
          With <em>thanks</em>.
        </SectionHead>
        <div className="pg-grid two">
          <Reveal i={0}>
            <Card plain className="sci-credit">
              <h3 className="pg-name">Type</h3>
              <ul className="sci-notes">
                <li>Cinzel · Natanael Gama · SIL Open Font License</li>
                <li>Plus Jakarta Sans · Tokotype · SIL Open Font License</li>
                <li>Shippori Mincho · FONTDASU · SIL Open Font License</li>
                <li>Cormorant Garamond · Christian Thalmann · SIL Open Font License</li>
                <li>Self-hosted through Fontsource</li>
              </ul>
            </Card>
          </Reveal>
          <Reveal i={1}>
            <Card plain className="sci-credit">
              <h3 className="pg-name">Data and code</h3>
              <ul className="sci-notes">
                <li>Star catalogue, constellations, Milky Way: d3-celestial by Olaf Frohn (BSD-3), from Hipparcos</li>
                <li>Positions: astronomy-engine by Don Cross (MIT)</li>
                <li>Moon: NASA SVS CGI Moon Kit (LRO), public domain</li>
                <li>Maps: © OpenStreetMap contributors (ODbL), via Leaflet</li>
                <li>Interface pieces: React Bits (reactbits.dev): CountUp, GradualBlur, ScrollReveal, SpotlightCard, AnimatedContent, LiquidEther, GlowCursor</li>
                <li>Look and feel: PECFEST 2026 · pecfest.in</li>
              </ul>
              <p className="pg-quiet">
                {cat && (
                  <>
                    <Tag num>{cat.stars.toLocaleString('en-US')}</Tag> stars loaded in this browser
                  </>
                )}
              </p>
            </Card>
          </Reveal>
          <Reveal i={2}>
            <Credits path="/textures/CREDITS.md" title="Textures" />
          </Reveal>
          <Reveal i={3}>
            <Credits path="/audio/CREDITS.md" title="Sound" />
          </Reveal>
        </div>
      </section>
    </PageFrame>
  );
}
