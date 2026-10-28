import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, format, groupMarkers } from './data-utils.mjs';
import { buildMapGeometry } from './map-render.mjs';
import MapTooltip from './MapTooltip.jsx';

const W = 1250, LEFT = 150, RIGHT = 25, TRACK = W - LEFT - RIGHT;
const familyColor = d => d.label.includes('VWFA') ? '#7a9cba' : d.label.includes('Fibronectin') ? '#9bb6a8' : d.label.includes('Kunitz') ? '#b0a0c9' : '#d5dbdc';
const regionColor = d => d.label === 'NC1' ? '#dce9e3' : d.label === 'NC2' ? '#e7e2ef' : '#dce9ec';
const shortDomain = d => d.label.replace('Fibronectin type-III ', 'FN').replace('VWFA ', 'vWA ').replace('BPTI/Kunitz inhibitor', 'K');
const activate = (e, fn) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
const rectBounds = el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};
function markerTip(item, mode) {
  const m = item.marker, group = GROUPS[item.lane];
  return {
    id: `marker:${m.key}`,
    title: mode === 'density' ? `${format(m.start)}–${format(m.end)} aa · ${m.variants.length} variants` : `${m.variants[0].proteinHgvs[0] || 'Protein variant'}${m.variants.length > 1 ? ` + ${m.variants.length - 1} more` : ''}`,
    detail: mode === 'density' ? `${group.label} · e.g. ${m.variants[0].proteinHgvs[0] || 'Protein variant'}` : m.variants[0].clinicalSignificance.join(' / ') || 'Not provided',
    foot: `Position ${format(m.start)}${m.end !== m.start ? '–' + format(m.end) : ''} aa${m.glycine ? (m.variants.length > 1 ? ' · group contains Gly substitutions' : ' · Gly substitution') : ''}`,
    action: 'Click or press Enter to explore variants',
  };
}

