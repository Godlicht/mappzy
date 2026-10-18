/**
 * Validates every game manifest and all location files it references.
 *   npm run validate
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLocationsJson } from '../src/data/importers';
import type { GameIndex } from '../src/types';
import { GAMES_DIR, readManifest } from './lib';

const index = JSON.parse(readFileSync(resolve(GAMES_DIR, 'index.json'), 'utf8')) as GameIndex;
let problems = 0;
const report = (msg: string) => {
  problems++;
  console.error(`  ✖ ${msg}`);
};

for (const entry of index.games) {
  const manifest = readManifest(entry.id);
  console.log(`${manifest.name} (${manifest.id})`);
  if (manifest.id !== entry.id) report(`id w manifeście (${manifest.id}) różni się od index.json (${entry.id})`);

  const catIds = manifest.categories.map((c) => c.id);
  const mapIds = manifest.maps.map((m) => m.id);
  for (const [label, ids] of [['kategorii', catIds], ['map', mapIds]] as const) {
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) report(`zduplikowane id ${label}: ${dup.join(', ')}`);
  }

  const seen = new Map<string, string>();
  for (const map of manifest.maps) {
    const files = [...(map.locations ?? []).map((f) => [f, false] as const), ...(map.demoLocations ?? []).map((f) => [f, true] as const)];
    let count = 0;
    for (const [file, demo] of files) {
      const path = resolve(GAMES_DIR, entry.id, file);
      if (!existsSync(path)) {
        report(`${map.id}: brak pliku ${file}`);
        continue;
      }
      const result = parseLocationsJson(JSON.parse(readFileSync(path, 'utf8')), { defaultMapId: map.id, mapIds, categoryIds: catIds });
      result.errors.forEach((e) => report(`${file} wiersz ${e.row}: ${e.message}`));
      if (!demo && !result.meta?.license) console.warn(`  ⚠ ${file}: brak meta.license`);
      for (const loc of result.locations) {
        if (!demo) {
          const prev = seen.get(loc.id);
          if (prev) report(`id "${loc.id}" występuje w ${prev} i ${file}`);
          seen.set(loc.id, file);
        }
        if (loc.x < 0 || loc.y < 0 || loc.x > map.width || loc.y > map.height) report(`${file}: "${loc.name}" poza granicami mapy ${map.id}`);
      }
      count += result.locations.length;
    }
    console.log(`  ${map.name}: ${count} lokalizacji, tło: ${map.tiles ? 'kafelki' : map.image ? 'obraz' : 'mapa zastępcza'}`);
  }
}

if (problems) {
  console.error(`\n${problems} problem(ów).`);
  process.exit(1);
}
console.log('\n✔ Dane poprawne.');
