import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GROUPS } from './data-utils.mjs';
import './column-filters.css';

const MISSING = '__missing__';
const CONFIG = {
  variant: { field: 'types', source: 'types', heading: 'Variant / HGVS', values: 'Variant types', missing: 'Variant type not provided' },
  position: { heading: 'Position' },
  region: { field: 'regions', source: 'regions', heading: 'Region', values: 'Regions', missing: 'No mapped region' },
  significance: { field: 'significances', source: 'clinicalSignificance', heading: 'Clinical significance', values: 'Source classifications', missing: 'Classification not provided' },
  review: { field: 'reviewStatuses', source: 'reviewStatus', heading: 'Review status', values: 'Source review statuses', missing: 'Review status not provided' },
};

function selectedValues(column, filters, data) {
  const value = filters[CONFIG[column].field];
  if (Array.isArray(value)) return value;
  if (column === 'variant' && filters.type) return [filters.type];
  if (column === 'review' && filters.reviewStatus) return [filters.reviewStatus];
  if (column === 'significance' && !GROUPS.every(group => filters.groups.includes(group.id))) {
    return [...new Set(data.variants.filter(variant => filters.groups.includes(variant.significanceGroup)).flatMap(variant => variant.clinicalSignificance?.length ? variant.clinicalSignificance : [MISSING]))];
  }
  return null;
}
function draftFor(column, filters, selection, data) {
  return {
    values: selectedValues(column, filters, data),
    query: filters.query || '',
    mapping: filters.mapping || 'all',
    minReview: filters.minReview ?? '',
    start: selection ? String(selection.start) : '',
    end: selection ? String(selection.end) : '',
  };
}
function clearPatch(column) {
  if (column === 'variant') return { query: '', type: '', types: null };
  if (column === 'position') return { mapping: 'all' };
  if (column === 'review') return { minReview: '', reviewStatus: '', reviewStatuses: null };
  if (column === 'significance') return { significances: null, groups: GROUPS.map(group => group.id) };
  return { [CONFIG[column].field]: null };
}
function activeCount(column, filters, selection, data) {
  const selected = selectedValues(column, filters, data);
  const selectedCount = selected === null ? 0 : Math.max(1, selected.length);
  if (column === 'variant') return selectedCount + (filters.query ? 1 : 0);
  if (column === 'position') return (filters.mapping !== 'all' ? 1 : 0) + (selection ? 1 : 0);
  if (column === 'review') return selectedCount + (filters.minReview !== '' && filters.minReview != null ? 1 : 0);
  return selectedCount;
}
function Funnel() {
  return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4h14l-5.2 6.2V16l-3.6-1.8v-4Z" strokeLinejoin="round"/></svg>;
}

