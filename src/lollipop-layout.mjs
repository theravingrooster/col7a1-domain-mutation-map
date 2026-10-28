const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function clampPinIndex(index, length) {
  if (!Number.isSafeInteger(length) || length < 1) return -1;
  return clamp(Math.floor(finite(index, 0)), 0, length - 1);
}

/** Source coordinates are preserved; x is the center of the visible anchor's inclusive residue cell. */
export function buildPinGeometry(records, view, width = 1200, options = {}) {
  if (!Number.isSafeInteger(view?.start) || !Number.isSafeInteger(view?.end) || view.start < 1 || view.end < view.start) {
    throw new RangeError('Lollipop coordinates require a valid inclusive protein viewport.');
  }
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Lollipop width must be positive.');
  const left = finite(options.left, width * 164 / 1200);
  const rightMargin = finite(options.right, width * 28 / 1200);
  const right = width - rightMargin;
  if (left < 0 || rightMargin < 0 || right <= left) throw new RangeError('Lollipop margins must leave a visible plotting area.');
  const sorted = records.filter(v => Number.isSafeInteger(v.position) && Number.isSafeInteger(v.end) &&
    v.position >= 1 && v.end >= v.position && v.position <= view.end && v.end >= view.start,
  ).sort((a, b) => a.position - b.position || a.variationId - b.variationId);
  const plotWidth = right - left;
  const length = view.end - view.start + 1;
  const points = sorted.map((record, index) => ({
    index,
    x: left + (Math.max(view.start, record.position) - view.start + .5) / length * plotWidth,
  }));
  return { records: sorted, points, left, right, width, plotWidth, view: { start: view.start, end: view.end } };
}

/** Lower bound keeps ties deterministic: the earliest record wins a dense tie. */
export function findNearestPin(points, x) {
  if (!points?.length) return -1;
  const target = Number.isNaN(Number(x)) ? points[0].x : Number(x);
  let low = 0, high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].x < target) low = middle + 1;
    else high = middle;
  }
  let candidate = low >= points.length ? points.length - 1 : low;
  if (low > 0 && (low === points.length || target - points[low - 1].x <= points[low].x - target)) candidate = low - 1;
  // A target just to the right of coincident pins must use the same tie policy.
  const chosenX = points[candidate].x;
  low = 0; high = candidate;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].x < chosenX) low = middle + 1;
    else high = middle;
  }
  return points[low].index;
}

/**
 * Stable lens positions depend on the anchor index, never the moving pointer.
 * Keep this lens while the pointer remains within left/right and use
 * closestLensPin for the active variant. Re-anchor only on deliberate exit or
 * keyboard navigation; this avoids a target shifting away from the pointer.
 * `end` is exclusive. Non-lens positions optionally compress into context.
 */
export function buildPinLens(model, index, options = {}) {
  const centerIndex = clampPinIndex(index, model?.records?.length ?? 0);
  if (centerIndex < 0) return null;
  const requested = Math.max(1, Math.min(31, Math.floor(finite(options.count, 13))));
  const preferredSpacing = Math.max(1, finite(options.spacing, 28));
  const minimumSpacing = Math.min(preferredSpacing, Math.max(1, finite(options.minSpacing, 22)));
  const capacity = Math.max(1, Math.floor(model.plotWidth / minimumSpacing) + 1);
  const count = Math.min(model.records.length, requested, capacity);
  const start = clamp(centerIndex - Math.floor(count / 2), 0, model.records.length - count);
  const end = start + count;
  const spacing = count > 1 ? Math.min(preferredSpacing, model.plotWidth / (count - 1)) : preferredSpacing;
  const lensWidth = Math.min(model.plotWidth, (count - 1) * spacing);
  const innerLeft = clamp(model.points[centerIndex].x - (centerIndex - start) * spacing, model.left, Math.max(model.left, model.right - lensWidth));
  const innerRight = Math.min(model.right, innerLeft + lensWidth);
  const left = Math.max(model.left, innerLeft - spacing / 2);
  const right = Math.min(model.right, innerRight + spacing / 2);
  const radius = Math.max(1, Math.floor(count / 2));
  const points = Array.from({ length: count }, (_, offset) => {
    const globalIndex = start + offset;
    const distance = Math.abs(globalIndex - centerIndex);
    const influence = Math.max(0, 1 - distance / (radius + 1));
    return { index: globalIndex, x: clamp(innerLeft + offset * spacing, model.left, model.right), distance, scale: 1 + .95 * influence * influence, lift: 8 + 24 * influence * influence };
  });

  const positions = new Float64Array(model.records.length);
  const leftSourceSpan = model.points[start].x - model.left;
  const leftTargetEnd = Math.max(model.left, innerLeft - spacing * .6);
  for (let i = 0; i < start; i += 1) {
    const ratio = leftSourceSpan > 0 ? clamp((model.points[i].x - model.left) / leftSourceSpan, 0, 1) : 0;
    positions[i] = model.left + ratio * (leftTargetEnd - model.left);
  }
  for (const point of points) positions[point.index] = point.x;
  const rightSourceStart = model.points[end - 1].x;
  const rightSourceSpan = model.right - rightSourceStart;
  const rightTargetStart = Math.min(model.right, innerRight + spacing * .6);
  for (let i = end; i < positions.length; i += 1) {
    const ratio = rightSourceSpan > 0 ? clamp((model.points[i].x - rightSourceStart) / rightSourceSpan, 0, 1) : 1;
    positions[i] = rightTargetStart + ratio * (model.right - rightTargetStart);
  }
  return { start, end, centerIndex, left, right, innerLeft, innerRight, spacing, points, positions };
}

/** The returned index always addresses the original sorted geometry.records. */
export function closestLensPin(lens, x) {
  return findNearestPin(lens?.points, x);
}
