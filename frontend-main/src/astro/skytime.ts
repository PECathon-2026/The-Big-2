/**
 * astronomy-engine wrappers. Pure functions, no React. Positions are geometric (no refraction) so
 * they line up with the catalogue stars; altitudes shown to users can use `refracted`.
 */
import {
  Body,
  Equator,
  Horizon,
  Illumination,
  Libration,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchRiseSet,
  DefineStar,
  type AstroTime,
} from 'astronomy-engine';
import { altAzToVec, type Vec3 } from './coords';
import { SYNODIC } from './moonNames';

export interface LatLon {
  lat: number;
  lon: number;
}

const observer = (p: LatLon) => new Observer(p.lat, p.lon, 0);
const toDate = (t: AstroTime | null) => (t ? t.date : null);

export interface BodyPos {
  alt: number;
  az: number;
  ra: number; // degrees
  dec: number;
  dir: Vec3; // unit vector, horizontal frame
  distAu: number;
}

export function bodyPosition(body: Body, date: Date, place: LatLon): BodyPos {
  const obs = observer(place);
  const eq = Equator(body, date, obs, true, true);
  const hor = Horizon(date, obs, eq.ra, eq.dec);
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra * 15, dec: eq.dec, dir: altAzToVec(hor.altitude, hor.azimuth), distAu: eq.dist };
}

export const sunAltitude = (date: Date, place: LatLon) => bodyPosition(Body.Sun, date, place).alt;

export interface MoonState extends BodyPos {
  /** ecliptic phase angle 0..360 (0 new, 180 full) */
  phaseDeg: number;
  ageDays: number;
  illumination: number; // 0..1
  waxing: boolean;
  libration: { elat: number; elon: number };
  angularDiameterDeg: number;
}

export function moonState(date: Date, place: LatLon): MoonState {
  const pos = bodyPosition(Body.Moon, date, place);
  const phaseDeg = MoonPhase(date);
  const ill = Illumination(Body.Moon, date);
  const lib = Libration(date);
  return {
    ...pos,
    phaseDeg,
    ageDays: (phaseDeg / 360) * SYNODIC,
    illumination: ill.phase_fraction,
    waxing: phaseDeg < 180,
    libration: { elat: lib.elat, elon: lib.elon },
    angularDiameterDeg: lib.diam_deg,
  };
}

export const PLANETS: { body: Body; name: string; jp: string }[] = [
  { body: Body.Mercury, name: 'Mercury', jp: '水星' },
  { body: Body.Venus, name: 'Venus', jp: '金星' },
  { body: Body.Mars, name: 'Mars', jp: '火星' },
  { body: Body.Jupiter, name: 'Jupiter', jp: '木星' },
  { body: Body.Saturn, name: 'Saturn', jp: '土星' },
];

export interface PlanetState extends BodyPos {
  name: string;
  jp: string;
  mag: number;
}

export function planets(date: Date, place: LatLon): PlanetState[] {
  return PLANETS.map((p) => ({ ...bodyPosition(p.body, date, place), name: p.name, jp: p.jp, mag: Illumination(p.body, date).mag }));
}

export interface SunMoonPlanets {
  date: Date;
  sun: BodyPos;
  moon: MoonState;
  planets: PlanetState[];
}

export function sunMoonPlanets(date: Date, place: LatLon): SunMoonPlanets {
  return { date, sun: bodyPosition(Body.Sun, date, place), moon: moonState(date, place), planets: planets(date, place) };
}

/** Next rise/set of a body after `from` (direction +1 rise, −1 set). */
export function nextRiseSet(body: Body, place: LatLon, from: Date, direction: 1 | -1, limitDays = 2): Date | null {
  try {
    return toDate(SearchRiseSet(body, observer(place), direction, from, limitDays));
  } catch {
    return null;
  }
}

/** Rise/set for a fixed star (catalogue RA°/Dec°), via DefineStar + SearchRiseSet. */
export function starRiseSet(raDeg: number, decDeg: number, place: LatLon, from: Date): { rise: Date | null; set: Date | null } {
  try {
    DefineStar(Body.Star1, raDeg / 15, decDeg, 1000);
    const obs = observer(place);
    return { rise: toDate(SearchRiseSet(Body.Star1, obs, 1, from, 1.1)), set: toDate(SearchRiseSet(Body.Star1, obs, -1, from, 1.1)) };
  } catch {
    return { rise: null, set: null };
  }
}

