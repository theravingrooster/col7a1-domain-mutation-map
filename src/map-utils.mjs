import { GROUPS } from './data-utils.mjs';

const GROUP_IDS = GROUPS.map(group => group.id);
const emptyCounts = () => Object.fromEntries(GROUP_IDS.map(id => [id, 0]));
const emptyGroups = () => Object.fromEntries(GROUP_IDS.map(id => [id, []]));
const byPosition = (a, b) => a.position - b.position || a.variationId - b.variationId;

/**
 * A bounded overview of the filtered records. Each overlapping variant is
 * counted once at its reported start, clamped to the viewport's left edge.
 * A long interval is NOT counted again in each bin that it crosses.
 * Domain/interval overlap filtering remains the responsibility of the caller.
 */
export function buildMapBins(variants, view, maxBins = 72) {
  const { start, end } = view || {};
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
    throw new RangeError('A map viewport requires positive, inclusive residue coordinates.');
  }
  const limit = Number.isFinite(maxBins) ? Math.max(1, Math.min(256, Math.floor(maxBins))) : 72;
  const length = end - start + 1;
  const binSize = Math.max(1, Math.ceil(length / limit));
  const binCount = Math.ceil(length / binSize);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index,
    start: start + index * binSize,
    end: Math.min(end, start + (index + 1) * binSize - 1),
    variants: [],
    groups: emptyGroups(),
    counts: emptyCounts(),
    total: 0,
    glycineCount: 0,
  }));
  const totals = emptyCounts();
  const maxCounts = emptyCounts();
  // New arrays only: keep the source archive and caller's filter ordering intact.
  const mapped = variants.filter(variant =>
    Number.isSafeInteger(variant.position) && Number.isSafeInteger(variant.end) &&
    variant.position >= 1 && variant.end >= variant.position &&
    variant.position <= end && variant.end >= start,
  ).sort(byPosition);

  for (const variant of mapped) {
    const index = Math.min(binCount - 1, Math.floor((Math.max(start, variant.position) - start) / binSize));
    const bin = bins[index];
    const group = GROUP_IDS.includes(variant.significanceGroup) ? variant.significanceGroup : 'other';
    bin.variants.push(variant);
    bin.groups[group].push(variant);
    bin.counts[group] += 1;
    bin.total += 1;
    if (variant.glycineSubstitution) bin.glycineCount += 1;
    totals[group] += 1;
    maxCounts[group] = Math.max(maxCounts[group], bin.counts[group]);
  }

  return {
    bins, binSize, totals, maxCounts,
    maxCount: Math.max(0, ...Object.values(maxCounts)),
    mappedCount: mapped.length,
    view: { start, end },
  };
}

/**
 * Map a pointer ratio along the residue axis to a bin. A model argument respects
 * the shorter final bin; a numeric argument supports evenly spaced controls.
 */
export function binIndexAtRatio(ratio, modelOrCount) {
  const raw = Number(ratio);
  const clamped = Math.max(0, Math.min(1, Number.isNaN(raw) ? 0 : raw));
  if (typeof modelOrCount === 'number') {
    const count = Math.max(0, Math.floor(modelOrCount));
    return Number.isFinite(count) && count > 0 ? Math.min(count - 1, Math.floor(clamped * count)) : -1;
  }
  const model = modelOrCount;
  if (!model?.bins?.length) return -1;
  const length = model.view.end - model.view.start + 1;
  return Math.min(model.bins.length - 1, Math.floor(clamped * length / model.binSize));
}

/** Return the already-sorted references for the active bin/lane without copying. */
export function getBinVariants(model, index, group = 'all') {
  const safeIndex = Number.isFinite(index) ? Math.floor(index) : -1;
  const bin = model?.bins?.[safeIndex];
  if (!bin) return [];
  return group === 'all' ? bin.variants : bin.groups[group] || [];
}

/** Zero-based page input; start/end are one-based display positions (0 if empty). */
export function getDockPage(records, page = 0, pageSize = 7) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.min(30, Math.floor(pageSize))) : 7;
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.max(0, Math.min(pages - 1, Number.isFinite(page) ? Math.floor(page) : 0));
  const offset = safePage * size;
  return {
    records: records.slice(offset, offset + size),
    page: safePage,
    pages,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(total, offset + size),
  };
}
