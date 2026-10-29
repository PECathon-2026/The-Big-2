import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@/styles/globals.css';
import App from './App';
import { initLenis } from './lenis';
import { useApp } from '@/state/store';
import { initialQuality } from '@/scene/quality';
import { loadCatalog } from '@/astro/catalog';

useApp.getState().setQuality(initialQuality());
initLenis();
// Start the heavy, cacheable work immediately — it runs behind the gate (§7.1).
loadCatalog().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
