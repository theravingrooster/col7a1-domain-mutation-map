import React, { memo, useLayoutEffect } from 'react';
import { GROUPS } from './data-utils.mjs';
import './hover-magnification.css';

// Only this small overlay and the mask bounds change as the pointer moves.
// The original vector artwork and every protein x coordinate stay in place.
export default memo(function HoverMagnification({ focus, maskRef }) {
  useLayoutEffect(() => {
    const mask = maskRef.current;
    if (!mask) return;
    if (focus) {
      for (const key of ['x', 'y', 'width', 'height']) mask.setAttribute(key, String(focus.band[key]));
    } else {
      mask.setAttribute('width', '0');
      mask.setAttribute('height', '0');
    }
    return () => { mask.setAttribute('width', '0'); mask.setAttribute('height', '0'); };
  }, [focus, maskRef]);

  if (!focus) return null;
  const color = GROUPS[focus.lane].color, active = focus.active;
  return <svg className="map-hover-overlay magnification-overlay" viewBox="0 0 1250 418" aria-hidden="true" data-hover-magnification="true">
    <defs><clipPath id="magnification-band"><rect {...focus.band} /></clipPath></defs>
    <g clipPath="url(#magnification-band)">
      <path d={focus.paths.stems} fill="none" stroke={color} strokeWidth="1" opacity=".43" />
      <path d={focus.paths.spans} fill="none" stroke={color} strokeWidth="3" />
      <path d={focus.paths.heads} fill={color} />
      <path className="magnification-glycine" d={focus.paths.glycine} fill="none" stroke="#7953b0" strokeWidth="1.5" />
      {active && <g>
        <line x1={active.cx} x2={active.cx} y1={active.base} y2={active.cy} stroke={color} strokeWidth="1.5" />
        <circle cx={active.cx} cy={active.cy} r={active.radius} fill={color} stroke="var(--ink)" strokeWidth="1.25" />
        {active.glycine && <path className="magnification-glycine" d={`M${active.cx} ${active.cy-active.diamondRadius}l${active.diamondRadius} ${active.diamondRadius} ${-active.diamondRadius} ${active.diamondRadius} ${-active.diamondRadius} ${-active.diamondRadius}Z`} fill="none" stroke="#7953b0" strokeWidth="1.5" />}
      </g>}
    </g>
  </svg>;
});
