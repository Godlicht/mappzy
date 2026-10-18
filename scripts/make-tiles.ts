/**
 * Cuts a large map image into a Leaflet tile pyramid and registers it in the game manifest.
 *
 *   npm run tiles -- --game elden-ring --map lands-between --input ./my-map.png [--format webp] [--quality 85]
 *
 * Only use images you are legally allowed to use (e.g. screenshots of your own copy of the game
 * for private use, or maps published under a compatible licence). Generated tiles are git-ignored by default.
 */
import { existsSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { fail, GAMES_DIR, parseArgs, readManifest, writeManifest } from './lib';

const args = parseArgs(process.argv.slice(2));
const gameId = String(args.game ?? '');
const mapId = String(args.map ?? '');
const input = String(args.input ?? '');
const format = String(args.format ?? 'webp') as 'webp' | 'png' | 'jpeg';
const quality = Number(args.quality ?? 85);
const tileSize = 256;

if (!gameId || !mapId || !input) fail('Użycie: npm run tiles -- --game <id> --map <mapId> --input <plik> [--format webp|png|jpeg] [--quality 85]');
if (!existsSync(input)) fail(`Nie znaleziono pliku ${input}`);
if (!['webp', 'png', 'jpeg'].includes(format)) fail('Format musi być webp, png lub jpeg.');

const manifest = readManifest(gameId);
const map = manifest.maps.find((m) => m.id === mapId);
if (!map) fail(`Gra ${gameId} nie ma mapy ${mapId}. Dostępne: ${manifest.maps.map((m) => m.id).join(', ')}`);

sharp.cache(false);
const image = sharp(input, { limitInputPixels: false });
const meta = await image.metadata();
if (!meta.width || !meta.height) fail('Nie udało się odczytać wymiarów obrazu.');

const outDir = resolve(GAMES_DIR, gameId, 'maps', mapId, 'tiles');
rmSync(outDir, { recursive: true, force: true });

const maxNativeZoom = Math.max(0, Math.ceil(Math.log2(Math.max(meta.width, meta.height) / tileSize)));
console.log(`Obraz ${meta.width}×${meta.height}px → ${maxNativeZoom + 1} poziomów powiększenia (0–${maxNativeZoom})`);

const encoded = format === 'jpeg' ? image.jpeg({ quality }) : format === 'png' ? image.png() : image.webp({ quality });
await encoded
  .tile({
    layout: 'google',
    size: tileSize,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toFile(outDir);
for (const leftover of [resolve(dirname(outDir), 'vips-properties.xml'), resolve(outDir, 'vips-properties.xml')]) {
  rmSync(leftover, { force: true });
}

const ext = format === 'jpeg' ? 'jpg' : format;
if (map.width !== meta.width || map.height !== meta.height) {
  console.warn(
    `⚠ Wymiary mapy w manifeście (${map.width}×${map.height}) zmieniono na ${meta.width}×${meta.height}. ` +
      'Współrzędne istniejących lokalizacji muszą odnosić się do tego obrazu (opcja --scale w npm run convert).',
  );
}
map.width = meta.width;
map.height = meta.height;
map.tiles = {
  url: `${relative(resolve(GAMES_DIR, gameId), outDir).split('\\').join('/')}/{z}/{y}/{x}.${ext}`,
  tileSize,
  maxNativeZoom,
};
delete map.image;
if (args.attribution) map.attribution = String(args.attribution);
writeManifest(gameId, manifest);
console.log(`✔ Kafelki zapisane w ${relative(process.cwd(), outDir)}; manifest zaktualizowany.`);
