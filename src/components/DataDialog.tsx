import { useState } from 'react';
import type { GameLocation, GameManifest, ProgressMap } from '../types';
import { parseLocationsText, toLocationFile, type ImportResult } from '../data/importers';
import { EDITOR_DATASET_ID, type ImportedDataset } from '../data/localStore';
import { isValidProgressMap } from '../progress/progress';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  manifest: GameManifest;
  mapId: string;
  datasets: ImportedDataset[];
  allLocations: GameLocation[];
  progress: ProgressMap;
  mapImages: Record<string, boolean>;
  onAddDataset: (dataset: ImportedDataset) => Promise<void>;
  onToggleDataset: (id: string, enabled: boolean) => void;
  onDeleteDataset: (id: string) => void;
  onSetMapImage: (mapId: string, file: File | null) => void;
  onImportProgress: (data: ProgressMap) => void;
  onResetProgress: () => void;
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataDialog(props: Props) {
  const { manifest } = props;
  const [defaultMap, setDefaultMap] = useState(props.mapId);
  const [flipY, setFlipY] = useState(false);
  const [scale, setScale] = useState('1');
  const [pending, setPending] = useState<{ name: string; result: ImportResult } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setMessage(null);
    const text = await file.text();
    const map = manifest.maps.find((m) => m.id === defaultMap);
    const result = parseLocationsText(text, file.name, {
      defaultMapId: defaultMap,
      mapIds: manifest.maps.map((m) => m.id),
      categoryIds: manifest.categories.map((c) => c.id),
      flipYHeight: flipY ? map?.height : undefined,
      scale: Number(scale) || 1,
    });
    setPending({ name: file.name, result });
  };

  const confirmImport = async () => {
    if (!pending) return;
    await props.onAddDataset({
      id: `import-${Date.now()}`,
      gameId: manifest.id,
      name: pending.result.meta?.title ?? pending.name,
      importedAt: Date.now(),
      meta: pending.result.meta,
      enabled: true,
      locations: pending.result.locations,
    });
    setMessage(`Zaimportowano ${pending.result.locations.length} lokalizacji.`);
    setPending(null);
  };

  return (
    <Dialog open={props.open} title="Dane mapy i postępów" onClose={props.onClose} wide>
      <div className="data-grid">
        <section>
          <h3>Import lokalizacji</h3>
          <p className="muted small">
            Obsługiwane: JSON w formacie <code>mappzy-locations@1</code>, tablica JSON, GeoJSON (punkty) i CSV z kolumnami{' '}
            <code>id, map, category, name, x, y, description, hints, region, tags, source</code>. Współrzędne to piksele pełnego obrazu mapy (0,0 = lewy górny róg).
          </p>
          <div className="field-row">
            <label className="field">
              <span>Domyślna mapa</span>
              <select className="select" value={defaultMap} onChange={(e) => setDefaultMap(e.target.value)}>
                {manifest.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Skala współrzędnych</span>
              <input className="input" type="number" step="any" min="0" value={scale} onChange={(e) => setScale(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={flipY} onChange={(e) => setFlipY(e.target.checked)} /> Odwróć oś Y (źródło liczy y od dołu)
          </label>
          <label className="btn btn--primary file-btn">
            Wybierz plik…
            <input
              type="file"
              accept=".json,.geojson,.csv,application/json,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </label>

          {pending && (
            <div className="import-report" role="status">
              <p>
                <strong>{pending.name}</strong>: {pending.result.locations.length} poprawnych rekordów, {pending.result.errors.length} błędów,{' '}
                {pending.result.warnings.length} ostrzeżeń.
              </p>
              {pending.result.meta?.license && <p className="small">Licencja źródła: {pending.result.meta.license}</p>}
              {!pending.result.meta?.license && <p className="small warn">Plik nie deklaruje licencji (meta.license). Upewnij się, że możesz legalnie używać tych danych.</p>}
              {[...pending.result.errors, ...pending.result.warnings].length > 0 && (
                <ul className="issues">
                  {pending.result.errors.slice(0, 30).map((e, i) => (
                    <li key={`e${i}`} className="error">
                      Wiersz {e.row}: {e.message}
                    </li>
                  ))}
                  {pending.result.warnings.slice(0, 10).map((w, i) => (
                    <li key={`w${i}`} className="warn">
                      Wiersz {w.row}: {w.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="details__actions">
                <button type="button" className="btn btn--primary" disabled={!pending.result.locations.length} onClick={() => void confirmImport()}>
                  Importuj {pending.result.locations.length}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setPending(null)}>
                  Anuluj
                </button>
              </div>
            </div>
          )}
          {message && <p role="status">{message}</p>}

          <h4>Zaimportowane zestawy</h4>
          {props.datasets.length === 0 ? (
            <p className="muted small">Brak. Do czasu importu wyświetlane są dane wbudowane lub demonstracyjne.</p>
          ) : (
            <ul className="dataset-list">
              {props.datasets.map((d) => (
                <li key={d.id}>
                  <label className="check">
                    <input type="checkbox" checked={d.enabled} onChange={(e) => props.onToggleDataset(d.id, e.target.checked)} />
                    <span>
                      {d.id === EDITOR_DATASET_ID ? 'Moje zmiany (edytor)' : d.name} <span className="muted small">({d.locations.length})</span>
                    </span>
                  </label>
                  <button type="button" className="link-btn" onClick={() => download(`${manifest.id}-${d.id}.json`, toLocationFile(manifest.id, d.locations, d.meta))}>
                    eksport
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => {
                      if (confirm(`Usunąć zestaw „${d.name}”?`)) props.onDeleteDataset(d.id);
                    }}
                  >
                    usuń
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => download(`${manifest.id}-locations.json`, toLocationFile(manifest.id, props.allLocations.filter((l) => !l.demo), { title: `${manifest.name} — eksport` }))}
          >
            Eksportuj wszystkie aktywne lokalizacje
          </button>
        </section>

        <section>
          <h3>Obraz mapy</h3>
          <p className="muted small">
            Repozytorium nie zawiera oryginalnych grafik gry. Możesz wczytać własny obraz mapy (np. złożony ze zrzutów ekranu z Twojej kopii gry). Obraz zostaje tylko w tej
            przeglądarce i jest skalowany do wymiarów mapy. Dla dużych map użyj kafelków: <code>npm run tiles</code>.
          </p>
          <ul className="dataset-list">
            {manifest.maps.map((m) => (
              <li key={m.id}>
                <span>
                  {m.name} <span className="muted small">({m.width}×{m.height})</span>
                </span>
                <label className="link-btn file-btn">
                  {props.mapImages[m.id] ? 'zmień' : 'wczytaj'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) props.onSetMapImage(m.id, f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {props.mapImages[m.id] && (
                  <button type="button" className="link-btn danger" onClick={() => props.onSetMapImage(m.id, null)}>
                    usuń
                  </button>
                )}
              </li>
            ))}
          </ul>

          <h3>Kopia postępów</h3>
          <p className="muted small">Postęp zapisuje się automatycznie w tej przeglądarce (bez konta i serwera). Aby kontynuować na innym urządzeniu, wyeksportuj plik i zaimportuj go tam — wpisy są łączone według daty zmiany, więc nic nie zostanie nadpisane starszym stanem.</p>
          <div className="details__actions">
            <button type="button" className="btn btn--ghost" onClick={() => download(`${manifest.id}-progress.json`, { gameId: manifest.id, progress: props.progress })}>
              Eksportuj postęp
            </button>
            <label className="btn btn--ghost file-btn">
              Importuj postęp…
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const data = JSON.parse(await f.text());
                    const progress = data?.progress ?? data;
                    if (!isValidProgressMap(progress)) throw new Error('Nieprawidłowy plik postępu.');
                    if (data.gameId && data.gameId !== manifest.id) throw new Error(`Plik dotyczy innej gry (${data.gameId}).`);
                    props.onImportProgress(progress);
                    setMessage('Postęp zaimportowany i połączony z bieżącym.');
                  } catch (err) {
                    setMessage((err as Error).message);
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (confirm('Wyzerować cały postęp w tej grze? Tej operacji nie można cofnąć.')) props.onResetProgress();
              }}
            >
              Wyzeruj postęp
            </button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