export interface Twilight {
  sunset: Date | null;
  civilDusk: Date | null;
  nauticalDusk: Date | null;
  astroDusk: Date | null;
  astroDawn: Date | null;
  sunrise: Date | null;
}

/** Tonight's twilight times, searching forward from `from` minus 12 h so "tonight" is stable during the evening. */
export function twilight(place: LatLon, from: Date): Twilight {
  const obs = observer(place);
  const start = new Date(from.getTime() - 12 * 3600_000);
  const s = (dir: 1 | -1, alt: number, t0: Date) => {
    try {
      return toDate(SearchAltitude(Body.Sun, obs, dir, t0, 1.5, alt));
    } catch {
      return null;
    }
  };
  const sunset = nextRiseSet(Body.Sun, place, start, -1, 1.5);
  const base = sunset ?? start;
  return {
    sunset,
    civilDusk: s(-1, -6, base),
    nauticalDusk: s(-1, -12, base),
    astroDusk: s(-1, -18, base),
    astroDawn: s(1, -18, base),
    sunrise: nextRiseSet(Body.Sun, place, base, 1, 1.5),
  };
}

/**
 * The intro's real time-lapse (§7.3): from 20 min before today's real sunset to the target night time
 * (now if already dark, else tonight's astronomical dusk + 1 h).
 */
export function introTimeline(place: LatLon, now = new Date()): { start: Date; end: Date; sunsetAz: number; sunset: Date | null } {
  const dark = sunAltitude(now, place) < -12;
  let sunset: Date | null;
  if (dark) {
    sunset = nextRiseSet(Body.Sun, place, new Date(now.getTime() - 20 * 3600_000), -1, 1);
  } else {
    sunset = nextRiseSet(Body.Sun, place, now, -1, 1.2) ?? nextRiseSet(Body.Sun, place, new Date(now.getTime() - 6 * 3600_000), -1, 1);
  }
  const start = sunset ? new Date(sunset.getTime() - 20 * 60_000) : new Date(now.getTime());
  let end: Date;
  if (dark) end = now;
  else {
    const tw = twilight(place, sunset ?? now);
    end = tw.astroDusk ? new Date(tw.astroDusk.getTime() + 3600_000) : new Date(start.getTime() + 3 * 3600_000);
  }
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 2 * 3600_000);
  const sunsetAz = bodyPosition(Body.Sun, sunset ?? start, place).az;
  return { start, end, sunsetAz, sunset };
}

/** The 12 koku, equal 2-hour hours centred on 0:00, 2:00 … (real wadokei used unequal hours — noted on /science). */
export const KOKU = [
  { kanji: '子', romaji: 'ne', animal: 'Rat' },
  { kanji: '丑', romaji: 'ushi', animal: 'Ox' },
  { kanji: '寅', romaji: 'tora', animal: 'Tiger' },
  { kanji: '卯', romaji: 'u', animal: 'Rabbit' },
  { kanji: '辰', romaji: 'tatsu', animal: 'Dragon' },
  { kanji: '巳', romaji: 'mi', animal: 'Snake' },
  { kanji: '午', romaji: 'uma', animal: 'Horse' },
  { kanji: '未', romaji: 'hitsuji', animal: 'Sheep' },
  { kanji: '申', romaji: 'saru', animal: 'Monkey' },
  { kanji: '酉', romaji: 'tori', animal: 'Rooster' },
  { kanji: '戌', romaji: 'inu', animal: 'Dog' },
  { kanji: '亥', romaji: 'i', animal: 'Boar' },
];

/** Local wall-clock hours (0..24, fractional) of `date` in `tz`. */
export function localHours(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
    const g = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
    return (g('hour') % 24) + g('minute') / 60 + g('second') / 3600;
  } catch {
    return date.getHours() + date.getMinutes() / 60;
  }
}

export function kokuAt(date: Date, tz: string) {
  const h = localHours(date, tz);
  return KOKU[Math.round(h / 2) % 12];
}

/** "23:40" in the place's timezone. */
export function fmtClock(date: Date, tz: string, withDate = false): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(withDate ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}
