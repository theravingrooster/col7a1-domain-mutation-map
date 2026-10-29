import { GROUPS } from './data-utils.mjs';

export const MAP_WIDTH = 1250;
export const MAP_HEIGHT = 418;
export const MAP_LEFT = 150;
export const MAP_RIGHT = 25;
const TRACK = MAP_WIDTH - MAP_LEFT - MAP_RIGHT;
const BUCKET = 16;
const number = value => String(Math.round(value * 1000) / 1000);

function roundedRect(x, y, width, height) {
  const r = Math.min(1.5, width / 2, height / 2);
  return `M${number(x+r)} ${number(y)}h${number(width-2*r)}q${number(r)} 0 ${number(r)} ${number(r)}v${number(height-2*r)}q0 ${number(r)} ${number(-r)} ${number(r)}h${number(-width+2*r)}q${number(-r)} 0 ${number(-r)} ${number(-r)}v${number(-height+2*r)}q0 ${number(-r)} ${number(r)} ${number(-r)}Z`;
}

function segmentDistanceSquared(x, y, x1, y1, x2, y2) {
  const dx = x2-x1, dy = y2-y1;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy))) : 0;
  return (x-x1-t*dx)**2 + (y-y1-t*dy)**2;
}

// The visible chart is still a vector SVG. Each lane uses a handful of paths,
// instead of a React element and event-handler set for each source marker.
// Record references remain intact; only the drawing commands are batched.
export function buildMapGeometry(markers, view, mode = 'variants') {
  const length = view.end - view.start + 1;
  if (!Number.isFinite(length) || length < 1) throw new RangeError('Invalid protein viewport');
  const x = position => MAP_LEFT + (position-view.start)/length*TRACK;
  const layers = GROUPS.map(group => ({ group, stems: [], heads: [], spans: [], glycine: [], density: [] }));
  const laneByGroup = new Map(GROUPS.map((group, lane) => [group.id, lane]));
  const items = markers.map((marker, paintOrder) => {
    const lane = laneByGroup.get(marker.group);
    if (lane == null) throw new RangeError(`Unknown significance group: ${marker.group}`);
    const base = 64 + lane*48;
    const height = Math.min(39, 8+Math.sqrt(marker.variants.length)*8);
    const cx = x(marker.start), cy = base-height, xEnd = x(marker.end);
    const barWidth = Math.max(1, (marker.end-marker.start+1)/length*TRACK-1.6);
    const right = mode === 'density' ? cx+barWidth : Math.max(cx+5, xEnd);
    return { marker, paintOrder, lane, cx, cy, base, xEnd, barWidth, height,
      left: Math.max(MAP_LEFT, mode === 'density' ? cx : cx-5),
      right: Math.min(MAP_WIDTH-MAP_RIGHT, right), top: mode === 'density' ? cy : cy-5, bottom: base };
  }).sort((a,b) => a.marker.start-b.marker.start || a.lane-b.lane || a.marker.key.localeCompare(b.marker.key));

  const buckets = GROUPS.map(() => new Map());
  for (const [index,item] of items.entries()) {
    item.index = index;
    const { marker, lane, cx, cy, base, xEnd, barWidth, height } = item;
    const layer = layers[lane];
    if (mode === 'density') layer.density.push(roundedRect(cx, cy, barWidth, height));
    else {
      layer.stems.push(`M${number(cx)} ${number(base)}V${number(cy)}`);
      if (marker.end > marker.start) layer.spans.push(`M${number(cx)} ${number(cy)}H${number(xEnd)}`);
      layer.heads.push(`M${number(cx-2.4)} ${number(cy)}a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0Z`);
    }
    if (marker.glycine) layer.glycine.push(`M${number(cx)} ${number(cy-4)}l4 4-4 4-4-4Z`);
    // Long interval markers occupy every crossed bucket, so their horizontal
    // span remains discoverable without scanning all markers on pointer move.
    for (let b=Math.floor(item.left/BUCKET); b<=Math.floor(item.right/BUCKET); b++) {
      const bucket=buckets[lane].get(b);
      if (bucket) bucket.push(item); else buckets[lane].set(b,[item]);
    }
  }
  for (const layer of layers) for (const key of ['stems','heads','spans','glycine','density']) layer[key]=layer[key].join('');

  const visited = new Uint32Array(items.length);
  let query = 0;
  function hitTest(px, py, tolerance = 5) {
    if (!Number.isFinite(px) || !Number.isFinite(py) || px<MAP_LEFT || px>MAP_WIDTH-MAP_RIGHT || py<10 || py>270) return null;
    const radius = Math.max(0, Math.min(10, tolerance));
    const radiusSquared=radius*radius;
    if (++query === 0x100000000) { visited.fill(0); query=1; }
    let nearest=null, best=Infinity;
    for (let lane=0;lane<GROUPS.length;lane++) {
      const base=64+lane*48;
      if (py<base-39-radius || py>base+radius) continue;
      for (let b=Math.floor((px-radius)/BUCKET);b<=Math.floor((px+radius)/BUCKET);b++) {
        for (const item of buckets[lane].get(b) || []) {
          if (visited[item.index]===query) continue;
          visited[item.index]=query;
          let distance;
          if (mode==='density') {
            distance=Math.max(item.cx-px,0,px-item.cx-item.barWidth)**2+Math.max(item.cy-py,0,py-item.base)**2;
          } else {
            distance=Math.min((px-item.cx)**2+(py-item.cy)**2,
              segmentDistanceSquared(px,py,item.cx,item.cy,item.cx,item.base),
              item.marker.end>item.marker.start ? segmentDistanceSquared(px,py,item.cx,item.cy,Math.min(item.xEnd,MAP_WIDTH-MAP_RIGHT),item.cy) : Infinity);
          }
          if (distance<=radiusSquared && (distance<best || distance===best && item.paintOrder>(nearest?.paintOrder ?? -1))) {
            nearest=item; best=distance;
          }
        }
      }
    }
    return nearest;
  }
  // Query a small plotted interval, including spans whose anchors lie outside it.
  // The magnification overlay uses this index rather than scanning every marker.
  function rangeItems(lane, left, right) {
    if (!Number.isInteger(lane) || !buckets[lane] || !Number.isFinite(left) || !Number.isFinite(right) || right < left) return [];
    const lo = Math.max(MAP_LEFT, left), hi = Math.min(MAP_WIDTH - MAP_RIGHT, right);
    if (hi < lo) return [];
    const found = new Set();
    for (let b = Math.floor(lo / BUCKET); b <= Math.floor(hi / BUCKET); b++) {
      for (const item of buckets[lane].get(b) || []) if (item.right >= lo && item.left <= hi) found.add(item);
    }
    return [...found].sort((a, b) => a.index - b.index);
  }
  return { mode, layers, items, hitTest, rangeItems };
}
