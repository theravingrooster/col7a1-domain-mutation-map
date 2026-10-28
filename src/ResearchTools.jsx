import React, { useMemo, useState } from 'react';
import { GROUPS, format } from './data-utils.mjs';
import { clinvarUrl, getReviewStars, getSequenceContext } from './research-utils.mjs';
import './research-tools.css';

const variantName = v => v.proteinHgvs?.[0] || v.codingHgvs?.[0] || `Variation ${v.variationId}`;
const list = values => values?.length ? values.join(' · ') : 'Not provided';
const span = v => v.position == null ? 'Unmapped' : `${format(v.position)}${v.end !== v.position ? `–${format(v.end)}` : ''} aa`;

export function EvidenceBadge({ variant, showStatus = false }) {
  const stars = getReviewStars(variant);
  return <span className="evidence-badge" title={list(variant.reviewStatus)}>
    <span className="review-rating">
      <span aria-hidden="true" className="review-stars">{stars == null ? '—' : '★'.repeat(stars) + '☆'.repeat(4 - stars)}</span>
      <span>{stars == null ? 'Review not recorded' : `${stars} review ${stars === 1 ? 'star' : 'stars'}`}</span>
    </span>
    {showStatus && <span className="review-description">{list(variant.reviewStatus)}</span>}
  </span>;
}

export function ResearchSummary({ results, selection }) {
  const counts = useMemo(() => {
    const groups = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    let mapped = 0;
    for (const v of results) {
      if (v.position != null) mapped += 1;
      if (v.significanceGroup in groups) groups[v.significanceGroup] += 1;
    }
    return { groups, mapped, unmapped: results.length - mapped };
  }, [results]);
  return <section className="research-summary" aria-label="Current filtered results">
    <div className="summary-scope"><span className="eyebrow">CURRENT RESULT SET</span><strong>{format(results.length)} {results.length===1?'variant':'variants'}</strong><small>{selection ? `${format(selection.start)}–${format(selection.end)} aa · interval overlap` : 'All protein regions'} · active filters applied</small></div>
    <div className="summary-mapping"><span><b>{format(counts.mapped)}</b> mapped</span><span><b>{format(counts.unmapped)}</b> unmapped</span></div>
    <div className="summary-groups">{GROUPS.map(g => <span key={g.id}><i className="legend-dot" style={{ background: g.color }}/><span>{g.short}</span><b>{format(counts.groups[g.id])}</b></span>)}</div>
  </section>;
}

