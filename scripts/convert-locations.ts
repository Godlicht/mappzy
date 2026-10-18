/**
 * Converts CSV / GeoJSON / JSON location data into the mappzy format, validates it against
 * the game manifest and (optionally) registers the output file on the map.
 *
 *   npm run convert -- --game elden-ring --map lands-between --input data.csv \
 *     [--out data/lands-between.json] [--register] [--flip-y] [--scale 1] [--offset-x 0] [--offset-y 0] \
 *     [--aliases aliases.json] [--source "https://…"] [--license "CC BY-SA 4.0"]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseLocationsText, toLocationFile } from '../src/data/importers';
import { fail, GAMES_DIR, parseArgs, readManifest, writeManifest } from './lib';

const args = parseArgs(process.argv.slice(2));
const gameId = String(args.game ?? '');
const mapId = args.map ? String(args.map) : undefined;
const input = String(args.input ?? '');
if (!gameId || !input) fail('Użycie: npm run convert -- --game <id> --input <plik> [--map <mapId>] [--out <ścieżka>] [--register]');
if (!existsSync(input)) fail(`Nie znaleziono pliku ${input}`);

const manifest = readManifest(gameId);
const map = mapId ? manifest.maps.find((m) => m.id === mapId) : undefined;
if (mapId && !map) fail(`Nieznana mapa ${mapId}`);

const result = parseLocationsText(readFileSync(input, 'utf8'), basename(input), {
  defaultMapId: mapId,
  mapIds: manifest.maps.map((m) => m.id),
  categoryIds: manifest.categories.map((c) => c.id),
  categoryAliases: args.aliases ? JSON.parse(readFileSync(String(args.aliases), 'utf8')) : undefined,
  flipYHeight: args['flip-y'] ? (map?.height ?? fail('--flip-y wymaga --map')) : undefined,
  scale: args.scale ? Number(args.scale) : undefined,
  offsetX: args['offset-x'] ? Number(args['offset-x']) : undefined,
  offsetY: args['offset-y'] ? Number(args['offset-y']) : undefined,
});

for (const e of result.errors) console.error(`  ✖ wiersz ${e.row}: ${e.message}`);
for (const w of result.warnings.slice(0, 20)) console.warn(`  ⚠ wiersz ${w.row}: ${w.message}`);
if (result.warnings.length > 20) console.warn(`  … oraz ${result.warnings.length - 20} kolejnych ostrzeżeń`);

for (const loc of result.locations) {
  const m = manifest.maps.find((mm) => mm.id === loc.mapId)!;
  if (loc.x < 0 || loc.y < 0 || loc.x > m.width || loc.y > m.height) {
    console.warn(`  ⚠ "${loc.name}" (${loc.id}) leży poza mapą ${m.id} (${m.width}×${m.height}): ${loc.x}, ${loc.y}`);
  }
}

if (!result.locations.length) fail('Brak poprawnych rekordów.');
const license = args.license ? String(args.license) : result.meta?.license;
if (!license) console.warn('  ⚠ Nie podano licencji (--license). Upewnij się, że masz prawo do wykorzystania danych.');

const outRel = String(args.out ?? `data/${mapId ?? 'locations'}.json`);
const outPath = resolve(GAMES_DIR, gameId, outRel);
mkdirSync(dirname(outPath), { recursive: true });
const file = toLocationFile(gameId, result.locations, {
  ...result.meta,
  title: result.meta?.title ?? basename(input),
  source: args.source ? String(args.source) : result.meta?.source,
  license,
});
if (mapId) file.mapId = mapId;
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
console.log(`✔ Zapisano ${result.locations.length} lokalizacji do ${outPath}`);

if (args.register) {
  const targets = new Set(result.locations.map((l) => l.mapId));
  for (const m of manifest.maps) {
    if (!targets.has(m.id)) continue;
    m.locations = [...new Set([...(m.locations ?? []), outRel])];
  }
  writeManifest(gameId, manifest);
  console.log(`✔ Plik dodany do manifestu dla map: ${[...targets].join(', ')}`);
}
if (result.errors.length) process.exitCode = 2;
