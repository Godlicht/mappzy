import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CategoryDef, GameLocation, MapDef, ProgressMap } from '../types';
import { createPixelCrs, mapBounds, nativeZoom, toLatLng, DEFAULT_TILE_SIZE } from './crs';
import { GlyphMarker } from './GlyphMarker';
import { createPlaceholderLayer } from './placeholderLayer';

export interface FocusRequest {
  id: string;
  nonce: number;
}

interface Props {
  mapDef: MapDef;
  baseUrl: string;
  /** Object URL of a user-imported map image (overrides bundled tiles/image). */
  overlayUrl?: string | null;
  categories: Record<string, CategoryDef>;
  locations: GameLocation[];
  progress: ProgressMap;
  selectedId: string | null;
  focus: FocusRequest | null;
  placing: boolean;
  showCoords: boolean;
  onSelect: (id: string | null) => void;
  onToggleFound: (id: string) => void;
  onPlace: (x: number, y: number) => void;
}

export function MapView(props: Props) {
  const { mapDef, baseUrl, overlayUrl, categories, locations, progress, selectedId, focus, placing, showCoords } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const markersRef = useRef<Map<string, GlyphMarker>>(new Map());
  const rendererRef = useRef<L.Canvas | null>(null);
  const radiusRef = useRef(7.5);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [mapReady, setMapReady] = useState(0);

  // (Re)create the Leaflet map whenever the map definition or its background changes.
  useEffect(() => {
    const el = containerRef.current!;
    const zN = nativeZoom(mapDef);
    const bounds = mapBounds(mapDef);
    const map = L.map(el, {
      crs: createPixelCrs(zN),
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxZoom: zN + 2,
      minZoom: 0,
      maxBounds: bounds.pad(0.25),
      maxBoundsViscosity: 0.8,
      attributionControl: true,
      zoomControl: false,
      preferCanvas: true,
      keyboard: true,
    });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Przybliż', zoomOutTitle: 'Oddal' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    if (overlayUrl) {
      L.imageOverlay(overlayUrl, bounds, { attribution: 'Obraz mapy zaimportowany przez użytkownika' }).addTo(map);
    } else if (mapDef.tiles) {
      L.tileLayer(new URL(mapDef.tiles.url, baseUrl).toString(), {
        tileSize: mapDef.tiles.tileSize ?? DEFAULT_TILE_SIZE,
        maxNativeZoom: mapDef.tiles.maxNativeZoom,
        minNativeZoom: mapDef.tiles.minNativeZoom ?? 0,
        noWrap: true,
        bounds,
        attribution: mapDef.attribution,
      }).addTo(map);
    } else if (mapDef.image) {
      L.imageOverlay(new URL(mapDef.image.url, baseUrl).toString(), bounds, { attribution: mapDef.attribution }).addTo(map);
    } else {
      createPlaceholderLayer(mapDef, zN).addTo(map);
    }

    const fitZoom = map.getBoundsZoom(bounds, false);
    map.setMinZoom(Math.max(0, Math.floor((fitZoom - 0.75) * 4) / 4));
    map.fitBounds(bounds);

    const labelPane = map.createPane('labels');
    labelPane.style.zIndex = '350';
    labelPane.style.pointerEvents = 'none';
    for (const label of mapDef.labels ?? []) {
      L.marker(toLatLng(label.x, label.y), {
        pane: 'labels',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: `region-label region-label--l${label.level ?? 1}`,
          html: `<span>${escapeHtml(label.name)}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(map);
    }

    const renderer = L.canvas({ padding: 0.3, tolerance: L.Browser.mobile ? 10 : 3 });
    const group = L.featureGroup().addTo(map);
    const tooltip = L.tooltip({ direction: 'top', offset: [0, -10], className: 'marker-tooltip' });
    group.on('mouseover', (e) => {
      const m = e.propagatedFrom as GlyphMarker;
      tooltip.setLatLng(m.getLatLng()).setContent(escapeHtml(m.state.loc.name));
      map.openTooltip(tooltip);
    });
    group.on('mouseout', () => map.closeTooltip(tooltip));
    group.on('click', (e) => {
      L.DomEvent.stop(e);
      callbacks.current.onSelect((e.propagatedFrom as GlyphMarker).state.loc.id);
    });
    group.on('contextmenu', (e) => {
      L.DomEvent.stop(e);
      callbacks.current.onToggleFound((e.propagatedFrom as GlyphMarker).state.loc.id);
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (callbacks.current.placing) callbacks.current.onPlace(Math.round(e.latlng.lng), Math.round(e.latlng.lat));
      else callbacks.current.onSelect(null);
    });
    map.on('mousemove', (e: L.LeafletMouseEvent) => setCursor({ x: Math.round(e.latlng.lng), y: Math.round(e.latlng.lat) }));
    map.on('mouseout', () => setCursor(null));

    const updateZoomClass = () => {
      const z = map.getZoom();
      el.classList.toggle('zoom-far', z < zN - 3.5);
      el.classList.toggle('zoom-near', z >= zN - 1.5);
      const radius = z < zN - 3.5 ? 4.5 : z < zN - 2 ? 6 : 7.5;
      radiusRef.current = radius;
      markersRef.current.forEach((m) => m.getRadius() !== radius && m.setRadius(radius));
    };
    map.on('zoomend', updateZoomClass);
    updateZoomClass();

    rendererRef.current = renderer;
    mapRef.current = map;
    groupRef.current = group;
    markersRef.current = new Map();
    setMapReady((n) => n + 1);

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
      rendererRef.current = null;
      markersRef.current = new Map();
    };
  }, [mapDef, baseUrl, overlayUrl]);

  // Diff markers against the visible locations instead of rebuilding everything.
  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;
    const radius = radiusRef.current;
    const markers = markersRef.current;
    const wanted = new Set<string>();
    const progressNow = callbacks.current.progress;
    const selectedNow = callbacks.current.selectedId;
    const map = mapRef.current;
    // Detaching the group during big updates avoids per-marker projection and redraw work.
    const bulk = map && Math.abs(locations.length - markers.size) > 300;
    if (bulk) map.removeLayer(group);
    for (const loc of locations) {
      wanted.add(loc.id);
      const existing = markers.get(loc.id);
      if (existing && existing.state.loc === loc) continue;
      if (existing) group.removeLayer(existing);
      const marker = new GlyphMarker(
        toLatLng(loc.x, loc.y),
        { loc, category: categories[loc.category], found: progressNow[loc.id]?.f === 1, selected: loc.id === selectedNow },
        { renderer, radius, bubblingMouseEvents: true },
      );
      markers.set(loc.id, marker);
      group.addLayer(marker);
    }
    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        group.removeLayer(marker);
        markers.delete(id);
      }
    }
    if (bulk) map.addLayer(group);
    markers.get(selectedNow ?? '')?.bringToFront();
  }, [locations, categories, mapReady]);

  useEffect(() => {
    for (const marker of markersRef.current.values()) {
      const found = progress[marker.state.loc.id]?.f === 1;
      if (marker.state.found !== found) marker.setState({ found });
    }
  }, [progress, mapReady, locations]);

  useEffect(() => {
    for (const marker of markersRef.current.values()) {
      const selected = marker.state.loc.id === selectedId;
      if (marker.state.selected !== selected) {
        marker.setState({ selected });
        if (selected) marker.bringToFront();
      }
    }
  }, [selectedId, mapReady, locations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const marker = markersRef.current.get(focus.id);
    if (!marker) return;
    const zN = nativeZoom(mapDef);
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), zN - 1.5), { duration: 0.6 });
  }, [focus, mapDef, mapReady]);

  return (
    <div className={`map-wrap${placing ? ' map-wrap--placing' : ''}`}>
      <div ref={containerRef} className="map" role="application" aria-label={`Mapa: ${mapDef.name}`} />
      {(showCoords || placing) && cursor && (
        <div className="map-coords" aria-hidden="true">
          x {cursor.x} · y {cursor.y}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
