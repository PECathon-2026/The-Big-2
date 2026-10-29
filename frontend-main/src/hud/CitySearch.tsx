/** City search dialog (§7.1, §8.7): Photon geocoder (keyless, CORS), presets as backup, "use my location". */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/state/store';
import { locate, PRESETS, searchCity, type CityHit } from '@/data/location';
import { Button, Dialog, Eyebrow, Title } from '@/ui';
import { fmtLatLon } from './LocationChip';

export default function CitySearch() {
  const open = useApp((s) => s.citySearchOpen);
  const setOpen = useApp((s) => s.setCitySearchOpen);
  const setPlace = useApp((s) => s.setPlace);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CityHit[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error' | 'none'>('idle');
  const [locating, setLocating] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setHits([]);
      setStatus('idle');
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setStatus('idle');
      return;
    }
    const ac = new AbortController();
    const h = window.setTimeout(() => {
      setStatus('searching');
      searchCity(term, ac.signal)
        .then((r) => {
          setHits(r);
          setStatus(r.length ? 'idle' : 'none');
        })
        .catch((e) => {
          if (!ac.signal.aborted) setStatus('error');
          void e;
        });
    }, 280);
    return () => {
      ac.abort();
      window.clearTimeout(h);
    };
  }, [q]);

  const close = () => setOpen(false);
  const pick = (p: { lat: number; lon: number; label: string; tz?: string }) => {
    setPlace({ lat: p.lat, lon: p.lon, label: p.label, tz: p.tz, source: 'manual' });
    close();
  };
  const presets = PRESETS.filter((p) => !q || p.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Dialog open={open} onClose={close} label="Choose a place" className="hud-dialog city-dialog">
      <div className="city">
        <button className="tw-icon-btn dir-close" onClick={close} aria-label="Close (Esc)">
          ✕
        </button>
        <Eyebrow jp="場所">Where you stand</Eyebrow>
        <Title level={2}>
          Choose a <em>place</em>.
        </Title>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--washi-2)' }}>The sky, the forecast and every time on screen follow this place. Coordinates are rounded to about a kilometre.</p>
        <input
          ref={input}
          className="city-input"
          type="search"
          placeholder="Search a city…"
          aria-label="Search a city"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) pick(hits[0]);
          }}
        />
        <ul className="city-list" aria-live="polite">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon},${h.label}`}>
              <button className="city-row" onClick={() => pick(h)}>
                <b>{h.label}</b>
                <span>{h.detail}</span>
                <span className="c">{fmtLatLon(h.lat, h.lon)}</span>
              </button>
            </li>
          ))}
          {status === 'searching' && <li className="city-status">Searching the map…</li>}
          {status === 'none' && <li className="city-status">No place by that name. Try a nearby city.</li>}
          {status === 'error' && <li className="city-status">The geocoder is unreachable. Pick a preset below.</li>}
          {hits.length === 0 &&
            presets.map((p) => (
              <li key={p.label}>
                <button className="city-row" onClick={() => pick(p)}>
                  <b>{p.label}</b>
                  <span lang="ja">{p.jp}</span>
                  <span className="c">{fmtLatLon(p.lat, p.lon)}</span>
                </button>
              </li>
            ))}
        </ul>
        <div className="dir-foot">
          <Button
            variant="primary"
            disabled={locating}
            onClick={() => {
              setLocating(true);
              locate()
                .then((p) => {
                  setPlace(p);
                  close();
                })
                .finally(() => setLocating(false));
            }}
          >
            {locating ? 'Finding you…' : '◉ Use my location'}
          </Button>
          <span className="hint">Search by Photon · OpenStreetMap</span>
        </div>
      </div>
    </Dialog>
  );
}
