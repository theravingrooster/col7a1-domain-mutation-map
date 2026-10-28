import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterVariants, makeCSV } from '../src/data-utils.mjs';
import { DEFAULT_FILTERS, getReviewStars, getSequenceContext, clinvarUrl, serializeView, parseView, buildSession, MAX_QUERY_LENGTH } from '../src/research-utils.mjs';

const data = JSON.parse(readFileSync(new URL('../public/data/domain-map.json', import.meta.url)));

test('review stars preserve unknowns and distinguish conflicts from consensus', () => {
  assert.equal(getReviewStars({ reviewStatus: ['practice guideline'] }), 4);
  assert.equal(getReviewStars({ reviewStatus: ['reviewed by expert panel'] }), 3);
  assert.equal(getReviewStars({ reviewStatus: ['criteria provided, multiple submitters, no conflicts'] }), 2);
  assert.equal(getReviewStars({ reviewStatus: ['criteria provided, conflicting classifications'] }), 1);
  assert.equal(getReviewStars({ reviewStatus: ['no assertion criteria provided'] }), 0);
  assert.equal(getReviewStars({ reviewStatus: ['no classification for the single variant'] }), 0);
  assert.equal(getReviewStars({ reviewStatus: [] }), null);
  assert.equal(getReviewStars({ reviewStatus: ['unrecognized wording'] }), null);
  assert.equal(getReviewStars({ reviewStatus: ['reviewed by expert panel', 'no assertion criteria provided'] }), 0);
  assert.equal(getReviewStars({ reviewStatus: ['reviewed by expert panel', 'unknown'] }), null);
});

test('minimum review and exact status filters operate on actual snapshot evidence', () => {
  assert.equal(filterVariants(data.variants, { ...DEFAULT_FILTERS, minReview: '2' }).length, 928);
  assert.equal(filterVariants(data.variants, { ...DEFAULT_FILTERS, minReview: '3' }).length, 0);
  assert.equal(filterVariants(data.variants, { ...DEFAULT_FILTERS, minReview: '0' }).length, 6484);
  assert.equal(filterVariants(data.variants, { ...DEFAULT_FILTERS, reviewStatus: '__missing__' }).length, 38);
  const conflicting = filterVariants(data.variants, { ...DEFAULT_FILTERS, reviewStatus: 'criteria provided, conflicting classifications' });
  assert.equal(conflicting.length, 413);
  assert(conflicting.every(v => getReviewStars(v) === 1));
  assert.equal(filterVariants(data.variants, { ...DEFAULT_FILTERS, minReview: '2', reviewStatus: 'criteria provided, conflicting classifications' }).length, 0);
});

test('VCV and explicit ID searches match exact records and numeric residue search is preserved', () => {
  for (const query of ['VCV000017423', 'VCV000017423.7', 'id:17423', 'id: 17423']) {
    assert.deepEqual(filterVariants(data.variants, { ...DEFAULT_FILTERS, query }).map(v => v.variationId), [17423]);
  }
  assert(filterVariants(data.variants, { ...DEFAULT_FILTERS, query: '2798' }).some(v => v.variationId === 17423));
  assert.equal(clinvarUrl(17423), 'https://www.ncbi.nlm.nih.gov/clinvar/variation/17423/');
  assert.equal(clinvarUrl(data.variants[0]), clinvarUrl(17423));
  for (const id of [-1, null, NaN, 'javascript:alert(1)', '17423/../../', '1e3', Infinity]) assert.equal(clinvarUrl(id), null);
});

test('reference sequence context handles termini, spans, frameshift anchors and unmapped records', () => {
  const sequence = data.protein.sequence;
  const left = getSequenceContext(sequence, { position: 1, end: 1 });
  assert.equal(left.start, 1); assert.equal(left.end, 11); assert.equal(left.sequence, sequence.slice(0, 11));
  assert.equal(left.residues.filter(r => r.highlighted).length, 1);
  const right = getSequenceContext(sequence, { position: 2944, end: 2944 });
  assert.equal(right.end, 2944); assert.equal(right.start, 2934);
  const span = getSequenceContext(sequence, { position: 100, end: 104 });
  assert.equal(span.residues.filter(r => r.highlighted).length, 5);
  const anchor = getSequenceContext(sequence, { position: 100, end: 100, mappingExtent: 'frameshift_anchor' });
  assert.equal(anchor.residues.filter(r => r.highlighted).length, 1);
  for (const v of [{ position: null, end: null }, { position: 0, end: 1 }, { position: 2944, end: 2945 }, { position: 20, end: 10 }]) assert.equal(getSequenceContext(sequence, v), null);
});