// The SVG artwork is stable during pointer movement. Thousands of source
// markers share a few vector paths; only the small highlight and tooltip update.
const MapStage = memo(function MapStage({ data, geometry, ticks, view, selection, mode, svgRef, interactionRef, onHover, onHide, onChooseMarker, onChooseDomain }) {
  const interaction = interactionRef.current;
  const length = view.end - view.start + 1;
  const x = p => LEFT + (p - view.start) / length * TRACK;
  const width = (s, e) => (e - s + 1) / length * TRACK;
  const visibleDomains = data.domains.filter(d => d.end >= view.start && d.start <= view.end);
  const cancelFrame = () => { if (interaction.frame) cancelAnimationFrame(interaction.frame); interaction.frame = 0; interaction.pending = null; };
  const hide = () => { cancelFrame(); interaction.shown = null; onHide(); };
  useEffect(() => {
    cancelFrame();
    interaction.active = -1;
    interaction.shown = null;
    return cancelFrame;
  }, [geometry]);
  const showMarker = (item, pointerX, keyboard = false) => {
    if (!item) { if (interaction.shown != null) { interaction.shown = null; onHide(); } return; }
    interaction.active = item.index;
    const key = `marker:${item.marker.key}`;
    if (interaction.shown === key && !keyboard) return;
    interaction.shown = key;
    const bounds = svgRef.current.getBoundingClientRect(), scale = bounds.width / W;
    const anchorX = pointerX == null ? item.cx : Math.min(Math.max(pointerX, item.cx), mode === 'density' ? item.cx + item.barWidth : item.xEnd);
    onHover({ ...markerTip(item, mode), item, keyboard, anchor: { left: bounds.left + (anchorX - 5) * scale, right: bounds.left + (anchorX + 5) * scale, top: bounds.top + (item.cy - 5) * scale, bottom: bounds.top + (item.cy + 5) * scale } });
  };
  const pointerItem = event => {
    const bounds = svgRef.current.getBoundingClientRect(), scale = bounds.width / W;
    const px = (event.clientX - bounds.left) / scale, py = (event.clientY - bounds.top) / scale;
    return { item: geometry.hitTest(px, py, Math.max(5, 5 / scale)), px };
  };
  const queuePointer = event => {
    interaction.pending = { clientX: event.clientX, clientY: event.clientY };
    if (interaction.frame) return;
    interaction.frame = requestAnimationFrame(() => {
      interaction.frame = 0;
      if (!interaction.pending) return;
      const { item, px } = pointerItem(interaction.pending);
      interaction.pending = null;
      showMarker(item, px);
    });
  };
  const choosePointer = event => {
    cancelFrame();
    const { item } = pointerItem(event);
    if (item) { interaction.active = item.index; onChooseMarker(item.marker); }
    interaction.shown = null;
    onHide();
  };
  const keyboard = e => {
    const count = geometry.items.length;
    if (!count) return;
    let index = interaction.active < 0 ? 0 : interaction.active;
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChooseMarker(geometry.items[index].marker); hide(); return; }
    if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = count - 1;
    else if (e.key === 'ArrowLeft') index--;
    else if (e.key === 'ArrowRight') index++;
    else if (e.key === 'PageUp') index -= 25;
    else if (e.key === 'PageDown') index += 25;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const current = geometry.items[index], lane = current.lane + (e.key === 'ArrowUp' ? -1 : 1);
      let closest = Infinity;
      for (const item of geometry.items) if (item.lane === lane && Math.abs(item.cx - current.cx) < closest) { index = item.index; closest = Math.abs(item.cx - current.cx); }
    } else return;
    e.preventDefault();
    showMarker(geometry.items[Math.min(count - 1, Math.max(0, index))], undefined, true);
  };
  const showDomain = (e, d, subdomain, keyboard = false) => {
    cancelFrame();
    interaction.shown = `domain:${d.id}`;
    onHover({ id: interaction.shown, title: d.label, detail: subdomain ? 'UniProt subdomain' : d.description, foot: `${d.start}–${d.end} aa${subdomain ? '' : ' · UniProt annotation'}`, action: keyboard ? 'Enter to select' : `Click to filter this ${subdomain ? 'domain' : 'region'}`, anchor: rectBounds(e.currentTarget) });
  };
  return <svg ref={svgRef} className="protein-svg" viewBox={`0 0 ${W} 418`} aria-label="Interactive COL7A1 protein map. Select a domain or variant marker to filter the table." onPointerLeave={hide} onKeyDown={e => { if (e.key === 'Escape') hide(); }}>
    <defs><clipPath id="plot-clip"><rect x={LEFT} y="10" width={TRACK} height="380" /></clipPath><pattern id="collagen-pattern" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 10 L10 -2 M8 12 L12 8" stroke="#a9c7cd" strokeWidth="1" opacity=".6" /></pattern></defs>
    {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1="18" y2="375" stroke="#e6eae8" strokeDasharray="3 5" /><text x={x(t)} y="401" textAnchor={t === view.start ? 'start' : t === view.end ? 'end' : 'middle'} className="axis-text">{format(t)}</text></g>)}
    {selection && <g clipPath="url(#plot-clip)" pointerEvents="none"><rect x={x(selection.start)} y="15" width={Math.max(width(selection.start, selection.end), 2)} height="360" fill="#0b6958" opacity=".07" /><line x1={x(selection.start)} x2={x(selection.start)} y1="15" y2="375" stroke="#398774" strokeDasharray="3 3" /><line x1={x(selection.end + 1)} x2={x(selection.end + 1)} y1="15" y2="375" stroke="#398774" strokeDasharray="3 3" /></g>}
    {GROUPS.map((g, i) => <g key={g.id}><circle cx="18" cy={42 + i * 48} r="3.5" fill={g.color} /><text x="30" y={46 + i * 48} className="track-label">{g.short}</text><line x1={LEFT} x2={W - RIGHT} y1={64 + i * 48} y2={64 + i * 48} stroke="#e3e8e5" /></g>)}
    <g clipPath="url(#plot-clip)" pointerEvents="none" aria-hidden="true">{geometry.layers.map(layer => <g key={layer.group.id}>
      {mode === 'density' ? <path d={layer.density} fill={layer.group.color} opacity=".8" /> : <><path d={layer.stems} fill="none" stroke={layer.group.color} strokeWidth="1" opacity=".43" /><path d={layer.spans} fill="none" stroke={layer.group.color} strokeWidth="3" /><path d={layer.heads} fill={layer.group.color} /></>}
      <path d={layer.glycine} fill="none" stroke="#7953b0" strokeWidth="1.5" />
    </g>)}</g>
    <rect data-map-interaction="true" x={LEFT} y="10" width={TRACK} height="256" fill="transparent" role="button" tabIndex={geometry.items.length ? 0 : -1} aria-label={`Explore ${format(geometry.items.length)} variant markers. Use arrow keys to move, Home or End to jump, and Enter to select.`} aria-describedby="map-keyboard-help map-tooltip" style={{ cursor: geometry.items.length ? 'pointer' : 'default' }} onPointerMove={queuePointer} onPointerLeave={hide} onPointerDown={e => { const { item } = pointerItem(e); if (item) interaction.active = item.index; }} onClick={choosePointer} onFocus={() => showMarker(geometry.items[interaction.active < 0 ? 0 : interaction.active], undefined, true)} onBlur={hide} onKeyDown={keyboard} />
    <text x="18" y="301" className="track-label strong">Regions</text><text x="18" y="353" className="track-label">Subdomains</text>
    <g clipPath="url(#plot-clip)">
      {visibleDomains.filter(d => d.level !== 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-describedby="map-tooltip" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => { onChooseDomain(d); hide(); }} onKeyDown={e => activate(e, () => { onChooseDomain(d); hide(); })} onFocus={e => showDomain(e, d, false, true)} onBlur={hide} onPointerEnter={e => showDomain(e, d, false)} onPointerLeave={hide}>
        <rect x={x(d.start)} y="279" width={width(d.start, d.end)} height="35" rx="4" fill={regionColor(d)} stroke={selection?.id === d.id ? '#266e60' : '#b9cbca'} strokeWidth={selection?.id === d.id ? 2 : 1} />
        {d.label === 'Collagenous' && <rect x={x(d.start)} y="279" width={width(d.start, d.end)} height="35" rx="4" fill="url(#collagen-pattern)" pointerEvents="none" />}
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 45 && <text x={x((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y="301" textAnchor="middle" className="domain-text">{d.label === 'Collagenous' && width(d.start, d.end) > 280 ? 'Collagenous · triple-helical region' : d.label}</text>}
      </g>)}
      <line x1={LEFT} x2={W - RIGHT} y1="348" y2="348" stroke="#c9d3d0" strokeWidth="2" />
      {visibleDomains.filter(d => d.level === 'subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-describedby="map-tooltip" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={() => { onChooseDomain(d); hide(); }} onKeyDown={e => activate(e, () => { onChooseDomain(d); hide(); })} onFocus={e => showDomain(e, d, true, true)} onBlur={hide} onPointerEnter={e => showDomain(e, d, true)} onPointerLeave={hide}>
        <rect x={x(d.start)} y="333" width={width(d.start, d.end)} height="30" rx="3" fill={familyColor(d)} stroke={selection?.id === d.id ? '#205f52' : '#fff'} strokeWidth={selection?.id === d.id ? 2 : 1} />
        {width(Math.max(d.start, view.start), Math.min(d.end, view.end)) > 17 && <text x={x((Math.max(d.start, view.start) + Math.min(d.end, view.end)) / 2)} y="352" textAnchor="middle" className="subdomain-text">{shortDomain(d)}</text>}
      </g>)}
    </g>
  </svg>;
});

