import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupMarkers } from '../src/data-utils.mjs';
import { buildMapGeometry, MAP_LEFT, MAP_RIGHT, MAP_WIDTH } from '../src/map-render.mjs';

const data=JSON.parse(readFileSync(new URL('../public/data/domain-map.json',import.meta.url)));
const view={start:1,end:2944};
const variant=(id,position,end=position,group='pathogenic',glycine=false)=>({variationId:id,position,end,significanceGroup:group,glycineSubstitution:glycine});
const geometry=(variants,range=view,mode='variants')=>buildMapGeometry(groupMarkers(variants,range,mode).markers,range,mode);

test('batched vector layers preserve all mapped source IDs and marker geometry in both modes',()=>{
  for (const mode of ['variants','density']) {
    const {markers}=groupMarkers(data.variants,view,mode);
    const {layers,items}=buildMapGeometry(markers,view,mode);
    assert.equal(layers.length,5);
    assert.equal(items.length,markers.length);
    assert.equal(items.reduce((n,item)=>n+item.marker.variants.length,0),4268);
    assert.equal(new Set(items.flatMap(item=>item.marker.variants.map(v=>v.variationId))).size,4268);
    assert(items.every((item,i)=>item.index===i && item.marker===markers.find(m=>m.key===item.marker.key)));
    for (const item of items) {
      assert.equal(item.cx,150+(item.marker.start-1)/2944*1075);
      assert.equal(item.base,64+item.lane*48);
      assert.equal(item.height,Math.min(39,8+Math.sqrt(item.marker.variants.length)*8));
    }
    for (const layer of layers) {
      assert(!Object.values(layer).some(path=>typeof path==='string' && /NaN|Infinity/.test(path)));
      assert.equal((layer[mode==='density'?'density':'heads'].match(/M/g)||[]).length,items.filter(item=>item.marker.group===layer.group.id).length);
    }
  }
});

test('spatial lookup distinguishes same-position lanes and preserves grouped coincident variants',()=>{
  const {items,hitTest}=geometry([variant(1,200),variant(2,200),variant(3,200,200,'benign'),variant(4,400)]);
  const first=items.find(item=>item.marker.group==='pathogenic' && item.marker.start===200);
  const benign=items.find(item=>item.marker.group==='benign');
  assert.deepEqual(first.marker.variants.map(v=>v.variationId),[1,2]);
  assert.equal(hitTest(first.cx,first.cy),first);
  assert.equal(hitTest(benign.cx,benign.cy),benign);
  assert.equal(hitTest(first.cx,first.base-2),first);
  assert.equal(hitTest(first.cx,first.base+18),null);
  assert.equal(hitTest(MAP_LEFT-1,first.cy),null);
});

test('long interval spans remain hittable across buckets and are clipped without changing source coordinates',()=>{
  const v=variant(1,100,800,'uncertain',true);
  const {items,hitTest}=geometry([v],{start:300,end:500});
  const item=items[0];
  assert.equal(item.cx,MAP_LEFT);
  assert(item.xEnd>MAP_WIDTH-MAP_RIGHT);
  assert.equal(item.right,MAP_WIDTH-MAP_RIGHT);
  assert.equal(item.marker.variants[0].position,100);
  assert.equal(item.marker.variants[0].end,800);
  assert.equal(hitTest(1000,item.cy),item);
  assert.equal(hitTest(MAP_WIDTH-MAP_RIGHT+1,item.cy),null);
});

test('single-residue and density views have finite paths, hittable bars and deterministic keyboard ordering',()=>{
  const variants=[variant(2,400,402,'benign'),variant(1,399,401),variant(3,401,401,'uncertain')];
  for (const mode of ['variants','density']) {
    const {items,hitTest}=geometry(variants,{start:401,end:401},mode);
    assert.deepEqual(items.map(item=>item.marker.group),['pathogenic','uncertain','benign']);
    assert(items.every(item=>Number.isFinite(item.cx)&&Number.isFinite(item.barWidth)&&item.cx===MAP_LEFT));
    for(const item of items) assert.equal(hitTest(mode==='density'?item.cx+20:item.cx,item.cy+2),item);
  }
  assert.equal(geometry([]).hitTest(200,50),null);
  assert.throws(()=>buildMapGeometry([],{start:2,end:1}),RangeError);
});
