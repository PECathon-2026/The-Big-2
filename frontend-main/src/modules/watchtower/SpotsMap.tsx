/**
 * Ink-on-washi Leaflet map of observing spots (§9.2). Lazy-loaded with its CSS. OSM tiles in
 * grayscale/sepia (attribution kept), Shippori kanji glyph markers sized and darkened by rank_score,
 * a crimson ring on the selected spot, hover-linked with the list.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Spot } from '@/data/api';
import { glyphOf } from './glyph';


function icon(glyph: string, rank: number, maxRank: number, hi: boolean, sel: boolean) {
  const t = maxRank > 0 ? Math.max(0, Math.min(1, rank / maxRank)) : 0.5;
  const size = Math.round(24 + t * 14);
  return L.divIcon({
    className: 'wt-mark-wrap',
    html: `<span class="wt-mark ${hi ? 'hi' : ''} ${sel ? 'sel' : ''}" style="--t:${t.toFixed(2)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.58)}px">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const originIcon = L.divIcon({ className: 'wt-mark-wrap', html: '<span class="wt-origin" aria-hidden="true"></span>', iconSize: [16, 16], iconAnchor: [8, 8] });

function Fit({ lat, lon, spots }: { lat: number; lon: number; spots: Spot[] }) {
  const map = useMap();
  useEffect(() => {
    if (spots.length) map.fitBounds(L.latLngBounds([[lat, lon], ...spots.map((s) => [s.lat, s.lon] as [number, number])]).pad(0.15), { animate: false });
    else map.setView([lat, lon], 9, { animate: false });
  }, [lat, lon, spots, map]);
  return null;
}

function FlyTo({ spot }: { spot: Spot | null }) {
  const map = useMap();
  useEffect(() => {
    if (spot) map.panTo([spot.lat, spot.lon], { animate: true, duration: 0.6 });
  }, [spot, map]);
  return null;
}

export default function SpotsMap({ lat, lon, spots, hi, sel, onHi, onSel }: { lat: number; lon: number; spots: Spot[]; hi: string | null; sel: string | null; onHi: (id: string | null) => void; onSel: (id: string) => void }) {
  const maxRank = useMemo(() => Math.max(0, ...spots.map((s) => s.rank_score)), [spots]);
  const selected = spots.find((s) => s.osm_id === sel) ?? null;
  return (
    <div className="wt-map" data-cursor="off">
      <MapContainer center={[lat, lon]} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit lat={lat} lon={lon} spots={spots} />
        <FlyTo spot={selected} />
        <Marker position={[lat, lon]} icon={originIcon}>
          <Tooltip>You are here</Tooltip>
        </Marker>
        {spots.map((s) => (
          <Marker
            key={s.osm_id}
            position={[s.lat, s.lon]}
            icon={icon(glyphOf(s), s.rank_score, maxRank, hi === s.osm_id, sel === s.osm_id)}
            zIndexOffset={sel === s.osm_id ? 1000 : hi === s.osm_id ? 900 : 0}
            eventHandlers={{ mouseover: () => onHi(s.osm_id), mouseout: () => onHi(null), click: () => onSel(s.osm_id) }}
            keyboard
            title={s.name}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {s.name} · {s.kind} · rank {s.rank_score.toFixed(1)}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
