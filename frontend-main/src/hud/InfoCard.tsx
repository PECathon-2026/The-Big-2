/**
 * InfoCard (§7.5) for plain stars and constellations: a PECFEST developer card beside the object.
 * Name (Cinzel) + Japanese (Shippori), constellation, magnitude, altitude/azimuth at sky time, and
 * rise/set from astronomy-engine (DefineStar + SearchRiseSet). "Look closer" narrows the FOV onto it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { compass16, eqToHorizontal, lstDeg, vecToAltAz } from '@/astro/coords';
import { fmtClock, starRiseSet } from '@/astro/skytime';
import { DEFAULT_PLACE } from '@/data/location';
import { Director, rig } from '@/scene/Director';
import { useApp, type SkyObject } from '@/state/store';
import { BrushLine, Button, Card, Divider } from '@/ui';

const KIND: Record<SkyObject['kind'], string> = { star: 'Star', planet: 'Planet', moon: 'Moon', sun: 'Sun', dso: 'Deep sky', constellation: 'Constellation', iss: 'Satellite', meteor: 'Meteor', landmark: 'Landmark' };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);

export default function InfoCard({ obj, x, y, onClose }: { obj: SkyObject; x: number; y: number; onClose: () => void }) {
  const place = useApp((s) => s.place) ?? DEFAULT_PLACE;
  const tz = useApp((s) => s.tz);
  const offset = useApp((s) => s.offsetMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(h);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 28, top: y - 40 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + 28;
    if (left + w > window.innerWidth - 80) left = x - 28 - w;
    const top = Math.max(84, Math.min(window.innerHeight - h - 24, y - h * 0.35));
    setPos({ left: Math.max(16, left), top });
  }, [x, y, obj.id]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [obj.id]);

  const info = obj.info ?? {};
  const ra = num(info.ra);
  const dec = num(info.dec);
  const sky = new Date(now + offset);
  const { alt, az } = ra != null && dec != null ? vecToAltAz(eqToHorizontal(ra, dec, place.lat, lstDeg(sky, place.lon))) : vecToAltAz(obj.world);
  const rs = ra != null && dec != null && obj.kind !== 'constellation' ? starRiseSet(ra, dec, place, new Date(sky.getTime() - 12 * 3600_000)) : null;
  const circumpolar = rs && !rs.rise && !rs.set && alt > 0;
  const mag = num(info.mag);
  const con = (info.constellation ?? info.con ?? info.conName) as string | undefined;
  const dist = num(info.dist_ly ?? info.distance_ly ?? info.ly);
  const bayer = (info.bayer ?? info.desig) as string | undefined;
  const glyph = obj.kind === 'constellation' ? '座' : obj.kind === 'planet' ? '惑' : obj.kind === 'dso' ? '雲' : '星';

  const rows: [string, string][] = [];
  if (con) rows.push(['Constellation', String(con)]);
  if (bayer) rows.push(['Designation', String(bayer)]);
  if (mag != null) rows.push(['Magnitude', mag.toFixed(2)]);
  rows.push(['Altitude', `${alt.toFixed(1)}°${alt < 0 ? ' · below horizon' : ''}`]);
  rows.push(['Azimuth', `${az.toFixed(1)}° ${compass16(az)}`]);
  if (rs) {
    if (circumpolar) rows.push(['Rise / set', 'never sets here']);
    else if (!rs.rise && !rs.set) rows.push(['Rise / set', 'never rises here']);
    else {
      if (rs.rise) rows.push(['Rises', fmtClock(rs.rise, tz, true)]);
      if (rs.set) rows.push(['Sets', fmtClock(rs.set, tz, true)]);
    }
  }
  if (dist != null) rows.push(['Distance', `${dist.toLocaleString(undefined, { maximumFractionDigits: dist < 100 ? 1 : 0 })} ly`]);

  const closer = () => {
    Director.lookAt(obj.world, Math.max(14, Math.min(rig.tgt.fov * 0.45, 24)));
  };

  return (
    <div ref={ref} className="infocard" style={pos} role="dialog" aria-label={`${obj.name}: details`} data-cursor="off">
      <Card brand={{ kanji: glyph, text: KIND[obj.kind] }}>
        <button className="tw-icon-btn x" onClick={onClose} aria-label="Close (Esc)">
          ✕
        </button>
        <h2 className="nm">{obj.name}</h2>
        {obj.jp && (
          <div className="jpn" lang="ja">
            {obj.jp}
          </div>
        )}
        <BrushLine />
        <Divider />
        <dl>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="acts">
          <Button variant="primary" onClick={closer} disabled={alt < -1}>
            Look closer
          </Button>
        </div>
      </Card>
    </div>
  );
}
