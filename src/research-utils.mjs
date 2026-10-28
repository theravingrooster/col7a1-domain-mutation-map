import { GROUPS } from './data-utils.mjs';
export { getReviewStars, clinvarUrl } from './data-utils.mjs';

export const DEFAULT_FILTERS = Object.freeze({
  query: '', groups: Object.freeze(GROUPS.map(g => g.id)), mapping: 'all',
  type: '', glycine: false, minReview: '', reviewStatus: '',
});
export const MAX_PINNED = 4;
export const MAX_QUERY_LENGTH = 500;

export function positionLabel(v) {
  if (!Number.isInteger(v?.position) || !Number.isInteger(v?.end)) return 'Unmapped';
  return `${v.position}${v.end === v.position ? '' : `–${v.end}`} aa`;
}

// Reference sequence only. The complete context is retained for copying/FASTA;
// the display residues abbreviate the middle of long intervals explicitly.
export function getSequenceContext(sequence, variant, flank = 10) {
  const variantStart = variant?.position, variantEnd = variant?.end;
  if (typeof sequence !== 'string' || !sequence.length ||
      !Number.isInteger(variantStart) || !Number.isInteger(variantEnd) ||
      variantStart < 1 || variantEnd < variantStart || variantEnd > sequence.length) return null;
  const padding = Number.isInteger(flank) ? Math.max(0, Math.min(50, flank)) : 10;
  const start = Math.max(1, variantStart - padding);
  const end = Math.min(sequence.length, variantEnd + padding);
  const context = sequence.slice(start - 1, end);
  const all = Array.from(context, (aa, i) => ({
    position: start + i, aa, highlighted: start + i >= variantStart && start + i <= variantEnd,
  }));
  const edge = padding + 15;
  const omitted = all.length > edge * 2 + 10 ? all.length - edge * 2 : 0;
  const residues = omitted ? [...all.slice(0, edge), { gap: true, count: omitted }, ...all.slice(-edge)] : all;
  return { start, end, variantStart, variantEnd, sequence: context, residues, omitted, truncated: omitted > 0 };
}

const integer = raw => /^\d+$/.test(String(raw)) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
const validRange = (start, end, length) => start != null && end != null && start >= 1 && end >= start && end <= length;

export function serializeView(state) {
  const params = new URLSearchParams();
  const filters = { ...DEFAULT_FILTERS, ...state.filters };
  params.set('v', '1');
  if (filters.query) params.set('q', String(filters.query).slice(0, MAX_QUERY_LENGTH));
  // An explicitly empty group list is meaningful and must round-trip.
  params.set('groups', filters.groups.join(','));
  if (filters.mapping !== 'all') params.set('mapping', filters.mapping);
  if (filters.type) params.set('type', filters.type);
  if (filters.glycine) params.set('gly', '1');
  if (filters.minReview !== '' && filters.minReview != null) params.set('review', String(filters.minReview));
  if (filters.reviewStatus) params.set('status', filters.reviewStatus);
  if (state.selection) {
    params.set('start', String(state.selection.start));
    params.set('end', String(state.selection.end));
    if (state.selection.id) params.set('domain', state.selection.id);
  }
  if (state.view) { params.set('vs', String(state.view.start)); params.set('ve', String(state.view.end)); }
  if (state.sort && state.sort !== 'position') params.set('sort', state.sort);
  if (state.mapMode === 'density') params.set('mode', 'density');
  if (state.pinnedIds?.length) params.set('pins', [...new Set(state.pinnedIds)].slice(0, MAX_PINNED).join(','));
  return params.toString();
}

// Only known parameters are accepted. Every identifier/enum/range is validated
// against the loaded snapshot before it becomes UI state.
export function parseView(search, data) {
  const length = data.protein.length;
  const fallback = {
    filters: { ...DEFAULT_FILTERS, groups: [...DEFAULT_FILTERS.groups] },
    selection: null, view: { start: 1, end: length }, sort: 'position',
    mapMode: 'variants', pinnedIds: [],
  };
  if (typeof search !== 'string' || search.length > 16000) return fallback;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.has('v') && params.get('v') !== '1') return fallback;
  const filters = fallback.filters;
  filters.query = (params.get('q') || '').slice(0, MAX_QUERY_LENGTH);
  if (params.has('groups')) filters.groups = [...new Set((params.get('groups') || '').split(','))].filter(id => GROUPS.some(g => g.id === id));
  if (['all', 'mapped', 'unmapped'].includes(params.get('mapping'))) filters.mapping = params.get('mapping');
  const types = new Set(data.variants.flatMap(v => v.types));
  if (types.has(params.get('type'))) filters.type = params.get('type');
  filters.glycine = params.get('gly') === '1';
  const review = params.get('review');
  if (/^[0-4]$/.test(review || '')) filters.minReview = review;
  const status = params.get('status');
  if (status === '__missing__' || data.variants.some(v => v.reviewStatus.includes(status))) filters.reviewStatus = status;
  const start = integer(params.get('start')), end = integer(params.get('end'));
  if (validRange(start, end, length) && filters.mapping !== 'unmapped') {
    const domain = data.domains.find(d => d.id === params.get('domain') && d.start === start && d.end === end);
    fallback.selection = domain ? { start, end, id: domain.id, label: domain.label } : { start, end, label: `Residues ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')}` };
  }
  const viewStart = integer(params.get('vs')), viewEnd = integer(params.get('ve'));
  if (validRange(viewStart, viewEnd, length)) fallback.view = { start: viewStart, end: viewEnd };
  if (['position', 'significance', 'id'].includes(params.get('sort'))) fallback.sort = params.get('sort');
  fallback.mapMode = params.get('mode') === 'density' ? 'density' : 'variants';
  const ids = new Set(data.variants.map(v => v.variationId));
  fallback.pinnedIds = [...new Set((params.get('pins') || '').split(',').map(integer))].filter(id => ids.has(id)).slice(0, MAX_PINNED);
  return fallback;
}

export function buildSession(data, state, results) {
  // A JSON-safe copy separates the downloadable record from mutable UI state.
  return JSON.parse(JSON.stringify({
    schemaVersion: '1.0.0', tool: 'COL7A1 Atlas research view', exportedAt: new Date().toISOString(),
    snapshot: data.snapshot, sourceDataSchemaVersion: data.schemaVersion,
    coordinateSystem: data.coordinateSystem,
    reference: { accession: data.protein.accession, length: data.protein.length, entryAudit: data.protein.entryAudit, refSeqLinks: data.protein.refSeqLinks },
    sources: data.sources, processing: data.processing,
    state: parseView(serializeView(state), data),
    resultCount: results.length, resultVariationIds: results.map(v => v.variationId),
    note: 'A reproducible view of the fixed local snapshot. Live ClinVar pages may have changed. Review stars describe review status, not pathogenicity. Variant counts are not patient frequencies.',
  }));
}
