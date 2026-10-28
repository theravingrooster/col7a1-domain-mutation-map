import React, { memo, useEffect, useId, useMemo, useState } from 'react';
import { GROUPS, format } from './data-utils.mjs';
import { EvidenceBadge } from './ResearchTools.jsx';
import './variant-pins.css';

const PAGE_SIZE = 15;
const variantName = variant => variant.proteinHgvs?.[0] || variant.codingHgvs?.[0] || `Variation ${variant.variationId}`;
const groupFor = variant => GROUPS.find(group => group.id === variant.significanceGroup) || GROUPS[GROUPS.length - 1];
const significanceFor = variant => variant.clinicalSignificance?.join(' / ') || groupFor(variant).label;
const positionFor = variant => variant.position == null ? 'Unmapped' : `${format(variant.position)}${variant.end != null && variant.end !== variant.position ? `–${format(variant.end)}` : ''} aa`;
const initialState = records => ({ records, page: 0, index: 0, held: false });

function VariantPins({ records, onInspect, onSelectRange }) {
  const descriptionId = useId();
  const detailId = useId();
  const [state, setState] = useState(() => initialState(records));
  // Derive a fresh state immediately, so a changed bin never briefly displays
  // the prior bin's selected ID while the reset effect is being committed.
  const current = state.records === records ? state : initialState(records);
  useEffect(() => { setState(initialState(records)); }, [records]);

  const ordered = useMemo(() => [...records].sort((a, b) =>
    (a.position ?? Infinity) - (b.position ?? Infinity) || Number(a.variationId) - Number(b.variationId)
  ), [records]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const page = Math.min(current.page, pageCount - 1);
  const pageStart = page * PAGE_SIZE;
  const visible = useMemo(() => ordered.slice(pageStart, pageStart + PAGE_SIZE), [ordered, pageStart]);
  const activeIndex = Math.max(pageStart, Math.min(current.index, pageStart + visible.length - 1));
  const active = ordered[activeIndex];
  const activeGroup = active ? groupFor(active) : null;

  // Pointer entry changes the preview once per pin. There are no pointer-move
  // listeners, layout reads, or animation frames; CSS animates only transforms.
  const preview = index => {
    if (!current.held && current.index !== index) setState({ ...current, index });
  };
  const select = index => setState({ ...current, index, held: true });
  const changePage = nextPage => setState({ records, page: nextPage, index: nextPage * PAGE_SIZE, held: false });

  return <div className="variant-pin-explorer">
    <div className="variant-pin-instructions">
      <p id={descriptionId}>One pin per variant · ordered by residue, with expanded spacing.<span>Hover or focus a pin to preview; click to select it.</span></p>
      <div className="variant-pin-hold">
        {current.held ? <button className="button small" onClick={() => setState({ ...current, held: false })}>Resume hover</button> : <span>Click a pin to hold its details</span>}
      </div>
    </div>

    {active ? <>
      <div className="variant-pin-scroll">
        <div className="variant-pin-row" role="group" aria-label="Individual variant pins" aria-describedby={descriptionId} style={{ '--pin-slots': Math.max(visible.length, 7) }}>
          <span className="variant-pin-baseline" aria-hidden="true"/>
          {visible.map((variant, localIndex) => {
            const index = pageStart + localIndex;
            const distance = Math.abs(index - activeIndex);
            const group = groupFor(variant);
            return <button
              key={variant.variationId}
              type="button"
              className={`variant-pin${distance === 0 ? ' is-active' : distance === 1 ? ' is-neighbor' : distance === 2 ? ' is-next-neighbor' : ''}${current.held && distance === 0 ? ' is-selected' : ''}`}
              style={{ '--variant-color': group.color }}
              aria-label={`Select ${variantName(variant)}, Variation ${variant.variationId}, ${positionFor(variant)}, ${significanceFor(variant)}`}
              aria-pressed={current.held && distance === 0}
              aria-controls={detailId}
              onPointerEnter={event => { if (event.pointerType !== 'touch') preview(index); }}
              onFocus={() => preview(index)}
              onClick={() => select(index)}
            >
              <span className="variant-pin-stem" aria-hidden="true"/>
              <span className="variant-pin-head" aria-hidden="true"/>
              <span className="variant-pin-foot" aria-hidden="true"/>
              <span className="variant-pin-position mono" aria-hidden="true">{format(variant.position)}</span>
              {variant.glycineSubstitution && <span className="variant-pin-gly-mark" aria-hidden="true">◇</span>}
            </button>;
          })}
        </div>
      </div>

      <section id={detailId} className="variant-pin-detail" aria-label="Variant details preview" style={{ '--variant-color': activeGroup.color }}>
        <div className="variant-pin-detail-main">
          <div className="variant-pin-detail-kicker"><span>{current.held ? 'SELECTED VARIANT' : 'VARIANT PREVIEW'}</span><span className="mono">Variation {active.variationId}</span></div>
          <h4 className="variant-pin-detail-name mono" title={variantName(active)}>{variantName(active)}</h4>
          <div className="variant-pin-detail-significance" title={significanceFor(active)}><span className="variant-pin-classification-dot"/><span>{significanceFor(active)}</span></div>
          <div className="variant-pin-detail-meta"><span className="mono">{positionFor(active)}</span>{active.glycineSubstitution && <span className="variant-pin-gly-badge" title="Collagenous glycine substitution">◇ Gly substitution</span>}</div>
          <p className="variant-pin-conditions" title={active.conditions?.join(' · ') || 'Conditions not provided'}><span>Conditions</span> {active.conditions?.join(' · ') || 'Not provided'}</p>
        </div>
        <div className="variant-pin-detail-actions">
          <EvidenceBadge variant={active}/>
          <button className="button variant-pin-open" onClick={() => onInspect(active)}>Open details <span aria-hidden="true">↗</span></button>
          <button className="button small" disabled={active.position == null} onClick={() => onSelectRange({ start: active.position, end: active.end ?? active.position, label: variantName(active) })}>Select range</button>
        </div>
      </section>
      <span className="sr-only" role="status">{current.held ? `Selected Variation ${active.variationId}. Details held until you select another pin or resume hover.` : ''}</span>
      <div className="variant-pin-pagination">
        <span>{format(pageStart + 1)}–{format(pageStart + visible.length)} of {format(ordered.length)} {ordered.length === 1 ? 'variant' : 'variants'}<small>Variants at the same residue have separate pins.</small></span>
        <div><button className="button small" aria-label="Previous page of variant pins" disabled={page === 0} onClick={() => changePage(page - 1)}>← Previous</button><span aria-label={`Page ${page + 1} of ${pageCount}`}>{page + 1} / {pageCount}</span><button className="button small" aria-label="Next page of variant pins" disabled={page >= pageCount - 1} onClick={() => changePage(page + 1)}>Next →</button></div>
      </div>
    </> : <div className="variant-pin-empty"><strong>No variants in this window.</strong><p>Choose another position or classification, or broaden your filters.</p></div>}
  </div>;
}

export default memo(VariantPins);
