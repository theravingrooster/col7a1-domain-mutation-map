import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterVariants, getReviewStars } from '../src/data-utils.mjs';
import { DEFAULT_FILTERS, serializeView, parseView, buildSession } from '../src/research-utils.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/domain-map.json', import.meta.url)));
const twoStars = 'criteria provided, multiple submitters, no conflicts';
const oneStar = 'criteria provided, single submitter';
const zeroStars = 'no assertion criteria provided';
const record = (variationId, values) => ({
  variationId, position: 10, end: 10, names: [`record ${variationId}`], conditions: [],
  types: ['single nucleotide variant'], regions: ['NC1'], clinicalSignificance: ['Pathogenic'],
  significanceGroup: 'pathogenic', reviewStatus: [twoStars], glycineSubstitution: false, ...values,
});
const fixture = [
  record(1, {}),
  record(2, { position: 20, end: 30, types: ['Deletion'], regions: ['NC1', 'Collagenous'], clinicalSignificance: ['Likely pathogenic'], reviewStatus: [oneStar] }),
  record(3, { position: 40, end: 40, regions: ['NC2'], clinicalSignificance: ['Pathogenic/Likely pathogenic'], reviewStatus: [zeroStars] }),
  record(4, { position: null, end: null, types: [], regions: [], clinicalSignificance: [], significanceGroup: 'other', reviewStatus: [] }),
  record(5, { position: 50, end: 50, types: ['Insertion', 'Deletion'], regions: ['Collagenous'], clinicalSignificance: ['Uncertain significance'], significanceGroup: 'uncertain', reviewStatus: ['unrecognized source status'] }),
];
const ids = (filters, range = null) => filterVariants(fixture, { ...DEFAULT_FILTERS, ...filters }, range).map(v => v.variationId);
const queryWith = (name, value) => new URLSearchParams({ [name]: JSON.stringify(value) }).toString();

test('column choices OR within one column and AND across columns without mutating source records', () => {
  const before = JSON.stringify(fixture);
  assert.deepEqual(ids({ regions: ['NC1', 'NC2'] }), [1, 2, 3]);
  assert.deepEqual(ids({ types: ['Deletion', 'single nucleotide variant'], regions: ['NC1', 'NC2'], significances: ['Pathogenic', 'Likely pathogenic'] }), [1, 2]);
  assert.deepEqual(ids({ types: ['Insertion'], regions: ['NC1', 'Collagenous'], reviewStatuses: ['unrecognized source status', twoStars] }), [5]);
  assert.equal(JSON.stringify(fixture), before);
});

test('cleared, empty, and missing-value selections retain distinct meanings for every column', () => {
  for (const column of ['types', 'regions', 'significances', 'reviewStatuses']) {
    assert.deepEqual(ids({ [column]: null }), [1, 2, 3, 4, 5]);
    assert.deepEqual(ids({ [column]: [] }), []);
    assert.deepEqual(ids({ [column]: ['__missing__'] }), [4]);
    assert.deepEqual(ids({ [column]: 'invalid runtime selection' }), []);
  }
  assert.deepEqual(ids({ regions: ['__missing__', 'NC2'] }), [3, 4]);
});

test('classification choices match full source labels and missing review is distinct from unknown and zero stars', () => {
  assert.deepEqual(ids({ significances: ['Pathogenic'] }), [1]);
  assert.deepEqual(ids({ significances: ['Pathogenic/Likely pathogenic'] }), [3]);
  assert.deepEqual(ids({ significances: ['pathogenic'] }), []);
  assert.equal(getReviewStars(fixture[2]), 0);
  assert.equal(getReviewStars(fixture[3]), null);
  assert.equal(getReviewStars(fixture[4]), null);
  assert.deepEqual(ids({ reviewStatuses: ['__missing__', zeroStars], minReview: '0' }), [3]);
  assert.deepEqual(ids({ reviewStatuses: ['unrecognized source status'] }), [5]);
  assert.deepEqual(ids({ reviewStatuses: ['unrecognized source status'], minReview: '0' }), []);
});

