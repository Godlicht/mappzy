import type { GameLocation, ProgressEntry, ProgressMap } from '../types';

/**
 * Merges two progress maps entry by entry, keeping the most recent change.
 * Unchecking is stored as `f: 0` (a tombstone) so it propagates between devices.
 */
export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
  const out: ProgressMap = { ...a };
  for (const [id, entry] of Object.entries(b)) {
    const current = out[id];
    if (!current || entry.t > current.t || (entry.t === current.t && entry.f > current.f)) {
      out[id] = entry;
    }
  }
  return out;
}

export function isFound(progress: ProgressMap, id: string): boolean {
  return progress[id]?.f === 1;
}

export function setFound(progress: ProgressMap, id: string, found: boolean, now = Date.now()): ProgressMap {
  const prev = progress[id];
  // Guarantee monotonic timestamps even if the clock goes backwards.
  const t = prev && prev.t >= now ? prev.t + 1 : now;
  return { ...progress, [id]: { f: found ? 1 : 0, t } };
}

export function isValidProgressMap(value: unknown): value is ProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!isValidEntry(entry)) return false;
  }
  return true;
}

function isValidEntry(entry: unknown): entry is ProgressEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (e.f === 0 || e.f === 1) && typeof e.t === 'number' && Number.isFinite(e.t);
}

export interface CategoryStats {
  found: number;
  total: number;
}

export interface ProgressStats {
  found: number;
  total: number;
  byCategory: Record<string, CategoryStats>;
}

export function computeStats(locations: readonly GameLocation[], progress: ProgressMap): ProgressStats {
  const stats: ProgressStats = { found: 0, total: 0, byCategory: {} };
  for (const loc of locations) {
    const cat = (stats.byCategory[loc.category] ??= { found: 0, total: 0 });
    cat.total++;
    stats.total++;
    if (isFound(progress, loc.id)) {
      cat.found++;
      stats.found++;
    }
  }
  return stats;
}

export function percent(found: number, total: number): number {
  return total === 0 ? 0 : Math.round((found / total) * 1000) / 10;
}
