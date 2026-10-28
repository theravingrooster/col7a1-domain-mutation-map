import React, { useMemo, useState } from 'react';
import { GROUPS, format, groupMarkers } from './data-utils.mjs';

const W = 1250, LEFT = 150, RIGHT = 25, TRACK = W - LEFT - RIGHT;
const familyColor = d => d.label.includes('VWFA') ? '#7a9cba' : d.label.includes('Fibronectin') ? '#9bb6a8' : d.label.includes('Kunitz') ? '#b0a0c9' : '#d5dbdc';
const regionColor = d => d.label === 'NC1' ? '#dce9e3' : d.label === 'NC2' ? '#e7e2ef' : '#dce9ec';
const shortDomain = d => d.label.replace('Fibronectin type-III ', 'FN').replace('VWFA ', 'vWA ').replace('BPTI/Kunitz inhibitor', 'K');

export default function ProteinMap({ data, variants, selection, setSelection, view, setView, onInspect, mode, setMode }) {
  const [hover, setHover] = useState(null);
  const { markers, binSize } = useMemo(() => groupMarkers(variants, view, mode), [variants, view, mode]);
  const length = view.end - view.start + 1;
  const x = p => LEFT + (p - view.start) / length * TRACK;
  const width = (s,e) => (e - s + 1) / length * TRACK;
  const visibleDomains = data.domains.filter(d => d.end >= view.start && d.start <= view.end);
  const ticks = useMemo(() => {
    if (view.start === view.end) return [view.start];
    const step = length > 2000 ? 250 : length > 800 ? 100 : length > 300 ? 50 : length > 100 ? 20 : length > 40 ? 10 : 5;
    const result = [view.start];
    for (let p = Math.ceil((view.start + step / 2) / step) * step; p < view.end - step / 2; p += step) result.push(p);
    result.push(view.end);
    return result;
  }, [view.start, view.end, length]);
  const full = view.start === 1 && view.end === data.protein.length;
  const showTip = (e, info) => {
    const bounds = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const target = e.currentTarget.getBoundingClientRect();
    setHover({ ...info, left: Math.min(Math.max(target.left - bounds.left + target.width / 2, 150), bounds.width - 150), top: target.top - bounds.top });
  };
  const activate = (e, fn) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const chooseDomain = d => setSelection({ start: d.start, end: d.end, label: d.label, id: d.id });
  const chooseMarker = m => {
    setSelection({ start: m.start, end: m.end, label: m.start === m.end ? `Residue ${format(m.start)}` : `Residues ${format(m.start)}–${format(m.end)}` });
    if (m.variants.length === 1 && mode === 'variants') onInspect(m.variants[0]);
    setHover(null);
  };
  const exportSVG = () => {
    const source=document.querySelector('.protein-svg');if(!source)return;
    const clone=source.cloneNode(true), originals=[source,...source.querySelectorAll('*')], copies=[clone,...clone.querySelectorAll('*')];
    originals.forEach((node,i)=>{const style=getComputedStyle(node);for(const prop of ['fill','stroke','stroke-width','stroke-dasharray','opacity','font-family','font-size','font-weight','text-anchor'])copies[i].style.setProperty(prop,style.getPropertyValue(prop));copies[i].removeAttribute('tabindex');copies[i].removeAttribute('role');});
    const ns='http://www.w3.org/2000/svg', outer=document.createElementNS(ns,'svg');outer.setAttribute('xmlns',ns);outer.setAttribute('viewBox',`0 0 ${W} 500`);outer.setAttribute('width',String(W));outer.setAttribute('height','500');
    const bg=document.createElementNS(ns,'rect');bg.setAttribute('width','100%');bg.setAttribute('height','100%');bg.setAttribute('fill',getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()||'#fff');outer.append(bg);
    const label=(text,y,size)=>{const el=document.createElementNS(ns,'text');el.setAttribute('x','18');el.setAttribute('y',String(y));el.setAttribute('fill',getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());el.setAttribute('font-family','Arial, sans-serif');el.setAttribute('font-size',String(size));el.textContent=text;outer.append(el);};
    label(`COL7A1 · Q02388 · ${view.start}–${view.end} aa · ${mode}`,26,18);clone.setAttribute('y','36');clone.setAttribute('width',String(W));clone.setAttribute('height','418');outer.append(clone);
    label(`Prepared ${data.snapshot.preparedDate} · ${markers.reduce((n,m)=>n+m.variants.length,0)} mapped variants in view · height = √count · 1-based precursor`,472,12);
    label('Source-reported classifications · ClinVar release date not recorded · export session JSON for filters and source hashes',490,11);
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(outer)],{type:'image/svg+xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`COL7A1-map-${view.start}-${view.end}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="map-panel" aria-labelledby="map-heading">
    <div className="panel-heading">
      <div><div className="eyebrow"><span className="live-dot"/> PROTEIN EXPLORER</div><h2 id="map-heading">A sequence-level view</h2></div>
      <div className="map-tools"><div className="segmented" aria-label="Map display">
        <button aria-pressed={mode === 'variants'} onClick={() => { setMode('variants'); setHover(null); }}>Variants</button>
        <button aria-pressed={mode === 'density'} onClick={() => { setMode('density'); setHover(null); }}>Density</button>
      </div><button className="button small" onClick={exportSVG}>Export SVG ↓</button><button className="button small" disabled={!selection} onClick={() => {setView({start: selection.start, end: selection.end}); setHover(null);}}>Zoom to selection <span>↗</span></button>
      {!full && <button className="text-button" onClick={() => {setView({start:1,end:data.protein.length});setHover(null);}}>Full protein ↺</button>}</div>
    </div>
    <div className="map-context"><span><strong>{format(markers.reduce((count, marker) => count + marker.variants.length, 0))}</strong> mapped variants in view <span className="muted">· selection highlighted below</span></span><span className="mono">{format(view.start)}—{format(view.end)} aa</span></div>
    <div className="map-scroll"><div className="svg-wrap" onMouseLeave={() => setHover(null)}>
      <svg className="protein-svg" viewBox={`0 0 ${W} 418`} aria-label="Interactive COL7A1 protein map. Select a domain or variant marker to filter the table." onKeyDown={e => {if(e.key === 'Escape') setHover(null);}}>
        <defs><clipPath id="plot-clip"><rect x={LEFT} y="10" width={TRACK} height="380" /></clipPath><pattern id="collagen-pattern" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 10 L10 -2 M8 12 L12 8" stroke="#a9c7cd" strokeWidth="1" opacity=".6"/></pattern></defs>
        {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1="18" y2="375" stroke="#e6eae8" strokeDasharray="3 5"/><text x={x(t)} y="401" textAnchor={t===view.start?'start':t===view.end?'end':'middle'} className="axis-text">{format(t)}</text></g>)}
        {selection && <g clipPath="url(#plot-clip)" pointerEvents="none"><rect x={x(selection.start)} y="15" width={Math.max(width(selection.start,selection.end),2)} height="360" fill="#0b6958" opacity=".07"/><line x1={x(selection.start)} x2={x(selection.start)} y1="15" y2="375" stroke="#398774" strokeDasharray="3 3"/><line x1={x(selection.end+1)} x2={x(selection.end+1)} y1="15" y2="375" stroke="#398774" strokeDasharray="3 3"/></g>}
        {GROUPS.map((g, i) => <g key={g.id}><circle cx="18" cy={42+i*48} r="3.5" fill={g.color}/><text x="30" y={46+i*48} className="track-label">{g.short}</text><line x1={LEFT} x2={W-RIGHT} y1={64+i*48} y2={64+i*48} stroke="#e3e8e5"/></g>)}
        <g clipPath="url(#plot-clip)">{markers.map(m => {
          const group = GROUPS.find(g => g.id === m.group), lane = GROUPS.indexOf(group), base = 64+lane*48;
          const h = Math.min(39, 8+Math.sqrt(m.variants.length)*8), cx = x(m.start), cy = base-h;
          const tooltip = { title: mode==='density' ? `${format(m.start)}–${format(m.end)} aa · ${m.variants.length} variants` : `${m.variants[0].proteinHgvs[0] || 'Protein variant'}${m.variants.length>1 ? ` + ${m.variants.length-1} more` : ''}`, detail: mode==='density' ? `${group.label} · e.g. ${m.variants[0].proteinHgvs[0]}` : m.variants[0].clinicalSignificance.join(' / ') || 'Not provided', foot: `Position ${format(m.start)}${m.end!==m.start?'–'+format(m.end):''} aa${m.glycine?(m.variants.length>1?' · group contains Gly substitutions':' · Gly substitution'):''}`, action: 'Click to explore variants' };
          return <g key={m.key} className="marker" role="button" tabIndex={markers.length<=250?0:-1} aria-label={`${tooltip.title}; ${tooltip.detail}; ${tooltip.foot}`} onMouseEnter={e=>showTip(e,tooltip)} onFocus={e=>showTip(e,tooltip)} onBlur={()=>setHover(null)} onKeyDown={e=>activate(e,()=>chooseMarker(m))} onClick={()=>chooseMarker(m)}>
            <title>{tooltip.title} · {tooltip.detail} · {tooltip.foot}</title>
            {mode==='density' ? <rect x={cx} y={cy} width={Math.max(1,width(m.start,m.end)-1.6)} height={h} rx="1.5" fill={group.color} opacity=".8"/> : <><line x1={cx} x2={cx} y1={base} y2={cy} stroke={group.color} opacity=".43" strokeWidth="1"/>{m.end>m.start && <line x1={cx} x2={x(m.end)} y1={cy} y2={cy} stroke={group.color} strokeWidth="3"/>}<circle cx={cx} cy={cy} r="2.4" fill={group.color}/><circle cx={cx} cy={cy} r="5" fill="transparent"/></>}
            {m.glycine && <path d={`M${cx} ${cy-4}l4 4 -4 4 -4 -4Z`} fill="none" stroke="#7953b0" strokeWidth="1.5"/>}
          </g>;
        })}</g>
        <text x="18" y="301" className="track-label strong">Regions</text><text x="18" y="353" className="track-label">Subdomains</text>
        <g clipPath="url(#plot-clip)">
          {visibleDomains.filter(d=>d.level!=='subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={()=>chooseDomain(d)} onKeyDown={e=>activate(e,()=>chooseDomain(d))} onFocus={e=>showTip(e,{title:d.label,detail:d.description,foot:`${d.start}–${d.end} aa · UniProt annotation`,action:'Enter to select'})} onBlur={()=>setHover(null)} onMouseEnter={e=>showTip(e,{title:d.label,detail:d.description,foot:`${d.start}–${d.end} aa · UniProt annotation`,action:'Click to filter this region'})}>
            <rect x={x(d.start)} y="279" width={width(d.start,d.end)} height="35" rx="4" fill={regionColor(d)} stroke={selection?.id===d.id?'#266e60':'#b9cbca'} strokeWidth={selection?.id===d.id?2:1}/>
            {d.label==='Collagenous' && <rect x={x(d.start)} y="279" width={width(d.start,d.end)} height="35" rx="4" fill="url(#collagen-pattern)" pointerEvents="none"/>}
            {width(Math.max(d.start,view.start),Math.min(d.end,view.end))>45 && <text x={x((Math.max(d.start,view.start)+Math.min(d.end,view.end))/2)} y="301" textAnchor="middle" className="domain-text">{d.label==='Collagenous' && width(d.start,d.end)>280 ? 'Collagenous · triple-helical region' : d.label}</text>}
          </g>)}
          <line x1={LEFT} x2={W-RIGHT} y1="348" y2="348" stroke="#c9d3d0" strokeWidth="2"/>
          {visibleDomains.filter(d=>d.level==='subdomain').map(d => <g key={d.id} role="button" tabIndex="0" className="domain" aria-label={`Select ${d.label}, residues ${d.start} to ${d.end}`} onClick={()=>chooseDomain(d)} onKeyDown={e=>activate(e,()=>chooseDomain(d))} onFocus={e=>showTip(e,{title:d.label,detail:'UniProt subdomain',foot:`${d.start}–${d.end} aa`,action:'Enter to select'})} onBlur={()=>setHover(null)} onMouseEnter={e=>showTip(e,{title:d.label,detail:'UniProt subdomain',foot:`${d.start}–${d.end} aa`,action:'Click to filter this domain'})}>
            <rect x={x(d.start)} y="333" width={width(d.start,d.end)} height="30" rx="3" fill={familyColor(d)} stroke={selection?.id===d.id?'#205f52':'#fff'} strokeWidth={selection?.id===d.id?2:1}/>
            {width(Math.max(d.start,view.start),Math.min(d.end,view.end))>17 && <text x={x((Math.max(d.start,view.start)+Math.min(d.end,view.end))/2)} y="352" textAnchor="middle" className="subdomain-text">{shortDomain(d)}</text>}
          </g>)}
        </g>
      </svg>
      {hover && <div className="map-tooltip" role="tooltip" style={{left:hover.left,top:Math.max(0,hover.top-12)}}><strong>{hover.title}</strong><span>{hover.detail}</span><span className="mono">{hover.foot}</span><small>{hover.action}</small></div>}
    </div></div>
    <div className="map-footer"><span><span className="diamond">◇</span> Collagenous glycine substitution <span className="divider">/</span> <span className="swatch vwa"/> vWA <span className="swatch fn"/> Fibronectin III <span className="swatch kunitz"/> Kunitz</span><span>{mode==='density' ? `${binSize}-residue bins · height = √count` : 'Markers at reported residues · height = √count'} <span className="divider">/</span> Click a region to explore</span></div>
  </section>;
}
