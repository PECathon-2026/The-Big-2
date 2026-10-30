/** Module routes (D owns the pages). Each is lazy; the sky itself is `/` and renders no page. */
import { lazy } from 'react';

export const Watchtower = lazy(() => import('@/modules/watchtower'));
export const Scroll = lazy(() => import('@/modules/scroll'));
export const Lens = lazy(() => import('@/modules/lens'));
export const Dojo = lazy(() => import('@/modules/dojo'));
export const DojoDashboard = lazy(() => import('@/modules/dojo/Dashboard'));
export const Honor = lazy(() => import('@/modules/honor'));
export const Science = lazy(() => import('@/modules/science'));

export interface Chapter {
  num: string; // kanji numeral
  roman: string;
  jp: string;
  romaji: string;
  name: string;
  path: string;
}

/** Chapters (§5.6, §8.5). `/science` lives in the directory, not on the rail. */
export const CHAPTERS: Chapter[] = [
  { num: '一', roman: 'I', jp: '空', romaji: 'Sora', name: 'The Sky', path: '/' },
  { num: '二', roman: 'II', jp: '見張り', romaji: 'Mihari', name: 'Watchtower', path: '/watchtower' },
  { num: '三', roman: 'III', jp: '巻物', romaji: 'Makimono', name: 'Celestial Scroll', path: '/scroll' },
  { num: '四', roman: 'IV', jp: '鏡', romaji: 'Kagami', name: 'Spirit Lens', path: '/lens' },
  { num: '五', roman: 'V', jp: '誉', romaji: 'Homare', name: 'Honor', path: '/honor' },
];

export const DOJO = { num: '道', jp: '道場', romaji: 'Dōjō', name: 'Dojo', path: '/dojo' };

export const SCIENCE = { num: '学', jp: '学', romaji: 'Gaku', name: 'Science', path: '/science' };

export const MODULE_PATHS = ['/watchtower', '/scroll', '/lens', '/dojo', '/honor', '/science'];
export const isModulePath = (p: string) => MODULE_PATHS.some((m) => p === m || p.startsWith(m + '/'));
