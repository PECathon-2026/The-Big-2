/**
 * "Choose your chapter" — THE IMPERIAL DIRECTORY (§5.6, §8.7). Numbered chapter rows with a gold left
 * border on hover, Science, "Tonight's highlights" (every sky destination as a keyboard-reachable list
 * that triggers the same dives, §8.3/§10.8) and the field-mode toggle.
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { CHAPTERS, SCIENCE } from '@/app/routes';
import { compass16, vecToAltAz } from '@/astro/coords';
import { Director } from '@/scene/Director';
import { useApp, type SkyObject } from '@/state/store';
import { Button, Dialog, Eyebrow, Title } from '@/ui';
import { chapterIndex, goChapter } from './nav';
import { setSound } from '@/audio/engine';

const GLYPH: Record<SkyObject['kind'], string> = { moon: '☾', sun: '☉', planet: '◉', dso: '✶', star: '★', constellation: '✧', iss: '⟡', meteor: '☄', landmark: '⛩' };
const ORDER: Record<SkyObject['kind'], number> = { moon: 0, planet: 1, iss: 2, meteor: 3, dso: 4, star: 5, landmark: 6, sun: 7, constellation: 8 };

export default function Directory() {
  const open = useApp((s) => s.directoryOpen);
  const setOpen = useApp((s) => s.setDirectoryOpen);
  const objects = useApp((s) => s.objects);
  const field = useApp((s) => s.field);
  const setField = useApp((s) => s.setField);
  const sound = useApp((s) => s.sound);
  const { pathname } = useLocation();
  const active = chapterIndex(pathname);

  const highlights = useMemo(() => {
    if (!open) return [];
    const seen = new Set<string>();
    return Object.values(objects)
      .filter((o) => o.route && !seen.has(o.route + o.id) && seen.add(o.route + o.id))
      .map((o) => ({ o, ...vecToAltAz(o.world) }))
      .filter((h) => h.alt > -2 || h.o.kind === 'landmark')
      .sort((a, b) => ORDER[a.o.kind] - ORDER[b.o.kind] || b.alt - a.alt)
      .slice(0, 9);
  }, [objects, open]);

  const close = () => setOpen(false);
  const pt = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left + 24, y: r.top + r.height / 2 };
  };
  const go = (path: string, e: React.MouseEvent) => {
    const p = pt(e);
    close();
    // let the dialog close before the ink starts
    requestAnimationFrame(() => goChapter(path, p));
  };
  const dive = (o: SkyObject, e: React.MouseEvent) => {
    const p = pt(e);
    close();
    requestAnimationFrame(() => void Director.diveTo(o, p));
  };

  return (
    <Dialog open={open} onClose={close} label="Choose your chapter" className="hud-dialog dir-dialog">
      <div className="dir">
        <button className="tw-icon-btn dir-close" onClick={close} aria-label="Close the directory (Esc)">
          ✕
        </button>
        <Eyebrow jp="目録">The Imperial Directory</Eyebrow>
        <Title level={2}>
          Choose your <em>chapter</em>.
        </Title>
        <div className="dir-grid">
          <div>
            <h3 className="dir-h">Chapters</h3>
            <ul className="dir-list">
              {CHAPTERS.map((c, i) => (
                <li key={c.path}>
                  <button className={`dir-row ${i === active ? 'active' : ''}`} onClick={(e) => go(c.path, e)} aria-current={i === active ? 'page' : undefined}>
                    <span className="k" lang="ja">
                      {c.num}
                    </span>
                    <span className="t">
                      <b>{c.name}</b>
                      <span>
                        <span className="jp" lang="ja">
                          {c.jp}
                        </span>
                        {c.romaji}
                        {i === 0 ? ' · the dome, tonight' : ''}
                      </span>
                    </span>
                    {i === active ? <span className="here">You are here</span> : <span className="r">{c.roman}</span>}
                  </button>
                </li>
              ))}
              <li>
                <button className={`dir-row ${pathname === SCIENCE.path ? 'active' : ''}`} onClick={(e) => go(SCIENCE.path, e)}>
                  <span className="k" lang="ja">
                    {SCIENCE.num}
                  </span>
                  <span className="t">
                    <b>{SCIENCE.name}</b>
                    <span>
                      <span className="jp" lang="ja">
                        {SCIENCE.jp}
                      </span>
                      {SCIENCE.romaji} · is this real?
                    </span>
                  </span>
                  <span className="r">†</span>
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="dir-h">Tonight's highlights</h3>
            {highlights.length === 0 ? (
              <p className="hl-empty">The sky is still being drawn…</p>
            ) : (
              <ul className="dir-list">
                {highlights.map(({ o, alt, az }) => (
                  <li key={o.id}>
                    <button className="hl-row" onClick={(e) => dive(o, e)} aria-label={`Dive to ${o.name}${alt > 0 ? `, ${Math.round(alt)} degrees up in the ${compass16(az)}` : ', below the horizon'}`}>
                      <span className="g" aria-hidden="true">
                        {GLYPH[o.kind]}
                      </span>
                      <b>
                        {o.name}
                        {o.jp && (
                          <span className="jp" lang="ja">
                            {o.jp}
                          </span>
                        )}
                      </b>
                      <span className="m">{o.kind === 'landmark' ? 'on the horizon' : alt > 0 ? `${Math.round(alt)}° ${compass16(az)}` : 'below horizon'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="dir-foot">
          <Button variant="primary" className="toggle-btn" aria-pressed={field} onClick={() => setField(!field)}>
            <span lang="ja">赤</span> Field mode · {field ? 'on' : 'off'}
          </Button>
          <Button variant="primary" className="toggle-btn" aria-pressed={sound} onClick={() => setSound(!sound)}>
            Sound · {sound ? 'on' : 'off'}
          </Button>
          <span className="hint">
            <span className="kbd">←</span> <span className="kbd">→</span> chapters · <span className="kbd">Esc</span> back
          </span>
        </div>
      </div>
    </Dialog>
  );
}
