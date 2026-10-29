import type { Spot } from '@/data/api';

/** Spot kind → Shippori kanji glyph (§9.2). */
export const KIND_GLYPH: Record<string, string> = { peak: '山', shrine: '⛩', temple: '寺', lake: '湖', park: '園', viewpoint: '望' };
export const glyphOf = (s: Spot) => KIND_GLYPH[s.kind] ?? s.glyph ?? '望';
