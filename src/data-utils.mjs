export const GROUPS = [
  { id: 'pathogenic', label: 'Pathogenic / likely pathogenic', short: 'Pathogenic / LP', color: '#d25655' },
  { id: 'uncertain', label: 'Uncertain significance', short: 'VUS', color: '#ce8c27' },
  { id: 'benign', label: 'Benign / likely benign', short: 'Benign / LB', color: '#329681' },
  { id: 'conflicting', label: 'Conflicting classifications', short: 'Conflicting', color: '#7488b4' },
  { id: 'other', label: 'Other / not provided', short: 'Other', color: '#8a9198' },
];
export const format = (n) => n.toLocaleString('en-US');
// Germline review status, not a pathogenicity score. Exact source wording is
// retained elsewhere. Unknown or mixed known/unknown statuses stay unknown.
// https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/
const REVIEW_STARS = new Map([
  ['practice guideline', 4],
  ['reviewed by expert panel', 3],
  ['criteria provided, multiple submitters, no conflicts', 2],
  ['criteria provided, single submitter', 1],
  ['criteria provided, conflicting classifications', 1],
  ['criteria provided, conflicting interpretations', 1],
  ['no assertion criteria provided', 0],
  ['no classification provided', 0],
  ['no assertion provided', 0],
  ['no classification for the single variant', 0],
  ['no classification for the individual variant', 0],
  ['no assertion for the individual variant', 0],
]);
export function getReviewStars(variant) {
  const statuses = variant?.reviewStatus;
  if (!Array.isArray(statuses) || !statuses.length) return null;
  const levels = statuses.map(s => REVIEW_STARS.get(String(s).trim().toLowerCase()));
  return levels.some(n => n === undefined) ? null : Math.min(...levels);
}
export function clinvarUrl(variantOrId) {
  const id = typeof variantOrId === 'object' ? variantOrId?.variationId : variantOrId;
  return /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) > 0
    ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${Number(id)}/` : null;
}
export function overlaps(v, range) {
  return v.position != null && v.position <= range.end && v.end >= range.start;
}
export function filterVariants(variants, filters, range = null) {
  const q = filters.query.trim().toLowerCase();
  // VCV accessions and an explicit id: prefix disambiguate identifiers from
  // residue searches. Plain numeric searches retain the original broad search.
  const exactId = q.match(/^(?:vcv\s*0*|id:\s*)(\d+)(?:\.\d+)?$/i);
  const minimum = filters.minReview === '' || filters.minReview == null ? null : Number(filters.minReview);
  // A cleared column is null; an explicitly empty selection matches nothing.
  // Selected values are alternatives within a column, while columns combine
  // with AND. Match the source values exactly, including compound labels.
  const columns = [
    ['types', 'types'], ['regions', 'regions'],
    ['significances', 'clinicalSignificance'], ['reviewStatuses', 'reviewStatus'],
  ].filter(([filter]) => filters[filter] != null).map(([filter, field]) => ({
    field, choices: new Set(Array.isArray(filters[filter]) ? filters[filter] : []),
  }));
  return variants.filter(v => (!range || overlaps(v, range)) &&
    (filters.mapping === 'all' || (filters.mapping === 'mapped' ? v.position != null : v.position == null)) &&
    (!filters.glycine || v.glycineSubstitution) &&
    (!filters.type || v.types.includes(filters.type)) &&
    (minimum == null || (Number.isInteger(minimum) && minimum >= 0 && minimum <= 4 && getReviewStars(v) != null && getReviewStars(v) >= minimum)) &&
    (!filters.reviewStatus || (filters.reviewStatus === '__missing__' ? !v.reviewStatus?.length : v.reviewStatus?.includes(filters.reviewStatus))) &&
    columns.every(({ field, choices }) => v[field]?.length
      ? v[field].some(value => choices.has(value)) : choices.has('__missing__')) &&
    filters.groups.includes(v.significanceGroup) &&
    (!q || (exactId ? Number(exactId[1]) === v.variationId : [v.variationId, ...v.names, ...v.conditions, ...v.clinicalSignificance, ...v.reviewStatus, ...v.regions, v.position ?? ''].join(' ').toLowerCase().includes(q))));
}
export function sortVariants(variants, sort) {
  return [...variants].sort((a, b) => sort === 'id' ? a.variationId - b.variationId :
    sort === 'significance' ? GROUPS.findIndex(g => g.id === a.significanceGroup) - GROUPS.findIndex(g => g.id === b.significanceGroup) || (a.position ?? Infinity) - (b.position ?? Infinity) || a.variationId - b.variationId :
    (a.position ?? Infinity) - (b.position ?? Infinity) || a.variationId - b.variationId);
}
export function groupMarkers(variants, range, mode) {
  const bins = new Map();
  const binSize = mode === 'density' ? Math.max(1, Math.ceil((range.end - range.start + 1) / 110)) : 1;
  for (const v of variants) {
    if (!overlaps(v, range)) continue;
    const anchor = Math.max(range.start, v.position);
    const start = range.start + Math.floor((anchor - range.start) / binSize) * binSize;
    const key = `${v.significanceGroup}:${start}`;
    if (!bins.has(key)) bins.set(key, { key, group: v.significanceGroup, start, end: Math.min(range.end, start + binSize - 1), variants: [], glycine: false });
    const marker = bins.get(key);
    marker.variants.push(v);
    marker.end = mode === 'density' ? marker.end : Math.max(marker.end, v.end);
    marker.glycine ||= v.glycineSubstitution;
  }
  return { markers: [...bins.values()], binSize };
}
export function makeCSV(variants, snapshot) {
  const cell = value => {
    let s = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = [['ClinVar Variation ID', 'Protein HGVS', 'Coding HGVS', 'Start (aa)', 'End (aa)', 'Regions', 'Clinical significance', 'Collagenous glycine substitution', 'Review status', 'Conditions', 'Variant type', 'Mapping reason', 'Mapping extent', 'Last evaluated (record)', 'Local preparation date', 'ClinVar release date', 'Source lines', 'Review stars (unknown is blank)', 'UniProt accession', 'Reference transcript', 'Reference protein', 'Coordinate system', 'ClinVar URL (live record)']];
  for (const v of variants) rows.push([v.variationId, v.proteinHgvs, v.codingHgvs, v.position, v.end, v.regions, v.clinicalSignificance, v.glycineSubstitution ? 'Yes' : 'No', v.reviewStatus, v.conditions, v.types, v.mappingReason, v.mappingExtent, v.lastEvaluated, snapshot.preparedDate, snapshot.clinvarReleaseDate ?? 'Not recorded', v.sourceLines, getReviewStars(v), 'Q02388', 'NM_000094.4', 'NP_000085.1', '1-based inclusive; complete precursor', clinvarUrl(v)]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
