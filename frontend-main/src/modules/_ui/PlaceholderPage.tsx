/** PHASE-0 STUB (lead) — workstream D owns src/modules/ and replaces this with the real page frame (§9.1). */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Director } from '@/scene/Director';
import { Button, Eyebrow, Title } from '@/ui';

export default function PlaceholderPage({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <main data-cursor="off" style={{ position: 'fixed', inset: 0, zIndex: 40, overflow: 'auto', padding: '96px max(24px, 8vw) 64px' }} className="reveal-ink">
      <Button
        variant="secondary"
        onClick={() => {
          nav('/');
          Director.back();
        }}
      >
        ← Return to the sky
      </Button>
      <div style={{ marginTop: 24 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        {children}
      </div>
    </main>
  );
}
