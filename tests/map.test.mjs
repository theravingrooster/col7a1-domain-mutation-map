import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROUPS, filterVariants, overlaps } from '../src/data-utils.mjs';
import { DEFAULT_FILTERS } from '../src/research-utils.mjs';
import { buildMapBins, binIndexAtRatio, getBinVariants, getDockPage } from '../src/map-utils.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/domain-map.json', import.meta.url)));
const fullView = { start: 1, end: data.protein.length };
const record = (variationId, position, end = position, significanceGroup = 'pathogenic') => ({
  variationId, position, end, significanceGroup, glycineSubstitution: false,
});

test('bounded map bins account for all 4,268 mapped records once and preserve every classification', () => {
  const originalOrder = data.variants.map(v => v.variationId);
  const model = buildMapBins(data.variants, fullView);
  assert(model.bins.length <= 72);
  assert.equal(model.bins[0].start, 1);
  assert.equal(model.bins.at(-1).end, 2944);
  assert.equal(model.mappedCount, 4268);
  assert.equal(model.bins.reduce((n, b) => n + b.total, 0), 4268);
  assert.equal(new Set(model.bins.flatMap(b => b.variants.map(v => v.variationId))).size, 4268);
  assert.equal(model.bins.reduce((n, b) => n + b.glycineCount, 0), 479);
  assert.deepEqual(data.variants.map(v => v.variationId), originalOrder);
  for (const group of GROUPS) {
    const expected = data.variants.filter(v => v.position != null && v.significanceGroup === group.id).length;
    assert.equal(model.totals[group.id], expected);
    assert.equal(model.bins.reduce((n, b) => n + b.counts[group.id], 0), expected);
    assert.equal(model.maxCounts[group.id], Math.max(...model.bins.map(b => b.counts[group.id])));
    assert(model.bins.every(b => b.groups[group.id].every(v => v.significanceGroup === group.id)));
  }
  assert.equal(model.maxCount, Math.max(...Object.values(model.maxCounts)));
});

test('viewport overlap counts long intervals once at the clipped anchor and excludes unmapped records', () => {
  const records = [record(1, 100, 200), record(2, 149), record(3, 150), record(4, 160), record(5, 161), record(6, null, null)];
  const model = buildMapBins(records, { start: 150, end: 160 }, 4);
  assert.equal(model.mappedCount, 3);
  assert.deepEqual(model.bins[0].variants.map(v => v.variationId), [1, 3]);
  assert.deepEqual(model.bins.at(-1).variants.map(v => v.variationId), [4]);
  assert.equal(model.bins[0].variants[0].position, 100, 'Keep original coordinates in the dock');
  assert.equal(model.bins[0].variants[0].end, 200);
  assert.equal(model.bins.at(-1).start, 159);
  assert.equal(model.bins.at(-1).end, 160);
});

test('one-residue view keeps all variants overlapping the residue and has valid pointer mapping', () => {
  const view = { start: 2798, end: 2798 };
  const expected = data.variants.filter(v => overlaps(v, view));
  const model = buildMapBins(data.variants, view);
  assert.equal(model.bins.length, 1);
  assert.equal(model.binSize, 1);
  assert.equal(model.mappedCount, expected.length);
  assert(model.bins[0].variants.some(v => v.variationId === 17423));
  for (const ratio of [-1, 0, .5, 1, 10, NaN]) assert.equal(binIndexAtRatio(ratio, model), 0);
});

test('pointer-to-bin mapping respects real residue boundaries including a short final bin', () => {
  const model = buildMapBins([], { start: 10, end: 20 }, 4); // lengths 3,3,3,2
  assert.equal(model.bins.length, 4);
  assert.equal(binIndexAtRatio(-.2, model), 0);
  assert.equal(binIndexAtRatio(2.99 / 11, model), 0);
  assert.equal(binIndexAtRatio(3 / 11, model), 1);
  assert.equal(binIndexAtRatio(6 / 11, model), 2);
  assert.equal(binIndexAtRatio(9 / 11, model), 3);
  assert.equal(binIndexAtRatio(1, model), 3);
  assert.equal(binIndexAtRatio(Infinity, model), 3);
  assert.equal(binIndexAtRatio(NaN, model), 0);
  assert.equal(binIndexAtRatio(.5, 4), 2);
  assert.equal(binIndexAtRatio(1, 4), 3);
  assert.equal(binIndexAtRatio(.5, 0), -1);
});

