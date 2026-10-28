import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROUPS, filterVariants, sortVariants, groupMarkers, makeCSV, overlaps } from '../src/data-utils.mjs';
const d=JSON.parse(readFileSync(new URL('../public/data/domain-map.json',import.meta.url)));
const defaults={query:'',groups:GROUPS.map(g=>g.id),mapping:'all',type:'',glycine:false};
test('all 6,522 variants remain searchable, including all 2,254 unmapped variants',()=>{
 assert.equal(filterVariants(d.variants,defaults).length,6522);
 assert.equal(filterVariants(d.variants,{...defaults,mapping:'unmapped'}).length,2254);
 assert.equal(filterVariants(d.variants,{...defaults,mapping:'mapped'}).length,4268);
});
test('NC2 region overlap includes the known Met2798Lys variant',()=>{
 const r=filterVariants(d.variants,defaults,{start:2785,end:2944});
 assert.equal(r.length,225);assert(r.some(v=>v.variationId===17423));
 assert(r.every(v=>v.position>=2785&&v.end<=2944));
});
test('combined glycine, classification, query, and region filters agree',()=>{
 assert.equal(filterVariants(d.variants,{...defaults,glycine:true}).length,479);
 const r=filterVariants(d.variants,{...defaults,query:'p.Gly2040Ser',glycine:true,groups:['pathogenic']},{start:1254,end:2784});
 assert(r.some(v=>v.variationId===17424)); assert(r.every(v=>v.glycineSubstitution&&v.significanceGroup==='pathogenic'));
 assert.equal(filterVariants(d.variants,{...defaults,glycine:true},{start:17,end:1253}).length,0);
 assert.equal(filterVariants(d.variants,{...defaults,groups:[]}).length,0);
});
test('intervals overlap inclusively and unmapped positions never enter a range',()=>{
 assert(overlaps({position:1200,end:1300},{start:1254,end:2784}));
 assert(overlaps({position:1254,end:1254},{start:1254,end:2784}));
 assert(!overlaps({position:null,end:null},{start:1,end:2944}));
});
test('density and individual marker counts account for every mapped variant once',()=>{
 for(const mode of ['variants','density']){
  const {markers}=groupMarkers(d.variants,{start:1,end:2944},mode);
  assert.equal(markers.reduce((n,m)=>n+m.variants.length,0),4268);
  assert.equal(new Set(markers.flatMap(m=>m.variants.map(v=>v.variationId))).size,4268);
  assert(markers.every(m=>m.start>=1&&m.end<=2944));
 }
});
test('zoom retains overlapping intervals and caps bins at the viewport edge',()=>{
 const v={position:100,end:200,significanceGroup:'pathogenic',glycineSubstitution:false,variationId:1};
 for(const mode of ['variants','density']){
  const {markers}=groupMarkers([v],{start:150,end:160},mode);
  assert.equal(markers.length,1);assert.equal(markers[0].start,150);
 }
});
test('position sorting puts unmapped variants last without changing source order',()=>{
 const before=d.variants[0];const r=sortVariants(d.variants,'position');
 assert.equal(r[0].position,1);assert.equal(r.at(-1).position,null);assert.equal(d.variants[0],before);
});
test('CSV exports every filtered result, quotes values, and preserves snapshot provenance',()=>{
 const r=filterVariants(d.variants,{...defaults,glycine:true});
 const csv=makeCSV(r,d.snapshot);
 assert.equal(csv.split('\r\n').length,481);
 assert(csv.includes('"2026-10-28","Not recorded"'));
 assert(csv.includes('"17424"'));
 const synthetic={...r[0],conditions:['=SUM(A1:A2)','A "quote", with comma']};
 const safe=makeCSV([synthetic],d.snapshot);
 assert(safe.includes('"\'=SUM(A1:A2) | A ""quote"", with comma"'));
});
