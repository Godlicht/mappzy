import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchLocations } from '../src/search';
import type { GameLocation } from '../src/types';

const locs: GameLocation[] = [
  { id: '1', mapId: 'm', category: 'boss', name: 'Margit, Upadły Omen', region: 'Stormhill', x: 0, y: 0 },
  { id: '2', mapId: 'm', category: 'boss', name: 'Morgott, Król Omenów', region: 'Leyndell', x: 0, y: 0 },
  { id: '3', mapId: 'm', category: 'grace', name: 'Kościół Elleh', region: 'Limgrave', x: 0, y: 0 },
];
const index = buildSearchIndex(locs, { boss: 'Bossowie', grace: 'Miejsca Łaski' });

describe('searchLocations', () => {
  it('is diacritic-insensitive', () => {
    expect(searchLocations(index, 'kosciol').map((l) => l.id)).toEqual(['3']);
    expect(searchLocations(index, 'upadly').map((l) => l.id)).toEqual(['1']);
  });

  it('requires all words and ranks name prefixes first', () => {
    expect(searchLocations(index, 'omen').map((l) => l.id)).toEqual(['1', '2']);
    expect(searchLocations(index, 'mor omen').map((l) => l.id)).toEqual(['2']);
  });

  it('matches regions and category names', () => {
    expect(searchLocations(index, 'leyndell').map((l) => l.id)).toEqual(['2']);
    expect(searchLocations(index, 'laski').map((l) => l.id)).toEqual(['3']);
    expect(searchLocations(index, '  ')).toEqual([]);
  });
});
