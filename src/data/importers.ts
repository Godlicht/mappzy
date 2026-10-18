import { LOCATION_FILE_FORMAT, type GameLocation, type LocationFile, type LocationFileMeta } from '../types';

/**
 * Parsers that turn community / hand-made data into `GameLocation` records.
 * Supported inputs:
 *  - mappzy JSON (`{ format: "mappzy-locations@1", locations: [...] }`)
 *  - a plain JSON array of location objects
 *  - GeoJSON FeatureCollection with Point features (coordinates = [x, y] in image pixels)
 *  - CSV with a header row (see FIELD_ALIASES for accepted column names)
 */

export interface ImportOptions {
  /** Map used when a record has no mapId. */
  defaultMapId?: string;
  /** Known map ids; records pointing elsewhere are rejected. */
  mapIds?: readonly string[];
  /** Known category ids; unknown categories are rejected. */
  categoryIds?: readonly string[];
  /** Optional mapping from foreign category names to category ids. */
  categoryAliases?: Record<string, string>;
  /** Flip the y axis (for sources whose origin is bottom-left): y' = flipYHeight - y. */
  flipYHeight?: number;
  /** Linear transform applied to the raw coordinates: x' = x * scale + offsetX. */
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ImportResult {
  locations: GameLocation[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  meta?: LocationFileMeta;
}

const FIELD_ALIASES: Record<keyof GameLocation, string[]> = {
  id: ['id', 'uid', 'key'],
  mapId: ['mapid', 'map', 'map_id', 'layer'],
  category: ['category', 'cat', 'type', 'kategoria'],
  name: ['name', 'title', 'nazwa'],
  x: ['x', 'px', 'lng', 'lon'],
  y: ['y', 'py', 'lat'],
  description: ['description', 'desc', 'opis'],
  hints: ['hints', 'hint', 'notes', 'wskazowki', 'wskazówki'],
  region: ['region', 'area', 'zone'],
  tags: ['tags'],
  source: ['source', 'url', 'zrodlo', 'źródło'],
  demo: ['demo'],
};

export function parseLocationsText(text: string, fileName: string, options: ImportOptions = {}): ImportResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[') || /\.(geo)?json$/i.test(fileName);
  if (looksJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return { locations: [], errors: [{ row: 0, message: `Niepoprawny JSON: ${(e as Error).message}` }], warnings: [] };
    }
    return parseLocationsJson(parsed, options);
  }
  return parseLocationsCsv(trimmed, options);
}

export function parseLocationsJson(data: unknown, options: ImportOptions = {}): ImportResult {
  if (Array.isArray(data)) return normalizeRecords(data, options);
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      return normalizeRecords(obj.features.map(featureToRecord), options);
    }
    if (Array.isArray(obj.locations)) {
      if (obj.format !== undefined && obj.format !== LOCATION_FILE_FORMAT) {
        return {
          locations: [],
          errors: [{ row: 0, message: `Nieobsługiwany format pliku: ${String(obj.format)}` }],
          warnings: [],
        };
      }
      const defaultMapId = typeof obj.mapId === 'string' ? obj.mapId : options.defaultMapId;
      const result = normalizeRecords(obj.locations, { ...options, defaultMapId });
      const meta = obj.meta && typeof obj.meta === 'object' ? (obj.meta as LocationFileMeta) : undefined;
      if (meta?.demo) result.locations.forEach((l) => (l.demo = true));
      return { ...result, meta };
    }
  }
  return {
    locations: [],
    errors: [{ row: 0, message: 'Nie rozpoznano struktury pliku (oczekiwano tablicy, GeoJSON lub formatu mappzy).' }],
    warnings: [],
  };
}

function featureToRecord(feature: unknown): unknown {
  if (!feature || typeof feature !== 'object') return feature;
  const f = feature as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown>; id?: unknown };
  const coords = f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : [];
  return { id: f.id, ...f.properties, x: coords[0], y: coords[1] };
}

