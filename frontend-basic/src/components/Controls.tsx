import { useEffect, useState } from 'react';
import { PRESETS, useApp } from '../context/AppContext';

/** Global location + reference-time picker. Lives at the top of each page. */
export function Controls() {
  const app = useApp();
  const [latText, setLatText] = useState(String(app.lat));
  const [lonText, setLonText] = useState(String(app.lon));

  useEffect(() => {
    setLatText(String(app.lat));
    setLonText(String(app.lon));
  }, [app.lat, app.lon]);

  const applyCoords = () => {
    const la = parseFloat(latText);
    const lo = parseFloat(lonText);
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) app.setCoords(la, lo);
  };

  return (
    <div className="controls">
      <label>
        Location · 場所
        <select value={PRESETS.some((p) => p.id === app.presetId) ? app.presetId : app.presetId === 'geo' ? 'geo' : 'custom'} onChange={(e) => app.setPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.jp} ({p.lat}, {p.lon})
            </option>
          ))}
          <option value="custom">Custom lat/lon</option>
          <option value="geo">My location</option>
        </select>
      </label>
      <label>
        Lat / Lon
        <span className="coord">
          <input type="number" step="0.01" min={-90} max={90} value={latText} onChange={(e) => setLatText(e.target.value)} onBlur={applyCoords} onKeyDown={(e) => e.key === 'Enter' && applyCoords()} aria-label="latitude" />
          <input type="number" step="0.01" min={-180} max={180} value={lonText} onChange={(e) => setLonText(e.target.value)} onBlur={applyCoords} onKeyDown={(e) => e.key === 'Enter' && applyCoords()} aria-label="longitude" />
          <button className="btn small ghost" onClick={applyCoords} type="button">
            Set
          </button>
          <button className="btn small ghost" onClick={() => void app.useMyLocation()} disabled={app.geoBusy} type="button" title="Use browser geolocation">
            {app.geoBusy ? '…' : 'Use my location'}
          </button>
        </span>
        {app.geoError && <span className="verm small" style={{ textTransform: 'none', letterSpacing: 0 }}>{app.geoError}</span>}
      </label>
      <label>
        Reference time · 刻
        <span className="coord">
          <input type="datetime-local" value={app.localTime} onChange={(e) => app.setLocalTime(e.target.value)} />
          <button className="btn small ghost" onClick={app.setNow} type="button">
            Now
          </button>
          <button className="btn small ghost" onClick={app.setTonight21} type="button">
            Tonight 21:00
          </button>
        </span>
      </label>
      <span className="muted small" style={{ alignSelf: 'center' }}>
        at = <code>{app.atIso}</code>
      </span>
    </div>
  );
}