test('column choices compose with inclusive interval overlap, mapping, query, and existing single-value filters', () => {
  assert.deepEqual(ids({ regions: ['Collagenous'], types: ['Deletion'] }, { start: 25, end: 25 }), [2]);
  assert.deepEqual(ids({ regions: ['__missing__'], mapping: 'mapped' }), []);
  assert.deepEqual(ids({ mapping: 'unmapped' }), [4]);
  assert.deepEqual(ids({ types: ['Insertion', 'Deletion'], type: 'Deletion', query: 'id:5' }), [5]);
  assert.deepEqual(ids({ reviewStatuses: [twoStars, oneStar], reviewStatus: oneStar }), [2]);
  assert.deepEqual(ids({ significances: ['Uncertain significance'], groups: ['pathogenic'] }), []);
});

test('shared views round-trip multi-select and explicit empty lists while preserving legacy links', () => {
  const state = parseView('?type=Deletion&status=' + encodeURIComponent(oneStar) + '&pins=17423', data);
  for (const column of ['types', 'regions', 'significances', 'reviewStatuses']) assert.equal(state.filters[column], null);
  assert.equal(state.filters.type, 'Deletion');
  assert.equal(state.filters.reviewStatus, oneStar);
  const next = {
    ...state,
    filters: { ...state.filters, type: '', reviewStatus: '', types: ['Deletion', 'single nucleotide variant'], regions: ['NC1', 'NC2'], significances: ['Pathogenic', 'Likely pathogenic'], reviewStatuses: [twoStars, '__missing__'] },
  };
  assert.deepEqual(parseView(serializeView(next), data), next);
  const empty = { ...next, filters: { ...next.filters, types: [], regions: [], significances: [], reviewStatuses: [] } };
  assert.deepEqual(parseView(serializeView(empty), data), empty);
  assert.equal(filterVariants(data.variants, parseView(serializeView(empty), data).filters).length, 0);
});

test('malformed or unrecognized URL choices cannot inject values or silently clear a restrictive column', () => {
  const names = { types: 'columnTypes', regions: 'columnRegions', significances: 'columnSignificances', reviewStatuses: 'columnStatuses' };
  for (const [field, parameter] of Object.entries(names)) {
    for (const value of [null, {}, 5, 'NC1', [null, {}, 9, '__proto__', '<script>bad()</script>']]) {
      assert.deepEqual(parseView(queryWith(parameter, value), data).filters[field], []);
    }
    assert.deepEqual(parseView(new URLSearchParams({ [parameter]: '[broken' }).toString(), data).filters[field], []);
  }
  assert.deepEqual(parseView(queryWith('columnRegions', ['NC1', 'invalid', 'NC1', '__missing__']), data).filters.regions, ['NC1', '__missing__']);
  assert.deepEqual(parseView(queryWith('columnRegions', Array(101).fill('NC1')), data).filters.regions, []);
  assert.deepEqual(parseView(queryWith('columnRegions', ['x'.repeat(501)]), data).filters.regions, []);
});

test('real snapshot filtering and session export preserve exact multi-column result IDs and immutable settings', () => {
  const state = parseView('', data);
  state.filters = { ...state.filters, regions: ['NC2'], significances: ['Pathogenic', 'Likely pathogenic', 'Pathogenic/Likely pathogenic'], reviewStatuses: [twoStars] };
  const result = filterVariants(data.variants, state.filters);
  assert(result.length > 0);
  assert(result.some(v => v.variationId === 17423));
  assert(result.every(v => v.regions.includes('NC2') && v.significanceGroup === 'pathogenic' && getReviewStars(v) === 2));
  const session = buildSession(data, state, result);
  assert.deepEqual(session.resultVariationIds, result.map(v => v.variationId));
  assert.deepEqual(session.state.filters, state.filters);
  session.state.filters.regions.push('NC1');
  assert.deepEqual(state.filters.regions, ['NC2']);
});
