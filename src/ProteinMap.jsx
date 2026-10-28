import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, format } from './data-utils.mjs';
import { buildMapBins, binIndexAtRatio, getBinVariants, getDockPage } from './map-utils.mjs';
import './protein-map.css';

const W = 1200, H = 328, LEFT = 164, RIGHT = 28, TRACK = W - LEFT - RIGHT;
const TOP = 18, LANE = 34, CHART_HEIGHT = LANE * GROUPS.length;
const PAGE_SIZE = 7;
const familyColor = d => d.label.includes('VWFA') ? '#7a9cba' : d.label.includes('Fibronectin') ? '#9bb6a8' : d.label.includes('Kunitz') ? '#b0a0c9' : '#d5dbdc';
const regionColor = d => d.label === 'NC1' ? '#dce9e3' : d.label === 'NC2' ? '#e7e2ef' : '#dce9ec';
const shortDomain = d => d.label.replace('Fibronectin type-III ', 'FN').replace('VWFA ', 'vWA ').replace('BPTI/Kunitz inhibitor', 'K');
const variantName = v => v.proteinHgvs[0] || v.codingHgvs[0] || `Variation ${v.variationId}`;
const activate = (event, action) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
};

function axisTicks(view) {
  const length = view.end - view.start + 1;
  if (length === 1) return [view.start];
  const target = length / 6;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(1, [1, 2, 5, 10].map(n => n * power).find(n => n >= target));
  const ticks = [view.start];
  for (let p = Math.ceil((view.start + step / 3) / step) * step; p < view.end - step / 3; p += step) ticks.push(p);
  ticks.push(view.end);
  return ticks;
}