export function parseLocationsCsv(text: string, options: ImportOptions = {}): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { locations: [], errors: [{ row: 0, message: 'Plik CSV musi zawierać nagłówek i co najmniej jeden wiersz.' }], warnings: [] };
  }
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = r[i] ?? ''));
    return rec;
  });
  return normalizeRecords(records, options, 2);
}

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF). Detects `;` delimiters. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pick(rec: Record<string, unknown>, key: keyof GameLocation): unknown {
  for (const alias of FIELD_ALIASES[key]) {
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === alias && rec[k] !== undefined && rec[k] !== '') return rec[k];
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeRecords(records: unknown[], options: ImportOptions, firstRow = 1): ImportResult {
  const locations: GameLocation[] = [];
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const seen = new Set<string>();
  const aliases = Object.fromEntries(
    Object.entries(options.categoryAliases ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const scale = options.scale ?? 1;

  records.forEach((raw, index) => {
    const row = index + firstRow;
    if (!raw || typeof raw !== 'object') {
      errors.push({ row, message: 'Rekord nie jest obiektem.' });
      return;
    }
    const rec = raw as Record<string, unknown>;
    const name = str(pick(rec, 'name'));
    let category = str(pick(rec, 'category'));
    const mapId = str(pick(rec, 'mapId')) ?? options.defaultMapId;
    let x = num(pick(rec, 'x'));
    let y = num(pick(rec, 'y'));

    if (!name) return void errors.push({ row, message: 'Brak nazwy (name).' });
    if (x === undefined || y === undefined) return void errors.push({ row, message: `"${name}": brak lub niepoprawne współrzędne x/y.` });
    if (!mapId) return void errors.push({ row, message: `"${name}": brak mapId.` });
    if (options.mapIds && !options.mapIds.includes(mapId)) {
      return void errors.push({ row, message: `"${name}": nieznana mapa "${mapId}".` });
    }
    if (category && aliases[category.toLowerCase()]) category = aliases[category.toLowerCase()];
    if (!category) return void errors.push({ row, message: `"${name}": brak kategorii.` });
    if (options.categoryIds && !options.categoryIds.includes(category)) {
      return void errors.push({ row, message: `"${name}": nieznana kategoria "${category}".` });
    }

    if (options.flipYHeight !== undefined) y = options.flipYHeight - y;
    x = x * scale + (options.offsetX ?? 0);
    y = y * scale + (options.offsetY ?? 0);

    let id = str(pick(rec, 'id'));
    if (!id) {
      id = `${mapId}:${category}:${slugify(name)}:${Math.round(x)}-${Math.round(y)}`;
      warnings.push({ row, message: `"${name}": brak id — wygenerowano "${id}". Nadaj stałe id, aby postępy były trwałe.` });
    }
    if (seen.has(id)) return void errors.push({ row, message: `Zduplikowane id "${id}".` });
    seen.add(id);

    const tagsRaw = pick(rec, 'tags');
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map(String)
      : typeof tagsRaw === 'string'
        ? tagsRaw.split(/[|,]/).map((t) => t.trim()).filter(Boolean)
        : undefined;

    const demoRaw = pick(rec, 'demo');
    const loc: GameLocation = {
      id,
      mapId,
      category,
      name,
      x,
      y,
      description: str(pick(rec, 'description')),
      hints: str(pick(rec, 'hints')),
      region: str(pick(rec, 'region')),
      tags: tags?.length ? tags : undefined,
      source: str(pick(rec, 'source')),
      demo: demoRaw === true || demoRaw === 'true' || demoRaw === '1' ? true : undefined,
    };
    for (const k of Object.keys(loc) as (keyof GameLocation)[]) if (loc[k] === undefined) delete loc[k];
    locations.push(loc);
  });

  return { locations, errors, warnings };
}

export function toLocationFile(gameId: string, locations: GameLocation[], meta?: LocationFileMeta): LocationFile {
  return {
    format: LOCATION_FILE_FORMAT,
    gameId,
    meta: { ...meta, generatedAt: new Date().toISOString() },
    locations,
  };
}
