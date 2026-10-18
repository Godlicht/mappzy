import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { User } from '../api/client';
import { isValidProgressMap, mergeProgress, setFound } from '../progress/progress';
import type { ProgressMap } from '../types';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

const storageKey = (gameId: string) => `mappzy:progress:${gameId}`;
const PUSH_DELAY_MS = 800;

function readLocal(gameId: string): ProgressMap {
  try {
    const raw = localStorage.getItem(storageKey(gameId));
    const parsed = raw ? JSON.parse(raw) : {};
    return isValidProgressMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(gameId: string, progress: ProgressMap) {
  try {
    localStorage.setItem(storageKey(gameId), JSON.stringify(progress));
  } catch {
    /* quota exceeded / private mode: progress stays in memory */
  }
}

/**
 * Progress is always persisted in localStorage. When a user is logged in, changes are
 * additionally pushed to the server (debounced) and pulled on load / window focus.
 */
export function useProgress(gameId: string | null, user: User | null) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [status, setStatus] = useState<SyncStatus>('local');
  const progressRef = useRef<ProgressMap>({});
  const dirty = useRef<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  const apply = useCallback(
    (next: ProgressMap) => {
      if (!gameId) return;
      progressRef.current = next;
      setProgress(next);
      writeLocal(gameId, next);
    },
    [gameId],
  );

  useEffect(() => {
    if (!gameId) return;
    dirty.current.clear();
    apply(readLocal(gameId));
  }, [gameId, apply]);

  const pull = useCallback(async () => {
    if (!gameId || !user) return;
    setStatus('syncing');
    try {
      const { progress: remote } = await api.getProgress(gameId);
      const merged = mergeProgress(progressRef.current, remote);
      apply(merged);
      const localOnly = Object.keys(merged).filter((id) => remote[id]?.t !== merged[id].t);
      if (localOnly.length) {
        const partial: ProgressMap = Object.fromEntries(localOnly.map((id) => [id, merged[id]]));
        apply(mergeProgress(progressRef.current, (await api.putProgress(gameId, partial)).progress));
      }
      setStatus('synced');
    } catch {
      setStatus('error');
    }
  }, [gameId, user, apply]);

  const push = useCallback(async () => {
    if (!gameId || !user || !dirty.current.size) return;
    const ids = [...dirty.current];
    dirty.current.clear();
    const partial: ProgressMap = Object.fromEntries(ids.filter((id) => progressRef.current[id]).map((id) => [id, progressRef.current[id]]));
    setStatus('syncing');
    try {
      const { progress: remote } = await api.putProgress(gameId, partial);
      apply(mergeProgress(progressRef.current, remote));
      setStatus(dirty.current.size ? 'syncing' : 'synced');
    } catch {
      ids.forEach((id) => dirty.current.add(id));
      setStatus('error');
    }
  }, [gameId, user, apply]);

  useEffect(() => {
    if (!user) {
      setStatus('local');
      return;
    }
    void pull();
    const onFocus = () => void pull();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, pull]);

  // Keep several open tabs consistent.
  useEffect(() => {
    if (!gameId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(gameId)) apply(mergeProgress(progressRef.current, readLocal(gameId)));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [gameId, apply]);

  const schedulePush = useCallback(() => {
    if (!user) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), PUSH_DELAY_MS);
  }, [user, push]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setManyFound = useCallback(
    (ids: string[], found: boolean) => {
      let next = progressRef.current;
      const now = Date.now();
      for (const id of ids) {
        if ((next[id]?.f === 1) === found) continue;
        next = setFound(next, id, found, now);
        dirty.current.add(id);
      }
      if (next !== progressRef.current) {
        apply(next);
        schedulePush();
      }
    },
    [apply, schedulePush],
  );

  const toggle = useCallback(
    (id: string) => setManyFound([id], progressRef.current[id]?.f !== 1),
    [setManyFound],
  );

  /** Merges a backup file (or replaces everything when `replace`). */
  const importProgress = useCallback(
    (data: ProgressMap, replace = false) => {
      const now = Date.now();
      let next: ProgressMap;
      if (replace) {
        next = {};
        const ids = new Set([...Object.keys(progressRef.current), ...Object.keys(data)]);
        for (const id of ids) next[id] = { f: data[id]?.f ?? 0, t: now };
      } else next = mergeProgress(progressRef.current, data);
      Object.keys(next).forEach((id) => dirty.current.add(id));
      apply(next);
      schedulePush();
    },
    [apply, schedulePush],
  );

  return { progress, status, toggle, setManyFound, importProgress, syncNow: pull };
}
