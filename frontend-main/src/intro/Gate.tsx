/**
 * The gate (§7.1): sakura-washi paper, live suminagashi ink (LiquidEther, multiply), a glass card,
 * the sound choice (the user gesture) and the location flow GPS (6 s) → IP → Chandigarh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import LiquidEther from '@/vendor/reactbits/LiquidEther';
import { useApp, type Place } from '@/state/store';
import { useTier } from '@/scene/quality';
import { DEFAULT_PLACE, PRESETS, geolocationGranted, gpsPosition, ipPlace, reverseLabel, searchCity, type CityHit } from '@/data/location';
import { unlockAudio } from '@/audio/engine';
import { Button, Kanji } from '@/ui';
import { token } from '@/scene/intro/introBus';
import { afterGate } from './flow';
import { startPreload } from './preload';
import './intro.css';

type Status = { text: string; busy: boolean } | null;

const fmtCoord = (p: Pick<Place, 'lat' | 'lon'>) => `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(2)}°${p.lon >= 0 ? 'E' : 'W'}`;

export default function Gate() {
  const lite = useApp((s) => s.lite);
  const reduced = useApp((s) => s.reducedMotion);
  const tierCfg = useTier();
  const [status, setStatus] = useState<Status>(null);
  const [found, setFound] = useState<Place | null>(null);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const busyRef = useRef(false);

  // Ink colours from the tokens: sumi, beni (ink red), indigo.
  const inkColors = useMemo(() => [token('--indigo', '#101B2B'), token('--sumi', '#090A0C'), token('--beni', '#C8372D'), token('--crimson', '#A70D16')], []);

  useEffect(() => {
    startPreload();
    let alive = true;
    // Already granted? Locate silently so the card can say "We found you · {city}".
    geolocationGranted().then(async (ok) => {
      if (!ok || !alive) return;
      try {
        const g = await gpsPosition(6000);
        const label = (await reverseLabel(g.lat, g.lon)) ?? fmtCoord(g);
        if (alive) setFound({ ...g, label, source: 'gps' });
      } catch {
        /* fall back to the click flow */
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const resolvePlace = async (): Promise<Place> => {
    if (chosen) return chosen;
    if (found) return found;
    setStatus({ text: 'Asking your device where you stand…', busy: true });
    try {
      const g = await gpsPosition(6000);
      setStatus({ text: `Found you · ${fmtCoord(g)} · naming the place…`, busy: true });
      const label = (await reverseLabel(g.lat, g.lon)) ?? fmtCoord(g);
      return { ...g, label, source: 'gps' };
    } catch {
      /* denied or timed out */
    }
    setStatus({ text: 'No device location · approximating from your network…', busy: true });
    try {
      return await ipPlace();
    } catch {
      return DEFAULT_PLACE;
    }
  };

  const enter = async (sound: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const s = useApp.getState();
    s.setSound(sound);
    if (sound) unlockAudio(); // inside the click: the user gesture
    const place = await resolvePlace();
    const where = place.source === 'default' ? `${place.label} (default)` : place.label;
    setStatus({ text: `Your sky over ${where} · ${fmtCoord(place)}`, busy: false });
    afterGate(place);
  };

  const shown = chosen ?? found;

  return (
    <div className="tw-gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      {!lite && (
        <div className="tw-gate-ink" aria-hidden="true">
          <LiquidEther
            colors={inkColors}
            lightMode
            intensity={0.85}
            mouseForce={14}
            cursorSize={80}
            persistence={0.88}
            viscosity={0.3}
            resolution={tierCfg.liquidResolution}
            autoDemo={!reduced}
            autoSpeed={0.22}
            autoIntensity={1.6}
            autoResumeDelay={2500}
            clickBurst
            maxDevicePixelRatio={1.5}
          />
        </div>
      )}
      <div className="tw-gate-grain" aria-hidden="true" />
      <main className="tw-gate-card reveal-ink">
        <span className="tw-gate-corner tl" aria-hidden="true" />
        <span className="tw-gate-corner tr" aria-hidden="true" />
        <span className="tw-gate-corner bl" aria-hidden="true" />
        <span className="tw-gate-corner br" aria-hidden="true" />
        <div className="tw-gate-eyebrow">
          <Kanji>月読</Kanji>
          <span>·</span>
          <span>TSUKUYOMI WATCH</span>
        </div>
        <h1 id="gate-title" className="tw-gate-title">
          Your sky, <em>tonight</em>.
        </h1>
        <p className="tw-gate-body">
          To draw the real stars above you, we need to know where you stand. We round it to about a kilometre and use it only to compute your sky and fetch tonight's forecast.
        </p>
        {shown && !status && (
          <p className="tw-gate-found" aria-live="polite">
            <span className="dot" aria-hidden="true" />
            {chosen ? 'Your sky over' : 'We found you'} · <strong>{shown.label}</strong> <span className="num">{fmtCoord(shown)}</span>
          </p>
        )}
        <div className="tw-gate-actions">
          <Button variant="gold" disabled={!!status?.busy} onClick={() => enter(true)}>
            Enter with sound
          </Button>
          <Button variant="primary" className="tw-gate-silent" disabled={!!status?.busy} onClick={() => enter(false)}>
            Enter in silence
          </Button>
        </div>
        <button type="button" className="tw-gate-link" onClick={() => setSearchOpen((o) => !o)} aria-expanded={searchOpen} disabled={!!status?.busy}>
          {searchOpen ? 'Close the search' : 'Choose a place instead'}
        </button>
        {searchOpen && (
          <CitySearch
            onPick={(p) => {
              setChosen(p);
              setSearchOpen(false);
            }}
          />
        )}
        <p className="tw-gate-status" role="status" aria-live="polite">
          {status && (
            <>
              {status.busy && <span className="tw-gate-spin" aria-hidden="true" />}
              {status.text}
            </>
          )}
        </p>
      </main>
    </div>
  );
}

function CitySearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CityHit[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setState('idle');
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setState('busy');
      searchCity(q.trim(), ctl.signal)
        .then((h) => {
          setHits(h);
          setState('idle');
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setState('error');
        });
    }, 280);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  return (
    <div className="tw-gate-search">
      <label className="sr-only" htmlFor="gate-city">
        Search for a city
      </label>
      <input
        ref={input}
        id="gate-city"
        type="search"
        autoComplete="off"
        placeholder="Search a city…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) onPick({ lat: hits[0].lat, lon: hits[0].lon, label: hits[0].label, source: 'manual' });
        }}
      />
      {state === 'busy' && <p className="tw-gate-hint">Searching…</p>}
      {state === 'error' && <p className="tw-gate-hint">Search is offline · pick a place below</p>}
      {hits.length > 0 && (
        <ul className="tw-gate-hits">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon},${h.label}`}>
              <button type="button" onClick={() => onPick({ lat: h.lat, lon: h.lon, label: h.label, source: 'manual' })}>
                <strong>{h.label}</strong> <span>{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tw-gate-presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => onPick({ ...p, source: 'manual' })}>
            <Kanji>{p.jp}</Kanji> {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
