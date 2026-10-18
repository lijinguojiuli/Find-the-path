// Canvas-only presentation: data and algorithms never import this module.
const palette = { wall: '#283e55', open: '#101e2d', forward: '#236d89', backward: '#6a4f91', path: '#ffc76b', start: '#4ce8c3', goal: '#ff8b98' };
const rasterCache = new WeakMap();
function raster(maze, playback) {
  let entry = rasterCache.get(playback);
  if (!entry || entry.maze !== maze || playback.index < entry.index) {
    const canvas = document.createElement('canvas'); canvas.width = maze.cols; canvas.height = maze.rows;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(maze.cols, maze.rows);
    for (let id = 0; id < maze.walls.length; id++) image.data.set(maze.walls[id] ? [40, 62, 85, 255] : [16, 30, 45, 255], id * 4);
    entry = { maze, canvas, ctx, image, index: 0, done: false }; rasterCache.set(playback, entry);
  }
  let changed = entry.index === 0;
  for (; entry.index < playback.index; entry.index++) {
    const id = playback.result.visitedOrder[entry.index]; entry.image.data.set(playback.result.visitedSides[entry.index] === 2 ? [106, 79, 145, 255] : [35, 109, 137, 255], id * 4); changed = true;
  }
  if (playback.state === 'completed' && !entry.done) {
    for (const id of playback.result.path) entry.image.data.set([255, 199, 107, 255], id * 4);
    entry.done = true; changed = true;
  }
  if (changed) entry.ctx.putImageData(entry.image, 0, 0);
  return entry.canvas;
}
export function drawMaze(canvas, maze, playback, g, { time = 0, effects = true, width, height } = {}) {
  const ctx = canvas.getContext('2d'), ratio = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#0a1522'; ctx.fillRect(0, 0, width, height);
  if (g.size < 6) { ctx.imageSmoothingEnabled = false; ctx.drawImage(raster(maze, playback), g.left, g.top, maze.cols * g.size, maze.rows * g.size); }
  else for (let y = g.firstRow; y < g.lastRow; y++) for (let x = g.firstCol; x < g.lastCol; x++) {
    const id = y * maze.cols + x, px = g.left + x * g.size, py = g.top + y * g.size, gap = Math.max(.65, Math.min(2, g.size * .07));
    ctx.fillStyle = maze.walls[id] ? palette.wall : playback.pathMask[id] ? palette.path : playback.mask[id] === 2 ? palette.backward : playback.mask[id] ? palette.forward : palette.open;
    ctx.beginPath(); ctx.roundRect(px + gap / 2, py + gap / 2, g.size - gap, g.size - gap, Math.min(3, g.size * .15)); ctx.fill();
    if (maze.walls[id] && g.size >= 12) { ctx.fillStyle = '#ffffff0c'; ctx.fillRect(px + 3, py + 2, g.size - 6, 1); }
  }
  const point = id => [g.left + (id % maze.cols + .5) * g.size, g.top + (Math.floor(id / maze.cols) + .5) * g.size];
  if (effects && playback.state === 'playing' && playback.result) for (let i = Math.max(0, playback.index - 6); i < playback.index; i++) {
    const [x, y] = point(playback.result.visitedOrder[i]); ctx.fillStyle = '#a4fff4'; ctx.shadowColor = '#4ce8c3'; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, g.size * .17), 0, Math.PI * 2); ctx.fill();
  }
  if (effects && playback.state === 'completed' && playback.result?.found) {
    const path = playback.result.path;
    for (let i = 0; i < 7; i++) {
      const pos = (time / 85 + i * path.length / 7) % path.length, a = point(path[Math.floor(pos)]), b = point(path[Math.min(path.length - 1, Math.floor(pos) + 1)]), t = pos % 1;
      ctx.fillStyle = '#fff4d5'; ctx.shadowColor = '#ffd277'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.max(1.5, g.size * .14), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  for (const [id, color, label] of [[maze.startId, palette.start, '起'], [maze.goalId, palette.goal, '终']]) {
    const [x, y] = point(id), radius = Math.max(3, g.size * .39);
    ctx.shadowColor = color; ctx.shadowBlur = effects ? 10 + 4 * Math.sin(time / 550) : 0; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (g.size >= 14) { ctx.fillStyle = '#122234'; ctx.font = `bold ${Math.max(9, g.size * .45)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + .5); }
  }
}
export function drawComparison(canvas, maze, result, color) {
  const width = Math.max(140, canvas.clientWidth), height = 210, ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio); canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#0a1522'; ctx.fillRect(0, 0, width, height);
  const size = Math.min((width - 16) / maze.cols, (height - 16) / maze.rows), left = (width - size * maze.cols) / 2, top = (height - size * maze.rows) / 2;
  const image = document.createElement('canvas'); image.width = maze.cols; image.height = maze.rows;
  const ic = image.getContext('2d'), pixels = ic.createImageData(maze.cols, maze.rows);
  for (let id = 0; id < maze.walls.length; id++) pixels.data.set(maze.walls[id] ? [40, 62, 85, 255] : [16, 30, 45, 255], id * 4);
  if (result) for (let i = 0; i < result.visitedOrder.length; i++) pixels.data.set([34, 76, 96, 255], result.visitedOrder[i] * 4);
  ic.putImageData(pixels, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, left, top, maze.cols * size, maze.rows * size);
  if (result?.found) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, size * .36); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 5; ctx.beginPath();
    for (let i = 0; i < result.path.length; i++) { const id = result.path[i], x = left + (id % maze.cols + .5) * size, y = top + (Math.floor(id / maze.cols) + .5) * size; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.shadowBlur = 0;
  }
  for (const [id, c] of [[maze.startId, '#4ce8c3'], [maze.goalId, '#ff8b98']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(left + (id % maze.cols + .5) * size, top + (Math.floor(id / maze.cols) + .5) * size, Math.max(2.5, size * .4), 0, 7); ctx.fill(); }
}
