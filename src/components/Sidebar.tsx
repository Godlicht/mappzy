import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryDef, GameIndexEntry, GameLocation, GameManifest, ProgressMap } from '../types';
import { percent, type ProgressStats } from '../progress/progress';
import { searchLocations, type SearchIndexEntry } from '../search';
import { CategoryIcon } from './CategoryIcon';
import type { SyncStatus } from '../hooks/useProgress';

export type FoundFilter = 'all' | 'missing' | 'found';

interface Props {
  games: GameIndexEntry[];
  manifest: GameManifest;
  mapId: string;
  categories: Record<string, CategoryDef>;
  mapStats: ProgressStats;
  gameStats: ProgressStats;
  hidden: Set<string>;
  foundFilter: FoundFilter;
  searchIndex: SearchIndexEntry[];
  progress: ProgressMap;
  usingDemo: boolean;
  userName: string | null;
  syncStatus: SyncStatus;
  accountsAvailable: boolean;
  editMode: boolean;
  onGameChange: (id: string) => void;
  onMapChange: (id: string) => void;
  onToggleCategory: (id: string) => void;
  onSetCategories: (ids: string[], visible: boolean) => void;
  onFoundFilter: (f: FoundFilter) => void;
  onPick: (loc: GameLocation) => void;
  onOpenAccount: () => void;
  onOpenData: () => void;
  onOpenAbout: () => void;
  onToggleEdit: () => void;
  onClose?: () => void;
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  local: 'Zapis lokalny',
  syncing: 'Synchronizacja…',
  synced: 'Zsynchronizowano',
  error: 'Błąd synchronizacji',
};

