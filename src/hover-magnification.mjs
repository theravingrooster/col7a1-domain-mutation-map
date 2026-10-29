import { MAP_LEFT, MAP_RIGHT, MAP_WIDTH } from './map-render.mjs';

export const MAGNIFICATION_RADIUS = 60;
const BAND_PADDING = 7;
const number = value => String(Math.round(value * 1000) / 1000);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Smooth compact wave: only size and height vary; reported x positions never do. */
export function magnificationWeight(distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) >= MAGNIFICATION_RADIUS) return 0;
  return (1 + Math.cos(Math.PI * distance / MAGNIFICATION_RADIUS)) / 2;
}

/**
 * Replacement artwork for one small lane interval. The base SVG masks only this
 * band, then the overlay redraws every intersecting shape; no marker is dropped.
 */
export function computeFocus(geometry, activeItem, pointerX = activeItem?.cx) {
  if (!activeItem || geometry.mode === 'density' || !Number.isFinite(pointerX)) return null;
  const centerX = clamp(pointerX, MAP_LEFT, MAP_WIDTH - MAP_RIGHT);
  const left = Math.max(MAP_LEFT, centerX - MAGNIFICATION_RADIUS - BAND_PADDING);
  const right = Math.min(MAP_WIDTH - MAP_RIGHT, centerX + MAGNIFICATION_RADIUS + BAND_PADDING);
  const band = { x: left, y: activeItem.base - 47.5, width: right - left, height: 48 };
  const items = geometry.rangeItems(activeItem.lane, left, right).map(source => {
    const weight = magnificationWeight(source.cx - centerX);
    const height = source.height + (40 - source.height) * weight;
    return {
      source, marker: source.marker, index: source.index, lane: source.lane,
      cx: source.cx, cy: source.base - height, base: source.base, xEnd: source.xEnd,
      // Interval endpoints stay on their original horizontal line so the
      // replacement joins the untouched tail continuously at the band edge.
      spanCy: source.cy,
      height, radius: 2.4 + 3.6 * weight, diamondRadius: 4 + 3 * weight,
      glycine: source.marker.glycine, weight,
    };
  });
  const paths = { stems: [], heads: [], spans: [], glycine: [] };
  for (const item of items) {
    const { cx, cy, base, xEnd, spanCy, radius, diamondRadius, marker } = item;
    paths.stems.push(`M${number(cx)} ${number(base)}V${number(cy)}`);
    paths.heads.push(`M${number(cx-radius)} ${number(cy)}a${number(radius)} ${number(radius)} 0 1 0 ${number(radius*2)} 0a${number(radius)} ${number(radius)} 0 1 0 ${number(-radius*2)} 0Z`);
    if (marker.end > marker.start) paths.spans.push(`M${number(cx)} ${number(spanCy)}H${number(xEnd)}`);
    if (marker.glycine) paths.glycine.push(`M${number(cx)} ${number(cy-diamondRadius)}l${number(diamondRadius)} ${number(diamondRadius)} ${number(-diamondRadius)} ${number(diamondRadius)} ${number(-diamondRadius)} ${number(-diamondRadius)}Z`);
  }
  for (const name of Object.keys(paths)) paths[name] = paths[name].join('');
  return { items, paths, band, centerX, lane: activeItem.lane,
    active: items.find(item => item.source === activeItem) || null };
}

function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2-x1, dy = y2-y1;
  const t = dx || dy ? clamp(((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy), 0, 1) : 0;
  return Math.hypot(x-x1-t*dx, y-y1-t*dy);
}

/** Resolve the enlarged drawing back to the original immutable marker item. */
export function hitFocus(focus, x, y, tolerance = 5) {
  if (!focus || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { band } = focus;
  if (x < band.x || x > band.x + band.width || y < band.y || y > band.y + band.height) return null;
  const extra = clamp(Number.isFinite(tolerance) ? tolerance : 5, 0, 10);
  let nearest = null, bestDistance = Infinity, bestX = Infinity, bestCenter = Infinity;
  for (const item of focus.items) {
    const center = Math.hypot(x - item.cx, y - item.cy);
    const distance = Math.min(
      Math.max(0, center - item.radius),
      segmentDistance(x, y, item.cx, item.cy, item.cx, item.base),
      item.marker.end > item.marker.start ? segmentDistance(x, y, item.cx, item.spanCy, Math.min(item.xEnd, MAP_WIDTH - MAP_RIGHT), item.spanCy) : Infinity,
      item.glycine ? Math.max(0, (Math.abs(x-item.cx)+Math.abs(y-item.cy)-item.diamondRadius)/Math.SQRT2) : Infinity,
    );
    const dx = Math.abs(x - item.cx);
    if (distance > extra) continue;
    if (distance < bestDistance || (distance === bestDistance && (dx < bestX || (dx === bestX && (center < bestCenter || (center === bestCenter && item.source.paintOrder > (nearest?.paintOrder ?? -1))))))) {
      nearest = item.source; bestDistance = distance; bestX = dx; bestCenter = center;
    }
  }
  return nearest;
}
