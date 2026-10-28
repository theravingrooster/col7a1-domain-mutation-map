import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { GROUPS, format } from './data-utils.mjs';
import { EvidenceBadge } from './ResearchTools.jsx';
import { buildPinGeometry, buildPinLens, clampPinIndex, closestLensPin, findNearestPin } from './lollipop-layout.mjs';
import './variant-pins.css';

const WIDTH = 1200, HEIGHT = 205, BASELINE = 155;
const variantName = variant => variant.proteinHgvs?.[0] || variant.codingHgvs?.[0] || `Variation ${variant.variationId}`;
const groupFor = variant => GROUPS.find(group => group.id === variant.significanceGroup) || GROUPS[GROUPS.length - 1];
const significanceFor = variant => variant.clinicalSignificance?.join(' / ') || groupFor(variant).label;
const positionFor = variant => `${format(variant.position)}${variant.end !== variant.position ? `–${format(variant.end)}` : ''} aa`;
const freshPreview = model => ({ model, index: null, held: false });

function ticksFor(view) {
  if (view.start === view.end) return [view.start];
  const target = (view.end - view.start) / 6;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(1, [1, 2, 5, 10].map(n => n * power).find(n => n >= target));
  const ticks = [view.start];
  for (let p = Math.ceil((view.start + step / 3) / step) * step; p < view.end - step / 3; p += step) ticks.push(p);
  return [...ticks, view.end];
}

// Cache the dense context as pixels. Its five batched stem/head paths are only
// rebuilt when geometry, theme, canvas size, or the anchored lens window changes.
function makeContext(runtime, canvas) {
  const { model, lens, cssWidth, dpr } = runtime;
  const scale = cssWidth / WIDTH;
  const colors = getComputedStyle(canvas);
  const background = colors.getPropertyValue('--surface').trim() || '#fff';
  const ink = colors.getPropertyValue('--ink').trim() || '#253c38';
  const muted = colors.getPropertyValue('--muted').trim() || '#607264';
  const line = colors.getPropertyValue('--line').trim() || '#dfe5df';
  const raster = document.createElement('canvas');
  raster.width = canvas.width; raster.height = canvas.height;
  const ctx = raster.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = background; ctx.fillRect(0, 0, cssWidth, HEIGHT);
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(model.left * scale, BASELINE); ctx.lineTo(model.right * scale, BASELINE); ctx.stroke();
  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.fillStyle = muted;
  const length = model.view.end - model.view.start + 1;
  for (const position of ticksFor(model.view)) {
    const x = (model.left + (position - model.view.start + .5) / length * model.plotWidth) * scale;
    ctx.beginPath(); ctx.moveTo(x, BASELINE + 1); ctx.lineTo(x, BASELINE + 6); ctx.stroke();
    ctx.textAlign = position === model.view.start ? 'left' : position === model.view.end ? 'right' : 'center';
    ctx.fillText(format(position), x, BASELINE + 25);
  }
  ctx.textAlign = 'left'; ctx.font = '11px Inter, sans-serif'; ctx.fillText('Position / aa', 12, BASELINE + 25);
  const paths = GROUPS.map(group => ({ group, stems: new Path2D(), heads: new Path2D() }));
  const byGroup = Object.fromEntries(paths.map(path => [path.group.id, path]));
  model.points.forEach(point => {
    if (lens && point.index >= lens.start && point.index < lens.end) return;
    const variant = model.records[point.index];
    const path = byGroup[variant.significanceGroup] || paths[paths.length - 1];
    const x = point.x * scale;
    path.stems.moveTo(x, BASELINE); path.stems.lineTo(x, BASELINE - 48);
    path.heads.moveTo(x + 2.3, BASELINE - 48); path.heads.arc(x, BASELINE - 48, 2.3, 0, Math.PI * 2);
  });
  for (const { group, stems, heads } of paths) {
    ctx.strokeStyle = group.color; ctx.fillStyle = group.color; ctx.lineWidth = .8;
    ctx.globalAlpha = lens ? .25 : .58; ctx.stroke(stems);
    ctx.globalAlpha = lens ? .4 : .83; ctx.fill(heads);
  }
  ctx.globalAlpha = 1;
  return { raster, ink, muted, line, background };
}

