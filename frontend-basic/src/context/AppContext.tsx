import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Preset {
  id: string;
  name: string;
  jp: string;
  lat: number;
  lon: number;
}

export const PRESETS: Preset[] = [
  { id: 'bengaluru', name: 'Bengaluru', jp: 'ベンガルール', lat: 12.97, lon: 77.59 },
  { id: 'kyoto', name: 'Kyoto', jp: '京都', lat: 35.01, lon: 135.77 },
  { id: 'delhi', name: 'Delhi', jp: 'デリー', lat: 28.61, lon: 77.21 },
  { id: 'mumbai', name: 'Mumbai', jp: 'ムンバイ', lat: 19.08, lon: 72.88 },
];

export interface AppState {
  presetId: string; // preset id | 'custom' | 'geo'
  lat: number;
  lon: number;
  /** datetime-local string, e.g. "2026-10-29T21:00" (browser-local wall time). */
  localTime: string;
  /** ISO 8601 UTC instant derived from localTime, passed as `at` / `start`. */
  atIso: string;
  setPreset: (id: string) => void;
  setCoords: (lat: number, lon: number) => void;
  setLocalTime: (v: string) => void;
  setNow: () => void;
  setTonight21: () => void;
  useMyLocation: () => Promise<void>;
  geoError: string | null;
  geoBusy: boolean;
}

const Ctx = createContext<AppState | null>(null);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

const STORAGE_KEY = 'tsukuyomi-basic-state';

function loadSaved(): Partial<{ presetId: string; lat: number; lon: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<{ presetId: string; lat: number; lon: number }>) : {};
  } catch {
    return {};
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(loadSaved, []);
  const [presetId, setPresetIdState] = useState<string>(saved.presetId ?? PRESETS[0].id);
  const [lat, setLat] = useState<number>(saved.lat ?? PRESETS[0].lat);
  const [lon, setLon] = useState<number>(saved.lon ?? PRESETS[0].lon);
  const [localTime, setLocalTimeState] = useState<string>(() => toLocalInput(new Date()));
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const persist = (p: string, la: number, lo: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ presetId: p, lat: la, lon: lo }));
    } catch {
      /* ignore */
    }
  };

  const setPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    setPresetIdState(id);
    if (p) {
      setLat(p.lat);
      setLon(p.lon);
      persist(id, p.lat, p.lon);
    }
  }, []);

  const setCoords = useCallback((la: number, lo: number) => {
    setPresetIdState('custom');
    setLat(la);
    setLon(lo);
    persist('custom', la, lo);
  }, []);

  const setLocalTime = useCallback((v: string) => {
    if (v) setLocalTimeState(v);
  }, []);
  const setNow = useCallback(() => setLocalTimeState(toLocalInput(new Date())), []);
  const setTonight21 = useCallback(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    setLocalTimeState(toLocalInput(d));
  }, []);

  const useMyLocation = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available in this browser.');
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const la = Math.round(pos.coords.latitude * 1000) / 1000;
          const lo = Math.round(pos.coords.longitude * 1000) / 1000;
          setPresetIdState('geo');
          setLat(la);
          setLon(lo);
          persist('geo', la, lo);
          setGeoBusy(false);
          resolve();
        },
        (err) => {
          setGeoError(err.message || 'Could not read your location.');
          setGeoBusy(false);
          resolve();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
  }, []);

  const atIso = useMemo(() => localInputToIso(localTime), [localTime]);

  const value = useMemo<AppState>(
    () => ({
      presetId,
      lat,
      lon,
      localTime,
      atIso,
      setPreset,
      setCoords,
      setLocalTime,
      setNow,
      setTonight21,
      useMyLocation,
      geoError,
      geoBusy,
    }),
    [presetId, lat, lon, localTime, atIso, setPreset, setCoords, setLocalTime, setNow, setTonight21, useMyLocation, geoError, geoBusy],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
