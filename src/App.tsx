import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CategoryDef, GameIndex, GameLocation, ProgressMap } from './types';
import { combineLocations, fetchGameIndex, loadGame, type LoadedGame } from './data/gameData';
import {
  deleteDataset,
  deleteMapImage,
  EDITOR_DATASET_ID,
  getMapImage,
  listDatasets,
  saveDataset,
  saveMapImage,
  type ImportedDataset,
} from './data/localStore';
import { computeStats } from './progress/progress';
import { buildSearchIndex } from './search';
import { useAuth } from './hooks/useAuth';
import { useProgress } from './hooks/useProgress';
import { MapView, type FocusRequest } from './map/MapView';
import { Sidebar, type FoundFilter } from './components/Sidebar';
import { DetailsPanel } from './components/DetailsPanel';
import { AccountDialog } from './components/AccountDialog';
import { DataDialog } from './components/DataDialog';
import { Dialog } from './components/Dialog';

interface Route {
  gameId?: string;
  mapId?: string;
  locId?: string;
}

function parseHash(): Route {
  const [gameId, mapId, locId] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { gameId: gameId || undefined, mapId: mapId || undefined, locId: locId || undefined };
}

function writeHash(r: Route) {
  const parts = [r.gameId, r.mapId, r.locId].filter(Boolean).map((p) => encodeURIComponent(p!));
  const hash = `#/${parts.join('/')}`;
  if (window.location.hash !== hash) history.replaceState(null, '', hash);
}

interface UiPrefs {
  hidden: string[];
  foundFilter: FoundFilter;
}

function readPrefs(gameId: string): UiPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(`mappzy:ui:${gameId}`) ?? 'null');
    if (p && Array.isArray(p.hidden)) return { hidden: p.hidden, foundFilter: p.foundFilter ?? 'all' };
  } catch {
    /* ignore */
  }
  return { hidden: [], foundFilter: 'all' };
}

const stressCount = Math.min(100_000, Number(new URLSearchParams(window.location.search).get('stress')) || 0);

type Placing = 'new' | 'move' | null;