export function ComparisonPanel({ variants, data, onRemove, onInspect, onClear, onExport }) {
  const rows = [
    ['Protein HGVS', v => <span className="mono">{list(v.proteinHgvs)}</span>],
    ['Coding HGVS', v => <span className="mono">{list(v.codingHgvs)}</span>],
    ['Protein position', span],
    ['Regions & domains', v => <>{list(v.regions)}<small>{v.domainIds?.map(id => data.domains.find(d => d.id === id)?.label).filter(Boolean).join(' · ') || 'No mapped domain'}</small></>],
    ['Source classification', v => <span className={`badge ${v.significanceGroup}`}>{list(v.clinicalSignificance)}</span>],
    ['Review evidence', v => <EvidenceBadge variant={v} showStatus/>],
    ['Conditions', v => list(v.conditions)],
    ['Variant type', v => list(v.types)],
    ['Collagenous Gly substitution', v => v.glycineSubstitution ? 'Yes' : 'No'],
    ['Last evaluated', v => list(v.lastEvaluated)],
    ['Mapping extent', v => v.position == null ? (v.mappingReason?.replaceAll('_', ' ') || 'Not mapped') : v.mappingExtent === 'frameshift_anchor' ? 'Reported frameshift anchor only' : 'Reported residue or span'],
    ['Source record', v => <a href={clinvarUrl(v)} target="_blank" rel="noopener noreferrer">ClinVar {v.variationId} ↗</a>],
  ];
  return <section className="comparison-panel" id="comparison" aria-labelledby="comparison-heading">
    <div className="research-heading"><div><span className="eyebrow">RESEARCH WORKSPACE</span><h2 id="comparison-heading">Compare variants <span className="count-pill">{variants.length} / 4</span></h2></div>
      {!!variants.length && <div className="research-actions"><button className="text-button" onClick={onClear}>Clear comparison</button><button className="button small" onClick={onExport}>Export comparison CSV</button></div>}
    </div>
    {!variants.length ? <p className="comparison-empty">Use <strong>Compare</strong> in the variant library to keep up to four records side by side. Your selection stays available as you change filters.</p> : <>
      <div className="comparison-scroll" tabIndex="0" aria-label="Variant comparison table; scroll horizontally for more variants">
        <table className="comparison-table"><thead><tr><th scope="col">RECORD FIELD</th>{variants.map(v => <th key={v.variationId} scope="col"><div className="comparison-column-heading"><button className="variant-name mono" onClick={() => onInspect(v)}>{variantName(v)}</button><button className="icon-button compare-remove" aria-label={`Remove variant ${v.variationId} from comparison`} onClick={() => onRemove(v.variationId)}>×</button></div><span className="comparison-id">Variation ID {v.variationId}</span></th>)}</tr></thead>
          <tbody>{rows.map(([label, render]) => <tr key={label}><th scope="row">{label}</th>{variants.map(v => <td key={v.variationId}>{render(v)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="research-footnote">Comparison uses this fixed snapshot, independent of current filters. Review stars describe ClinVar review status, not the severity of a variant. External ClinVar records may have changed.</p>
    </>}
  </section>;
}

export function SequenceContext({ variant, data }) {
  const context = getSequenceContext(data.protein.sequence, variant, 10);
  const [message, setMessage] = useState('');
  if (!context) return <section className="sequence-context"><h3>Reference sequence context</h3><p>A reliable protein position is unavailable for this record. No sequence context is inferred from coding or genomic coordinates.</p></section>;
  const fasta = `>sp|Q02388|COL7A1_HUMAN reference_residues=${context.start}-${context.end} variation_id=${variant.variationId}\n${context.sequence.match(/.{1,60}/g).join('\n')}\n`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(fasta); setMessage('Reference FASTA copied.'); }
    catch { setMessage('Clipboard unavailable. Use Download FASTA.'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([fasta], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `Q02388-${context.start}-${context.end}-reference.fasta`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Reference FASTA downloaded.');
  };
  return <section className="sequence-context" aria-label="Reference protein sequence context">
    <div className="sequence-heading"><h3>Reference sequence context</h3><span className="mono">Q02388 · {format(context.start)}–{format(context.end)} aa</span></div>
    <div className="sequence-residues" aria-label={`Reference residues ${context.start} to ${context.end}; reported ${variant.mappingExtent === 'frameshift_anchor' ? 'anchor' : 'residue or span'} ${variant.position} to ${variant.end} highlighted`}>
      {context.residues.map((residue, index) => residue.gap ? <span className="sequence-gap" key={`gap-${index}`}>… {format(residue.count)} residues omitted …</span> : <span key={residue.position} className={`sequence-residue ${residue.highlighted ? 'is-affected' : ''}`} title={`Reference ${residue.aa}${residue.position}${residue.highlighted ? ' · reported position' : ''}`}><b>{residue.aa}</b><small>{residue.position}</small></span>)}
    </div>
    <p className="sequence-note"><span className="sequence-key"/> Highlighted: reported {variant.mappingExtent === 'frameshift_anchor' ? 'frameshift anchor' : 'residue or span'}. Up to 10 flanking residues on either side. This is the reference sequence; altered protein sequence is not predicted.{context.truncated ? ' Download includes the complete reference interval.' : ''}</p>
    <div className="sequence-actions"><button className="button small" onClick={copy}>Copy FASTA</button><button className="button small" onClick={download}>Download FASTA</button><span role="status">{message}</span></div>
  </section>;
}
