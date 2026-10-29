import { useState } from 'react';
import api, { type Spectrum } from '../api';
import { Chip, KV, Label } from './Card';
import { ErrorBox, Loading } from './Status';

const PICKS: { name: string; ra: number; dec: number; note: string }[] = [
  { name: 'M87 (Virgo A)', ra: 187.7059, dec: 12.3911, note: 'giant elliptical, weak lines' },
  { name: 'NGC 5548 (Seyfert)', ra: 214.4981, dec: 25.1368, note: 'broad emission lines' },
  { name: 'eBOSS galaxy z≈0.54', ra: 184.99015, dec: 12.190777, note: 'distant galaxy' },
];

/** Flux vs wavelength with the pipeline's measured lines labelled (gold) and expected lines ticked (grey). */
function Chart({ s }: { s: Spectrum }) {
  const W = 760, H = 260, L = 46, R = 12, T = 28, B = 30;
  const x0 = s.wavelength[0], x1 = s.wavelength[s.wavelength.length - 1];
  const vals = s.flux.filter((v) => Number.isFinite(v));
  const sorted = [...vals].sort((a, b) => a - b);
  const y0 = sorted[Math.floor(sorted.length * 0.005)] ?? 0;
  const y1 = sorted[Math.floor(sorted.length * 0.995)] ?? 1;
  const sx = (w: number) => L + ((w - x0) / (x1 - x0)) * (W - L - R);
  const sy = (f: number) => T + (1 - (Math.min(y1, Math.max(y0, f)) - y0) / Math.max(y1 - y0, 1e-6)) * (H - T - B);
  const path = (arr: number[]) => arr.map((f, i) => `${i ? 'L' : 'M'}${sx(s.wavelength[i]).toFixed(1)},${sy(f).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="spectrum">
      {[4000, 5000, 6000, 7000, 8000, 9000].filter((w) => w > x0 && w < x1).map((w) => (
        <g key={w}>
          <line x1={sx(w)} x2={sx(w)} y1={T} y2={H - B} stroke="rgba(233,224,204,.08)" />
          <text x={sx(w)} y={H - 10} textAnchor="middle" fontSize="11" fill="#8b94a7">
            {w} Å
          </text>
        </g>
      ))}
      {s.lines_expected.map((l) => (
        <line key={`e${l.name}`} x1={sx(l.observed_wavelength)} x2={sx(l.observed_wavelength)} y1={T} y2={H - B} stroke="rgba(139,148,167,.35)" strokeDasharray="2 4">
          <title>
            {l.name} expected at {l.observed_wavelength} Å
          </title>
        </line>
      ))}
      <path d={path(s.model)} fill="none" stroke="rgba(207,168,79,.45)" strokeWidth="1" />
      <path d={path(s.flux)} fill="none" stroke="#f3ead6" strokeWidth="1" />
      {s.lines_measured.slice(0, 10).map((l, i) => (
        <g key={l.name}>
          <line x1={sx(l.observed_wavelength)} x2={sx(l.observed_wavelength)} y1={T - 4} y2={H - B} stroke={l.emission ? '#cfa84f' : '#b4282d'} strokeWidth="1" />
          <text x={sx(l.observed_wavelength) + 3} y={T + 10 + (i % 3) * 11} fontSize="10" fill={l.emission ? '#cfa84f' : '#d9534f'}>
            {l.name}
          </text>
        </g>
      ))}
      <text x={W - R} y={T - 8} textAnchor="end" fontSize="11" fill="#8b94a7">
        flux ({s.flux_unit}) · gold = measured emission · red = absorption · dashed = expected at z={s.z.toFixed(4)}
      </text>
    </svg>
  );
}

export function SpectrumView({ ra: ra0, dec: dec0 }: { ra?: number; dec?: number }) {
  const [ra, setRa] = useState(String(ra0 ?? PICKS[0].ra));
  const [dec, setDec] = useState(String(dec0 ?? PICKS[0].dec));
  const [st, setSt] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: Spectrum; error?: Error }>({ status: 'idle' });
  const run = async (r = Number(ra), d = Number(dec)) => {
    setSt({ status: 'loading' });
    try {
      const env = await api.spectra.at(r, d, 1);
      setSt({ status: 'ok', data: env.data });
    } catch (e) {
      setSt({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) });
    }
  };
  const s = st.data;
  return (
    <div>
      <Label en="Spectrum" jp="分光" right="SDSS · nearest spectrum within 1′" />
      <div className="row">
        <label>
          RA° <input type="number" step="0.0001" value={ra} onChange={(e) => setRa(e.target.value)} style={{ width: 110 }} />
        </label>
        <label>
          Dec° <input type="number" step="0.0001" value={dec} onChange={(e) => setDec(e.target.value)} style={{ width: 110 }} />
        </label>
        <button className="btn small" type="button" onClick={() => void run()} disabled={st.status === 'loading'}>
          {st.status === 'loading' ? 'Fetching…' : 'Fetch spectrum'}
        </button>
        {PICKS.map((p) => (
          <button
            key={p.name}
            className="btn small ghost"
            type="button"
            title={p.note}
            onClick={() => {
              setRa(String(p.ra));
              setDec(String(p.dec));
              void run(p.ra, p.dec);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      {st.status === 'error' && st.error && <ErrorBox error={st.error} onRetry={() => void run()} />}
      {st.status === 'loading' && <Loading what="Downloading the SDSS spectrum" />}
      {s && (
        <div style={{ marginTop: 8 }}>
          <KV
            rows={[
              ['Object', `${s.class}${s.subclass ? ` · ${s.subclass}` : ''} · z = ${s.z.toFixed(5)} ± ${s.z_err.toExponential(1)}${s.separation_arcsec !== undefined ? ` · ${s.separation_arcsec}″ from your position` : ''}`],
              ['Plate / MJD / fiber', `${s.plate} / ${s.mjd} / ${s.fiberid} · exposure ${Math.round(s.exptime_s)} s · S/N ${s.sn_median?.toFixed(1) ?? '—'}`],
              ['Pixels', `${s.n_pixels} binned to ${s.binned_to} · ${s.wavelength_range[0]}–${s.wavelength_range[1]} Å`],
            ]}
          />
          <Chart s={s} />
          <div className="row small" style={{ marginTop: 6 }}>
            {s.lines_measured.slice(0, 12).map((l) => (
              <Chip key={l.name} tone={l.emission ? 'ok' : 'bad'} title={`EW ${l.equivalent_width} Å · σ ${l.sigma_kms} km/s · ${l.significance}σ`}>
                {l.name} {l.emission ? '↑' : '↓'} {l.significance}σ
              </Chip>
            ))}
            {s.lines_measured.length === 0 && <span className="muted">no line passes the 3σ filter</span>}
          </div>
          <div className="muted small">{s.note}</div>
        </div>
      )}
    </div>
  );
}