// Hover never re-renders this artwork. Each lane is one path, regardless of
// whether the underlying snapshot contains dozens or thousands of records.
const OverviewArt = memo(function OverviewArt({ model, domains, selection, onSelectDomain }) {
  const { view, bins } = model;
  const length = view.end - view.start + 1;
  const x = p => LEFT + (p - view.start) / length * TRACK;
  const width = (start, end) => (end - start + 1) / length * TRACK;
  const visibleDomains = domains.filter(d => d.end >= view.start && d.start <= view.end);
  const maxCount = Math.max(1, model.maxCount);
  const paths = GROUPS.map((group, lane) => bins.map(bin => {
    const count = bin.counts[group.id];
    if (!count) return '';
    const h = Math.max(2, Math.sqrt(count / maxCount) * 23);
    const px = x(bin.start) + 1;
    const py = TOP + lane * LANE + 27 - h;
    const barWidth = Math.max(1, width(bin.start, bin.end) - 2);
    return `M${px.toFixed(2)},${py.toFixed(2)}h${barWidth.toFixed(2)}v${h.toFixed(2)}h-${barWidth.toFixed(2)}Z`;
  }).join(''));
  return <g className="overview-art">
    <defs><clipPath id="overview-plot-clip"><rect x={LEFT} y="0" width={TRACK} height={H}/></clipPath></defs>
    {axisTicks(view).map(t => <g key={t}>
      <line x1={x(t)} x2={x(t)} y1={TOP} y2={TOP + CHART_HEIGHT} className="overview-grid"/>
      <text x={x(t)} y="210" textAnchor={t === view.start ? 'start' : t === view.end ? 'end' : 'middle'} className="axis-text">{format(t)}</text>
    </g>)}
    {selection && <g clipPath="url(#overview-plot-clip)" pointerEvents="none">
      <rect x={x(selection.start)} y={TOP} width={Math.max(width(selection.start, selection.end), 2)} height={CHART_HEIGHT} className="overview-selection"/>
    </g>}
    {GROUPS.map((group, lane) => <g key={group.id}>
      <circle cx="12" cy={TOP + lane * LANE + 15} r="3.5" fill={group.color}/>
      <text x="25" y={TOP + lane * LANE + 19} className="overview-lane-label">{group.short}</text>
      <text x={LEFT - 13} y={TOP + lane * LANE + 19} textAnchor="end" className="overview-lane-count">{format(model.totals[group.id])}</text>
      <line x1={LEFT} x2={W - RIGHT} y1={TOP + lane * LANE + 28} y2={TOP + lane * LANE + 28} className="overview-baseline"/>
      <path d={paths[lane]} fill={group.color} className="overview-bar"/>
    </g>)}
    <text x="12" y="251" className="track-label strong">Regions</text>
    <text x="12" y="294" className="track-label">Subdomains</text>
    <g clipPath="url(#overview-plot-clip)">
      {visibleDomains.filter(d => d.level !== 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => onSelectDomain(d)} onKeyDown={e => activate(e, () => onSelectDomain(d))}>
        <title>{`${d.label} · ${d.start}–${d.end} aa · click to select`}</title>
        <rect x={x(d.start)} y="233" width={width(d.start, d.end)} height="28" rx="5" fill={regionColor(d)} stroke={selection?.id === d.id ? '#266e60' : '#b9cbca'} strokeWidth={selection?.id === d.id ? 2 : 1}/>
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 45 && <text x={x((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y="251" textAnchor="middle" className="domain-text">{d.label === 'Collagenous' && width(d.start, d.end) > 280 ? 'Collagenous · triple-helical region' : d.label}</text>}
      </g>)}
      <line x1={LEFT} x2={W - RIGHT} y1="289" y2="289" className="overview-domain-line"/>
      {visibleDomains.filter(d => d.level === 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => onSelectDomain(d)} onKeyDown={e => activate(e, () => onSelectDomain(d))}>
        <title>{`${d.label} · ${d.start}–${d.end} aa · click to select`}</title>
        <rect x={x(d.start)} y="276" width={width(d.start, d.end)} height="26" rx="4" fill={familyColor(d)} stroke={selection?.id === d.id ? '#205f52' : '#fff'} strokeWidth={selection?.id === d.id ? 2 : 1}/>
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 17 && <text x={x((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y="294" textAnchor="middle" className="subdomain-text">{shortDomain(d)}</text>}
      </g>)}
    </g>
  </g>;
});

const DockCard = memo(function DockCard({ variant, onInspect }) {
  const group = GROUPS.find(g => g.id === variant.significanceGroup);
  return <button className="dock-card" title={`${variantName(variant)} · ${variant.clinicalSignificance.join(' / ')}`} style={{ '--variant-color': group.color }} onClick={() => onInspect(variant)} aria-label={`Inspect ${variantName(variant)}, variant ${variant.variationId}, ${variant.clinicalSignificance.join(' / ')}`}>
    <span className="dock-card-position">{format(variant.position)}{variant.end !== variant.position ? `–${format(variant.end)}` : ''} <small>aa</small>{variant.glycineSubstitution && <span className="dock-gly" title="Collagenous glycine substitution">◇ Gly</span>}</span>
    <strong className="dock-card-name mono" title={variantName(variant)}>{variantName(variant)}</strong>
    <span className="dock-card-significance" title={variant.clinicalSignificance.join(' / ') || group.label}>{variant.clinicalSignificance.join(' / ') || group.label}</span>
    <span className="dock-card-id">Variation {variant.variationId} <span aria-hidden="true">↗</span></span>
  </button>;
});

function exportMap(source, data, model) {
  if (!source) return;
  const clone = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((node, i) => {
    const style = getComputedStyle(node);
    for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor']) copies[i].style.setProperty(prop, style.getPropertyValue(prop));
    copies[i].removeAttribute('tabindex'); copies[i].removeAttribute('role');
  });
  clone.querySelectorAll('[data-export-ignore]').forEach(node => node.remove());
  const ns = 'http://www.w3.org/2000/svg', outer = document.createElementNS(ns, 'svg');
  outer.setAttribute('xmlns', ns); outer.setAttribute('viewBox', `0 0 ${W} ${H + 90}`); outer.setAttribute('width', String(W)); outer.setAttribute('height', String(H + 90));
  const colors = getComputedStyle(document.documentElement);
  const bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', colors.getPropertyValue('--surface').trim() || '#fff'); outer.append(bg);
  const label = (text, y, size) => {
    const el = document.createElementNS(ns, 'text'); el.setAttribute('x', '18'); el.setAttribute('y', String(y)); el.setAttribute('fill', colors.getPropertyValue('--ink').trim() || '#253c38'); el.setAttribute('font-family', 'Arial, sans-serif'); el.setAttribute('font-size', String(size)); el.textContent = text; outer.append(el);
  };
  label(`COL7A1 · Q02388 · ${model.view.start}–${model.view.end} aa · variant density`, 26, 18);
  clone.setAttribute('y', '36'); clone.setAttribute('width', String(W)); clone.setAttribute('height', String(H)); outer.append(clone);
  label(`Prepared ${data.snapshot.preparedDate} · ${model.mappedCount} mapped variants · ${model.binSize}-residue bins · shared square-root count scale`, H + 59, 12);
  label('1-based precursor · ClinVar release date not recorded · export session JSON for filters and source hashes', H + 77, 11);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(outer)], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `COL7A1-map-${model.view.start}-${model.view.end}.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ProteinMap({ data, variants, selection, setSelection, view, setView, onInspect, mode, setMode }) {
  const model = useMemo(() => buildMapBins(variants, view, 72), [variants, view.start, view.end]);
  const [focus, setFocus] = useState({ index: 0, group: 'all' });
  const [locked, setLocked] = useState(false);
  const [page, setPage] = useState(0);
  const svgRef = useRef(null), frame = useRef(null), pending = useRef(null);
  const activeIndex = Math.min(focus.index, model.bins.length - 1);
  const bin = model.bins[activeIndex];
  const records = useMemo(() => getBinVariants(model, activeIndex, focus.group), [model, activeIndex, focus.group]);
  const dock = getDockPage(records, page, PAGE_SIZE);
  const length = view.end - view.start + 1;
  const full = view.start === 1 && view.end === data.protein.length;
  const focusedGroup = GROUPS.find(g => g.id === focus.group);
  const focusLane = GROUPS.findIndex(g => g.id === focus.group);
  const chooseDomain = useCallback(d => setSelection({ start: d.start, end: d.end, label: d.label, id: d.id }), [setSelection]);
  const chooseFocus = useCallback((index, group, freeze = false) => {
    setFocus(current => current.index === index && current.group === group ? current : { index, group });
    setPage(0);
    if (freeze) {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null; pending.current = null; setLocked(true);
    }
  }, []);

  useEffect(() => {
    const middle = Math.floor(model.bins.length / 2);
    const initial = model.bins.reduce((best, item) => item.total && Math.abs(item.index - middle) < Math.abs(best - middle) ? item.index : best, model.bins.find(item => item.total)?.index ?? middle);
    setFocus({ index: initial, group: 'all' }); setPage(0); setLocked(false);
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null; pending.current = null;
  }, [model]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  const stopPointer = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null; pending.current = null;
  }, []);
  const locate = useCallback((clientX, clientY, bounds) => {
    const px = (clientX - bounds.left) / bounds.width * W;
    const py = (clientY - bounds.top) / bounds.height * H;
    return {
      index: binIndexAtRatio((px - LEFT) / TRACK, model),
      group: GROUPS[Math.max(0, Math.min(GROUPS.length - 1, Math.floor((py - TOP) / LANE)))].id,
    };
  }, [model]);
  const followPointer = useCallback(event => {
    if (locked || mode !== 'variants' || event.pointerType === 'touch') return;
    pending.current = { x: event.clientX, y: event.clientY };
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!pending.current || !svgRef.current) return;
      const next = locate(pending.current.x, pending.current.y, svgRef.current.getBoundingClientRect());
      chooseFocus(next.index, next.group);
    });
  }, [locked, mode, locate, chooseFocus]);
  const pinPointer = useCallback(event => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null; pending.current = null;
    const next = locate(event.clientX, event.clientY, svgRef.current.getBoundingClientRect());
    chooseFocus(next.index, next.group, true);
    if (mode !== 'variants') setMode('variants');
  }, [locate, chooseFocus, mode, setMode]);
  const moveBin = delta => chooseFocus(Math.max(0, Math.min(model.bins.length - 1, activeIndex + delta)), focus.group, true);

  return <section className="map-panel protein-map-v2" aria-labelledby="map-heading">
    <div className="panel-heading">
      <div><div className="eyebrow"><span className="live-dot"/> PROTEIN EXPLORER</div><h2 id="map-heading">Find a region. Explore its variants.</h2></div>
      <div className="map-tools">
        <div className="segmented" aria-label="Map display">
          <button aria-pressed={mode === 'variants'} onClick={() => setMode('variants')}>Variant dock</button>
          <button aria-pressed={mode === 'density'} onClick={() => setMode('density')}>Density only</button>
        </div>
        <button className="button small" onClick={() => exportMap(svgRef.current, data, model)}>Export SVG ↓</button>
        <button className="button small" disabled={!selection} onClick={() => setView({ start: selection.start, end: selection.end })}>Zoom to selection ↗</button>
        {!full && <button className="text-button" onClick={() => setView({ start: 1, end: data.protein.length })}>Full protein ↺</button>}
      </div>
    </div>
    <div className="map-context"><span><strong>{format(model.mappedCount)}</strong> mapped variants <span className="muted">· {model.binSize}-residue bins · shared √count scale</span></span><span className="mono">{format(view.start)}—{format(view.end)} aa</span></div>
    <div className="overview-help" id="map-help"><span className="overview-help-icon" aria-hidden="true">↔</span><span>{mode === 'variants' ? 'Move across a colored track to reveal individual variants below. Click to hold a spot.' : 'A compact view of variant counts. Click a track to open its individual records.'}</span><span className="overview-help-secondary">Click a domain to select its region.</span></div>
    <div className="overview-viewport">
      <svg ref={svgRef} className="protein-svg overview-svg" viewBox={`0 0 ${W} ${H}`} aria-label={`COL7A1 variant density by protein position and clinical significance. ${mode === 'variants' ? 'Use the position slider below to explore individual records.' : 'Switch to Variant dock to explore individual records.'}`} aria-describedby="map-help">
        <OverviewArt model={model} domains={data.domains} selection={selection} onSelectDomain={chooseDomain}/>
        {mode === 'variants' && bin && <g className="overview-highlight" pointerEvents="none" data-export-ignore="true">
          <rect x={LEFT + (bin.start - view.start) / length * TRACK} y={TOP} width={(bin.end - bin.start + 1) / length * TRACK} height={CHART_HEIGHT} className="overview-active-band"/>
          {focusLane >= 0 && <rect x={LEFT + (bin.start - view.start) / length * TRACK} y={TOP + focusLane * LANE} width={(bin.end - bin.start + 1) / length * TRACK} height={LANE} className="overview-active-lane" style={{ '--variant-color': focusedGroup.color }}/>}
        </g>}
        <rect x={LEFT} y={TOP} width={TRACK} height={CHART_HEIGHT} fill="transparent" className="overview-hit-area" onPointerMove={followPointer} onPointerLeave={stopPointer} onClick={pinPointer} data-export-ignore="true"/>
      </svg>
    </div>
    {mode === 'variants' && bin && <div className="dock-panel">
      <div className="dock-heading">
        <div><div className="eyebrow">VARIANT DOCK <span className={locked ? 'dock-state is-locked' : 'dock-state'}>{locked ? 'Held' : 'Following pointer'}</span></div><h3>{format(bin.start)}–{format(bin.end)} <small>aa</small> <span className="dock-record-count">{format(records.length)} {records.length === 1 ? 'record' : 'records'}</span></h3></div>
        <div className="dock-navigation">
          <select aria-label="Dock classification" value={focus.group} onChange={event => chooseFocus(activeIndex, event.target.value, true)}><option value="all">All classifications</option>{GROUPS.map(g => <option key={g.id} value={g.id}>{g.short}</option>)}</select>
          <button className="button small" aria-pressed={locked} onClick={() => { stopPointer(); setLocked(value => !value); }}>{locked ? 'Resume hover' : 'Hold this spot'}</button>
          <button className="button small" onClick={() => setSelection({ start: bin.start, end: bin.end, label: `Residues ${format(bin.start)}–${format(bin.end)}` })}>Filter this range ↗</button>
        </div>
      </div>
      <div className="dock-scrubber">
        <button className="button small" aria-label="Previous protein window" disabled={activeIndex === 0} onClick={() => moveBin(-1)}>←</button>
        <input type="range" min="0" max={model.bins.length - 1} value={activeIndex} aria-label="Explore protein position" aria-valuetext={`${bin.start} to ${bin.end} amino acids`} onChange={event => chooseFocus(Number(event.target.value), focus.group, true)}/>
        <button className="button small" aria-label="Next protein window" disabled={activeIndex === model.bins.length - 1} onClick={() => moveBin(1)}>→</button>
        <span>{format(bin.start)}–{format(bin.end)} aa</span>
      </div>
      <div className="variant-dock" aria-label={`Individual variants at ${bin.start} to ${bin.end} amino acids`}>
        {dock.records.length ? dock.records.map(v => <DockCard key={v.variationId} variant={v} onInspect={onInspect}/>) : <div className="dock-empty"><strong>No {focusedGroup ? focusedGroup.short.toLowerCase() : ''} records in this window.</strong><span>Move along the map, choose another classification, or broaden the active filters.</span>{focus.group !== 'all' && <button className="text-button" onClick={() => chooseFocus(activeIndex, 'all', true)}>Show all classifications here</button>}</div>}
      </div>
      <div className="dock-pagination"><span>{records.length ? `${dock.start}–${dock.end} of ${format(records.length)} records` : '0 records'} <span className="dock-paging-note">· Hover a card to enlarge; click for evidence and sequence.</span></span><div><button className="button small" disabled={dock.page === 0} onClick={() => { setPage(dock.page - 1); setLocked(true); }}>Previous records</button><button className="button small" disabled={dock.page >= dock.pages - 1} onClick={() => { setPage(dock.page + 1); setLocked(true); }}>Next records</button></div></div>
    </div>}
    <div className="map-footer"><span>One count per mapped record at its reported anchor; overlaps beginning outside the view are placed at its edge.</span><span><span className="diamond">◇</span> Glycine substitutions are marked on individual cards.</span></div>
  </section>;
}

export default memo(ProteinMap);