function paint(runtime, canvas) {
  if (!runtime.cssWidth || !canvas) return;
  if (!runtime.context) runtime.context = makeContext(runtime, canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(runtime.context.raster, 0, 0);
  if (!runtime.lens || runtime.index == null) return;
  const scale = runtime.cssWidth / WIDTH;
  ctx.setTransform(runtime.dpr, 0, 0, runtime.dpr, 0, 0);
  const { lens, model } = runtime;
  for (const point of lens.points) {
    const variant = model.records[point.index];
    const distance = Math.abs(point.index - runtime.index);
    const lift = distance === 0 ? 66 : distance === 1 ? 43 : distance === 2 ? 24 : 12;
    const radius = distance === 0 ? 10 : distance === 1 ? 7 : distance === 2 ? 5 : 3.7;
    const x = point.x * scale, y = BASELINE - 48 - lift;
    ctx.strokeStyle = groupFor(variant).color; ctx.fillStyle = groupFor(variant).color;
    ctx.lineWidth = distance === 0 ? 2 : 1.3;
    ctx.beginPath(); ctx.moveTo(x, BASELINE); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    if (distance === 0) {
      ctx.strokeStyle = runtime.context.background; ctx.lineWidth = 2; ctx.stroke();
      if (runtime.held) { ctx.strokeStyle = groupFor(variant).color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, radius + 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (variant.glycineSubstitution) {
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('◇', x, BASELINE - 5);
    }
  }
  const variant = model.records[runtime.index];
  const selected = lens.points.find(point => point.index === runtime.index);
  if (selected) {
    const x = selected.x * scale;
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign = x < 90 ? 'left' : x > runtime.cssWidth - 90 ? 'right' : 'center';
    ctx.fillStyle = runtime.context.ink; ctx.fillText(positionFor(variant), x, 20);
  }
}

function VariantPins({ records, view, onInspect, onSelectRange, domainContext }) {
  const descriptionId = useId(), detailId = useId();
  const model = useMemo(() => buildPinGeometry(records, view, WIDTH), [records, view.start, view.end]);
  const [preview, setPreview] = useState(() => freshPreview(model));
  const current = preview.model === model ? preview : freshPreview(model);
  const canvasRef = useRef(null), runtimeRef = useRef(null), frameRef = useRef(null), pointerRef = useRef(null);
  const active = current.index == null ? null : model.records[current.index];
  const activeGroup = active ? groupFor(active) : null;

  const publishPreview = useCallback(runtime => {
    setPreview(previous => previous.model === runtime.model && previous.index === runtime.index && previous.held === runtime.held ? previous : { model: runtime.model, index: runtime.index, held: runtime.held });
  }, []);
  const makeLens = useCallback((runtime, index) => buildPinLens(runtime.model, index, {
    count: 13, spacing: 28 * WIDTH / runtime.cssWidth, minSpacing: 22 * WIDTH / runtime.cssWidth,
  }), []);
  const schedulePaint = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const runtime = runtimeRef.current, canvas = canvasRef.current;
      if (!runtime || !canvas) return;
      const pointer = pointerRef.current; pointerRef.current = null;
      const previousIndex = runtime.index, previousLens = runtime.lens;
      const needsContext = !runtime.context;
      if (pointer && !runtime.held && runtime.model.records.length) {
        const bounds = canvas.getBoundingClientRect();
        const x = (pointer.x - bounds.left) / bounds.width * WIDTH;
        const y = pointer.y - bounds.top;
        if (x >= runtime.model.left && x <= runtime.model.right && y >= 0 && y <= BASELINE + 10) {
          // Expanded x positions stay fixed until the pointer leaves the lens.
          // Selecting a neighbor never re-centers it under a moving pointer.
          if (!runtime.lens || x < runtime.lens.left || x > runtime.lens.right) {
            runtime.index = findNearestPin(runtime.model.points, x);
            runtime.lens = makeLens(runtime, runtime.index); runtime.context = null;
          } else runtime.index = closestLensPin(runtime.lens, x);
          publishPreview(runtime);
        }
      }
      if (pointer && !needsContext && runtime.index === previousIndex && runtime.lens === previousLens) return;
      paint(runtime, canvas);
    });
  }, [makeLens, publishPreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointerRef.current = null;
    const runtime = { model, index: null, held: false, lens: null, context: null, cssWidth: 0, dpr: 1 };
    runtimeRef.current = runtime; setPreview(freshPreview(model));
    const resize = () => {
      const width = canvas.getBoundingClientRect().width;
      if (!width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (width === runtime.cssWidth && dpr === runtime.dpr) return;
      runtime.cssWidth = width; runtime.dpr = dpr;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(HEIGHT * dpr);
      runtime.context = null;
      if (runtime.index != null) runtime.lens = makeLens(runtime, runtime.index);
      schedulePaint();
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    const themeObserver = new MutationObserver(() => { runtime.context = null; schedulePaint(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect(); themeObserver.disconnect(); window.removeEventListener('resize', resize);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null; pointerRef.current = null;
    };
  }, [model, makeLens, schedulePaint]);

  const goTo = useCallback((index, held = true) => {
    const runtime = runtimeRef.current;
    if (!runtime || !runtime.model.records.length) return;
    pointerRef.current = null;
    runtime.index = clampPinIndex(index, runtime.model.records.length); runtime.held = held;
    if (!runtime.lens || runtime.index < runtime.lens.start || runtime.index >= runtime.lens.end) {
      runtime.lens = makeLens(runtime, runtime.index); runtime.context = null;
    }
    // Keyboard and slider navigation also reveal the selected pin inside the
    // shared mobile chart/domain scroller. Pointer previews never move it.
    const viewport = canvasRef.current?.closest('.variant-pin-scroll');
    const point = runtime.lens?.points.find(item => item.index === runtime.index);
    if (viewport && point) {
      const x = point.x * runtime.cssWidth / WIDTH;
      if (x < viewport.scrollLeft + 28) viewport.scrollLeft = Math.max(0, x - 28);
      else if (x > viewport.scrollLeft + viewport.clientWidth - 28) viewport.scrollLeft = x - viewport.clientWidth + 28;
    }
    publishPreview(runtime); schedulePaint();
  }, [makeLens, publishPreview, schedulePaint]);
  const resume = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.held = false; runtime.lens = null; runtime.context = null;
    pointerRef.current = null; publishPreview(runtime); schedulePaint();
  };
  const leaveCanvas = () => {
    pointerRef.current = null;
    const runtime = runtimeRef.current;
    if (!runtime || runtime.held || !runtime.lens) return;
    runtime.lens = null; runtime.context = null; schedulePaint();
  };
  const selectAtPointer = event => {
    const runtime = runtimeRef.current, canvas = canvasRef.current;
    if (!runtime || !runtime.model.records.length) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * WIDTH;
    if (x < model.left || x > model.right || event.clientY - bounds.top > BASELINE + 10) return;
    let index;
    if (runtime.lens && x >= runtime.lens.left && x <= runtime.lens.right) index = closestLensPin(runtime.lens, x);
    else {
      index = findNearestPin(model.points, x);
      runtime.lens = makeLens(runtime, index); runtime.context = null;
    }
    goTo(index, true);
  };
  const onKeyDown = event => {
    const index = runtimeRef.current?.index;
    const next = event.key === 'ArrowRight' ? (index == null ? 0 : index + 1) : event.key === 'ArrowLeft' ? (index == null ? 0 : index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? model.records.length - 1 : event.key === 'PageDown' ? (index ?? 0) + 13 : event.key === 'PageUp' ? (index ?? 0) - 13 : null;
    if (next != null) { event.preventDefault(); goTo(next); }
    else if (event.key === 'Escape') { event.preventDefault(); resume(); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goTo(index ?? 0); }
  };

  return <div className="variant-pin-explorer">
    <div className="variant-pin-instructions">
      <p id={descriptionId}>All {format(model.records.length)} variants appear as individual pins at their protein positions.<span>Hover to spread nearby pins; click to hold one. Arrow keys explore every variant, including shared positions.</span></p>
      <div className="variant-pin-hold">{current.held ? <button className="button small" onClick={resume}>Resume hover</button> : <span>Pin height reflects focus</span>}</div>
    </div>
    <div className="variant-pin-scroll">
      <div className="variant-pin-stage">
        <canvas ref={canvasRef} className="variant-pin-canvas" tabIndex={model.records.length ? 0 : -1} role="img" aria-label={`COL7A1 lollipop map with ${format(model.records.length)} individual variant pins. Left and right arrows change variant; Home and End go to the first and last; Enter holds a variant; Escape resumes hover.`} aria-describedby={descriptionId} aria-controls={detailId}
          onPointerMove={event => { if (event.pointerType === 'touch' || runtimeRef.current?.held) return; pointerRef.current = { x: event.clientX, y: event.clientY }; schedulePaint(); }}
          onPointerLeave={leaveCanvas} onClick={selectAtPointer} onKeyDown={onKeyDown}>
          Every mapped variant is available through the record slider and previous/next controls below.
        </canvas>
        {domainContext}
      </div>
    </div>
    <div className="variant-pin-navigation">
      <button className="button small" aria-label="Previous individual variant" disabled={!model.records.length || current.index === 0} onClick={() => goTo(current.index == null ? 0 : current.index - 1)}>←</button>
      <input type="range" min="0" max={Math.max(0, model.records.length - 1)} value={current.index ?? 0} disabled={!model.records.length} aria-label="Explore every individual variant by record order" aria-valuetext={active ? `Variant ${current.index + 1} of ${model.records.length}, Variation ${active.variationId}, ${positionFor(active)}` : 'Move to preview an individual variant'} onChange={event => goTo(Number(event.target.value))}/>
      <button className="button small" aria-label="Next individual variant" disabled={!model.records.length || current.index === model.records.length - 1} onClick={() => goTo(current.index == null ? 0 : current.index + 1)}>→</button>
      <span>{current.index == null ? `${format(model.records.length)} variants` : `${format(current.index + 1)} / ${format(model.records.length)}`}</span>
    </div>
    <section id={detailId} className={`variant-pin-detail${active ? '' : ' is-empty'}`} aria-label="Variant details preview" style={{ '--variant-color': activeGroup?.color || 'var(--line)' }}>
      {active ? <>
        <div className="variant-pin-detail-main">
          <div className="variant-pin-detail-kicker"><span>{current.held ? 'SELECTED VARIANT' : 'VARIANT PREVIEW'}</span><span className="mono">Variation {active.variationId}</span></div>
          <h4 className="variant-pin-detail-name mono" title={variantName(active)}>{variantName(active)}</h4>
          <div className="variant-pin-detail-significance" title={significanceFor(active)}><span className="variant-pin-classification-dot"/><span>{significanceFor(active)}</span></div>
          <div className="variant-pin-detail-meta"><span className="mono">{positionFor(active)}</span>{active.glycineSubstitution && <span className="variant-pin-gly-badge" title="Collagenous glycine substitution">◇ Gly substitution</span>}</div>
          <p className="variant-pin-conditions" title={active.conditions?.join(' · ') || 'Conditions not provided'}><span>Conditions</span> {active.conditions?.join(' · ') || 'Not provided'}</p>
        </div>
        <div className="variant-pin-detail-actions"><EvidenceBadge variant={active}/><button className="button variant-pin-open" onClick={() => onInspect(active)}>Open details <span aria-hidden="true">↗</span></button><button className="button small" onClick={() => onSelectRange({ start: active.position, end: active.end, label: variantName(active) })}>Select range</button></div>
      </> : <div className="variant-pin-empty"><strong>{model.records.length ? 'Hover a pin to bring its neighbors into view.' : 'No mapped variants match this view.'}</strong><p>{model.records.length ? 'Select a pin to keep its HGVS, evidence, and controls here. The record slider also reaches every variant at a shared position.' : 'Broaden the active filters or choose another protein range.'}</p></div>}
    </section>
    <span className="sr-only" role="status">{current.held && active ? `Selected Variation ${active.variationId}, ${variantName(active)}, ${positionFor(active)}. Press Escape or Resume hover to release.` : ''}</span>
  </div>;
}

export default memo(VariantPins);
