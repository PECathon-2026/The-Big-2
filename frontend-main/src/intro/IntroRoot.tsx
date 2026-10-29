/**
 * PHASE-0 STUB (lead) — workstream B owns src/intro/ and replaces this with Gate, Loader,
 * IntroScroll, IntroFrame and BrandTitle (§7.1–7.3). Keeps the flow runnable:
 * gate (real location + sound choice) → intro (Skip only) → dome.
 */
import { useState } from 'react';
import { useApp } from '@/state/store';
import { locate } from '@/data/location';
import { loadTonight } from '@/data/tonight';
import { Director } from '@/scene/Director';
import { Button, Eyebrow, Title } from '@/ui';

function GateStub() {
  const [busy, setBusy] = useState(false);
  const enter = async (sound: boolean) => {
    setBusy(true);
    const s = useApp.getState();
    s.setSound(sound);
    const place = await locate();
    s.setPlace(place);
    loadTonight(place);
    s.setPhase('intro');
    Director.station('intro', { instant: true });
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'var(--sakura-washi)', color: 'var(--paper-ink)' }}>
      <div style={{ maxWidth: 520, padding: 32, textAlign: 'center' }}>
        <Eyebrow>月読 · TSUKUYOMI WATCH</Eyebrow>
        <Title level="hero" className="!text-[var(--paper-ink)]">
          Your sky, <em>tonight</em>.
        </Title>
        <p>To draw the real stars above you, we need to know where you stand. We round it to about a kilometre and use it only to compute your sky and fetch tonight's forecast.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
          <Button disabled={busy} onClick={() => enter(true)} className="!text-[var(--paper-ink)]">
            Enter with sound
          </Button>
          <Button disabled={busy} onClick={() => enter(false)} className="!text-[var(--paper-ink)]">
            Enter in silence
          </Button>
        </div>
        {busy && <p style={{ marginTop: 16 }}>Finding where you stand…</p>}
      </div>
    </div>
  );
}

function IntroStub() {
  const skip = () => {
    useApp.getState().setPhase('dome');
    Director.station('dome');
  };
  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 80 }}>
      <Button variant="secondary" onClick={skip}>
        Skip intro →
      </Button>
    </div>
  );
}

export default function IntroRoot() {
  const phase = useApp((s) => s.phase);
  if (phase === 'gate') return <GateStub />;
  if (phase === 'intro' || phase === 'loading') return <IntroStub />;
  return null;
}