export function Sidebar(props: Props) {
  const { manifest, mapId, categories, mapStats, gameStats, hidden, foundFilter } = props;
  const groups = useMemo(() => {
    const out = new Map<string, CategoryDef[]>();
    for (const c of manifest.categories) {
      const g = c.group ?? 'Inne';
      if (!out.has(g)) out.set(g, []);
      out.get(g)!.push(c);
    }
    return [...out.entries()];
  }, [manifest]);
  const mapNames = useMemo(() => Object.fromEntries(manifest.maps.map((m) => [m.id, m.name])), [manifest]);

  return (
    <aside className="sidebar" aria-label="Panel mapy">
      <header className="sidebar__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">✦</span>
          <span className="brand__name">mappzy</span>
        </div>
        {props.onClose && (
          <button type="button" className="icon-btn sidebar__close" onClick={props.onClose} aria-label="Zamknij panel">
            ✕
          </button>
        )}
      </header>

      <div className="sidebar__section">
        <label className="visually-hidden" htmlFor="game-select">
          Gra
        </label>
        <select id="game-select" className="select" value={manifest.id} onChange={(e) => props.onGameChange(e.target.value)}>
          {props.games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <div className="tabs" role="tablist" aria-label="Mapa">
          {manifest.maps.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === mapId}
              className={`tab${m.id === mapId ? ' tab--active' : ''}`}
              onClick={() => props.onMapChange(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <SearchBox index={props.searchIndex} categories={categories} mapNames={mapNames} currentMap={mapId} progress={props.progress} onPick={props.onPick} />

      {props.usingDemo && (
        <div className="notice" role="note">
          <strong>Dane demonstracyjne.</strong> Pozycje są przybliżone, a mapa jest zastępcza.{' '}
          <button type="button" className="link-btn" onClick={props.onOpenData}>
            Zaimportuj prawdziwe dane
          </button>
        </div>
      )}

      <section className="sidebar__section" aria-labelledby="progress-heading">
        <h3 id="progress-heading" className="section-title">
          Postęp — {mapNames[mapId]}
        </h3>
        <ProgressBar found={mapStats.found} total={mapStats.total} large />
        <p className="muted small">
          Cała gra: {gameStats.found}/{gameStats.total} ({percent(gameStats.found, gameStats.total)}%)
        </p>
      </section>

      <section className="sidebar__section sidebar__section--grow" aria-labelledby="filters-heading">
        <div className="section-row">
          <h3 id="filters-heading" className="section-title">
            Kategorie
          </h3>
          <div className="row-actions">
            <button type="button" className="link-btn" onClick={() => props.onSetCategories(manifest.categories.map((c) => c.id), true)}>
              Wszystkie
            </button>
            <button type="button" className="link-btn" onClick={() => props.onSetCategories(manifest.categories.map((c) => c.id), false)}>
              Żadne
            </button>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Pokaż znaczniki">
          {(
            [
              ['all', 'Wszystkie'],
              ['missing', 'Do zdobycia'],
              ['found', 'Znalezione'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={foundFilter === value} className={foundFilter === value ? 'active' : ''} onClick={() => props.onFoundFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        {groups.map(([group, cats]) => {
          const allVisible = cats.every((c) => !hidden.has(c.id));
          return (
            <div key={group} className="cat-group">
              <div className="cat-group__title">
                <span>{group}</span>
                <button type="button" className="link-btn small" onClick={() => props.onSetCategories(cats.map((c) => c.id), !allVisible)}>
                  {allVisible ? 'ukryj' : 'pokaż'}
                </button>
              </div>
              <ul className="cat-list">
                {cats.map((c) => {
                  const s = mapStats.byCategory[c.id] ?? { found: 0, total: 0 };
                  const visible = !hidden.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className={`cat-item${visible ? '' : ' cat-item--off'}${s.total === 0 ? ' cat-item--empty' : ''}`}>
                        <input type="checkbox" checked={visible} onChange={() => props.onToggleCategory(c.id)} />
                        <CategoryIcon category={c} muted={!visible} />
                        <span className="cat-item__name">{c.name}</span>
                        <span className="cat-item__count" aria-label={`${s.found} z ${s.total} znalezionych`}>
                          {s.found}/{s.total}
                        </span>
                        <span className="cat-item__bar" aria-hidden="true">
                          <span style={{ width: `${percent(s.found, s.total)}%`, background: c.color }} />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <footer className="sidebar__footer">
        <button type="button" className="btn btn--ghost" onClick={props.onOpenAccount} title={props.accountsAvailable ? undefined : 'Serwer kont niedostępny — postęp zapisywany lokalnie'}>
          <span aria-hidden="true">◉</span> {props.userName ?? 'Konto'}
          <span className={`sync-dot sync-dot--${props.syncStatus}`} title={SYNC_LABEL[props.syncStatus]} aria-label={SYNC_LABEL[props.syncStatus]} />
        </button>
        <button type="button" className="btn btn--ghost" onClick={props.onOpenData}>
          Dane
        </button>
        <button type="button" className={`btn btn--ghost${props.editMode ? ' btn--on' : ''}`} aria-pressed={props.editMode} onClick={props.onToggleEdit}>
          Edytor
        </button>
        <button type="button" className="btn btn--ghost" onClick={props.onOpenAbout} aria-label="O projekcie i prawach">
          ⓘ
        </button>
      </footer>
    </aside>
  );
}

export function ProgressBar({ found, total, large }: { found: number; total: number; large?: boolean }) {
  const p = percent(found, total);
  return (
    <div className={`progress${large ? ' progress--large' : ''}`}>
      <div className="progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label="Ukończenie">
        <div className="progress__fill" style={{ width: `${p}%` }} />
      </div>
      <div className="progress__label">
        <span>
          {found} / {total}
        </span>
        <span>{p}%</span>
      </div>
    </div>
  );
}

function SearchBox(props: {
  index: SearchIndexEntry[];
  categories: Record<string, CategoryDef>;
  mapNames: Record<string, string>;
  currentMap: string;
  progress: ProgressMap;
  onPick: (loc: GameLocation) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchLocations(props.index, query, 40), [props.index, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (loc: GameLocation) => {
    props.onPick(loc);
    setQuery('');
  };

  return (
    <div className="sidebar__section search" role="search">
      <label className="visually-hidden" htmlFor="search-input">
        Szukaj przedmiotu, lokacji lub przeciwnika
      </label>
      <input
        id="search-input"
        ref={inputRef}
        className="input search__input"
        type="search"
        placeholder="Szukaj…  ( / )"
        autoComplete="off"
        value={query}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-activedescendant={results[active] ? `sr-${active}` : undefined}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') setQuery('');
        }}
      />
      {query.trim() !== '' && (
        <ul id="search-results" className="search__results" role="listbox" aria-label="Wyniki wyszukiwania">
          {results.length === 0 && <li className="search__empty">Brak wyników</li>}
          {results.map((loc, i) => {
            const found = props.progress[loc.id]?.f === 1;
            return (
              <li
                key={loc.id}
                id={`sr-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search__item${i === active ? ' search__item--active' : ''}${found ? ' search__item--found' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(loc)}
                onMouseEnter={() => setActive(i)}
              >
                <CategoryIcon category={props.categories[loc.category]} muted={found} />
                <span className="search__name">{loc.name}</span>
                <span className="search__meta">
                  {loc.region ?? props.categories[loc.category]?.name}
                  {loc.mapId !== props.currentMap && ` · ${props.mapNames[loc.mapId]}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
