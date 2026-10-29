// usage: node scripts/rb.mjs GlowCursor-TS-TW LiquidEther-TS-TW …
// Fetches exact React Bits sources from the registry into src/vendor/reactbits/.
import fs from 'node:fs';
import path from 'node:path';
for (const id of process.argv.slice(2)) {
  const res = await fetch(`https://reactbits.dev/r/${id}`);
  if (!res.ok) { console.error(id, res.status); continue; }
  const item = await res.json();
  for (const f of item.files) {
    const out = path.join('src/vendor/reactbits', path.basename(f.path));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.content);
    console.log('wrote', out);
  }
  if (item.dependencies?.length) console.log(`  npm deps for ${id}:`, item.dependencies.join(' '));
}
