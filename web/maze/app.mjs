import { Maze, MAZE_TYPES, parseOptions } from './model.mjs';
import { ALGORITHMS } from './search.mjs';
import { Tasks, ResultCache, MazePlayback, minimapTarget, fitGeometry, compareSummaries } from './state.mjs';
import { calculateViewport } from '../viewport.mjs';
import { drawMaze, drawComparison } from './renderer.mjs';

const $ = id => document.getElementById(id), tasks = new Tasks(), cache = new ResultCache();
const viewport = $('viewport'), canvas = $('maze-canvas'), ctx = canvas.getContext('2d'), mini = $('minimap'), miniCtx = mini.getContext('2d');
const colors = { wall: '#203c43', open: '#f9fcfa', forward: '#93bfdc', backward: '#c5b1e6', path: '#efb54e', start: '#087f73', goal: '#e7806a' };
let maze = null, worker = null, playback = null, dirty = true, version = 0, lastTime = null, geometry = null;
let miniBase = null, miniPixels = null, miniIndex = 0, miniFinished = false, lastMiniTime = 0;
let fit = true, comparing = false, comparisonDirty = true, lastPaint = 0;
const rate = () => Math.round(10 ** Number($('speed').value));
const selected = () => $('algorithm').value;
const status = text => { $('status').textContent = text; };
for (const [key, info] of Object.entries(ALGORITHMS)) {
  const option = document.createElement('option'); option.value = key; option.textContent = info.name; $('algorithm').append(option);
  $('reference').append(option.cloneNode(true));
}
$('algorithm').value = 'astar';
$('reference').value = 'bfs';
function note() { const info = ALGORITHMS[selected()]; $('algorithm-note').textContent = `${info.optimal ? '保证最短路径' : '不保证最短路径'} · ${info.description}`; }
function buttons() {
  for (const id of ['run', 'compare', 'locate-start', 'locate-goal']) $(id).disabled = !maze;
  $('cancel').disabled = !tasks.active;
  for (const id of ['pause', 'step', 'reset', 'replay', 'finish']) $(id).disabled = !playback?.result;
  $('pause').disabled = !playback?.result || playback.state === 'completed';
  $('pause').textContent = playback?.state === 'paused' ? '继续' : '暂停';
}
function table() {
  $('results').replaceChildren();
  for (const [algorithm, info] of Object.entries(ALGORITHMS)) {
    const row = document.createElement('tr'); row.classList.toggle('selected', algorithm === selected());
    const name = document.createElement('td'), button = document.createElement('button');
    button.textContent = info.name; button.onclick = () => { $('algorithm').value = algorithm; choose(); }; name.append(button);
    if (!info.optimal) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = '不保证最短'; name.append(tag); }
    row.append(name); const summary = cache.summaries.get(algorithm);
    for (const value of [summary ? summary.pathLength ?? (summary.status === 'limited' ? '达上限' : '不可达') : '—', summary?.visitedCount.toLocaleString() ?? '—', summary ? summary.elapsedMs.toFixed(2) : '—']) {
      const td = document.createElement('td'); td.textContent = value; row.append(td);
    }
    $('results').append(row);
  }
  comparisonDirty = true;
}
function stopWorker() { if (worker) worker.terminate(); worker = null; tasks.cancel(); buttons(); }
function launch(kind, options) {
  stopWorker(); if (playback?.state === 'playing') playback.toggle();
  const job = tasks.begin(kind, kind === 'generate' ? version + 1 : version, selected());
  try {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (!tasks.accepts(data)) return;
      if (data.kind === 'map') {
        maze = new Maze(data.map.rows, data.map.cols, data.map); version = maze.version;
        cache.clear(); playback = new MazePlayback(maze.walls.length, rate());
        $('map-title').textContent = `${maze.rows} × ${maze.cols} · ${MAZE_TYPES[maze.type]}`;
        $('map-meta').textContent = `种子 ${maze.seed} · ${maze.walls.length.toLocaleString()} 格`;
        $('settings-label').textContent = `${maze.rows} × ${maze.cols} · ${MAZE_TYPES[maze.type]}`;
        $('compact-meta').textContent = `${maze.rows}×${maze.cols} · 种子 ${maze.seed}`;
        $('settings').open = false;
        $('generation-time').textContent = `生成耗时 ${data.generationMs.toFixed(2)} ms · 白框表示可见区域，点击小地图定位。`;
        buildMini(); viewport.scrollLeft = viewport.scrollTop = 0;
        status('迷宫已就绪。选择算法后点击「开始搜索」，或运行全部对比。'); table();
      } else if (data.kind === 'progress') status(`正在比较：${ALGORITHMS[data.algorithm].name}…… 可随时取消。`);
      else if (data.kind === 'measurement' || data.kind === 'result') {
        cache.put(data.algorithm, data.result, data.summary); table();
        if (data.result && data.algorithm === selected()) {
          playback.load(data.result, data.kind === 'result'); resetMini();
          if (data.kind === 'result') status(data.result.status === 'limited' ? data.result.reason : `${ALGORITHMS[selected()].name} 已完成。可暂停、单步或看结果。${data.result.found ? '' : '终点不可达。'}`);
        }
      } else if (data.kind === 'done') {
        const result = cache.get(selected()); if (result) { playback.load(result); resetMini(); }
        status(job.kind === 'pair' ? '两种算法对比完成。两张图使用相同地图与移动规则。' : '14 种算法已比较。查看「算法差异对比」中的路径、探索范围和策略。');
        comparisonDirty = true;
      } else if (data.kind === 'error') {
        $('form-error').textContent = data.error; status(`任务未完成：${data.error}。当前地图已保留。`);
      }
      if (['map', 'result', 'done', 'error'].includes(data.kind)) { tasks.finish(data); worker?.terminate(); worker = null; }
      dirty = true; buttons();
    };
    worker.onerror = event => { event.preventDefault(); if (!tasks.accepts(job)) return; stopWorker(); status('后台任务出现错误，请重试或使用较小的迷宫。当前地图已保留。'); };
    worker.postMessage({ ...job, reference: $('reference').value, ...(kind === 'generate' ? { options } : { map: maze }) });
    status(kind === 'generate' ? '正在生成迷宫……' : ['compare', 'pair'].includes(kind) ? '正在同图比较算法……' : `正在运行 ${ALGORITHMS[selected()].name}……`);
  } catch (error) { stopWorker(); status(`无法启动任务：${error.message}`); }
  buttons(); dirty = true;
}
function generate(options) {
  try {
    const parsed = parseOptions(options);
    $('form-error').textContent = ''; launch('generate', parsed);
  } catch (error) { $('form-error').textContent = error.message; }
}
function formOptions() { return { rows: $('rows').value, cols: $('cols').value, seed: $('seed').value, type: $('maze-type').value }; }
function example() {
  $('rows').value = '15'; $('cols').value = '25'; $('seed').value = '42'; $('maze-type').value = 'braided'; $('preset').value = 'compact';
  generate(formOptions());
}
function choose() {
  note(); if (!maze) return;
  if (comparing) { table(); launch('pair'); return; }
  stopWorker(); playback = new MazePlayback(maze.walls.length, rate()); resetMini();
  const result = cache.get(selected());
  if (result) { playback.load(result); status(`正在重播 ${ALGORITHMS[selected()].name}，地图和种子保持不变。`); }
  else launch('search');
  table(); buttons(); dirty = true;
}
function locate(cell) {
  if (!maze) return;
  if (fit) setFit(false);
  const g = view();
  viewport.scrollLeft = g.left + viewport.scrollLeft + (cell[0] + .5) * g.size - viewport.clientWidth / 2;
  viewport.scrollTop = g.top + viewport.scrollTop + (cell[1] + .5) * g.size - viewport.clientHeight / 2;
  dirty = true;
}
function view() {
  if (fit) return fitGeometry(maze.rows, maze.cols, Math.max(1, viewport.clientWidth), Math.max(1, viewport.clientHeight), Number($('zoom').value));
  return calculateViewport({ rows: maze.rows, cols: maze.cols, width: Math.max(1, viewport.clientWidth), height: Math.max(1, viewport.clientHeight),
    cellSize: Number($('zoom').value), scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop });
}
function draw(time = 0) {
  if (!maze) return;
  geometry = view(); const g = geometry, w = viewport.clientWidth, h = viewport.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  $('spacer').style.width = `${g.contentWidth}px`; $('spacer').style.height = `${g.contentHeight}px`;
  drawMaze(canvas, maze, playback, g, { width: w, height: h, time, effects: $('effects').checked });
  $('zoom-label').textContent = fit ? `自适配 ${g.size.toFixed(1)} px` : `${g.size} 像素`;
}
function buildMini() {
  mini.width = Math.min(320, maze.cols); mini.height = Math.max(1, Math.round(mini.width * maze.rows / maze.cols));
  // Keep rectangular overviews within a 320×320 raster too.
  if (mini.height > 320) { mini.height = 320; mini.width = Math.max(1, Math.round(320 * maze.cols / maze.rows)); }
  const counts = new Uint32Array(mini.width * mini.height), totals = new Uint32Array(counts.length);
  for (let id = 0; id < maze.walls.length; id++) {
    const p = Math.floor(Math.floor(id / maze.cols) * mini.height / maze.rows) * mini.width + Math.floor((id % maze.cols) * mini.width / maze.cols);
    totals[p]++; if (!maze.walls[id]) counts[p]++;
  }
  miniBase = miniCtx.createImageData(mini.width, mini.height);
  for (let p = 0; p < counts.length; p++) {
    const open = counts[p] / Math.max(1, totals[p]);
    for (let c = 0; c < 3; c++) miniBase.data[p * 4 + c] = Math.round([32, 60, 67][c] + open * ([249, 252, 250][c] - [32, 60, 67][c]));
    miniBase.data[p * 4 + 3] = 255;
  }
  resetMini();
}
function resetMini() {
  if (!miniBase) return;
  miniPixels = new ImageData(new Uint8ClampedArray(miniBase.data), mini.width, mini.height); miniIndex = 0; miniFinished = false; dirty = true;
}
function miniPixel(id, rgb) {
  const x = Math.floor((id % maze.cols) * mini.width / maze.cols), y = Math.floor(Math.floor(id / maze.cols) * mini.height / maze.rows), offset = (y * mini.width + x) * 4;
  miniPixels.data.set(rgb, offset);
}
function drawMini() {
  if (!maze || !miniPixels || !geometry) return;
  if (playback.index < miniIndex) resetMini();
  for (; miniIndex < playback.index; miniIndex++) miniPixel(playback.result.visitedOrder[miniIndex], playback.result.visitedSides[miniIndex] === 2 ? [197, 177, 230, 255] : [147, 191, 220, 255]);
  if (playback.state === 'completed' && !miniFinished) { for (const id of playback.result.path) miniPixel(id, [239, 181, 78, 255]); miniFinished = true; }
  miniCtx.putImageData(miniPixels, 0, 0);
  const sx = mini.width / maze.cols, sy = mini.height / maze.rows;
  for (const [cell, color] of [[maze.start, colors.start], [maze.goal, colors.goal]]) { miniCtx.fillStyle = color; miniCtx.fillRect(cell[0] * sx - 2, cell[1] * sy - 2, 5, 5); }
  const g = geometry; miniCtx.strokeStyle = '#ffffff'; miniCtx.lineWidth = 2;
  miniCtx.strokeRect(g.firstCol * sx + .5, g.firstRow * sy + .5, Math.max(2, (g.lastCol - g.firstCol) * sx - 1), Math.max(2, (g.lastRow - g.firstRow) * sy - 1));
}
function playbackLabels() {
  const count = playback?.result?.visitedCount ?? 0, index = playback?.index ?? 0;
  $('progress-fill').style.width = `${count ? index / count * 100 : 0}%`;
  const state = { idle: '等待搜索', playing: '播放中', paused: '已暂停', completed: playback?.result?.found ? '播放完成，金色为最终路径' : playback?.result?.status === 'limited' ? '达到计算上限，尚不能判断是否可达' : '搜索完成，终点不可达' }[playback?.state ?? 'idle'];
  $('playback-progress').textContent = `${state} · 已展示 ${index.toLocaleString()} / ${count.toLocaleString()} 个探索格子`;
}
function frame(time) {
  const dt = lastTime === null ? 0 : Math.min(.1, (time - lastTime) / 1000); lastTime = time;
  const before = playback?.index; playback?.update(dt);
  if (playback?.index !== before) dirty = true;
  const animate = !comparing && $('effects').checked && playback?.result && ['playing', 'completed'].includes(playback.state) && !document.hidden;
  if (dirty || (animate && time - lastPaint >= 33)) { if (!comparing) draw(time); playbackLabels(); buttons(); dirty = false; lastPaint = time; }
  if (comparing && comparisonDirty && maze) { drawPair(); comparisonDirty = false; }
  if (time - lastMiniTime > 100) { drawMini(); lastMiniTime = time; }
  requestAnimationFrame(frame);
}
$('generate-form').noValidate = true;
$('generate-form').onsubmit = event => { event.preventDefault(); generate(formOptions()); };
$('preset').onchange = () => { if ($('preset').value === 'compact') { $('rows').value = '15'; $('cols').value = '25'; } else if ($('preset').value !== 'custom') $('rows').value = $('cols').value = $('preset').value; };
for (const id of ['rows', 'cols']) $(id).oninput = () => { $('preset').value = 'custom'; };
$('random').onclick = () => { const values = new Uint32Array(1); crypto.getRandomValues(values); $('seed').value = values[0]; generate(formOptions()); };
$('example').onclick = example; $('algorithm').onchange = choose;
$('run').onclick = () => { if (maze) { playback = new MazePlayback(maze.walls.length, rate()); resetMini(); launch('search'); } };
$('compare').onclick = () => { if (maze) { mode(true, false); launch('compare'); } };
$('pair').onclick = () => { if (maze) launch('pair'); };
$('reference').onchange = () => { if (maze && comparing) launch('pair'); };
$('mode-explore').onclick = () => mode(false);
$('mode-compare').onclick = () => mode(true);
$('fit').onclick = () => setFit(!fit);
$('effects').onchange = () => { dirty = true; };
if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('effects').checked = false;
$('cancel').onclick = () => { stopWorker(); status('计算已取消，当前地图和已完成的统计保留。'); dirty = true; };
$('pause').onclick = () => { playback?.toggle(); dirty = true; };
$('step').onclick = () => { playback?.step(); dirty = true; };
$('reset').onclick = () => { playback?.rewind(); resetMini(); };
$('replay').onclick = () => { playback?.rewind(true); resetMini(); };
$('finish').onclick = () => { playback?.finish(); dirty = true; };
$('speed').oninput = () => { if (playback) playback.rate = rate(); $('speed-label').textContent = `${rate().toLocaleString()} 格子/秒`; };
$('speed').oninput();
$('zoom').oninput = () => { $('zoom-label').textContent = `${$('zoom').value} 像素`; dirty = true; };
$('locate-start').onclick = () => locate(maze.start); $('locate-goal').onclick = () => locate(maze.goal);
viewport.addEventListener('scroll', () => { dirty = true; }, { passive: true });
viewport.addEventListener('wheel', event => { if (event.shiftKey) { event.preventDefault(); viewport.scrollLeft += event.deltaY || event.deltaX; dirty = true; } }, { passive: false });
const resize = new ResizeObserver(() => { dirty = true; comparisonDirty = true; });
resize.observe(viewport); resize.observe($('compare-stage'));
mini.onclick = event => { if (maze) { const r = mini.getBoundingClientRect(); locate(minimapTarget(event.clientX - r.left, event.clientY - r.top, r.width, r.height, maze)); } };
mini.onkeydown = event => { if (event.key === 'Enter' && maze) { locate(maze.goal); event.preventDefault(); } if (event.key === 'Home' && maze) { locate(maze.start); event.preventDefault(); } };
function large() { const enabled = document.body.classList.toggle('large'); $('large').setAttribute('aria-pressed', String(enabled)); $('large').textContent = enabled ? '退出大屏 F' : '大屏模式 F'; dirty = true; }
function help() { if (!$('tutorial').open) $('tutorial').showModal(); }
function closeHelp() { $('tutorial').close(); try { localStorage.setItem('maze-tutorial-seen-v1', '1'); } catch { /* Storage can be disabled. */ } }
$('large').onclick = large; $('help').onclick = help; $('close-help').onclick = closeHelp;
$('tutorial-example').onclick = () => { closeHelp(); example(); }; $('keep-map').onclick = closeHelp;
$('tutorial').addEventListener('cancel', () => { try { localStorage.setItem('maze-tutorial-seen-v1', '1'); } catch { /* optional */ } });
document.addEventListener('keydown', event => {
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape' && !$('tutorial').open && document.body.classList.contains('large')) large();
  if ($('tutorial').open) return;
  if (event.key.toLowerCase() === 'f') { large(); event.preventDefault(); }
  if (event.key.toLowerCase() === 'h') help();
  if (event.code === 'Space' && event.target === document.body) { playback?.toggle(); event.preventDefault(); dirty = true; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playback?.state === 'playing') { playback.toggle(); dirty = true; } lastTime = null; });
