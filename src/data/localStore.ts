import type { GameLocation, LocationFileMeta } from '../types';

/** A dataset imported by the user in the browser (or created in the editor). */
export interface ImportedDataset {
  id: string;
  gameId: string;
  name: string;
  importedAt: number;
  meta?: LocationFileMeta;
  /** Disabled datasets are kept in storage but not shown on the map. */
  enabled: boolean;
  locations: GameLocation[];
}

export const EDITOR_DATASET_ID = 'editor';

const DB_NAME = 'mappzy';
const DB_VERSION = 1;
const DATASETS = 'datasets';
const MAP_IMAGES = 'mapImages';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB niedostępne'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATASETS)) {
        db.createObjectStore(DATASETS, { keyPath: ['gameId', 'id'] }).createIndex('gameId', 'gameId');
      }
      if (!db.objectStoreNames.contains(MAP_IMAGES)) db.createObjectStore(MAP_IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function listDatasets(gameId: string): Promise<ImportedDataset[]> {
  try {
    const all = await run<ImportedDataset[]>(DATASETS, 'readonly', (s) => s.index('gameId').getAll(gameId));
    return all.sort((a, b) => a.importedAt - b.importedAt);
  } catch {
    return [];
  }
}

export function saveDataset(dataset: ImportedDataset): Promise<IDBValidKey> {
  return run(DATASETS, 'readwrite', (s) => s.put(dataset));
}

export function deleteDataset(gameId: string, id: string): Promise<undefined> {
  return run(DATASETS, 'readwrite', (s) => s.delete([gameId, id]));
}

export async function getMapImage(gameId: string, mapId: string): Promise<Blob | undefined> {
  try {
    return await run<Blob | undefined>(MAP_IMAGES, 'readonly', (s) => s.get(`${gameId}/${mapId}`));
  } catch {
    return undefined;
  }
}

export function saveMapImage(gameId: string, mapId: string, blob: Blob): Promise<IDBValidKey> {
  return run(MAP_IMAGES, 'readwrite', (s) => s.put(blob, `${gameId}/${mapId}`));
}

export function deleteMapImage(gameId: string, mapId: string): Promise<undefined> {
  return run(MAP_IMAGES, 'readwrite', (s) => s.delete(`${gameId}/${mapId}`));
}
