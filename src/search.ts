import type { GameLocation } from './types';

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .toLowerCase();
}

export interface SearchIndexEntry {
  loc: GameLocation;
  name: string;
  haystack: string;
}

export function buildSearchIndex(locations: readonly GameLocation[], categoryNames: Record<string, string>): SearchIndexEntry[] {
  return locations.map((loc) => ({
    loc,
    name: normalizeText(loc.name),
    haystack: normalizeText(
      [loc.name, loc.region, loc.description, loc.hints, categoryNames[loc.category], ...(loc.tags ?? [])]
        .filter(Boolean)
        .join(' '),
    ),
  }));
}

/**
 * All query words must appear somewhere in the record; results whose name matches
 * are ranked first (prefix > word start > anywhere).
 */
export function searchLocations(index: readonly SearchIndexEntry[], query: string, limit = 50): GameLocation[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { loc: GameLocation; score: number }[] = [];
  for (const entry of index) {
    if (!words.every((w) => entry.haystack.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      const pos = entry.name.indexOf(w);
      if (pos === 0) score += 3;
      else if (pos > 0 && /[^a-z0-9]/.test(entry.name[pos - 1])) score += 2;
      else if (pos > 0) score += 1;
    }
    scored.push({ loc: entry.loc, score });
  }
  scored.sort((a, b) => b.score - a.score || a.loc.name.localeCompare(b.loc.name, 'pl'));
  return scored.slice(0, limit).map((s) => s.loc);
}
