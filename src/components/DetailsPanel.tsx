import { useEffect, useRef, useState } from 'react';
import type { CategoryDef, GameLocation, MapDef } from '../types';
import { CategoryIcon } from './CategoryIcon';

interface Props {
  gameId: string;
  loc: GameLocation;
  categories: CategoryDef[];
  maps: MapDef[];
  found: boolean;
  editMode: boolean;
  isDraft: boolean;
  editorOwned: boolean;
  moving: boolean;
  onToggleFound: () => void;
  onClose: () => void;
  onSave: (loc: GameLocation) => void;
  onDelete: () => void;
  onStartMove: () => void;
}

export function DetailsPanel(props: Props) {
  const { loc, categories, found } = props;
  const category = categories.find((c) => c.id === loc.category);
  const [editing, setEditing] = useState(props.isDraft);
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setEditing(props.isDraft);
    setCopied(false);
    headingRef.current?.focus({ preventScroll: true });
  }, [loc.id, props.isDraft]);

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}${location.search}#/${encodeURIComponent(props.gameId)}/${encodeURIComponent(loc.mapId)}/${encodeURIComponent(loc.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Skopiuj link:', url);
    }
  };

  return (
    <section className="details" aria-labelledby="details-title" role="region">
      <header className="details__header">
        <span className="details__cat" style={{ color: category?.color }}>
          <CategoryIcon category={category} size={18} />
          {category?.name ?? loc.category}
        </span>
        <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Zamknij szczegóły">
          ✕
        </button>
      </header>

      {editing && props.editMode ? (
        <EditForm
          loc={loc}
          categories={categories}
          maps={props.maps}
          isDraft={props.isDraft}
          moving={props.moving}
          onStartMove={props.onStartMove}
          onCancel={() => (props.isDraft ? props.onClose() : setEditing(false))}
          onSave={(l) => {
            props.onSave(l);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <h2 id="details-title" className="details__title" tabIndex={-1} ref={headingRef}>
            {loc.name}
          </h2>
          {loc.region && <p className="details__region">{loc.region}</p>}
          {loc.demo && <p className="badge badge--demo">Dane demonstracyjne — pozycja przybliżona</p>}
          {loc.description && <p className="details__text">{loc.description}</p>}
          {loc.hints && (
            <div className="details__hints">
              <h3>Wskazówki</h3>
              <p>{loc.hints}</p>
            </div>
          )}
          {loc.tags?.length ? (
            <ul className="tags" aria-label="Tagi">
              {loc.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          <dl className="details__meta">
            <dt>Współrzędne</dt>
            <dd>
              {Math.round(loc.x)}, {Math.round(loc.y)}
            </dd>
            {loc.source && (
              <>
                <dt>Źródło</dt>
                <dd>
                  {/^https?:\/\//.test(loc.source) ? (
                    <a href={loc.source} target="_blank" rel="noreferrer noopener">
                      {new URL(loc.source).hostname}
                    </a>
                  ) : (
                    loc.source
                  )}
                </dd>
              </>
            )}
          </dl>
          <div className="details__actions">
            <button type="button" className={`btn ${found ? 'btn--found' : 'btn--primary'}`} aria-pressed={found} onClick={props.onToggleFound}>
              {found ? '✓ Znalezione — cofnij' : 'Oznacz jako znalezione'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={copyLink}>
              {copied ? 'Skopiowano' : 'Link'}
            </button>
            {props.editMode && (
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
                Edytuj
              </button>
            )}
            {props.editMode && props.editorOwned && (
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  if (confirm(`Usunąć „${loc.name}” z danych edytora?`)) props.onDelete();
                }}
              >
                Usuń
              </button>
            )}
          </div>
          <p className="muted small details__tip">Wskazówka: prawy klik na znaczniku przełącza „znalezione”.</p>
        </>
      )}
    </section>
  );
}

function EditForm(props: {
  loc: GameLocation;
  categories: CategoryDef[];
  maps: MapDef[];
  isDraft: boolean;
  moving: boolean;
  onStartMove: () => void;
  onSave: (loc: GameLocation) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(props.loc);
  useEffect(() => setDraft((d) => ({ ...d, x: props.loc.x, y: props.loc.y })), [props.loc.x, props.loc.y]);
  const set = <K extends keyof GameLocation>(k: K, v: GameLocation[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const clean: GameLocation = { ...draft, name: draft.name.trim(), demo: undefined };
        for (const k of ['description', 'hints', 'region', 'source'] as const) if (!clean[k]?.trim()) delete clean[k];
        if (!clean.tags?.length) delete clean.tags;
        delete clean.demo;
        props.onSave(clean);
      }}
    >
      <h2 id="details-title" className="details__title">
        {props.isDraft ? 'Nowy znacznik' : 'Edycja znacznika'}
      </h2>
      <label className="field">
        <span>Nazwa</span>
        <input className="input" required value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Kategoria</span>
        <select className="select" value={draft.category} onChange={(e) => set('category', e.target.value)}>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Region</span>
        <input className="input" value={draft.region ?? ''} onChange={(e) => set('region', e.target.value)} />
      </label>
      <label className="field">
        <span>Opis</span>
        <textarea className="input" rows={3} value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </label>
      <label className="field">
        <span>Wskazówki</span>
        <textarea className="input" rows={2} value={draft.hints ?? ''} onChange={(e) => set('hints', e.target.value)} />
      </label>
      <label className="field">
        <span>Tagi (oddzielone przecinkami)</span>
        <input
          className="input"
          value={draft.tags?.join(', ') ?? ''}
          onChange={(e) =>
            set(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
      <label className="field">
        <span>Źródło (URL lub opis)</span>
        <input className="input" value={draft.source ?? ''} onChange={(e) => set('source', e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>x</span>
          <input className="input" type="number" value={Math.round(draft.x)} onChange={(e) => set('x', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>y</span>
          <input className="input" type="number" value={Math.round(draft.y)} onChange={(e) => set('y', Number(e.target.value))} />
        </label>
        <button type="button" className={`btn btn--ghost${props.moving ? ' btn--on' : ''}`} onClick={props.onStartMove}>
          {props.moving ? 'Kliknij mapę…' : 'Wskaż na mapie'}
        </button>
      </div>
      <p className="muted small">Id: {draft.id}</p>
      <div className="details__actions">
        <button type="submit" className="btn btn--primary">
          Zapisz
        </button>
        <button type="button" className="btn btn--ghost" onClick={props.onCancel}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
