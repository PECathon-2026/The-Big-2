import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@/styles/globals.css';
import App from './App';
import { initLenis } from './lenis';
import { useApp } from '@/state/store';
import { initialQuality } from '@/scene/quality';
import { loadCatalog } from '@/astro/catalog';
import { DEFAULT_PLACE } from '@/data/location';
import { Director } from '@/scene/Director';
import { isModulePath } from './routes';
import '@/data/tonight'; // starts per-place fetching as soon as a place exists

useApp.getState().setQuality(initialQuality());
initLenis();

// Dev shortcut for agents and QA: ?dev=sky | ?dev=intro skips the gate with the default place.
// (?dev=dome is kept as an alias of sky — there is no dome exterior any more.)
{
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev === 'dome' || dev === 'sky' || dev === 'intro') {
    const s = useApp.getState();
    s.setPlace(DEFAULT_PLACE);
    const target = dev === 'intro' ? 'intro' : 'sky';
    if (isModulePath(location.pathname)) s.setPhase('module');
    else s.setPhase(target);
    Director.station(target, { instant: true });
  }
}
// Start the heavy, cacheable work immediately — it runs behind the gate (§7.1).
loadCatalog().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
