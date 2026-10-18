import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameManifest } from '../src/types';

export const GAMES_DIR = resolve('public/games');

export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, inline] = a.slice(2).split('=', 2);
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

export function manifestPath(gameId: string): string {
  return resolve(GAMES_DIR, gameId, 'game.json');
}

export function readManifest(gameId: string): GameManifest {
  return JSON.parse(readFileSync(manifestPath(gameId), 'utf8')) as GameManifest;
}

export function writeManifest(gameId: string, manifest: GameManifest) {
  writeFileSync(manifestPath(gameId), JSON.stringify(manifest, null, 2) + '\n');
}

export function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}
