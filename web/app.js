import { Grid, MODES, applyEdit, cellFromPoint, createDemoGrid, validDimensions } from './model.mjs';
import { LESSON_STEPS, newLesson, advanceLesson } from './lesson.mjs';
import { SearchPlayback } from './playback.mjs';
import { ALGORITHMS } from './search.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const initialRows = Number(params.get('rows') || 20);
const initialCols = Number(params.get('cols') || 30);
let grid = validDimensions(initialRows, initialCols) ? createDemoGrid(initialRows, initialCols) : createDemoGrid();
let mode = MODES.obstacle;
let lesson = { active: false, step: -1, target: null };
let hover = null;
let focusCell = [0, 0];
let geometry = { left: 0, top: 0, size: 1 };
let immersive = false;
const history = [];
const canvas = $('grid-canvas');
const ctx = canvas.getContext('2d');
const palette = { empty: '#ffffff', obstacle: '#334a50', start: '#3aaf88', goal: '#e7806a' };
const equal = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const playback = new SearchPlayback();
const searchWorker = new Worker(new URL('./search-worker.mjs', import.meta.url), { type: 'module' });
let mapVersion = 0, requestId = 0, searching = false, lastFrame = null;
let measurements = [];

function renderMetrics() {
  const selected = measurements.find(item => item.algorithm === $('algorithm').value);
  const duration = value => value < .001 ? '<0.001' : value.toFixed(3);
  $('metric-summary').textContent = selected ? `${ALGORITHMS[selected.algorithm]} · ${selected.pathLength === null ? '不可达' : selected.pathLength + ' 步 · 成本 ' + selected.totalCost} · 访问 ${selected.result.visitedCount} · ${duration(selected.elapsedMs)} 毫秒（仅算法）` : '搜索后显示步数、总代价、访问节点和算法耗时';
  $('comparison-body').replaceChildren(...measurements.map(item => {
    const row = document.createElement('tr');
    for (const value of [ALGORITHMS[item.algorithm], item.pathLength ?? '不可达', item.totalCost ?? '—', item.result.visitedCount, duration(item.elapsedMs)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
}

function syncSearchControls() {
  $('algorithm-note').textContent = $('algorithm').value === 'bfs' ? 'BFS 优化步数，不保证加权总代价最低。' : 'Dijkstra / A* 优化累计进入成本；普通地面 1，高成本地形 5。';
  $('search-button').disabled = searching;
  $('compare-button').disabled = searching;
  $('search-button').textContent = searching ? '计算中…' : '开始搜索';
  $('pause-search').disabled = !['playing', 'paused'].includes(playback.state);
  $('pause-search').textContent = playback.state === 'paused' ? '继续' : '暂停';
  $('step-search').disabled = !playback.result || playback.state === 'completed';
  const labels = { idle: '等待搜索', playing: '播放中', paused: '已暂停', completed: playback.result?.found ? '路径已显示' : '目标不可达' };
  $('search-progress').textContent = searching ? '正在计算搜索结果…' : playback.result
    ? `${labels[playback.state]} · ${playback.index}/${playback.result.visitedCount}` : labels.idle;
}
function invalidateSearch() {
  mapVersion++; requestId++; searching = false; playback.reset(); measurements = []; renderMetrics(); syncSearchControls();
}
searchWorker.onmessage = ({ data }) => {
  if (data.id !== requestId || data.version !== mapVersion) return;
  searching = false;
  if (data.error) { setStatus(data.error, true); syncSearchControls(); return; }
  playback.load(data.result); lastFrame = null;
  measurements = data.measurements; renderMetrics();
  if (measurements.length > 1) $('comparison-details').open = true;
  setStatus(data.result.found ? '计算完成，正在按访问顺序播放。可以暂停后单步观察。' : '目标不可达：正在播放已探索区域。', !data.result.found);
  syncSearchControls(); draw();
};
searchWorker.onerror = () => { searching = false; setStatus('搜索模块加载失败，请刷新页面重试。', true); syncSearchControls(); };

function setStatus(message, error = false) {
  $('status-text').textContent = message;
  $('status').classList.toggle('error', error);
}
function rememberWelcome() { try { localStorage.setItem('path-lab-welcome-v1', 'seen'); } catch {} }
function hasSeenWelcome() { try { return localStorage.getItem('path-lab-welcome-v1') === 'seen'; } catch { return false; } }
function chooseMode(next, announce = true) {
  mode = next;
  for (const button of document.querySelectorAll('[data-mode]')) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (announce) {
    const tips = { obstacle: '障碍物工具：左键点击空地添加障碍，再点一次清除。',
      start: '起点工具：在一块新的空地上点一下，把绿色起点移过去。',
      goal: '终点工具：在一块新的空地上点一下，把珊瑚色终点移过去。',
      terrain: '高成本工具：点击可通行格，进入该格的成本设为 5。',
      plain: '普通地面工具：点击可通行格，将进入成本恢复为 1。' };
    setStatus(tips[mode]);
  }
  draw();
}
function saveUndo() {
  history.push({ map: grid.snapshot(), mode, lesson: { ...lesson, target: lesson.target && [...lesson.target] } });
  if (history.length > 60) history.shift();
}
function syncInputs() { $('rows').value = grid.rows; $('cols').value = grid.cols; }
function refresh() {
  $('dimensions-label').textContent = `${grid.rows} 行 × ${grid.cols} 列`;
  $('map-summary').textContent = `${grid.obstacleCount} 块障碍 · ${grid.costs.size} 格高成本地形`;
  $('undo-button').disabled = history.length === 0;
  $('lesson-list').replaceChildren(...LESSON_STEPS.map((step, index) => {
    const item = document.createElement('li');
    item.className = index < lesson.step ? 'done' : lesson.active && index === lesson.step ? 'current' : '';
    const number = document.createElement('span');
    number.className = 'step-number';
    number.textContent = index < lesson.step ? '✓' : String(index + 1);
    const label = document.createElement('span');
    label.textContent = step.title;
    item.append(number, label);
    return item;
  }));
  $('lesson-progress-bar').style.width = `${Math.max(0, lesson.step) / LESSON_STEPS.length * 100}%`;
  if (lesson.active) {
    $('coach').textContent = `第 ${lesson.step + 1} 步：${LESSON_STEPS[lesson.step].hint}`;
    $('lesson-button').textContent = '重新查看教程';
    $('board-hint').textContent = LESSON_STEPS[lesson.step].hint;
  } else if (lesson.step === LESSON_STEPS.length) {
    $('coach').textContent = '太棒了，四步全部完成！现在可以自由布置地图，给机器人留一条通道。';
    $('lesson-button').textContent = '再学一遍';
    $('board-hint').textContent = '教程已完成，现在轮到你自由创作';
  } else {
    $('coach').textContent = '点击下方按钮，开始一次手把手的练习。';
    $('lesson-button').textContent = '开始动手教程 →';
    $('board-hint').textContent = '选择工具，然后在地图上点一下';
  }
  draw();
}
function edit(cell) {
  const before = grid.snapshot();
  const beforeLesson = { ...lesson, target: lesson.target && [...lesson.target] };
  const beforeMode = mode;
  const result = applyEdit(grid, mode, cell);
  if (result.changed) {
    invalidateSearch();
    history.push({ map: before, mode: beforeMode, lesson: beforeLesson });
    if (history.length > 60) history.shift();
    const previousStep = lesson.step;
    lesson = advanceLesson(lesson, result);
    if (lesson.active && lesson.step !== previousStep) chooseMode(LESSON_STEPS[lesson.step].mode, false);
    if (lesson.step === LESSON_STEPS.length && previousStep !== lesson.step) {
      chooseMode(MODES.obstacle, false);
      setStatus('四步教程完成！你已经学会地图编辑，可以开始自由创作了。');
    } else setStatus(result.message);
  } else setStatus(result.message, true);
  refresh();
}
function restartLessonForMapChange() {
  invalidateSearch();
  if (lesson.active) { lesson = newLesson(); chooseMode(MODES.obstacle, false); }
  hover = null;
  focusCell = [0, 0];
}
function undo() {
  const previous = history.pop();
  if (!previous) return;
  grid = new Grid(previous.map.rows, previous.map.cols, previous.map);
  invalidateSearch();
  lesson = previous.lesson;
  chooseMode(previous.mode, false);
  syncInputs();
  hover = null;
  focusCell = [0, 0];
  setStatus('已撤销上一步，地图和教程进度一起恢复了。');
  refresh();
}
function openWelcome() { if (!$('welcome-dialog').open) $('welcome-dialog').showModal(); }
function closeWelcome() { $('welcome-dialog').close(); rememberWelcome(); }
function startLesson() {
  closeWelcome();
  const endpoints = equal(grid.start, grid.goal) ? 1 : Number(Boolean(grid.start)) + Number(Boolean(grid.goal));
  if (grid.rows * grid.cols - grid.obstacleCount - endpoints < 1) {
    setStatus('教程需要一块空地。请先清除一些障碍，或应用一张更大的地图。', true);
    return;
  }
  lesson = newLesson();
  chooseMode(MODES.obstacle, false);
  setStatus('我们从第一步开始：在空白格上点击，放置一块障碍。');
  refresh();
  canvas.focus({ preventScroll: true });
}

function roundedCell(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1.2, y + 1.2, Math.max(1, size - 2.4), Math.max(1, size - 2.4), Math.min(3, size / 6));
  ctx.fill();
}
function draw() {
  const bounds = $('board-container').getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = bounds.width, height = bounds.height;
  ctx.fillStyle = '#fcfefd';
  ctx.fillRect(0, 0, width, height);
  const size = Math.min((width - 50) / grid.cols, (height - 48) / grid.rows);
  if (size <= 0) return;
  const left = (width - grid.cols * size) / 2;
  const top = (height - grid.rows * size) / 2 - 2;
  geometry = { left, top, size };
  Object.assign(canvas.dataset, { rows: String(grid.rows), cols: String(grid.cols), left: String(left), top: String(top), cellSize: String(size) });
  ctx.fillStyle = palette.empty;
  ctx.fillRect(left, top, grid.cols * size, grid.rows * size);
  const obstacles = grid.obstacles;
  const visited = new Set(playback.visited.map(String)), path = new Set(playback.path.map(String));
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const pixelX = left + x * size, pixelY = top + y * size;
      const cell = [x, y];
      if (!obstacles.has(String(cell)) && grid.costAt(cell) > 1) roundedCell(pixelX, pixelY, size, '#e1d6b7');
      if (visited.has(String(cell))) roundedCell(pixelX, pixelY, size, '#b9d9ee');
      if (path.has(String(cell))) roundedCell(pixelX, pixelY, size, '#f4ca6e');
      if (obstacles.has(`${x},${y}`)) roundedCell(pixelX, pixelY, size, palette.obstacle);
      const start = equal(cell, grid.start), goal = equal(cell, grid.goal);
      if (!start && !goal && !obstacles.has(String(cell)) && grid.costAt(cell) > 1 && size > 14) {
        ctx.fillStyle = '#7f6438'; ctx.font = `600 ${Math.min(12, size * .45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(grid.costAt(cell)), pixelX + size / 2, pixelY + size / 2);
      }
      if (start || goal) {
        if (start && goal) {
          ctx.fillStyle = palette.start;
          ctx.fillRect(pixelX + 1, pixelY + 1, size - 2, size - 2);
          ctx.fillStyle = palette.goal;
          ctx.beginPath(); ctx.moveTo(pixelX + size - 1, pixelY + 1);
          ctx.lineTo(pixelX + size - 1, pixelY + size - 1); ctx.lineTo(pixelX + 1, pixelY + size - 1); ctx.fill();
        } else roundedCell(pixelX, pixelY, size, start ? palette.start : palette.goal);
        if (size > 13) {
          ctx.font = `600 ${Math.min(14, size * .52)}px "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
          ctx.fillText(start && goal ? '合' : start ? '起' : '终', pixelX + size / 2, pixelY + size / 2);
        }
      }
    }
  }
  ctx.strokeStyle = '#dce7df'; ctx.lineWidth = .8;
  ctx.beginPath();
  for (let x = 0; x <= grid.cols; x++) { ctx.moveTo(left + x * size, top); ctx.lineTo(left + x * size, top + grid.rows * size); }
  for (let y = 0; y <= grid.rows; y++) { ctx.moveTo(left, top + y * size); ctx.lineTo(left + grid.cols * size, top + y * size); }
  ctx.stroke();
  ctx.font = '9px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#9bafa0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let x = 0; x < grid.cols; x++) if (size > 15 || x % 5 === 0 || x === grid.cols - 1) ctx.fillText(String(x + 1), left + (x + .5) * size, top - 12);
  for (let y = 0; y < grid.rows; y++) if (size > 15 || y % 5 === 0 || y === grid.rows - 1) ctx.fillText(String(y + 1), left - 13, top + (y + .5) * size);
  const highlighted = lesson.active && lesson.step === 1 ? lesson.target : hover;
  if (highlighted) {
    ctx.strokeStyle = lesson.active && lesson.step === 1 ? '#dfa848' : '#087f73'; ctx.lineWidth = 2;
    ctx.strokeRect(left + highlighted[0] * size + 1, top + highlighted[1] * size + 1, size - 2, size - 2);
  }
  if (document.activeElement === canvas) {
    ctx.strokeStyle = '#6d9ed1'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.strokeRect(left + focusCell[0] * size + 1, top + focusCell[1] * size + 1, size - 2, size - 2); ctx.setLineDash([]);
  }
}
function pointerCell(event) {
  const bounds = canvas.getBoundingClientRect();
  return cellFromPoint(event.clientX - bounds.left, event.clientY - bounds.top, geometry, grid.rows, grid.cols);
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) { setStatus('右键不会修改地图，请用左键点击。'); return; }
  canvas.focus({ preventScroll: true });
  const cell = pointerCell(event);
  if (cell) focusCell = [...cell];
  edit(cell);
});
canvas.addEventListener('pointermove', event => {
  hover = pointerCell(event);
  $('pointer-label').textContent = hover ? `第 ${hover[0] + 1} 列 · 第 ${hover[1] + 1} 行` : '网格内点击编辑';
  draw();
});
canvas.addEventListener('pointerleave', () => { hover = null; $('pointer-label').textContent = '网格内点击编辑'; draw(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('focus', draw); canvas.addEventListener('blur', draw);
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => chooseMode(button.dataset.mode));
$('undo-button').addEventListener('click', undo);
function startSearch(compare = false) {
  playback.reset(); searching = true; requestId++;
  searchWorker.postMessage({ id: requestId, version: mapVersion, map: grid.snapshot(), algorithm: $('algorithm').value, compare });
  syncSearchControls(); draw();
}
$('search-button').addEventListener('click', () => startSearch());
$('compare-button').addEventListener('click', () => startSearch(true));
$('pause-search').addEventListener('click', () => {
  if (playback.state === 'paused') playback.resume(); else playback.pause();
  syncSearchControls();
});
$('step-search').addEventListener('click', () => { playback.step(); syncSearchControls(); draw(); });
$('reset-search').addEventListener('click', () => { invalidateSearch(); setStatus('搜索已重置，地图保持原样。点击「开始搜索」重新播放。'); draw(); });
$('search-speed').addEventListener('input', () => { playback.setRate(Number($('search-speed').value)); $('speed-label').textContent = `${playback.rate} 节点/秒`; });
$('algorithm').addEventListener('change', () => { invalidateSearch(); setStatus('算法已切换。点击「开始搜索」查看新的访问顺序。'); draw(); });
$('clear-button').addEventListener('click', () => {
  if (!grid.obstacleCount) { setStatus('地图上已经没有障碍了。'); return; }
  saveUndo();
  grid = new Grid(grid.rows, grid.cols, { start: grid.start, goal: grid.goal, costs: grid.snapshot().costs });
  restartLessonForMapChange();
  setStatus(lesson.active ? '障碍已清空，教程从放置第一块障碍重新开始。' : '已清除所有障碍，起点和终点保持原位。');
  refresh();
});
$('reset-button').addEventListener('click', () => {
  saveUndo(); grid = createDemoGrid(grid.rows, grid.cols); restartLessonForMapChange();
  setStatus('已恢复示例地图。想回到刚才的地图，可以点击撤销。'); refresh();
});
$('terrain-demo').addEventListener('click', () => {
  saveUndo(); grid = new Grid(3, 5, { start: [0, 1], goal: [4, 1], costs: [[1, 1, 5], [2, 1, 5], [3, 1, 5]] });
  restartLessonForMapChange(); syncInputs(); setStatus('成本示例已载入：直行 4 步成本 16，绕行 6 步成本 6。点击「对比三种算法」验证。'); refresh();
});
$('size-form').addEventListener('submit', event => {
  event.preventDefault();
  const rows = Number($('rows').value), cols = Number($('cols').value);
  if (!validDimensions(rows, cols)) { $('size-error').textContent = '行数和列数都要填写 1–80 之间的整数，原地图没有改变。'; return; }
  $('size-error').textContent = ''; saveUndo(); grid = createDemoGrid(rows, cols);
  restartLessonForMapChange(); syncInputs(); setStatus(`已创建 ${rows} 行、${cols} 列的新地图。`); refresh();
});
$('help-button').addEventListener('click', openWelcome);
$('lesson-button').addEventListener('click', openWelcome);
$('welcome-start').addEventListener('click', startLesson);
$('welcome-skip').addEventListener('click', () => { closeWelcome(); setStatus('自由体验已开启。遇到问题，随时点击「新手教程」或按 H。'); });
$('welcome-close').addEventListener('click', closeWelcome);
$('welcome-dialog').addEventListener('cancel', rememberWelcome);

function fullscreenUI() {
  $('fullscreen-label').textContent = immersive ? '退出大屏' : '大屏模式';
  $('fullscreen-button').setAttribute('aria-pressed', String(immersive));
  requestAnimationFrame(draw);
}
async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  immersive = !immersive;
  document.body.classList.toggle('focus-mode', immersive);
  setStatus(immersive
    ? '已进入大屏模式，保留底部系统任务栏。按 Esc 或「退出大屏」返回。'
    : '已退出大屏模式，地图与编辑进度已保留。');
  fullscreenUI();
}
$('fullscreen-button').addEventListener('click', toggleFullscreen);
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
  if (typing || $('welcome-dialog').open) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const numberModes = { '1': MODES.obstacle, '2': MODES.start, '3': MODES.goal, '4': MODES.terrain, '5': MODES.plain };
  if (numberModes[event.key]) chooseMode(numberModes[event.key]);
  if (event.key.toLowerCase() === 'h') { event.preventDefault(); openWelcome(); }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); }
  if (event.key === 'Escape' && immersive) { toggleFullscreen(); }
  if (document.activeElement === canvas) {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key]) {
      event.preventDefault(); const [dx, dy] = arrows[event.key];
      focusCell = [Math.max(0, Math.min(grid.cols - 1, focusCell[0] + dx)), Math.max(0, Math.min(grid.rows - 1, focusCell[1] + dy))]; draw();
    }
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); edit(focusCell); }
  }
});
new ResizeObserver(draw).observe($('board-container'));
function animate(timestamp) {
  const previous = playback.index;
  const beforeState = playback.state;
  if (lastFrame !== null) playback.update((timestamp - lastFrame) / 1000);
  lastFrame = timestamp;
  if (previous !== playback.index || beforeState !== playback.state) { syncSearchControls(); draw(); }
  requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange', () => { lastFrame = null; if (document.hidden) { playback.pause(); syncSearchControls(); } });
requestAnimationFrame(animate);
syncInputs(); refresh(); fullscreenUI(); syncSearchControls(); renderMetrics();
if (!hasSeenWelcome() || params.get('tutorial') === '1') openWelcome();
if (!validDimensions(initialRows, initialCols)) setStatus('网址中的地图尺寸无效，已载入 20×30 示例地图。', true);
