/** Small formatting helpers. All numeric output should use tabular numerals (CSS .num). */

export function fmtNum(v: number | null | undefined, digits = 1, suffix = ''): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}${suffix}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString('en-US');
}

/** Format an ISO instant as local wall time in `tz` (falls back to browser zone). */
export function fmtTime(iso: string | null | undefined, tz?: string, withDate = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(withDate ? { weekday: 'short', day: '2-digit', month: 'short' } : {}),
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function fmtDate(iso: string | null | undefined, tz?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.round((t - Date.now()) / 60000);
  const abs = Math.abs(diff);
  if (abs < 1) return 'just now';
  const s = abs < 60 ? `${abs} min` : abs < 1440 ? `${(abs / 60).toFixed(1)} h` : `${(abs / 1440).toFixed(1)} d`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export function compass(az: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

export function kindGlyph(kind: string): string {
  switch (kind) {
    case 'moon':
      return '月';
    case 'meteor':
      return '流';
    case 'eclipse':
      return '食';
    case 'satellite':
      return '衛';
    case 'launch':
      return '発';
    case 'planet':
      return '惑';
    default:
      return '・';
  }
}

export function verdictClass(v: string): string {
  if (v === 'go') return 'ok';
  if (v === 'maybe') return 'gold';
  return 'verm';
}
