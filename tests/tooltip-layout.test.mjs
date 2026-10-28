import test from 'node:test';
import assert from 'node:assert/strict';
import { placeMapTooltip } from '../src/tooltip-layout.mjs';

const viewport = { left: 0, top: 0, width: 1280, height: 800 };

test('map tooltip fits above or below the anchor without clipping the top lane', () => {
  const top = placeMapTooltip({ left: 480, right: 485, top: 40, bottom: 45 }, { width: 300, height: 150 }, viewport);
  assert.equal(top.placement, 'below');
  assert.equal(top.top, 57);
  const bottom = placeMapTooltip({ left: 480, right: 485, top: 760, bottom: 765 }, { width: 300, height: 150 }, viewport);
  assert.equal(bottom.placement, 'above');
  assert.equal(bottom.top, 598);
});

test('map tooltip clamps at both horizontal viewport edges independently of scroller size', () => {
  const left = placeMapTooltip({ left: 2, right: 7, top: 300, bottom: 305 }, { width: 330, height: 150 }, viewport);
  const right = placeMapTooltip({ left: 1270, right: 1275, top: 300, bottom: 305 }, { width: 330, height: 150 }, viewport);
  assert.equal(left.left, 12);
  assert.equal(right.left + 330, 1268);
});

test('map tooltip respects narrow visual viewport offsets and bounds long content', () => {
  const narrow = { left: 28, top: 140, width: 320, height: 260 };
  const result = placeMapTooltip({ left: 10, right: 16, top: 146, bottom: 151 }, { width: 500, height: 400 }, narrow);
  assert.equal(result.maxWidth, 296);
  assert.equal(result.maxHeight, 236);
  assert.equal(result.left, 40);
  assert.equal(result.top, 152);
});
