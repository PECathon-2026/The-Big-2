/** Location chip, top-left (§8.7): `📍 Chandigarh · 30.76 N 76.79 E` + where the place came from. Opens city search. */
import { useApp } from '@/state/store';
import { sourceGlyph } from '@/data/location';

export const fmtLatLon = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)} ${lon >= 0 ? 'E' : 'W'}`;

export default function LocationChip() {
  const place = useApp((s) => s.place);
  const open = useApp((s) => s.setCitySearchOpen);
  if (!place) return null;
  const src = sourceGlyph(place.source);
  return (
    <button className="hud-loc hud-bar" onClick={() => open(true)} aria-haspopup="dialog" aria-label={`Location: ${place.label}, ${fmtLatLon(place.lat, place.lon)}, source ${src}. Change place`}>
      <span className="pin" aria-hidden="true">
        ◉
      </span>
      <span className="name">{place.label}</span>
      <span className="coords">{fmtLatLon(place.lat, place.lon)}</span>
      <span className="src">{src}</span>
    </button>
  );
}
