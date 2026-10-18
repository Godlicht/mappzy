import { describe, expect, it } from 'vitest';
import { computeStats, isValidProgressMap, mergeProgress, percent, setFound } from '../src/progress/progress';
import type { GameLocation } from '../src/types';

describe('mergeProgress', () => {
  it('keeps the most recent change per entry', () => {
    const a = { x: { f: 1 as const, t: 10 }, y: { f: 1 as const, t: 5 } };
    const b = { x: { f: 0 as const, t: 20 }, y: { f: 0 as const, t: 1 }, z: { f: 1 as const, t: 3 } };
    expect(mergeProgress(a, b)).toEqual({ x: { f: 0, t: 20 }, y: { f: 1, t: 5 }, z: { f: 1, t: 3 } });
  });

  it('is commutative', () => {
    const a = { x: { f: 1 as const, t: 10 } };
    const b = { x: { f: 0 as const, t: 10 } };
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
  });
});

describe('setFound', () => {
  it('produces strictly increasing timestamps', () => {
    let p = setFound({}, 'a', true, 100);
    p = setFound(p, 'a', false, 50);
    expect(p.a).toEqual({ f: 0, t: 101 });
  });
});

describe('validation and stats', () => {
  it('validates progress maps', () => {
    expect(isValidProgressMap({ a: { f: 1, t: 1 } })).toBe(true);
    expect(isValidProgressMap({ a: { f: 2, t: 1 } })).toBe(false);
    expect(isValidProgressMap([])).toBe(false);
    expect(isValidProgressMap(null)).toBe(false);
  });

  it('computes per-category and total stats', () => {
    const locs = [
      { id: '1', category: 'boss' },
      { id: '2', category: 'boss' },
      { id: '3', category: 'grace' },
    ] as GameLocation[];
    const stats = computeStats(locs, { '1': { f: 1, t: 1 }, '3': { f: 0, t: 2 } });
    expect(stats).toEqual({ found: 1, total: 3, byCategory: { boss: { found: 1, total: 2 }, grace: { found: 0, total: 1 } } });
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(0, 0)).toBe(0);
  });
});