window.addEventListener('pagehide', stopWorker);
function setFit(value) { fit = value; document.body.classList.toggle('fit', fit); $('fit').textContent = fit ? '完整地图 ✓' : '放大查看'; $('fit').setAttribute('aria-pressed', String(fit)); if (fit) viewport.scrollLeft = viewport.scrollTop = 0; dirty = true; }
function mode(value, run = true) {
  comparing = value; document.body.classList.toggle('comparing', value); $('explore-stage').hidden = value; $('compare-stage').hidden = !value;
  for (const [id, active] of [['mode-explore', !value], ['mode-compare', value]]) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active)); }
  if (value && run && maze && (!cache.get(selected()) || !cache.get($('reference').value))) launch('pair');
  dirty = comparisonDirty = true;
}
function drawPair() {
  const a = selected(), b = $('reference').value, left = cache.summaries.get(a), right = cache.summaries.get(b);
  $('left-name').textContent = ALGORITHMS[a].name; $('right-name').textContent = ALGORITHMS[b].name;
  const stats = s => !s ? '等待计算' : s.status === 'limited' ? '达到计算上限 · 未判定可达性' : s.found ? `${s.pathLength} 步 · 探索 ${s.visitedCount} 格 · ${s.elapsedMs.toFixed(2)} ms` : '确认不可达';
  $('left-stats').textContent = stats(left); $('right-stats').textContent = stats(right);
  drawComparison($('left-map'), maze, cache.get(a), '#4ce8c3'); drawComparison($('right-map'), maze, cache.get(b), '#ff8b98');
  const delta = compareSummaries(left, right);
  $('difference-summary').textContent = !delta.ready ? '正在计算同图对照……' : delta.comparable
    ? `路线${delta.pathDelta === 0 ? '同样长' : `相差 ${Math.abs(delta.pathDelta)} 步，${delta.pathDelta > 0 ? ALGORITHMS[b].name : ALGORITHMS[a].name} 更短`}；${ALGORITHMS[a].name} ${delta.visitedDelta <= 0 ? '少' : '多'}探索 ${Math.abs(delta.visitedDelta)} 个格子。`
    : '本次有算法未返回路径。请区分计算上限、舍弃分支与确认不可达。';
  $('strategy-summary').textContent = `${ALGORITHMS[a].name}：${ALGORITHMS[a].description} ${ALGORITHMS[b].name}：${ALGORITHMS[b].description}`;
  $('differences').replaceChildren(); const all = [...cache.summaries.values()], max = Math.max(1, ...all.map(s => s.visitedCount));
  for (const s of all) { const row = document.createElement('div'); row.className = 'bar-row'; const label = document.createElement('span'); label.textContent = ALGORITHMS[s.algorithm].name;
    const track = document.createElement('span'); track.className = 'bar-track'; const fill = document.createElement('i'); fill.style.width = `${s.visitedCount / max * 100}%`; track.append(fill);
    const text = document.createElement('span'); text.textContent = s.status === 'limited' ? `${s.visitedCount} · 达上限` : String(s.visitedCount); row.append(label, track, text); $('differences').append(row); }
}
note(); table(); buttons(); generate(formOptions()); requestAnimationFrame(frame);
try { if (!localStorage.getItem('maze-tutorial-seen-v1') || new URLSearchParams(location.search).get('tutorial') === '1') help(); } catch { help(); }