/** Use inside a th. Changes are staged until Apply; range undefined is unchanged. */
export default function ColumnFilterHeader({ column, label, data, filters, selection, onApply }) {
  const config = CONFIG[column];
  const dialogId = useId(), headingId = useId();
  const trigger = useRef(null), popover = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFor(column, filters, selection, data));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 500 });
  const count = activeCount(column, filters, selection, data);
  const options = useMemo(() => {
    if (!config.source) return [];
    const counts = new Map();
    for (const variant of data.variants) {
      const source = variant[config.source];
      const values = source?.length ? [...new Set(source)] : [MISSING];
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a === MISSING ? 1 : b === MISSING ? -1 : a.localeCompare(b))
      .map(([value, total]) => ({ value, total, label: value === MISSING ? config.missing : value }));
  }, [data.variants, config]);
  const visibleOptions = useMemo(() => options.filter(option => option.label.toLowerCase().includes(search.trim().toLowerCase())), [options, search]);
  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }, []);
  const place = useCallback(() => {
    if (!trigger.current || !popover.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const below = window.innerHeight - anchor.bottom - 20;
    const above = anchor.top - 20;
    const downward = below >= 260 || below >= above;
    const maxHeight = Math.max(140, Math.min(window.innerHeight * .65, downward ? below : above));
    const height = Math.min(popover.current.getBoundingClientRect().height, maxHeight);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const top = downward ? anchor.bottom + 8 : Math.max(12, anchor.top - height - 8);
    setPosition(previous => previous.left === left && previous.top === top && previous.maxHeight === maxHeight ? previous : { left, top, maxHeight });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, error, search, place]);
  useEffect(() => {
    if (!open) return;
    const focus = requestAnimationFrame(() => popover.current?.querySelector('[data-filter-autofocus]')?.focus());
    const outside = event => {
      if (!popover.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    };
    const scroll = event => { if (!popover.current?.contains(event.target)) close(false); };
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(focus);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);
  const toggleOpen = () => {
    if (open) { close(); return; }
    setDraft(draftFor(column, filters, selection, data)); setSearch(''); setError(''); setOpen(true);
  };
  const toggleValue = value => {
    setDraft(current => {
      const selected = current.values === null ? options.map(option => option.value) : current.values;
      const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
      return { ...current, values: next.length === options.length ? null : next };
    });
  };
  const apply = event => {
    event.preventDefault();
    let patch, range;
    if (column === 'position') {
      patch = { mapping: draft.mapping };
      range = null;
      if (draft.mapping !== 'unmapped' && (draft.start.trim() || draft.end.trim())) {
        const start = draft.start.trim() ? Number(draft.start) : 1;
        const end = draft.end.trim() ? Number(draft.end) : data.protein.length;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > data.protein.length || start > end) {
          setError(`Use whole residues from 1 to ${data.protein.length.toLocaleString('en-US')}, with start no greater than end.`); return;
        }
        range = selection?.start === start && selection?.end === end ? selection : { start, end, label: `Residues ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')}` };
      }
    } else if (column === 'variant') patch = { query: draft.query.trim(), type: '', types: draft.values };
    else if (column === 'review') patch = { minReview: draft.minReview, reviewStatus: '', reviewStatuses: draft.values };
    else if (column === 'significance') patch = { significances: draft.values, groups: GROUPS.map(group => group.id) };
    else patch = { [config.field]: draft.values };
    onApply(patch, range); close();
  };
  const clear = () => { onApply(clearPatch(column), column === 'position' ? null : undefined); close(); };
  const cycleFocus = event => {
    if (event.key !== 'Tab') return;
    const focusable = [...popover.current.querySelectorAll('button,input,select,[tabindex="0"]')].filter(element => !element.disabled);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <>
    <button ref={trigger} type="button" className={`column-filter-trigger${count ? ' has-filter' : ''}`} aria-label={`Filter ${config.heading}${count ? ', active' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={toggleOpen}>
      <span>{label || config.heading}</span><Funnel/>{count > 0 && <span className="column-filter-count" aria-label={`${count} active filter conditions`}>{count}</span>}
    </button>
    {open && createPortal(<div ref={popover} id={dialogId} role="dialog" aria-labelledby={headingId} className="column-filter-popover" style={position} onKeyDown={cycleFocus}>
      <div className="column-filter-heading"><h3 id={headingId}>Filter {config.heading}</h3><button type="button" className="column-filter-close" aria-label="Close column filter" onClick={() => close()}>×</button></div>
      <form onSubmit={apply}>
        <div className="column-filter-body">
          {column === 'variant' && <label className="column-filter-field">Search variants<input data-filter-autofocus type="search" value={draft.query} maxLength="500" placeholder="HGVS, VCV ID, condition, or residue" onChange={event => setDraft({ ...draft, query: event.target.value })}/></label>}
          {column === 'position' && <>
            <fieldset className="column-filter-mapping"><legend>Protein mapping</legend>{[['all','All variants'],['mapped','Mapped to protein'],['unmapped','Unmapped only']].map(([value, text], index) => <label key={value}><input data-filter-autofocus={index === 0 ? true : undefined} type="radio" name={`${dialogId}-mapping`} value={value} checked={draft.mapping === value} onChange={() => { setDraft({ ...draft, mapping: value }); setError(''); }}/>{text}</label>)}</fieldset>
            <div className="column-filter-range"><label>From residue<input aria-label="Column range start" type="number" min="1" max={data.protein.length} step="1" placeholder="1" disabled={draft.mapping === 'unmapped'} value={draft.start} onChange={event => { setDraft({ ...draft, start: event.target.value }); setError(''); }}/></label><span>–</span><label>To residue<input aria-label="Column range end" type="number" min="1" max={data.protein.length} step="1" placeholder={String(data.protein.length)} disabled={draft.mapping === 'unmapped'} value={draft.end} onChange={event => { setDraft({ ...draft, end: event.target.value }); setError(''); }}/></label></div>
            <p className="column-filter-note">Ranges include variants whose reported spans overlap the interval. Leave both ends blank for all positions.</p>
          </>}
          {column === 'review' && <label className="column-filter-field">Minimum review support<select data-filter-autofocus aria-label="Minimum review support" value={draft.minReview} onChange={event => setDraft({ ...draft, minReview: event.target.value })}><option value="">Any review level</option><option value="0">Recorded status (0+ stars)</option><option value="1">At least 1 star</option><option value="2">At least 2 stars</option><option value="3">At least 3 stars</option><option value="4">4 stars</option></select></label>}
          {config.field && <fieldset className="column-filter-values"><legend>{config.values}</legend>
            <input data-filter-autofocus={column === 'region' || column === 'significance' ? true : undefined} className="column-option-search" type="search" aria-label={`Search ${config.values.toLowerCase()}`} placeholder="Find a value…" maxLength="200" value={search} onChange={event => setSearch(event.target.value)}/>
            <div className="column-filter-selection"><button type="button" onClick={() => setDraft({ ...draft, values: null })}>All values</button><button type="button" onClick={() => setDraft({ ...draft, values: [] })}>Clear selection</button><span>{draft.values === null ? 'All included' : `${draft.values.length} selected`}</span></div>
            <div className="column-filter-options">{visibleOptions.map(option => <label key={option.value}><input type="checkbox" checked={draft.values === null || draft.values.includes(option.value)} onChange={() => toggleValue(option.value)}/><span>{option.label}</span><small>{option.total.toLocaleString('en-US')}</small></label>)}{!visibleOptions.length && <p>No values match this search.</p>}</div>
            <p className="column-filter-note">Match any checked value. Counts refer to the full snapshot; other columns narrow the results further.</p>
            {draft.values?.length === 0 && <p className="column-filter-warning">No values selected. Applying this will show no matching variants.</p>}
          </fieldset>}
          {column === 'review' && <p className="column-filter-note">Review support and status are combined. Missing review status is different from zero stars.</p>}
          {error && <p role="alert" className="column-filter-error">{error}</p>}
        </div>
        <div className="column-filter-actions"><button type="button" className="column-filter-clear" onClick={clear}>Clear column</button><button type="button" className="button small" onClick={() => close()}>Cancel</button><button type="submit" className="button small column-filter-apply">Apply filters</button></div>
      </form>
    </div>, document.body)}
  </>;
}