test('long reference spans abbreviate display without corrupting copied sequence coordinates', () => {
  const context = getSequenceContext(data.protein.sequence, { position: 100, end: 1000 });
  assert.equal(context.start, 90); assert.equal(context.end, 1010);
  assert.equal(context.sequence, data.protein.sequence.slice(89, 1010));
  assert(context.truncated); assert.equal(context.residues.filter(r => r.gap).length, 1);
  assert.equal(context.residues.filter(r => !r.gap).length + context.omitted, context.sequence.length);
  assert.equal(context.residues.at(-1).position, 1010);
});

test('shared view round-trips filters, region, zoom, sort, map mode and pinned records', () => {
  const domain = data.domains.find(d => d.label === 'NC2');
  const state = {
    filters: { ...DEFAULT_FILTERS, query: 'c.8393T>A', groups: ['pathogenic'], mapping: 'mapped', minReview: '2', reviewStatus: 'criteria provided, multiple submitters, no conflicts', type: 'single nucleotide variant', glycine: false },
    selection: { start: domain.start, end: domain.end, id: domain.id, label: domain.label },
    view: { start: 2785, end: 2944 }, sort: 'id', mapMode: 'density', pinnedIds: [17423, 17424],
  };
  assert.deepEqual(parseView(serializeView(state), data), state);
  assert.deepEqual(parseView(serializeView({ ...state, filters: { ...state.filters, groups: [] } }), data).filters.groups, []);
  assert.equal(parseView('?review=0&status=__missing__', data).filters.minReview, '0');
});

test('malformed share parameters cannot create invalid ranges, filters or pinned identifiers', () => {
  const parsed = parseView('?start=0&end=999999&vs=50&ve=2&groups=pathogenic,bogus&pins=17423,17423,1,not-an-id&mapping=bad&sort=bad&mode=bad&review=9&status=unknown&type=bad', data);
  assert.equal(parsed.selection, null); assert.deepEqual(parsed.view, { start: 1, end: 2944 });
  assert.deepEqual(parsed.filters.groups, ['pathogenic']); assert.equal(parsed.filters.minReview, '');
  assert.equal(parsed.filters.mapping, 'all'); assert.equal(parsed.filters.type, ''); assert.equal(parsed.filters.reviewStatus, '');
  assert.equal(parsed.sort, 'position'); assert.equal(parsed.mapMode, 'variants'); assert.deepEqual(parsed.pinnedIds, [17423]);
  assert.equal(parseView('?start=1&end=20&mapping=unmapped', data).selection, null);
  assert.equal(parseView('?q=' + 'x'.repeat(700), data).filters.query.length, MAX_QUERY_LENGTH);
  assert.equal(parseView('?v=999&q=should-not-load', data).filters.query, '');
  assert.equal(parseView('?q=' + 'x'.repeat(16000), data).filters.query, '');
  const ids = data.variants.slice(0, 10).map(v => v.variationId);
  assert.equal(parseView('?pins=' + ids.join(','), data).pinnedIds.length, 4);
});

test('session export records exact result IDs, reference and source hashes without retaining mutable UI objects', () => {
  const state = parseView('?gly=1&review=2&mode=density&pins=17424', data);
  const results = filterVariants(data.variants, state.filters);
  const session = buildSession(data, state, results);
  assert.equal(session.resultCount, results.length);
  assert.deepEqual(session.resultVariationIds, results.map(v => v.variationId));
  assert.equal(session.sources.clinvar.sha256, data.sources.clinvar.sha256);
  assert.equal(session.reference.accession, 'Q02388'); assert.equal(session.snapshot.clinvarReleaseDate, null);
  assert.equal(session.state.mapMode, 'density'); assert.equal(session.state.filters.minReview, '2');
  session.state.filters.groups.length = 0;
  assert(state.filters.groups.length > 0);
  assert(!Number.isNaN(Date.parse(session.exportedAt)));
});

test('CSV adds live source and reference identifiers, retaining unknown review values and formula protection', () => {
  const unknown = data.variants.find(v => getReviewStars(v) === null);
  const csv = makeCSV([{ ...unknown, conditions: ['  @SUM(1,2)', '"quoted"'] }], data.snapshot);
  assert(csv.includes('Review stars (unknown is blank)'));
  assert(csv.includes('"","Q02388","NM_000094.4","NP_000085.1"'));
  assert(csv.includes('"\'  @SUM(1,2) | ""quoted"""'));
  assert(csv.includes(clinvarUrl(unknown)));
});