test('filtered overview matches the current result set without reintroducing excluded classifications', () => {
  const filters = { ...DEFAULT_FILTERS, groups: ['pathogenic'], glycine: true, minReview: '2' };
  const variants = filterVariants(data.variants, filters);
  const model = buildMapBins(variants, { start: 1254, end: 2784 });
  assert.equal(model.mappedCount, variants.length);
  assert.equal(model.totals.pathogenic, variants.length);
  assert.equal(model.totals.uncertain, 0);
  assert(model.bins.every(b => b.glycineCount === b.total));
  const empty = buildMapBins(filterVariants(data.variants, { ...DEFAULT_FILTERS, groups: [] }), fullView);
  assert.equal(empty.mappedCount, 0);
  assert.equal(empty.maxCount, 0);
  assert(empty.bins.length > 0);
});

test('dock records sort stably by original protein position then ID and paginate without loss', () => {
  const records = [record(8, 4), record(9, 3), record(2, 4), record(1, 2, 2, 'benign')];
  const model = buildMapBins(records, { start: 1, end: 10 }, 1);
  const all = getBinVariants(model, 0);
  assert.deepEqual(all.map(v => v.variationId), [1, 9, 2, 8]);
  assert.deepEqual(getBinVariants(model, 0, 'pathogenic').map(v => v.variationId), [9, 2, 8]);
  assert.deepEqual(getBinVariants(model, -1), []);
  assert.deepEqual(getBinVariants(model, 0, 'bogus'), []);
  const first = getDockPage(all, 0, 3), last = getDockPage(all, 99, 3);
  assert.deepEqual(first.records.map(v => v.variationId), [1, 9, 2]);
  assert.equal(first.page, 0); assert.equal(first.pages, 2); assert.equal(first.start, 1); assert.equal(first.end, 3);
  assert.deepEqual(last.records.map(v => v.variationId), [8]);
  assert.equal(last.page, 1); assert.equal(last.start, 4); assert.equal(last.end, 4);
  assert.equal(getDockPage(all, -3).page, 0);
  assert.deepEqual(getDockPage([], 99), { records: [], page: 0, pages: 1, total: 0, start: 0, end: 0 });
  assert.deepEqual(records.map(v => v.variationId), [8, 9, 2, 1], 'Do not reorder caller records');
});

test('invalid viewports fail explicitly and requested bin counts remain bounded', () => {
  for (const view of [{ start: 0, end: 10 }, { start: 10, end: 2 }, { start: 1.5, end: 4 }, null]) {
    assert.throws(() => buildMapBins([], view), RangeError);
  }
  assert(buildMapBins([], fullView, 100000).bins.length <= 256);
  assert.equal(buildMapBins([], fullView, 0).bins.length, 1);
  assert(buildMapBins([], fullView, NaN).bins.length <= 72);
});

test('72-bin navigation and 15-pin windows expose every mapped variation individually without coordinate loss', () => {
  const model = buildMapBins(data.variants, fullView, 72);
  const expected = data.variants.filter(v => v.position != null);
  const originals = new Map(expected.map(v => [v.variationId, v]));
  const visited = [];
  let shortFinalWindow = false;
  assert.equal(model.bins.length, 72);

  for (const bin of model.bins) {
    const records = getBinVariants(model, bin.index);
    const { pages } = getDockPage(records, 0, 15);
    for (let page = 0; page < pages; page += 1) {
      const window = getDockPage(records, page, 15);
      assert(window.records.length <= 15);
      assert.equal(window.start, records.length ? page * 15 + 1 : 0);
      assert.equal(window.end, Math.min(records.length, (page + 1) * 15));
      for (const variant of window.records) {
        const original = originals.get(variant.variationId);
        assert.strictEqual(variant, original, 'Each pin refers to its own original variant record');
        assert.deepEqual([variant.position, variant.end], [original.position, original.end]);
        visited.push(variant);
      }
    }
    const last = getDockPage(records, Number.MAX_SAFE_INTEGER, 15);
    assert.equal(last.page, pages - 1, 'A stale page index clamps to the new final window');
    assert.deepEqual(last.records, records.slice((pages - 1) * 15));
    if (last.records.length > 0 && last.records.length < 15) shortFinalWindow = true;
  }

  assert(shortFinalWindow, 'Exercise a partial final pin window');
  assert.equal(visited.length, 4268);
  assert.equal(new Set(visited.map(v => v.variationId)).size, 4268);
  assert.deepEqual(visited.map(v => v.variationId).sort((a, b) => a - b), expected.map(v => v.variationId).sort((a, b) => a - b));

  const sameResidue = expected.filter(v => v.position === 1);
  assert(sameResidue.length > 1, 'Use a real residue with distinct variants at the same position');
  assert.deepEqual(visited.filter(v => v.position === 1).map(v => v.variationId).sort((a, b) => a - b), sameResidue.map(v => v.variationId).sort((a, b) => a - b));
});
