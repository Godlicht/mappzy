import type { GameIndex, GameLocation, GameManifest, MapDef } from '../types';
import { parseLocationsJson } from './importers';
import type { ImportedDataset } from './localStore';

const GAMES_ROOT = `${import.meta.env.BASE_URL}games/`;

export interface LoadedGame {
  manifest: GameManifest;
  /** Absolute base URL of the manifest, used to resolve tile and data URLs. */
  baseUrl: string;
  /** Locations from bundled real-data files, by map id. */
  bundled: Record<string, GameLocation[]>;
  /** Locations from bundled demo files, by map id. */
  demo: Record<string, GameLocation[]>;
  loadErrors: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchGameIndex(): Promise<GameIndex> {
  return fetchJson<GameIndex>(`${GAMES_ROOT}index.json`);
}

export function resolveUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export async function loadGame(manifestPath: string): Promise<LoadedGame> {
  const manifestUrl = new URL(`${GAMES_ROOT}${manifestPath}`, window.location.href).toString();
  const manifest = await fetchJson<GameManifest>(manifestUrl);
  const baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  const loadErrors: string[] = [];
  const categoryIds = manifest.categories.map((c) => c.id);
  const mapIds = manifest.maps.map((m) => m.id);

  const loadFiles = async (map: MapDef, files: string[] = []) => {
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const data = await fetchJson<unknown>(resolveUrl(baseUrl, file));
          const parsed = parseLocationsJson(data, { defaultMapId: map.id, mapIds, categoryIds });
          parsed.errors.slice(0, 5).forEach((e) => loadErrors.push(`${file} (wiersz ${e.row}): ${e.message}`));
          return parsed.locations;
        } catch (e) {
          loadErrors.push(`${file}: ${(e as Error).message}`);
          return [];
        }
      }),
    );
    return results.flat();
  };

  const bundled: Record<string, GameLocation[]> = {};
  const demo: Record<string, GameLocation[]> = {};
  await Promise.all(
    manifest.maps.map(async (map) => {
      [bundled[map.id], demo[map.id]] = await Promise.all([
        loadFiles(map, map.locations),
        loadFiles(map, map.demoLocations).then((locs) => locs.map((l) => ({ ...l, demo: true }))),
      ]);
    }),
  );

  return { manifest, baseUrl, bundled, demo, loadErrors };
}

/**
 * Combines bundled, demo and user-imported data into the effective list of locations.
 * Demo data is used for a map only if nothing else exists for it.
 * Later sources override earlier ones when ids collide (so imports can correct bundled records).
 */
export function combineLocations(game: LoadedGame, datasets: ImportedDataset[], stressCount = 0): GameLocation[] {
  const byId = new Map<string, GameLocation>();
  const imported = datasets.filter((d) => d.enabled).flatMap((d) => d.locations);
  for (const map of game.manifest.maps) {
    const real = game.bundled[map.id] ?? [];
    const importedForMap = imported.filter((l) => l.mapId === map.id && !l.demo);
    const source = real.length || importedForMap.length ? real : (game.demo[map.id] ?? []);
    for (const loc of source) byId.set(loc.id, loc);
  }
  for (const loc of imported) byId.set(loc.id, loc);
  const result = [...byId.values()];
  if (stressCount > 0) result.push(...generateStressLocations(game.manifest, stressCount));
  return result;
}

/** Synthetic markers for performance testing (`?stress=20000`). Never persisted. */
function generateStressLocations(manifest: GameManifest, count: number): GameLocation[] {
  const map = manifest.maps[0];
  const out: GameLocation[] = [];
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < count; i++) {
    const cat = manifest.categories[i % manifest.categories.length];
    out.push({
      id: `stress:${i}`,
      mapId: map.id,
      category: cat.id,
      name: `Test ${cat.name} #${i}`,
      x: rand() * map.width,
      y: rand() * map.height,
      demo: true,
    });
  }
  return out;
}
