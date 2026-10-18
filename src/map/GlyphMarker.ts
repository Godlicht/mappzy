import L from 'leaflet';
import type { CategoryDef, GameLocation, MarkerShape } from '../types';

export interface GlyphState {
  loc: GameLocation;
  category: CategoryDef | undefined;
  found: boolean;
  selected: boolean;
}

/* Leaflet private members used by the canvas renderer. */
interface CanvasInternals {
  _ctx: CanvasRenderingContext2D;
  _drawing: boolean;
}

const FALLBACK: Pick<CategoryDef, 'color' | 'shape'> = { color: '#bbbbbb', shape: 'circle' };

export function tracePath(ctx: CanvasRenderingContext2D | Path2D, shape: MarkerShape, x: number, y: number, r: number) {
  switch (shape) {
    case 'diamond':
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.05, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.05, y);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      break;
    case 'triangle':
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.85);
      ctx.lineTo(x - r * 1.1, y + r * 0.85);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(a) * r * 1.1;
        const py = y + Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.35 : r * 0.55;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    default:
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/**
 * Circle marker whose canvas drawing is replaced by a category shape. Keeps Leaflet's
 * fast canvas hit-testing (radius based) while giving each category a distinct glyph.
 */
export class GlyphMarker extends L.CircleMarker {
  state: GlyphState;

  constructor(latlng: L.LatLngExpression, state: GlyphState, options: L.CircleMarkerOptions) {
    super(latlng, options);
    this.state = state;
  }

  setState(patch: Partial<GlyphState>) {
    this.state = { ...this.state, ...patch };
    this.redraw();
  }

  _updatePath() {
    const self = this as unknown as { _renderer: CanvasInternals; _point: L.Point; _radius: number; _empty(): boolean };
    const renderer = self._renderer;
    if (!renderer._drawing || self._empty()) return;
    const ctx = renderer._ctx;
    const { x, y } = self._point;
    const r = self._radius;
    const { category, found, selected } = this.state;
    const { color, shape } = category ?? FALLBACK;

    ctx.save();
    if (selected) {
      ctx.beginPath();
      ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(243, 210, 122, 0.22)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f3d27a';
      ctx.stroke();
    }

    ctx.beginPath();
    tracePath(ctx, shape, x, y, r);
    ctx.globalAlpha = found ? 0.55 : 1;
    ctx.fillStyle = found ? '#4a4740' : color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = found ? '#8b8476' : 'rgba(10, 8, 6, 0.9)';
    ctx.stroke();

    if (found) {
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y);
      ctx.lineTo(x - r * 0.1, y + r * 0.45);
      ctx.lineTo(x + r * 0.6, y - r * 0.45);
      ctx.lineWidth = Math.max(1.5, r * 0.3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#e9dfc4';
      ctx.stroke();
    }
    ctx.restore();
  }
}
