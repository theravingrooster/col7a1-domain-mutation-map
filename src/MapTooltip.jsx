import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { placeMapTooltip } from './tooltip-layout.mjs';
import './map-tooltip.css';

function viewportBounds() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || document.documentElement.clientWidth,
    height: viewport?.height || document.documentElement.clientHeight,
  };
}

/** A separate portal keeps hovering from clipping at either map/scroll boundaries. */
export default function MapTooltip({ hover, onDismiss }) {
  const tooltipRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const visible = Boolean(hover);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!hover || !tooltip) return;
    const viewport = viewportBounds();
    tooltip.style.maxWidth = `${Math.min(360, Math.max(1, viewport.width - 24))}px`;
    tooltip.style.maxHeight = `${Math.max(1, viewport.height - 24)}px`;
    const size = tooltip.getBoundingClientRect();
    const position = placeMapTooltip(hover.anchor, size, viewport);
    tooltip.style.left = `${position.left}px`;
    tooltip.style.top = `${position.top}px`;
    tooltip.style.visibility = 'visible';
    tooltip.dataset.placement = position.placement;
  }, [hover]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => dismissRef.current?.();
    const keydown = event => { if (event.key === 'Escape') dismiss(); };
    // Capture also observes horizontal scrolling inside the protein map.
    window.addEventListener('scroll', dismiss, { capture: true, passive: true });
    window.addEventListener('resize', dismiss, { passive: true });
    window.addEventListener('keydown', keydown);
    window.visualViewport?.addEventListener('scroll', dismiss, { passive: true });
    window.visualViewport?.addEventListener('resize', dismiss, { passive: true });
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', keydown);
      window.visualViewport?.removeEventListener('scroll', dismiss);
      window.visualViewport?.removeEventListener('resize', dismiss);
    };
  }, [visible]);

  if (!hover) return null;
  return createPortal(
    <div ref={tooltipRef} id="map-tooltip" role="tooltip" className="map-tooltip map-tooltip-portal" style={{ visibility: 'hidden' }}>
      <strong>{hover.title}</strong>
      {hover.detail && <span>{hover.detail}</span>}
      {hover.foot && <span className="mono">{hover.foot}</span>}
      {hover.action && <small>{hover.action}</small>}
    </div>,
    document.body,
  );
}
