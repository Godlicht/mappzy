import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidProgressMap, mergeProgress, setFound } from '../progress/progress';
import type { ProgressMap } from '../types';

const storageKey = (gameId: string) => `mappzy:progress:${gameId}`;

function readLocal(gameId: string): ProgressMap {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    const parsed = raw ? JSON.parse(raw) : {};
    return isValidProgressMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(gameId: string, progress: ProgressMap): boolean {
  try {
    localStorage.setItem(storageKey(gameId), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/**
 * Progress lives in localStorage (per game). Moving it between devices is done with
 * export/import of a backup file; entries carry timestamps so imports merge cleanly.
 */
export function useProgress(gameId: string | null) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [storageOk, setStorageOk] = useState(true);
  const progressRef = useRef<ProgressMap>({});

  const apply = useCallback(
    (next: ProgressMap) => {
      if (!gameId) return;
      progressRef.current = next;
      setProgress(next);
      setStorageOk(writeLocal(gameId, next));
    },
    [gameId],
  );

  useEffect(() => {
    if (gameId) apply(readLocal(gameId));
  }, [gameId, apply]);

  // Keep several open tabs consistent.
  useEffect(() => {
    if (!gameId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(gameId)) apply(mergeProgress(progressRef.current, readLocal(gameId)));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [gameId, apply]);

  const setManyFound = useCallback(
    (ids: string[], found: boolean) => {
      let next = progressRef.current;
      const now = Date.now();
      for (const id of ids) {
        if ((next[id]?.f === 1) === found) continue;
        next = setFound(next, id, found, now);
      }
      if (next !== progressRef.current) apply(next);
    },
    [apply],
  );

  const toggle = useCallback((id: string) => setManyFound([id], progressRef.current[id]?.f !== 1), [setManyFound]);

  const importProgress = useCallback((data: ProgressMap) => apply(mergeProgress(progressRef.current, data)), [apply]);

  return { progress, storageOk, toggle, setManyFound, importProgress };
}
