// Compacts the d3-celestial GeoJSON in public/data/sky/ into one catalog.json the app loads at start.
// usage: node scripts/build-sky.mjs
// Source: d3-celestial (BSD-3) by Olaf Frohn — https://github.com/ofrohn/d3-celestial
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/data/sky');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const ra = (lon) => +(lon < 0 ? lon + 360 : lon).toFixed(4);
const r4 = (x) => +(+x).toFixed(4);

const stars = rd('stars.6.json').features;
const names = rd('starnames.json');
const consts = rd('constellations.json').features;
const lines = rd('constellations.lines.json').features;
const messier = rd('messier.json').features;
const dsos = rd('dsos.bright.json').features;

// stars: flat [ra, dec, mag, bv, hip] × N, sorted brightest first
const sorted = stars
  .map((f) => [ra(f.geometry.coordinates[0]), r4(f.geometry.coordinates[1]), +f.properties.mag, f.properties.bv === '' ? 0.6 : +f.properties.bv, +f.id])
  .sort((a, b) => a[2] - b[2]);
const flat = sorted.flat();

// names for stars in the catalogue that have a proper name: hip -> [name, ja, constellation, bayer]
const starNames = {};
for (const s of sorted) {
  const n = names[s[4]];
  if (n && n.name) starNames[s[4]] = [n.name, n.ja || '', n.c || '', n.bayer || ''];
}

const lineById = Object.fromEntries(lines.map((f) => [f.id, f.geometry.coordinates]));
const constellations = consts.map((f) => ({
  id: f.id,
  name: f.properties.name,
  ja: f.properties.ja || '',
  rank: +f.properties.rank,
  center: [ra(f.geometry.coordinates[0]), r4(f.geometry.coordinates[1])],
  lines: (lineById[f.id] || []).map((seg) => seg.map(([lo, la]) => [ra(lo), r4(la)])),
}));

const dsoList = [];
for (const f of messier) {
  const p = f.properties;
  dsoList.push({ id: f.id, name: p.alt || p.name, desig: p.desig || '', type: p.type, mag: +p.mag, dim: p.dim || '', ra: ra(f.geometry.coordinates[0]), dec: r4(f.geometry.coordinates[1]) });
}
for (const f of dsos) {
  const p = f.properties;
  const id = String(f.id).replace(/\s+/g, '');
  if (dsoList.some((d) => d.desig.replace(/\s+/g, '') === id || d.id === id)) continue;
  dsoList.push({ id, name: p.name || f.id, desig: p.desig || '', type: p.type, mag: +p.mag, dim: p.dim || '', ra: ra(f.geometry.coordinates[0]), dec: r4(f.geometry.coordinates[1]) });
}

const out = {
  source: 'd3-celestial (BSD-3) · Hipparcos via d3-celestial, J2000, mag ≤ 6',
  epoch: 'J2000',
  starCount: sorted.length,
  stars: flat,
  starNames,
  constellations,
  dsos: dsoList,
};
fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(out));
console.log('stars', sorted.length, 'named', Object.keys(starNames).length, 'constellations', constellations.length, 'dsos', dsoList.length, 'bytes', fs.statSync(path.join(dir, 'catalog.json')).size);