function ProteinMap({ data, variants, selection, setSelection, view, setView, onInspect, mode, setMode }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const interactionRef = useRef({ frame: 0, pending: null, active: -1, shown: null });
  const { markers, binSize } = useMemo(() => groupMarkers(variants, view, mode), [variants, view, mode]);
  const geometry = useMemo(() => buildMapGeometry(markers, view, mode), [markers, view, mode]);
  const count = useMemo(() => markers.reduce((n, m) => n + m.variants.length, 0), [markers]);
  const length = view.end - view.start + 1;
  const ticks = useMemo(() => {
    if (view.start === view.end) return [view.start];
    const step = length > 2000 ? 250 : length > 800 ? 100 : length > 300 ? 50 : length > 100 ? 20 : length > 40 ? 10 : 5;
    const result = [view.start];
    for (let p = Math.ceil((view.start + step / 2) / step) * step; p < view.end - step / 2; p += step) result.push(p);
    result.push(view.end);
    return result;
  }, [view.start, view.end, length]);
  const hideTip = useCallback(() => {
    const interaction = interactionRef.current;
    if (interaction.frame) cancelAnimationFrame(interaction.frame);
    interaction.frame = 0;
    interaction.pending = null;
    interaction.shown = null;
    setHover(null);
  }, []);
  const showTip = useCallback(next => setHover(previous => previous?.id === next.id && previous?.keyboard === next.keyboard ? previous : next), []);
  useEffect(hideTip, [geometry, selection, hideTip]);
  const chooseDomain = useCallback(d => setSelection({ start: d.start, end: d.end, label: d.label, id: d.id }), [setSelection]);
  const chooseMarker = useCallback(m => {
    setSelection({ start: m.start, end: m.end, label: m.start === m.end ? `Residue ${format(m.start)}` : `Residues ${format(m.start)}–${format(m.end)}` });
    if (m.variants.length === 1 && mode === 'variants') onInspect(m.variants[0]);
    hideTip();
  }, [setSelection, onInspect, mode, hideTip]);
  const full = view.start === 1 && view.end === data.protein.length;
  const exportSVG = () => {
    const source = svgRef.current; if (!source) return;
    const clone = source.cloneNode(true), originals = [source, ...source.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
    originals.forEach((node, i) => { const style = getComputedStyle(node); for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor']) copies[i].style.setProperty(prop, style.getPropertyValue(prop)); copies[i].removeAttribute('tabindex'); copies[i].removeAttribute('role'); });
    clone.querySelector('[data-map-interaction]')?.remove();
    const ns = 'http://www.w3.org/2000/svg', outer = document.createElementNS(ns, 'svg'); outer.setAttribute('xmlns', ns); outer.setAttribute('viewBox', `0 0 ${W} 500`); outer.setAttribute('width', String(W)); outer.setAttribute('height', '500');
    const bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff'); outer.append(bg);
    const label = (text, y, size) => { const el = document.createElementNS(ns, 'text'); el.setAttribute('x', '18'); el.setAttribute('y', String(y)); el.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()); el.setAttribute('font-family', 'Arial, sans-serif'); el.setAttribute('font-size', String(size)); el.textContent = text; outer.append(el); };
    label(`COL7A1 · Q02388 · ${view.start}–${view.end} aa · ${mode}`, 26, 18); clone.setAttribute('y', '36'); clone.setAttribute('width', String(W)); clone.setAttribute('height', '418'); outer.append(clone);
    label(`Prepared ${data.snapshot.preparedDate} · ${count} mapped variants in view · height = √count · 1-based precursor`, 472, 12);
    label('Source-reported classifications · ClinVar release date not recorded · export session JSON for filters and source hashes', 490, 11);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(outer)], { type: 'image/svg+xml;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `COL7A1-map-${view.start}-${view.end}.svg`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="map-panel" aria-labelledby="map-heading">
    <div className="panel-heading">
      <div><div className="eyebrow"><span className="live-dot" /> PROTEIN EXPLORER</div><h2 id="map-heading">A sequence-level view</h2></div>
      <div className="map-tools"><div className="segmented" aria-label="Map display">
        <button aria-pressed={mode === 'variants'} onClick={() => { setMode('variants'); hideTip(); }}>Variants</button>
        <button aria-pressed={mode === 'density'} onClick={() => { setMode('density'); hideTip(); }}>Density</button>
      </div><button className="button small" onClick={exportSVG}>Export SVG ↓</button><button className="button small" disabled={!selection} onClick={() => { setView({ start: selection.start, end: selection.end }); hideTip(); }}>Zoom to selection <span>↗</span></button>
        {!full && <button className="text-button" onClick={() => { setView({ start: 1, end: data.protein.length }); hideTip(); }}>Full protein ↺</button>}</div>
    </div>
    <div className="map-context"><span><strong>{format(count)}</strong> mapped variants in view <span className="muted">· selection highlighted below</span></span><span className="mono">{format(view.start)}—{format(view.end)} aa</span></div>
    <div className="map-scroll"><div className="svg-wrap">
      <MapStage data={data} geometry={geometry} ticks={ticks} view={view} selection={selection} mode={mode} svgRef={svgRef} interactionRef={interactionRef} onHover={showTip} onHide={hideTip} onChooseMarker={chooseMarker} onChooseDomain={chooseDomain} />
      {hover?.item && <svg className="map-hover-overlay" viewBox={`0 0 ${W} 418`} aria-hidden="true"><g clipPath="url(#plot-clip)">{mode === 'density' ? <rect x={hover.item.cx} y={hover.item.cy} width={hover.item.barWidth} height={hover.item.height} rx="1.5" fill="none" stroke="var(--ink)" strokeWidth="1.3" /> : <circle cx={hover.item.cx} cy={hover.item.cy} r="5" fill="none" stroke="var(--ink)" strokeWidth="1.2" />}</g></svg>}
    </div></div>
    <span id="map-keyboard-help" className="sr-only">Arrow keys explore markers; up and down change significance lane. Home and End jump to the first and last marker. Enter selects; Escape closes the preview.</span>
    <span role="status" className="sr-only">{hover?.keyboard ? `${hover.title}. ${hover.detail}. ${hover.foot}` : ''}</span>
    <MapTooltip hover={hover} onDismiss={hideTip} />
    <div className="map-footer"><span><span className="diamond">◇</span> Collagenous glycine substitution <span className="divider">/</span> <span className="swatch vwa" /> vWA <span className="swatch fn" /> Fibronectin III <span className="swatch kunitz" /> Kunitz</span><span>{mode === 'density' ? `${binSize}-residue bins · height = √count` : 'Markers at reported residues · height = √count'} <span className="divider">/</span> Click a region to explore</span></div>
  </section>;
}
export default memo(ProteinMap);
