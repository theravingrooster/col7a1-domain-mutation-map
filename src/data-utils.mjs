export const GROUPS = [
  { id: 'pathogenic', label: 'Pathogenic / likely pathogenic', short: 'Pathogenic / LP', color: '#d25655' },
  { id: 'uncertain', label: 'Uncertain significance', short: 'VUS', color: '#ce8c27' },
  { id: 'benign', label: 'Benign / likely benign', short: 'Benign / LB', color: '#329681' },
  { id: 'conflicting', label: 'Conflicting classifications', short: 'Conflicting', color: '#7488b4' },
  { id: 'other', label: 'Other / not provided', short: 'Other', color: '#8a9198' },
];
export const format = (n) => n.toLocaleString('en-US');
export function overlaps(v, range) {
  return v.position != null && v.position <= range.end && v.end >= range.start;
}
export function filterVariants(variants, filters, range = null) {
  const q = filters.query.trim().toLowerCase();
  return variants.filter(v => (!range || overlaps(v, range)) &&
    (filters.mapping === 'all' || (filters.mapping === 'mapped' ? v.position != null : v.position == null)) &&
    (!filters.glycine || v.glycineSubstitution) &&
    (!filters.type || v.types.includes(filters.type)) &&
    filters.groups.includes(v.significanceGroup) &&
    (!q || [v.variationId, ...v.names, ...v.conditions, ...v.clinicalSignificance, ...v.reviewStatus, ...v.regions, v.position ?? ''].join(' ').toLowerCase().includes(q)));
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
  const rows = [['ClinVar Variation ID', 'Protein HGVS', 'Coding HGVS', 'Start (aa)', 'End (aa)', 'Regions', 'Clinical significance', 'Collagenous glycine substitution', 'Review status', 'Conditions', 'Variant type', 'Mapping reason', 'Mapping extent', 'Last evaluated (record)', 'Local preparation date', 'ClinVar release date', 'Source lines']];
  for (const v of variants) rows.push([v.variationId, v.proteinHgvs, v.codingHgvs, v.position, v.end, v.regions, v.clinicalSignificance, v.glycineSubstitution ? 'Yes' : 'No', v.reviewStatus, v.conditions, v.types, v.mappingReason, v.mappingExtent, v.lastEvaluated, snapshot.preparedDate, snapshot.clinvarReleaseDate ?? 'Not recorded', v.sourceLines]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
