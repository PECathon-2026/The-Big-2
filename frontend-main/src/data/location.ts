/**
 * Location flow (§7.1, §3): GPS → approximate from IP (keyless HTTPS) → Chandigarh default.
 * Coordinates are rounded to 2 decimals (~1 km) before they leave the device.
 */
import { round2 } from '@/astro/coords';
import type { Place } from '@/state/store';

export const DEFAULT_PLACE: Place = { lat: 30.76, lon: 76.79, label: 'Chandigarh', tz: 'Asia/Kolkata', source: 'default' };

export const PRESETS: (Place & { jp: string })[] = [
  { lat: 30.76, lon: 76.79, label: 'Chandigarh', jp: 'チャンディーガル', tz: 'Asia/Kolkata', source: 'manual' },
  { lat: 28.61, lon: 77.21, label: 'Delhi', jp: 'デリー', tz: 'Asia/Kolkata', source: 'manual' },
  { lat: 12.97, lon: 77.59, label: 'Bengaluru', jp: 'ベンガルール', tz: 'Asia/Kolkata', source: 'manual' },
  { lat: 19.08, lon: 72.88, label: 'Mumbai', jp: 'ムンバイ', tz: 'Asia/Kolkata', source: 'manual' },
  { lat: 35.01, lon: 135.77, label: 'Kyoto', jp: '京都', tz: 'Asia/Tokyo', source: 'manual' },
];

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export function gpsPosition(timeoutMs = 6000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) }),
      (err) => reject(err),
      { timeout: timeoutMs, maximumAge: 10 * 60_000, enableHighAccuracy: false },
    );
  });
}

export async function geolocationGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return st?.state === 'granted';
  } catch {
    return false;
  }
}

export async function ipPlace(): Promise<Place> {
  try {
    const r = await withTimeout(fetch('https://get.geojs.io/v1/ip/geo.json'), 4000);
    const j = (await r.json()) as { latitude?: string; longitude?: string; city?: string; timezone?: string };
    if (j.latitude && j.longitude) return { lat: round2(+j.latitude), lon: round2(+j.longitude), label: `≈ ${j.city || 'your area'}`, tz: j.timezone, source: 'ip' };
  } catch {
    /* fall through */
  }
  const r = await withTimeout(fetch('https://ipwho.is/'), 4000);
  const j = (await r.json()) as { success?: boolean; latitude?: number; longitude?: number; city?: string; timezone?: { id?: string } };
  if (!j.success || j.latitude == null || j.longitude == null) throw new Error('ip lookup failed');
  return { lat: round2(j.latitude), lon: round2(j.longitude), label: `≈ ${j.city || 'your area'}`, tz: j.timezone?.id, source: 'ip' };
}

/** Best-effort city name for GPS coordinates (Photon reverse geocoder, keyless with CORS). */
export async function reverseLabel(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await withTimeout(fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`), 4000);
    const j = (await r.json()) as { features?: { properties: { city?: string; town?: string; village?: string; name?: string; state?: string } }[] };
    const p = j.features?.[0]?.properties;
    return p ? p.city || p.town || p.village || p.name || p.state || null : null;
  } catch {
    return null;
  }
}

/** Full chain: GPS → IP → default. Never rejects. */
export async function locate(): Promise<Place> {
  try {
    const g = await gpsPosition();
    const label = (await reverseLabel(g.lat, g.lon)) ?? `${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}`;
    return { ...g, label, source: 'gps' };
  } catch {
    /* denied or timed out */
  }
  try {
    return await ipPlace();
  } catch {
    return DEFAULT_PLACE;
  }
}

export interface CityHit {
  label: string;
  detail: string;
  lat: number;
  lon: number;
}

/** City search (Photon geocoder). */
export async function searchCity(q: string, signal?: AbortSignal): Promise<CityHit[]> {
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&layer=city&layer=locality&layer=district`, { signal });
  const j = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { name?: string; state?: string; country?: string } }[] };
  return j.features.map((f) => ({
    label: f.properties.name ?? 'Unknown',
    detail: [f.properties.state, f.properties.country].filter(Boolean).join(', '),
    lat: round2(f.geometry.coordinates[1]),
    lon: round2(f.geometry.coordinates[0]),
  }));
}

export const sourceGlyph = (s: Place['source']) => (s === 'gps' ? '📍 GPS' : s === 'ip' ? '≈ IP' : s === 'manual' ? '✎ chosen' : '· default');
