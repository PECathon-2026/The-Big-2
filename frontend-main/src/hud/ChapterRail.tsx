/** Chapter rail 一–五 (§8.5), Atelier style: active = gold + long hairline; hover shows the name. */
import { useLocation } from 'react-router';
import { CHAPTERS } from '@/app/routes';
import { chapterIndex, goChapter } from './nav';

export default function ChapterRail() {
  const { pathname } = useLocation();
  const active = chapterIndex(pathname);
  return (
    <nav className="rail" aria-label="Chapters">
      {CHAPTERS.map((c, i) => (
        <button
          key={c.path}
          className={`rail-item ${i === active ? 'active' : ''}`}
          aria-current={i === active ? 'page' : undefined}
          aria-label={`Chapter ${c.roman}: ${c.name}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            goChapter(c.path, { x: r.right - 16, y: r.top + r.height / 2 });
          }}
        >
          <span className="name">
            {c.name}
            <span className="jp" lang="ja">
              {c.jp}
            </span>
          </span>
          <span className="line" aria-hidden="true" />
          <span className="num" lang="ja" aria-hidden="true">
            {c.num}
          </span>
        </button>
      ))}
      <div className="rail-roman" aria-hidden="true">
        {active >= 0 ? CHAPTERS[active].roman : '学'} / V
      </div>
    </nav>
  );
}
