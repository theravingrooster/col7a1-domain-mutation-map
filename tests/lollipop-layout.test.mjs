import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPinGeometry, findNearestPin, buildPinLens, closestLensPin, clampPinIndex } from '../src/lollipop-layout.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/domain-map.json', import.meta.url)));
const view = { start: 1, end: 2944 };
const record = (variationId, position, end = position) => ({ variationId, position, end });
const ordered = xs => xs.every((x, i) => i === 0 || x >= xs[i - 1]);

test('dense geometry preserves all 4,268 mapped records, true anchors, and coincident variants', () => {
  const before = data.variants.map(v => v.variationId);
  const geometry = buildPinGeometry(data.variants, view);
  assert.equal(geometry.records.length, 4268);
  assert.equal(new Set(geometry.records.map(v => v.variationId)).size, 4268);
  assert.deepEqual(data.variants.map(v => v.variationId), before);
  assert.equal(geometry.left, 164); assert.equal(geometry.right, 1172);
  assert(ordered(geometry.points.map(p => p.x)));
  const originals = new Map(data.variants.map(v => [v.variationId, v]));
  for (const [i, variant] of geometry.records.entries()) {
    assert.strictEqual(variant, originals.get(variant.variationId));
    assert.equal(geometry.points[i].index, i);
    assert.equal(geometry.points[i].x, geometry.left + (variant.position - 1 + .5) / 2944 * geometry.plotWidth);
  }
  const atStart = geometry.records.filter(v => v.position === 1);
  assert(atStart.length > 1);
  assert(geometry.points.slice(0, atStart.length).every(p => p.x === geometry.left + .5 / 2944 * geometry.plotWidth));
  assert(ordered(atStart.map(v => v.variationId)));
});

test('coincident variants spread into independently hittable positions inside a stable lens', () => {
  const geometry = buildPinGeometry(Array.from({ length: 23 }, (_, i) => record(23 - i, 100)), { start: 1, end: 200 });
  const lens = buildPinLens(geometry, 11, { count: 13 });
  assert.equal(lens.points.length, 13);
  assert.equal(new Set(lens.points.map(p => p.x)).size, 13);
  assert(ordered(Array.from(lens.positions)));
  for (const point of lens.points) {
    assert.equal(closestLensPin(lens, point.x), point.index);
    assert.equal(closestLensPin(lens, point.x + lens.spacing * .2), point.index);
  }
  assert.equal(closestLensPin(lens, lens.left), lens.start);
  assert.equal(closestLensPin(lens, lens.right), lens.end - 1);
  const xs = lens.points.map(p => p.x);
  for (let x = lens.left; x <= lens.right; x += 1) closestLensPin(lens, x);
  assert.deepEqual(lens.points.map(p => p.x), xs, 'Pointer hit testing must not relocate its targets');
  // Keyboard-driven re-anchoring makes every record in a dense tie reachable.
  for (let i = 0; i < geometry.records.length; i += 1) {
    const shifted = buildPinLens(geometry, i);
    const point = shifted.points.find(p => p.index === i);
    assert.equal(closestLensPin(shifted, point.x), i);
  }
});

test('edge and narrow viewport lenses stay inside bounds with noncrossing context', () => {
  const records = Array.from({ length: 100 }, (_, i) => record(i + 1, i + 1));
  for (const width of [1200, 320, 90]) {
    const geometry = buildPinGeometry(records, { start: 1, end: 100 }, width);
    for (const index of [0, 1, 50, 98, 99]) {
      const lens = buildPinLens(geometry, index);
      assert(lens.left >= geometry.left);
      assert(lens.right <= geometry.right);
      assert(ordered(Array.from(lens.positions)));
      assert(Array.from(lens.positions).every(x => x >= geometry.left - 1e-8 && x <= geometry.right + 1e-8));
      assert(lens.points.every((p, i) => i === 0 || p.x - lens.points[i - 1].x >= 22 - 1e-8));
      assert(lens.points.some(p => p.index === index));
    }
  }
});

test('overlapping spans clip their plotted anchor but keep original coordinates', () => {
  const span = record(1, 20, 80), end = record(2, 70), outside = record(3, 71), unmapped = record(4, null, null);
  const geometry = buildPinGeometry([outside, unmapped, end, span], { start: 50, end: 70 });
  assert.deepEqual(geometry.records.map(v => v.variationId), [1, 2]);
  assert.equal(geometry.points[0].x, geometry.left + .5 / 21 * geometry.plotWidth);
  assert.equal(geometry.points[1].x, geometry.left + 20.5 / 21 * geometry.plotWidth);
  assert.equal(geometry.records[0].position, 20);
  assert.equal(geometry.records[0].end, 80);
  const single = buildPinGeometry([span], { start: 50, end: 50 });
  assert.equal(single.points[0].x, single.left + single.plotWidth / 2);
  assert.equal(closestLensPin(buildPinLens(single, 0), single.points[0].x), 0);
});

test('dense binary lookup and keyboard bounds are deterministic and safe', () => {
  const points = [{ index: 10, x: 100 }, { index: 11, x: 100 }, { index: 12, x: 100 }, { index: 13, x: 200 }];
  for (const x of [-100, 100, 101, 150, NaN]) assert.equal(findNearestPin(points, x), 10);
  assert.equal(findNearestPin(points, 151), 13);
  assert.equal(findNearestPin(points, Infinity), 13);
  assert.equal(findNearestPin([], 5), -1);
  assert.equal(clampPinIndex(-1, 4268), 0);
  assert.equal(clampPinIndex(4268, 4268), 4267);
  assert.equal(clampPinIndex(12.8, 4268), 12);
  assert.equal(clampPinIndex(NaN, 4268), 0);
  assert.equal(clampPinIndex(0, 0), -1);
  assert.equal(buildPinLens(buildPinGeometry([], view), 0), null);
  assert.throws(() => buildPinGeometry([], { start: 0, end: 10 }), RangeError);
  assert.throws(() => buildPinGeometry([], view, 100, { left: 80, right: 30 }), RangeError);
});
