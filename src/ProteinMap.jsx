import React, { memo, useCallback, useMemo, useRef } from 'react';
import { GROUPS, format } from './data-utils.mjs';
import { buildMapBins, binIndexAtRatio } from './map-utils.mjs';
import './protein-map.css';
import VariantPins from './VariantPins.jsx';

const W = 1200, H = 328, LEFT = 164, RIGHT = 28, TRACK = W - LEFT - RIGHT;
const TOP = 18, LANE = 34, CHART_HEIGHT = LANE * GROUPS.length;
const familyColor = d => d.label.includes('VWFA') ? '#7a9cba' : d.label.includes('Fibronectin') ? '#9bb6a8' : d.label.includes('Kunitz') ? '#b0a0c9' : '#d5dbdc';
const regionColor = d => d.label === 'NC1' ? '#dce9e3' : d.label === 'NC2' ? '#e7e2ef' : '#dce9ec';
const shortDomain = d => d.label.replace('Fibronectin type-III ', 'FN').replace('VWFA ', 'vWA ').replace('BPTI/Kunitz inhibitor', 'K');
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
const OverviewArt = memo(function OverviewArt({ model, domains, selection, onSelectDomain, compact = false, showAxis = true, clipId = "overview-plot-clip" }) {
  const { view, bins } = model;
  const length = view.end - view.start + 1;
  const x = p => LEFT + (p - view.start) / length * TRACK;
  const width = (start, end) => (end - start + 1) / length * TRACK;
  const visibleDomains = domains.filter(d => d.end >= view.start && d.start <= view.end);
  const maxCount = Math.max(1, model.maxCount);
  const regionY = compact ? (showAxis ? 50 : 16) : 233, domainY = compact ? (showAxis ? 93 : 59) : 276;
  const centerX = p => LEFT + (p - view.start + 0.5) / length * TRACK;
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
    <defs><clipPath id={clipId}><rect x={LEFT} y="0" width={TRACK} height={H}/></clipPath></defs>
    {showAxis && axisTicks(view).map(t => <g key={t}>
      {!compact && <line x1={centerX(t)} x2={centerX(t)} y1={TOP} y2={TOP + CHART_HEIGHT} className="overview-grid"/>}
      <text x={centerX(t)} y={compact ? 28 : 210} textAnchor={t === view.start ? 'start' : t === view.end ? 'end' : 'middle'} className="axis-text">{format(t)}</text>
    </g>)}
    {selection && <g clipPath={`url(#${clipId})`} pointerEvents="none">
      <rect x={x(selection.start)} y={compact ? regionY - 11 : TOP} width={Math.max(width(selection.start, selection.end), 2)} height={compact ? 85 : CHART_HEIGHT} className="overview-selection"/>
    </g>}
    {!compact && GROUPS.map((group, lane) => <g key={group.id}>
      <circle cx="12" cy={TOP + lane * LANE + 15} r="3.5" fill={group.color}/>
      <text x="25" y={TOP + lane * LANE + 19} className="overview-lane-label">{group.short}</text>
      <text x={LEFT - 13} y={TOP + lane * LANE + 19} textAnchor="end" className="overview-lane-count">{format(model.totals[group.id])}</text>
      <line x1={LEFT} x2={W - RIGHT} y1={TOP + lane * LANE + 28} y2={TOP + lane * LANE + 28} className="overview-baseline"/>
      <path d={paths[lane]} fill={group.color} className="overview-bar"/>
    </g>)}
    <text x="12" y={regionY + 18} className="track-label strong">Regions</text>
    <text x="12" y={domainY + 18} className="track-label">Subdomains</text>
    <g clipPath={`url(#${clipId})`}>
      {visibleDomains.filter(d => d.level !== 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => onSelectDomain(d)} onKeyDown={e => activate(e, () => onSelectDomain(d))}>
        <title>{`${d.label} · ${d.start}–${d.end} aa · click to select`}</title>
        <rect x={x(d.start)} y={regionY} width={width(d.start, d.end)} height="28" rx="5" fill={regionColor(d)} stroke={selection?.id === d.id ? '#266e60' : '#b9cbca'} strokeWidth={selection?.id === d.id ? 2 : 1}/>
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 45 && <text x={centerX((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y={regionY + 18} textAnchor="middle" className="domain-text">{d.label === 'Collagenous' && width(d.start, d.end) > 280 ? 'Collagenous · triple-helical region' : d.label}</text>}
      </g>)}
      <line x1={LEFT} x2={W - RIGHT} y1={domainY + 13} y2={domainY + 13} className="overview-domain-line"/>
      {visibleDomains.filter(d => d.level === 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => onSelectDomain(d)} onKeyDown={e => activate(e, () => onSelectDomain(d))}>
        <title>{`${d.label} · ${d.start}–${d.end} aa · click to select`}</title>
        <rect x={x(d.start)} y={domainY} width={width(d.start, d.end)} height="26" rx="4" fill={familyColor(d)} stroke={selection?.id === d.id ? '#205f52' : '#fff'} strokeWidth={selection?.id === d.id ? 2 : 1}/>
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 17 && <text x={centerX((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y={domainY + 18} textAnchor="middle" className="subdomain-text">{shortDomain(d)}</text>}
      </g>)}
    </g>
  </g>;
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
  const records = useMemo(() => model.bins.flatMap(bin => bin.variants), [model]);
  const svgRef = useRef(null), exportRef = useRef(null);
  const full = view.start === 1 && view.end === data.protein.length;
  const compact = mode === 'variants';
  const chooseDomain = useCallback(d => setSelection({ start: d.start, end: d.end, label: d.label, id: d.id }), [setSelection]);
  const chooseDensityWindow = event => {
    const bounds = svgRef.current.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width * W;
    const bin = model.bins[binIndexAtRatio((px - LEFT) / TRACK, model)];
    setView({ start: bin.start, end: bin.end });
    setMode('variants');
  };
  const domainContext = <div className="lollipop-domain-context"><svg className="protein-svg overview-svg" viewBox={`0 0 ${W} 100`} aria-label="COL7A1 protein regions and subdomains. Select a domain to filter its variants."><OverviewArt model={model} domains={data.domains} selection={selection} onSelectDomain={chooseDomain} compact showAxis={false}/></svg></div>;
  return <section className="map-panel protein-map-v2 protein-map-pins" aria-labelledby="map-heading">
    <div className="panel-heading">
      <div><div className="eyebrow"><span className="live-dot"/> PROTEIN EXPLORER</div><h2 id="map-heading">Lollipop mutation map</h2></div>
      <div className="map-tools">
        <div className="segmented" aria-label="Map display"><button aria-pressed={compact} onClick={() => setMode('variants')}>Lollipop diagram</button><button aria-pressed={!compact} onClick={() => setMode('density')}>Density overview</button></div>
        <button className="button small" onClick={() => exportMap(exportRef.current, data, model)}>Export density SVG ↓</button>
        <button className="button small" disabled={!selection} onClick={() => setView({ start: selection.start, end: selection.end })}>Zoom to selection ↗</button>
        {!full && <button className="text-button" onClick={() => setView({ start: 1, end: data.protein.length })}>Full protein ↺</button>}
      </div>
    </div>
    <div className="map-context"><span><strong>{format(model.mappedCount)}</strong> mapped variants <span className="muted">· {compact ? 'One pin per variant at its reported protein position.' : `${model.binSize}-residue bins · shared √count scale`}</span></span><span className="mono">{format(view.start)}—{format(view.end)} aa</span></div>
    {compact ? <VariantPins records={records} view={view} onInspect={onInspect} onSelectRange={setSelection} domainContext={domainContext}/> : <>
      <div className="overview-help">Click a density track to zoom into its individual variant pins.</div>
      <div className="overview-viewport"><svg ref={svgRef} className="protein-svg overview-svg" viewBox={`0 0 ${W} ${H}`} aria-label="COL7A1 variant density by protein position and classification."><OverviewArt model={model} domains={data.domains} selection={selection} onSelectDomain={chooseDomain}/><rect x={LEFT} y={TOP} width={TRACK} height={CHART_HEIGHT} fill="transparent" className="overview-hit-area" onClick={chooseDensityWindow} data-export-ignore="true"/></svg></div>
    </>}
    <div hidden aria-hidden="true"><svg ref={exportRef} className="protein-svg overview-svg" viewBox={`0 0 ${W} ${H}`}><OverviewArt model={model} domains={data.domains} selection={selection} onSelectDomain={chooseDomain} clipId="export-plot-clip"/></svg></div>
    <div className="map-footer"><span>{compact ? 'Hover temporarily expands crowded pins. Pin height reflects magnification, not patient frequency. Reported coordinates remain unchanged.' : 'One count per mapped record at its reported anchor; overlapping spans are clamped to the view edge.'}</span><span><span className="diamond">◇</span> Collagenous glycine substitution</span></div>
  </section>;
}

export default memo(ProteinMap);