export function App() {
  const auth = useAuth();
  const initial = useMemo(parseHash, []);
  const [index, setIndex] = useState<GameIndex | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<LoadedGame | null>(null);
  const [mapId, setMapId] = useState<string | null>(initial.mapId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(initial.locId ?? null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [datasets, setDatasets] = useState<ImportedDataset[]>([]);
  const [mapImages, setMapImages] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [foundFilter, setFoundFilter] = useState<FoundFilter>('all');
  const [fatal, setFatal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'account' | 'data' | 'about' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [placing, setPlacing] = useState<Placing>(null);
  const [draftLoc, setDraftLoc] = useState<GameLocation | null>(null);

  const { progress, status, toggle, setManyFound, importProgress, syncNow } = useProgress(game?.manifest.id ?? null, auth.user);

  useEffect(() => {
    fetchGameIndex()
      .then((idx) => {
        setIndex(idx);
        const wanted = idx.games.find((g) => g.id === initial.gameId) ?? idx.games[0];
        if (!wanted) setFatal('Brak zdefiniowanych gier w public/games/index.json.');
        else setGameId(wanted.id);
      })
      .catch((e) => setFatal(`Nie udało się wczytać listy gier: ${(e as Error).message}`));
  }, [initial.gameId]);

  useEffect(() => {
    if (!index || !gameId) return;
    const entry = index.games.find((g) => g.id === gameId);
    if (!entry) return;
    let cancelled = false;
    const urls: string[] = [];
    setGame(null);
    (async () => {
      try {
        const [loaded, ds] = await Promise.all([loadGame(entry.manifest), listDatasets(gameId)]);
        const images: Record<string, string> = {};
        for (const m of loaded.manifest.maps) {
          const blob = await getMapImage(gameId, m.id);
          if (blob) urls.push((images[m.id] = URL.createObjectURL(blob)));
        }
        if (cancelled) return;
        loaded.loadErrors.forEach((e) => console.warn('[mappzy]', e));
        const prefs = readPrefs(gameId);
        setHidden(new Set(prefs.hidden));
        setFoundFilter(prefs.foundFilter);
        setDatasets(ds);
        setMapImages(images);
        setMapId((current) => (loaded.manifest.maps.some((m) => m.id === current) ? current : loaded.manifest.maps[0].id));
        setGame(loaded);
      } catch (e) {
        if (!cancelled) setFatal(`Nie udało się wczytać gry: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [index, gameId]);

  useEffect(() => {
    if (!game) return;
    localStorage.setItem(`mappzy:ui:${game.manifest.id}`, JSON.stringify({ hidden: [...hidden], foundFilter }));
  }, [game, hidden, foundFilter]);

  useEffect(() => {
    if (game && mapId) writeHash({ gameId: game.manifest.id, mapId, locId: selectedId ?? undefined });
  }, [game, mapId, selectedId]);

  useEffect(() => {
    const onHash = () => {
      const r = parseHash();
      if (r.gameId && r.gameId !== gameId) setGameId(r.gameId);
      if (r.mapId) setMapId(r.mapId);
      setSelectedId(r.locId ?? null);
      if (r.locId) setFocus({ id: r.locId, nonce: Date.now() });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [gameId]);

  const manifest = game?.manifest;
  const mapDef = manifest?.maps.find((m) => m.id === mapId) ?? manifest?.maps[0];
  const categories = useMemo<Record<string, CategoryDef>>(
    () => Object.fromEntries((manifest?.categories ?? []).map((c) => [c.id, c])),
    [manifest],
  );

  const allLocations = useMemo(() => (game ? combineLocations(game, datasets, stressCount) : []), [game, datasets]);
  const byId = useMemo(() => new Map(allLocations.map((l) => [l.id, l])), [allLocations]);
  const mapLocations = useMemo(() => allLocations.filter((l) => l.mapId === mapDef?.id), [allLocations, mapDef]);
  const visibleLocations = useMemo(
    () =>
      mapLocations.filter((l) => {
        if (hidden.has(l.category)) return false;
        if (foundFilter === 'all' || l.id === selectedId) return true;
        const found = progress[l.id]?.f === 1;
        return foundFilter === 'found' ? found : !found;
      }),
    [mapLocations, hidden, foundFilter, progress, selectedId],
  );
  const mapStats = useMemo(() => computeStats(mapLocations, progress), [mapLocations, progress]);
  const gameStats = useMemo(() => computeStats(allLocations, progress), [allLocations, progress]);
  const searchIndex = useMemo(
    () => buildSearchIndex(allLocations, Object.fromEntries(Object.entries(categories).map(([k, c]) => [k, c.name]))),
    [allLocations, categories],
  );
  const usingDemo = mapLocations.some((l) => l.demo) && !mapImages[mapDef?.id ?? ''] && !mapDef?.tiles;

  // Resolve a deep-linked location once data is available.
  useEffect(() => {
    if (!game || !initial.locId) return;
    const loc = byId.get(initial.locId);
    if (loc) {
      setMapId(loc.mapId);
      setFocus({ id: loc.id, nonce: Date.now() });
    }
    // Only for the first load of a game; later selections set focus themselves.
  }, [game]);

  const editorDataset = datasets.find((d) => d.id === EDITOR_DATASET_ID);
  const shownLoc = draftLoc && draftLoc.id === selectedId ? draftLoc : selectedId ? byId.get(selectedId) : undefined;

  const selectLocation = useCallback((id: string | null) => {
    setSelectedId(id);
    setDraftLoc((d) => (d && d.id === id ? d : null));
    setPlacing(null);
  }, []);

  const pick = useCallback(
    (loc: GameLocation) => {
      setMapId(loc.mapId);
      selectLocation(loc.id);
      setFocus({ id: loc.id, nonce: Date.now() });
      setHidden((h) => {
        if (!h.has(loc.category)) return h;
        const next = new Set(h);
        next.delete(loc.category);
        return next;
      });
      setSidebarOpen(false);
    },
    [selectLocation],
  );

  const persistDatasets = async (next: ImportedDataset[], changed?: ImportedDataset) => {
    setDatasets(next);
    if (changed) await saveDataset(changed);
  };

  const saveEditorLocation = async (loc: GameLocation) => {
    if (!manifest) return;
    const base: ImportedDataset = editorDataset ?? {
      id: EDITOR_DATASET_ID,
      gameId: manifest.id,
      name: 'Moje zmiany (edytor)',
      importedAt: Date.now(),
      enabled: true,
      locations: [],
    };
    const updated = { ...base, enabled: true, locations: [...base.locations.filter((l) => l.id !== loc.id), loc] };
    await persistDatasets([...datasets.filter((d) => d.id !== EDITOR_DATASET_ID), updated], updated);
    setDraftLoc(null);
    setSelectedId(loc.id);
  };

  const deleteEditorLocation = async (id: string) => {
    if (!editorDataset) return;
    const updated = { ...editorDataset, locations: editorDataset.locations.filter((l) => l.id !== id) };
    await persistDatasets(datasets.map((d) => (d.id === EDITOR_DATASET_ID ? updated : d)), updated);
    selectLocation(null);
  };

  const onPlace = (x: number, y: number) => {
    if (!mapDef || !manifest) return;
    if (placing === 'move' && shownLoc) {
      setDraftLoc({ ...shownLoc, x, y });
    } else if (placing === 'new') {
      const firstVisible = manifest.categories.find((c) => !hidden.has(c.id)) ?? manifest.categories[0];
      const draft: GameLocation = {
        id: `user:${mapDef.id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        mapId: mapDef.id,
        category: firstVisible.id,
        name: '',
        x,
        y,
      };
      setDraftLoc(draft);
      setSelectedId(draft.id);
    }
    setPlacing(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (dialog || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'Escape') {
        if (placing) setPlacing(null);
        else selectLocation(null);
      } else if (e.key.toLowerCase() === 'f' && selectedId && byId.has(selectedId) && !e.ctrlKey && !e.metaKey) {
        toggle(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, placing, selectedId, byId, toggle, selectLocation]);

  if (fatal) {
    return (
      <div className="splash">
        <p className="error">{fatal}</p>
      </div>
    );
  }
  if (!index || !game || !manifest || !mapDef) {
    return (
      <div className="splash" aria-busy="true">
        <span className="brand__mark spin" aria-hidden="true">
          ✦
        </span>
        <p>Wczytywanie mapy…</p>
      </div>
    );
  }

  const isDraft = !!draftLoc && draftLoc.id === selectedId && !byId.has(draftLoc.id);

  return (
    <div className={`app${sidebarOpen ? ' app--sidebar-open' : ''}${shownLoc ? ' app--details-open' : ''}`} style={{ ['--accent' as string]: manifest.theme?.accent }}>
      <a href="#search-input" className="skip-link">
        Przejdź do wyszukiwarki
      </a>
      <Sidebar
        games={index.games}
        manifest={manifest}
        mapId={mapDef.id}
        categories={categories}
        mapStats={mapStats}
        gameStats={gameStats}
        hidden={hidden}
        foundFilter={foundFilter}
        searchIndex={searchIndex}
        progress={progress}
        usingDemo={usingDemo}
        userName={auth.user?.username ?? null}
        syncStatus={status}
        accountsAvailable={auth.serverAvailable}
        editMode={editMode}
        onGameChange={(id) => {
          selectLocation(null);
          setMapId(null);
          setGameId(id);
        }}
        onMapChange={(id) => {
          selectLocation(null);
          setMapId(id);
        }}
        onToggleCategory={(id) =>
          setHidden((h) => {
            const next = new Set(h);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onSetCategories={(ids, visible) =>
          setHidden((h) => {
            const next = new Set(h);
            ids.forEach((id) => (visible ? next.delete(id) : next.add(id)));
            return next;
          })
        }
        onFoundFilter={setFoundFilter}
        onPick={pick}
        onOpenAccount={() => setDialog('account')}
        onOpenData={() => setDialog('data')}
        onOpenAbout={() => setDialog('about')}
        onToggleEdit={() => {
          setEditMode((m) => !m);
          setPlacing(null);
        }}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <main className="main">
        <div className="toolbar">
          <button type="button" className="btn btn--ghost toolbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Otwórz panel" aria-expanded={sidebarOpen}>
            ☰
          </button>
          <div className="toolbar__title">
            <span className="toolbar__game">{manifest.name}</span>
            <span className="toolbar__map">{mapDef.name}</span>
          </div>
          <div className="toolbar__stats" aria-live="polite">
            {mapStats.found}/{mapStats.total}
          </div>
          {editMode && (
            <button type="button" className={`btn btn--primary${placing === 'new' ? ' btn--on' : ''}`} onClick={() => setPlacing((p) => (p === 'new' ? null : 'new'))}>
              {placing === 'new' ? 'Kliknij na mapie…' : '＋ Dodaj znacznik'}
            </button>
          )}
        </div>

        <MapView
          mapDef={mapDef}
          baseUrl={game.baseUrl}
          overlayUrl={mapImages[mapDef.id] ?? null}
          categories={categories}
          locations={visibleLocations}
          progress={progress}
          selectedId={selectedId}
          focus={focus}
          placing={placing !== null}
          showCoords={editMode}
          onSelect={selectLocation}
          onToggleFound={toggle}
          onPlace={onPlace}
        />

        {shownLoc && (
          <DetailsPanel
            gameId={manifest.id}
            loc={shownLoc}
            categories={manifest.categories}
            maps={manifest.maps}
            found={progress[shownLoc.id]?.f === 1}
            editMode={editMode}
            isDraft={isDraft}
            editorOwned={!!editorDataset?.locations.some((l) => l.id === shownLoc.id)}
            moving={placing === 'move'}
            onToggleFound={() => toggle(shownLoc.id)}
            onClose={() => selectLocation(null)}
            onSave={(l) => void saveEditorLocation(l)}
            onDelete={() => void deleteEditorLocation(shownLoc.id)}
            onStartMove={() => setPlacing((p) => (p === 'move' ? null : 'move'))}
          />
        )}
      </main>

      <AccountDialog open={dialog === 'account'} onClose={() => setDialog(null)} auth={auth} syncStatus={status} onSyncNow={() => void syncNow()} />
      <DataDialog
        open={dialog === 'data'}
        onClose={() => setDialog(null)}
        manifest={manifest}
        mapId={mapDef.id}
        datasets={datasets}
        allLocations={allLocations}
        progress={progress}
        mapImages={Object.fromEntries(Object.keys(mapImages).map((k) => [k, true]))}
        onAddDataset={async (d) => persistDatasets([...datasets, d], d)}
        onToggleDataset={(id, enabled) => {
          const d = datasets.find((x) => x.id === id);
          if (!d) return;
          const updated = { ...d, enabled };
          void persistDatasets(datasets.map((x) => (x.id === id ? updated : x)), updated);
        }}
        onDeleteDataset={(id) => {
          setDatasets(datasets.filter((d) => d.id !== id));
          void deleteDataset(manifest.id, id);
        }}
        onSetMapImage={async (id, file) => {
          if (file) await saveMapImage(manifest.id, id, file);
          else await deleteMapImage(manifest.id, id);
          setMapImages((imgs) => {
            const next = { ...imgs };
            if (next[id]) URL.revokeObjectURL(next[id]);
            if (file) next[id] = URL.createObjectURL(file);
            else delete next[id];
            return next;
          });
        }}
        onImportProgress={(p: ProgressMap, replace) => importProgress(p, replace)}
        onResetProgress={() => setManyFound(Object.keys(progress), false)}
      />
      <Dialog open={dialog === 'about'} title="O projekcie i prawach" onClose={() => setDialog(null)}>
        <div className="stack">
          <p>
            <strong>mappzy</strong> to fanowska, interaktywna mapa znajdziek. Postęp zapisuje się w przeglądarce, a po zalogowaniu — również na koncie.
          </p>
          {manifest.legal && <p className="small">{manifest.legal}</p>}
          <p className="small muted">
            Skróty: <kbd>/</kbd> wyszukiwarka, <kbd>F</kbd> oznacz wybrany znacznik, <kbd>Esc</kbd> zamknij szczegóły, prawy klik na znaczniku — szybkie oznaczanie.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
