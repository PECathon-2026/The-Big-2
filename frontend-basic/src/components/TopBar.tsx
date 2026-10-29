import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import api, { API_BASE, type Health } from '../api';

const TABS: { to: string; en: string; jp: string }[] = [
  { to: '/', en: 'Tonight', jp: '今夜' },
  { to: '/watchtower', en: 'Watchtower', jp: '物見櫓' },
  { to: '/scroll', en: 'Scroll', jp: '絵巻' },
  { to: '/lens', en: 'Lens', jp: '鏡' },
  { to: '/transients', en: 'Transients', jp: '変光' },
  { to: '/planner', en: 'Planner', jp: '策' },
  { to: '/horizon', en: 'Horizon', jp: '地平' },
  { to: '/science', en: 'Science', jp: '理' },
];

export function TopBar() {
  const [health, setHealth] = useState<Health | null | 'down'>(null);
  useEffect(() => {
    let alive = true;
    const run = () =>
      api
        .health()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth('down'));
    run();
    const id = setInterval(run, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="topbar">
      <span className="brand">月読 · TSUKUYOMI</span>
      <nav>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span>{t.en}</span>
            <span className="jp">{t.jp}</span>
          </NavLink>
        ))}
      </nav>
      <span className="spacer" />
      <span className="health" title={API_BASE}>
        <span className={`dot ${health === 'down' ? 'bad' : health ? 'ok' : ''}`} />
        {health === null ? 'checking…' : health === 'down' ? 'backend down' : `v${health.version}${health.demo_replay ? ' · replay' : ''}`}
      </span>
    </header>
  );
}
