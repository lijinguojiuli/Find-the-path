// Keep cells readable. Scrolling changes the origin, never the cell size.
export function calculateViewport({ rows, cols, width, height, cellSize = 28, scrollLeft = 0, scrollTop = 0 }) {
  if (![rows, cols].every(value => Number.isSafeInteger(value) && value > 0)
    || ![width, height].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(cellSize) || cellSize < 16 || cellSize > 48
    || ![scrollLeft, scrollTop].every(Number.isFinite)) throw new Error('地图视图尺寸无效。');
  const contentWidth = Math.max(width, cols * cellSize + 48);
  const contentHeight = Math.max(height, rows * cellSize + 48);
  const offsetX = Math.max(0, Math.min(contentWidth - width, scrollLeft));
  const offsetY = Math.max(0, Math.min(contentHeight - height, scrollTop));
  const left = Math.max(24, (width - cols * cellSize) / 2) - offsetX;
  const top = Math.max(24, (height - rows * cellSize) / 2) - offsetY;
  return { size: cellSize, left, top, contentWidth, contentHeight,
    firstCol: Math.max(0, Math.floor(-left / cellSize)),
    lastCol: Math.min(cols, Math.ceil((width - left) / cellSize)),
    firstRow: Math.max(0, Math.floor(-top / cellSize)),
    lastRow: Math.min(rows, Math.ceil((height - top) / cellSize)) };
}
