/** Sound toggle, bottom-left (§8.7): four animated bars + SOUND ON / OFF, pecfest pill. */
import { useApp } from '@/state/store';
import { setSound } from '@/audio/engine';

export default function SoundToggle() {
  const on = useApp((s) => s.sound);
  return (
    <button className={`sound hud-bar ${on ? 'on' : ''}`} onClick={() => setSound(!on)} aria-pressed={on} aria-label={on ? 'Sound is on: turn sound off' : 'Sound is off: turn sound on'}>
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      Sound {on ? 'on' : 'off'}
    </button>
  );
}
