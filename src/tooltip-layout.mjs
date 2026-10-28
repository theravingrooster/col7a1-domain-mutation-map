const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/** Place a viewport-level tooltip without relying on the map's clipped scroll box. */
export function placeMapTooltip(anchor, size, viewport, padding = 12, gap = 12) {
  const minLeft = viewport.left + padding, minTop = viewport.top + padding;
  const maxWidth = Math.max(1, viewport.width - padding * 2);
  const maxHeight = Math.max(1, viewport.height - padding * 2);
  const width = Math.min(size.width, maxWidth), height = Math.min(size.height, maxHeight);
  const above = anchor.top - gap - minTop;
  const below = viewport.top + viewport.height - padding - anchor.bottom - gap;
  const placement = above >= height || (below < height && above > below) ? 'above' : 'below';
  const wantedTop = placement === 'above' ? anchor.top - gap - height : anchor.bottom + gap;
  return {
    left: clamp((anchor.left + anchor.right - width) / 2, minLeft, viewport.left + viewport.width - padding - width),
    top: clamp(wantedTop, minTop, viewport.top + viewport.height - padding - height),
    maxWidth,
    maxHeight,
    placement,
  };
}
