/**
 * PHASE-0 STUB (lead) — workstream A owns this: DOM layer for the dome (leader-line hotspot labels
 * and the "Enter your sky" CTA, §7.4). Mounted by App at z 10.
 */
import { useApp } from '@/state/store';
import { Director } from '@/scene/Director';
import { Button } from '@/ui';

export default function DomeOverlay() {
  const phase = useApp((s) => s.phase);
  if (phase !== 'dome') return null;
  const enter = () => {
    useApp.getState().setPhase('sky');
    Director.station('sky');
  };
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: '18vh', transform: 'translateX(-50%)', zIndex: 10 }}>
      <Button onClick={enter}>
        Enter your <em className="accent" style={{ textTransform: 'none', fontSize: 16 }}>sky</em> ↘
      </Button>
    </div>
  );
}
