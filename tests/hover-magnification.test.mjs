import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupMarkers } from '../src/data-utils.mjs';
import { buildMapGeometry, MAP_LEFT, MAP_RIGHT, MAP_WIDTH } from '../src/map-render.mjs';
import { computeFocus, hitFocus, magnificationWeight, MAGNIFICATION_RADIUS } from '../src/hover-magnification.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/domain-map.json', import.meta.url)));
const view = { start: 1, end: 2944 };
const variant = (id, position, end=position, group='pathogenic', glycine=false) => ({variationId:id, position, end, significanceGroup:group, glycineSubstitution:glycine});
const geometry = (variants, range=view, mode='variants') => buildMapGeometry(groupMarkers(variants, range, mode).markers, range, mode);

test('magnification redraws every masked shape without changing positions, source groups, or records', () => {
  const map = geometry(snapshot.variants);
  const before = JSON.stringify(map.items.map(({cx,cy,height,marker}) => ({cx,cy,height,key:marker.key,ids:marker.variants.map(v=>v.variationId)})));
  for (const source of map.items.filter((_, i) => i % 71 === 0)) {
    const focus = computeFocus(map, source, source.cx);
    const expected = map.items.filter(item => item.lane === source.lane && item.right >= focus.band.x && item.left <= focus.band.x + focus.band.width);
    assert.deepEqual(focus.items.map(item=>item.source), expected);
    assert.equal(new Set(focus.items.map(item=>item.index)).size, focus.items.length);
    assert.equal((focus.paths.heads.match(/M/g)||[]).length, focus.items.length);
    for (const item of focus.items) {
      assert.equal(item.cx, item.source.cx);
      assert.equal(item.xEnd, item.source.xEnd);
      assert.equal(item.base, item.source.base);
      assert.equal(item.marker, item.source.marker);
      assert(item.cy - Math.max(item.radius, item.glycine ? item.diamondRadius : 0) >= item.base - 47.5);
    }
  }
  assert.equal(JSON.stringify(map.items.map(({cx,cy,height,marker}) => ({cx,cy,height,key:marker.key,ids:marker.variants.map(v=>v.variationId)}))), before);
  assert.equal(map.items.reduce((sum,item)=>sum+item.marker.variants.length,0),4268);
});

test('size wave is smooth, symmetric, local, and confined to the original lane', () => {
  assert.equal(magnificationWeight(0),1);
  assert.equal(magnificationWeight(MAGNIFICATION_RADIUS),0);
  assert.equal(magnificationWeight(MAGNIFICATION_RADIUS+1),0);
  assert.equal(magnificationWeight(-20),magnificationWeight(20));
  assert(magnificationWeight(10)>magnificationWeight(30));
  assert(magnificationWeight(30)>magnificationWeight(50));
  const map = geometry([variant(1,400),variant(2,405),variant(3,400,400,'benign'),variant(4,800)],{start:1,end:1000});
  const focus = computeFocus(map,map.items[0]);
  assert.equal(focus.active.radius,6);
  assert.equal(focus.active.height,40);
  assert(focus.items.every(item=>item.lane===0));
  assert(!focus.items.some(item=>item.marker.start===800));
  assert(focus.items.find(item=>item.marker.start===405).radius<focus.active.radius);
});

test('masked interval tails remain present when their anchor is outside the magnified window', () => {
  const map = geometry([variant(1,50,900),variant(2,450),variant(3,451)],{start:1,end:1000});
  const source = map.items.find(item=>item.marker.start===450);
  const focus = computeFocus(map,source);
  const tail = focus.items.find(item=>item.marker.start===50);
  assert(tail && tail.cx<focus.band.x && tail.xEnd>focus.band.x+focus.band.width);
  assert.equal(tail.weight,0);
  assert.equal(tail.cy,tail.source.cy);
  assert.equal(tail.radius,2.4);
  assert.equal(hitFocus(focus,focus.band.x+1,tail.cy),tail.source);
  assert.equal((focus.paths.spans.match(/M/g)||[]).length,1);
});

test('a magnified span anchor keeps its interval line connected to the unchanged tail', () => {
  const map = geometry([variant(1,400,950),variant(2,405)],{start:1,end:1000});
  const source = map.items.find(item=>item.marker.start===400);
  const focus = computeFocus(map,source);
  const item = focus.active;
  assert(item.cy < source.cy, 'The head lifts within the wave');
  assert(item.xEnd > focus.band.x + focus.band.width, 'The interval continues outside the local redraw');
  assert.equal(item.spanCy,source.cy,'The interval remains at its original y coordinate across the mask edge');
  const round = value => String(Math.round(value*1000)/1000);
  assert.equal(focus.paths.spans,`M${round(source.cx)} ${round(source.cy)}H${round(source.xEnd)}`);
  assert.equal(hitFocus(focus,focus.band.x+focus.band.width-1,source.cy),source);
  assert.equal(hitFocus(focus,focus.band.x+focus.band.width-1,item.cy),null);
});

test('enlarged head and stem hits resolve the same original marker while neighboring pins remain selectable', () => {
  const map = geometry([variant(1,400),variant(2,405),variant(3,410)],{start:1,end:1000});
  const source=map.items[1], focus=computeFocus(map,source);
  for (const item of focus.items) {
    assert.equal(hitFocus(focus,item.cx,item.cy),item.source);
    assert.equal(hitFocus(focus,item.cx,item.base-1),item.source);
  }
  assert.equal(hitFocus(focus,focus.active.cx,focus.active.cy-5),source);
  assert.equal(hitFocus(focus,focus.active.cx,focus.band.y-1),null);
  assert.equal(hitFocus(focus,focus.band.x-1,source.cy),null);
  assert.equal(hitFocus(null,400,50),null);
});

test('edge, one-residue, empty, and density views retain bounded finite focus geometry', () => {
  const map=geometry([variant(1,1),variant(2,2944)]);
  for(const source of map.items) {
    const focus=computeFocus(map,source);
    assert(focus.band.x>=MAP_LEFT);
    assert(focus.band.x+focus.band.width<=MAP_WIDTH-MAP_RIGHT);
    assert.equal(focus.active.cx,source.cx);
    assert(Object.values(focus.paths).every(path=>!/NaN|Infinity/.test(path)));
  }
  const one=geometry([variant(1,20,40)],{start:30,end:30});
  const focus=computeFocus(one,one.items[0]);
  assert.equal(focus.active.cx,MAP_LEFT);
  assert.equal(focus.active.marker.variants[0].position,20);
  assert.equal(focus.active.marker.variants[0].end,40);
  assert.equal(computeFocus(geometry([]),null),null);
  const density=geometry([variant(1,20)],view,'density');
  assert.equal(computeFocus(density,density.items[0]),null);
  assert.deepEqual(map.rangeItems(7,100,200),[]);
});
