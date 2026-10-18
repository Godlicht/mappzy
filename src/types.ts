/**
 * Data model shared by the web app and the CLI scripts.
 *
 * Coordinates of every location are expressed in pixels of the map's full-resolution
 * source image: x grows to the right, y grows downwards, (0,0) is the top-left corner.
 * This keeps location data independent from the tiling / zoom configuration.
 */

export type MarkerShape = 'circle' | 'diamond' | 'square' | 'triangle' | 'star' | 'hex';

export interface CategoryDef {
  id: string;
  name: string;
  /** Category group used to organise the sidebar (e.g. "Przedmioty"). */
  group?: string;
  color: string;
  shape: MarkerShape;
  description?: string;
}

export interface TileSource {
  /** Leaflet URL template, relative to the manifest file, e.g. "maps/lands-between/tiles/{z}/{y}/{x}.webp". */
  url: string;
  tileSize?: number;
  /** Zoom level at which tiles have the native resolution of the source image. */
  maxNativeZoom: number;
  minNativeZoom?: number;
}

export interface MapLabel {
  name: string;
  x: number;
  y: number;
  /** 1 = major region, 2 = sub-region. */
  level?: 1 | 2;
}

export interface MapDef {
  id: string;
  name: string;
  /** Size of the full-resolution source image in pixels. */
  width: number;
  height: number;
  tiles?: TileSource;
  /** Single image alternative to tiles (fine for images up to ~8k px). */
  image?: { url: string };
  /** Location files (relative to the manifest) containing real data. */
  locations?: string[];
  /** Demo files: shown only when no real data and no imported data exist for this map. */
  demoLocations?: string[];
  labels?: MapLabel[];
  attribution?: string;
}

export interface GameManifest {
  id: string;
  name: string;
  shortName?: string;
  description?: string;
  /** Free-form legal note displayed in the "O danych" dialog. */
  legal?: string;
  theme?: { accent?: string };
  categories: CategoryDef[];
  maps: MapDef[];
}

export interface GameIndexEntry {
  id: string;
  name: string;
  manifest: string;
  description?: string;
}

export interface GameIndex {
  games: GameIndexEntry[];
}

export interface GameLocation {
  /** Stable, unique (per game) identifier. Progress is stored against it, so never reuse ids. */
  id: string;
  mapId: string;
  category: string;
  name: string;
  x: number;
  y: number;
  description?: string;
  hints?: string;
  region?: string;
  tags?: string[];
  /** Where the information comes from (URL or short attribution). */
  source?: string;
  /** Set on demo records so the UI can warn the user. */
  demo?: boolean;
}

export const LOCATION_FILE_FORMAT = 'mappzy-locations@1';

export interface LocationFileMeta {
  title?: string;
  source?: string;
  license?: string;
  demo?: boolean;
  generatedAt?: string;
}

export interface LocationFile {
  format: typeof LOCATION_FILE_FORMAT;
  gameId: string;
  /** Default mapId for records that do not define one. */
  mapId?: string;
  meta?: LocationFileMeta;
  locations: GameLocation[];
}

/** One progress entry: `f` = found flag, `t` = last change timestamp (ms). */
export interface ProgressEntry {
  f: 0 | 1;
  t: number;
}

export type ProgressMap = Record<string, ProgressEntry>;
