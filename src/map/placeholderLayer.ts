import L from 'leaflet';
import type { MapDef } from '../types';

/**
 * Procedural background used until a legally obtained map image is imported.
 * Draws a coordinate grid in source-image pixels so data can be positioned and checked.
 */
export function createPlaceholderLayer(map: MapDef, zoomAtNative: number): L.GridLayer {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords) {
      const size = this.getTileSize() as L.Point;
      const canvas = document.createElement('canvas');
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext('2d')!;
      const scale = 2 ** (zoomAtNative - coords.z); // source px per tile px
      const x0 = coords.x * size.x * scale;
      const y0 = coords.y * size.y * scale;
      const span = size.x * scale;

      ctx.fillStyle = '#0d0c0a';
      ctx.fillRect(0, 0, size.x, size.y);
      const ix0 = Math.max(0, (0 - x0) / scale);
      const iy0 = Math.max(0, (0 - y0) / scale);
      const ix1 = Math.min(size.x, (map.width - x0) / scale);
      const iy1 = Math.min(size.y, (map.height - y0) / scale);
      if (ix1 <= ix0 || iy1 <= iy0) return canvas;

      const grad = ctx.createRadialGradient(size.x / 2, size.y / 2, 10, size.x / 2, size.y / 2, size.x);
      grad.addColorStop(0, '#24201a');
      grad.addColorStop(1, '#1b1814');
      ctx.fillStyle = grad;
      ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);

      const step = pickStep(scale);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix0, iy0, ix1 - ix0, iy1 - iy0);
      ctx.clip();
      for (const [s, alpha] of [[step, 0.08], [step * 4, 0.18]] as const) {
        ctx.strokeStyle = `rgba(212, 178, 106, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = Math.ceil(x0 / s) * s; gx <= x0 + span; gx += s) {
          const px = Math.round((gx - x0) / scale) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, size.y);
        }
        for (let gy = Math.ceil(y0 / s) * s; gy <= y0 + span; gy += s) {
          const py = Math.round((gy - y0) / scale) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(size.x, py);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(212, 178, 106, 0.35)';
      ctx.font = '10px ui-monospace, monospace';
      const major = step * 4;
      for (let gx = Math.ceil(x0 / major) * major; gx < x0 + span; gx += major) {
        for (let gy = Math.ceil(y0 / major) * major; gy < y0 + span; gy += major) {
          if (gx > map.width || gy > map.height) continue;
          ctx.fillText(`${gx},${gy}`, (gx - x0) / scale + 3, (gy - y0) / scale + 11);
        }
      }
      ctx.restore();
      return canvas;
    },
  }) as unknown as new (options: L.GridLayerOptions) => L.GridLayer;
  return new Layer({ noWrap: true, bounds: L.latLngBounds([0, 0], [map.height, map.width]) });
}

function pickStep(scale: number): number {
  const target = 64 * scale;
  const steps = [32, 64, 128, 256, 512, 1024, 2048];
  return steps.find((s) => s >= target) ?? 4096;
}
