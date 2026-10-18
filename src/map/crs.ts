import L from 'leaflet';
import type { MapDef } from '../types';

export const DEFAULT_TILE_SIZE = 256;

/** Zoom level at which one screen pixel equals one pixel of the source image. */
export function nativeZoom(map: MapDef): number {
  if (map.tiles) return map.tiles.maxNativeZoom;
  const tileSize = DEFAULT_TILE_SIZE;
  return Math.max(0, Math.ceil(Math.log2(Math.max(map.width, map.height) / tileSize)));
}

/**
 * CRS in which LatLng(lat, lng) == image pixel (y, x). Location data can therefore use raw
 * pixel coordinates of the full-resolution map image, independent of tiling.
 */
export function createPixelCrs(zoomAtNative: number): L.CRS {
  const f = 1 / 2 ** zoomAtNative;
  return L.Util.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(f, 0, f, 0),
  }) as L.CRS;
}

export function toLatLng(x: number, y: number): L.LatLng {
  return L.latLng(y, x);
}

export function mapBounds(map: MapDef): L.LatLngBounds {
  return L.latLngBounds([0, 0], [map.height, map.width]);
}
