import { describe, expect, it } from 'vitest';
import { parseCsv, parseLocationsText } from '../src/data/importers';

const opts = { defaultMapId: 'lands-between', mapIds: ['lands-between', 'underground'], categoryIds: ['boss', 'grace'] };

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and semicolons', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('a;b\n1,5;2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });
});

describe('parseLocationsText', () => {
  it('parses mappzy JSON and inherits mapId and demo flag', () => {
    const text = JSON.stringify({
      format: 'mappzy-locations@1',
      gameId: 'elden-ring',
      mapId: 'underground',
      meta: { demo: true, license: 'CC0' },
      locations: [{ id: 'a', category: 'boss', name: 'Mohg', x: 1, y: 2 }],
    });
    const r = parseLocationsText(text, 'x.json', opts);
    expect(r.errors).toEqual([]);
    expect(r.meta?.license).toBe('CC0');
    expect(r.locations).toEqual([{ id: 'a', mapId: 'underground', category: 'boss', name: 'Mohg', x: 1, y: 2, demo: true }]);
  });

  it('parses CSV with aliases, decimal commas and tags', () => {
    const csv = 'id;map;type;nazwa;x;y;tags\nm1;lands-between;boss;Margit;10,5;20;a|b\n';
    const r = parseLocationsText(csv, 'data.csv', opts);
    expect(r.errors).toEqual([]);
    expect(r.locations[0]).toMatchObject({ id: 'm1', category: 'boss', name: 'Margit', x: 10.5, y: 20, tags: ['a', 'b'] });
  });

  it('parses GeoJSON points', () => {
    const geo = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'g1', geometry: { type: 'Point', coordinates: [5, 6] }, properties: { name: 'Elleh', category: 'grace' } }],
    };
    const r = parseLocationsText(JSON.stringify(geo), 'a.geojson', opts);
    expect(r.locations).toEqual([{ id: 'g1', mapId: 'lands-between', category: 'grace', name: 'Elleh', x: 5, y: 6 }]);
  });

  it('reports invalid rows and duplicate ids, and generates missing ids', () => {
    const data = [
      { name: 'No coords', category: 'boss' },
      { name: 'Bad cat', category: 'weapon', x: 1, y: 1 },
      { id: 'd', name: 'A', category: 'boss', x: 1, y: 1 },
      { id: 'd', name: 'B', category: 'boss', x: 1, y: 1 },
      { name: 'Łaska', category: 'grace', x: 3, y: 4, map: 'nowhere' },
      { name: 'Łaska Pierwsza', category: 'grace', x: 3.4, y: 4 },
    ];
    const r = parseLocationsText(JSON.stringify(data), 'a.json', opts);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2, 4, 5]);
    expect(r.locations.map((l) => l.id)).toEqual(['d', 'lands-between:grace:laska-pierwsza:3-4']);
    expect(r.warnings).toHaveLength(1);
  });

  it('applies flip and scale transforms', () => {
    const r = parseLocationsText(JSON.stringify([{ id: 'a', name: 'A', category: 'boss', x: 10, y: 10 }]), 'a.json', {
      ...opts,
      flipYHeight: 100,
      scale: 2,
    });
    expect(r.locations[0]).toMatchObject({ x: 20, y: 180 });
  });

  it('rejects broken JSON gracefully', () => {
    const r = parseLocationsText('{oops', 'a.json', opts);
    expect(r.locations).toEqual([]);
    expect(r.errors[0].message).toMatch(/JSON/);
  });
});
