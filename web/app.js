import { Grid, MODES, applyEdit, applyObstacleEdit, cellFromPoint, createDemoGrid, validDimensions } from './model.mjs';
import { PaintStroke, PAINT_MODES } from './obstacle-stroke.mjs';
import { LESSON_STEPS, newLesson, advanceLesson } from './lesson.mjs';
import { SearchPlayback } from './playback.mjs';
import { ALGORITHMS } from './search.mjs';
import { Robot } from './robot.mjs';
import { calculateViewport } from './viewport.mjs';
import { DynamicPlanner } from './replanning.mjs';

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
let controlsWereOpen = true;
let cellSize = 28;
const obstacleHint = '障碍物：按住左键拖动布置；从障碍上拖动擦除，一次撤销恢复整笔';
const paintNames = {[MODES.obstacle]:'障碍物',[MODES.terrain]:'高成本地形',[MODES.plain]:'普通地面'};
const paintHints = {[MODES.obstacle]:obstacleHint,[MODES.terrain]:'高成本：按住左键连续涂抹，可直接覆盖障碍；一次撤销恢复整笔',[MODES.plain]:'普通地面：按住左键连续涂抹，清除障碍和高成本；一次撤销恢复整笔'};
const editingHint = () => paintHints[mode]??'选择工具，然后在地图上点一下';
const history = [];
let activeStroke = null;
const canvas = $('grid-canvas');
const viewport = $('board-viewport');
const ctx = canvas.getContext('2d');
const palette = { empty: '#ffffff', obstacle: '#334a50', start: '#3aaf88', goal: '#e7806a' };
const equal = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const playback = new SearchPlayback();
const searchWorker = new Worker(new URL('./search-worker.mjs', import.meta.url), { type: 'module' });
let mapVersion = 0, requestId = 0, searching = false, lastFrame = null;
let measurements = [];
let robot = null;
let planner = null;

function syncRobotControls() {
  const labels = { ready: '就绪', moving: '移动中', paused: '已暂停', arrived: '已到达终点', blocked: '无可执行路线，已安全停止', replanning: '正在从当前位置重新规划' };
  $('robot-start').disabled = !robot || !['ready', 'paused'].includes(robot.state);
  $('robot-start').textContent = robot?.state === 'paused' ? '继续移动' : '机器人出发';
  $('robot-pause').disabled = robot?.state !== 'moving' && !planner?.pending;
  $('robot-reset').disabled = !robot || Boolean(planner?.pending);
  $('replan-button').disabled = !robot || searching || robot.state === 'arrived';
  $('robot-state').textContent = robot ? `${labels[robot.state]} · 第 ${robot.position[0] + 1} 列、第 ${robot.position[1] + 1} 行 · 本段已移动 ${robot.index}/${robot.path.length - 1} 步 · 重规划 ${planner?.replanCount || 0} 次` : '搜索播放完成后，机器人就能出发';
}

function renderMetrics() {
  const selected = measurements.find(item => item.algorithm === $('algorithm').value);
  const duration = value => value < .001 ? '<0.001' : value.toFixed(3);
  $('metric-summary').textContent = selected ? `${ALGORITHMS[selected.algorithm]}${selected.replanned ? ' 重规划（当前位置起算）' : ''} · ${selected.pathLength === null ? '不可达' : selected.pathLength + ' 步 · 成本 ' + selected.totalCost} · 访问 ${selected.result.visitedCount} · ${duration(selected.elapsedMs)} 毫秒（仅算法）` : '搜索后显示步数、总代价、访问节点和算法耗时';
  $('comparison-body').replaceChildren(...measurements.map(item => {
    const row = document.createElement('tr');
    for (const value of [ALGORITHMS[item.algorithm], item.pathLength ?? '不可达', item.totalCost ?? '—', item.result.visitedCount, duration(item.elapsedMs)]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
}

function syncSearchControls() {
  if (playback.state === 'completed' && playback.result.found && !robot) {
    robot = new Robot(grid, playback.result.path, Number($('robot-speed').value));
    planner = new DynamicPlanner(robot);
  }
  syncRobotControls();
  $('algorithm-note').textContent = $('algorithm').value === 'bfs' ? 'BFS 优化步数，不保证加权总代价最低。' : 'Dijkstra / A* 优化累计进入成本；普通地面 1，高成本地形 5。';
  $('search-button').disabled = searching;
  $('compare-button').disabled = searching;
  $('search-button').textContent = searching ? '计算中…' : '开始搜索';
  $('pause-search').disabled = !['playing', 'paused'].includes(playback.state);
  $('pause-search').textContent = playback.state === 'paused' ? '继续' : '暂停';
  $('step-search').disabled = !playback.result || playback.state === 'completed';
  const labels = { idle: '等待搜索', playing: '播放中', paused: '已暂停', completed: playback.result?.found ? '路径已显示' : '目标不可达' };
  $('search-progress').textContent = searching ? planner?.pending ? 'A* 正在重新规划…' : '正在计算搜索结果…' : playback.result
    ? `${labels[playback.state]} · ${playback.index}/${playback.result.visitedCount}` : robot
      ? robot.state === 'blocked' ? '旧路线已停止' : `路线保留 · 剩余 ${robot.remainingPath.length - 1} 步` : labels.idle;
}
function invalidateSearch(refreshUI = true) {
  mapVersion++; requestId++; searching = false; playback.reset(); robot = null; planner = null; measurements = [];
  if(refreshUI){renderMetrics();syncSearchControls();}
}
searchWorker.onmessage = ({ data }) => {
  if (data.id !== requestId || data.version !== mapVersion) return;
  searching = false;
  if (data.kind === 'replan') {
    if (!planner?.pending) return;
    if (data.error) { planner.fail(); setStatus(`重规划失败，机器人已安全停止：${data.error}`, true); syncSearchControls(); draw(); return; }
    try {
      if (!planner.finishReplan(planner.pending, data.result)) { setStatus('过期路线已丢弃，机器人保持停止。', true); syncSearchControls(); draw(); return; }
    } catch (error) { setStatus(`新路线校验失败，机器人已停止：${error.message}`, true); syncSearchControls(); draw(); return; }
    playback.load(data.result, false); playback.advance(data.result.visitedCount);
    measurements = data.measurements.map(item => ({ ...item, replanned: true }));
    $('algorithm').value = 'astar'; renderMetrics(); lastFrame = null;
    setStatus(data.result.found ? `A* 重规划成功，已从当前位置更新路线，${robot.state === 'moving' ? '继续移动' : robot.state === 'paused' ? '保持暂停' : '等待出发'}。`
      : 'A* 未找到可行路径：机器人已安全停止在原格。清除障碍后可点「当前位置重规划」。', !data.result.found);
    syncSearchControls(); draw(); return;
  }
  if (data.error) { setStatus(data.error, true); syncSearchControls(); return; }
  playback.load(data.result); lastFrame = null;
  measurements = data.measurements; renderMetrics();
  if (measurements.length > 1) $('comparison-details').open = true;
  setStatus(data.result.found ? '计算完成，正在按访问顺序播放。可以暂停后单步观察。' : '目标不可达：正在播放已探索区域。', !data.result.found);
  syncSearchControls(); draw();
};
searchWorker.onerror = () => { searching = false; if (planner?.pending) planner.fail(); setStatus('搜索模块加载失败，机器人已停止，请刷新页面重试。', true); syncSearchControls(); draw(); };

function dispatchReplan(request) {
  searching = true; requestId++; lastFrame = null;
  playback.reset(); measurements = []; renderMetrics();
  searchWorker.postMessage({ id: requestId, version: mapVersion, kind: 'replan', map: request.map, algorithm: 'astar' });
  setStatus('剩余路径需要更新，机器人已暂停；A* 正在从当前位置重新规划。');
  syncSearchControls(); draw();
}

function rememberEdit(before, beforeMode, beforeLesson, stroke) {
  if(stroke?.historySaved)return;
  history.push({map:before,mode:beforeMode,lesson:beforeLesson});
  if(history.length>60)history.shift();
  if(stroke)stroke.historySaved=true;
}
function editRobotObstacle(cell, { blocked:desired = null, stroke = null, deferUI = false } = {}) {
  const blocked = desired ?? !grid.isBlocked(cell);
  if(grid.isBlocked(cell)===blocked)return false;
  const before = stroke?.historySaved ? null : grid.snapshot();
  let request;
  try { request = planner.changeObstacle(cell, blocked); }
  catch (error) { setStatus(error.message, true); return false; }
  rememberEdit(before,mode,{...lesson,target:lesson.target&&[...lesson.target]},stroke);
  mapVersion++; requestId++; searching = false; playback.reset(); measurements = [];if(!deferUI)renderMetrics();
  if (request) {if(deferUI)stroke.request=request;else dispatchReplan(request);}
  else { setStatus(blocked ? '障碍已添加，没有影响剩余路径，机器人保持原状态。' : robot.state === 'blocked'
    ? '障碍已清除，机器人仍留在原格。点击「当前位置重规划」寻找新路线。'
    : '障碍已清除，机器人与当前路线保留。需要更优路线可点「当前位置重规划」。'); if(!deferUI)syncSearchControls(); }
  if(!deferUI)refresh();return true;
}

function setStatus(message, error = false) {
  $('status-text').textContent = message;
  $('status').classList.toggle('error', error);
}
function rememberWelcome() { try { localStorage.setItem('path-lab-welcome-v1', 'seen'); } catch {} }
function hasSeenWelcome() { try { return localStorage.getItem('path-lab-welcome-v1') === 'seen'; } catch { return false; } }
function chooseMode(next, announce = true) {
  finishStroke();
  mode = next;
  if(!lesson.active)$('board-hint').textContent=editingHint();
  for (const button of document.querySelectorAll('[data-mode]')) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (announce) {
    const tips = { obstacle: '障碍物工具：按住左键拖动连续布置；从障碍上按下可连续擦除，撤销可恢复整笔。',
      start: '起点工具：在一块新的空地上点一下，把绿色起点移过去。',
      goal: '终点工具：在一块新的空地上点一下，把珊瑚色终点移过去。',
      terrain: '高成本工具：按住左键拖动连续涂抹，障碍会直接替换为成本 5 的地形。',
      plain: '普通地面工具：按住左键拖动连续涂抹，清除障碍和高成本，恢复成本 1。' };
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
    $('board-hint').textContent = editingHint();
  } else {
    $('coach').textContent = '点击下方按钮，开始一次手把手的练习。';
    $('lesson-button').textContent = '开始动手教程 →';
    $('board-hint').textContent = editingHint();
  }
  draw();
}
function edit(cell, {blocked = null, stroke = null, deferUI = false} = {}) {
  if (robot && mode === MODES.obstacle && grid.inBounds(cell)) return editRobotObstacle(cell,{blocked,stroke,deferUI});
  const before = stroke?.historySaved ? null : grid.snapshot();
  const beforeLesson = { ...lesson, target: lesson.target && [...lesson.target] };
  const beforeMode = mode;
  const result = mode===MODES.obstacle&&blocked!==null ? applyObstacleEdit(grid,cell,blocked) : applyEdit(grid, mode, cell);
  if (result.changed) {
    invalidateSearch(!deferUI);
    rememberEdit(before,beforeMode,beforeLesson,stroke);
    const previousStep = lesson.step;
    lesson = advanceLesson(lesson, result);
    if (lesson.active && lesson.step !== previousStep) chooseMode(LESSON_STEPS[lesson.step].mode, false);
    if (lesson.step === LESSON_STEPS.length && previousStep !== lesson.step) {
      chooseMode(MODES.obstacle, false);
      setStatus('四步教程完成！你已经学会地图编辑，可以开始自由创作了。');
    } else setStatus(result.message);
  } else setStatus(result.message, true);
  if(!deferUI)refresh();return result.changed;
}
function restartLessonForMapChange() {
  finishStroke();
  invalidateSearch();
  if (lesson.active) { lesson = newLesson(); chooseMode(MODES.obstacle, false); }
  hover = null;
  focusCell = [0, 0];
  viewport.scrollTo(0, 0);
}
function undo() {
  finishStroke();
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
function openWelcome() { finishStroke();if (!$('welcome-dialog').open) $('welcome-dialog').showModal(); }
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
  const width = viewport.clientWidth, height = viewport.clientHeight;
  if (!width || !height) return;
  geometry = calculateViewport({ rows: grid.rows, cols: grid.cols, width, height, cellSize, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop });
  const surface = $('board-container');
  surface.style.width = `${geometry.contentWidth}px`;
  surface.style.height = `${geometry.contentHeight}px`;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#fcfefd';
  ctx.fillRect(0, 0, width, height);
  const { left, top, size } = geometry;
  Object.assign(canvas.dataset, { rows: String(grid.rows), cols: String(grid.cols), left: String(left), top: String(top), cellSize: String(size) });
  ctx.fillStyle = palette.empty;
  ctx.fillRect(left, top, grid.cols * size, grid.rows * size);
  const obstacles = grid.obstacles;
  const visited = new Set(playback.visited.map(String)), path = new Set((robot ? robot.remainingPath : playback.path).map(String));
  for (let y = geometry.firstRow; y < geometry.lastRow; y++) {
    for (let x = geometry.firstCol; x < geometry.lastCol; x++) {
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
  if (robot) {
    const x = left + (robot.position[0] + .5) * size, y = top + (robot.position[1] + .5) * size;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, size * .28), 0, Math.PI * 2);
    ctx.fillStyle = '#285bb5'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(.5, size * .05); ctx.stroke();
    for (const offset of [-.09, .09]) { ctx.beginPath(); ctx.arc(x + size * offset, y - size * .03, Math.max(.5, size * .035), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
  }
}
function pointerCell(event) {
  const bounds = canvas.getBoundingClientRect();
  return cellFromPoint(event.clientX - bounds.left, event.clientY - bounds.top, geometry, grid.rows, grid.cols);
}
function editAtPointer(event) {
  if (event.button !== 0) { setStatus('右键不会修改地图，请用左键点击。'); return; }
  canvas.focus({ preventScroll: true });
  const cell = pointerCell(event);
  if (cell) focusCell = [...cell];
  edit(cell);
}
function finishStroke() {
  if(!activeStroke)return;
  const session=activeStroke;activeStroke=null;session.path.end();
  if(canvas.hasPointerCapture(session.pointerId))canvas.releasePointerCapture(session.pointerId);
  if(session.historySaved&&!robot)setStatus(`本笔${paintNames[session.path.mode]}编辑已结束，点击撤销可一次恢复整笔。`);
}
function paintStroke(cell) {
  const session=activeStroke;if(!session)return false;
  session.request=null;let changed=false;
  for(const point of session.path.visit(cell)){
    focusCell=[...point];
    changed=edit(point,{blocked:session.path.blocked,stroke:session,deferUI:true})||changed;
  }
  if(changed){
    if(session.request)dispatchReplan(session.request);
    else{renderMetrics();syncSearchControls();if(!robot)setStatus(`${session.path.mode===MODES.obstacle?(session.path.blocked?'连续添加':'连续擦除')+'障碍':'连续涂抹'+paintNames[session.path.mode]}中，松开左键结束；一次撤销可恢复整笔。`);}
    refresh();
  }
  return changed;
}
let touchStart = null;
canvas.addEventListener('pointerdown', event => {
  if(event.isPrimary===false)return;
  if (event.pointerType === 'touch') { touchStart = {id:event.pointerId,x:event.clientX,y:event.clientY};return; }
  finishStroke();
  const cell=pointerCell(event);
  if(event.button!==0||!PAINT_MODES.includes(mode)||lesson.active||!cell){editAtPointer(event);return;}
  event.preventDefault();canvas.focus({preventScroll:true});
  activeStroke={pointerId:event.pointerId,path:new PaintStroke(grid,cell,mode),historySaved:false,request:null};
  canvas.setPointerCapture(event.pointerId);paintStroke(cell);
});
canvas.addEventListener('pointerup', event => {
  if(activeStroke?.pointerId===event.pointerId){paintStroke(pointerCell(event));finishStroke();}
  if(event.pointerType==='touch'&&touchStart?.id===event.pointerId){
    if(Math.hypot(event.clientX-touchStart.x,event.clientY-touchStart.y)<8)editAtPointer(event);
    touchStart=null;
  }
});
canvas.addEventListener('pointercancel', event => {if(activeStroke?.pointerId===event.pointerId)finishStroke();if(touchStart?.id===event.pointerId)touchStart=null;});
canvas.addEventListener('lostpointercapture',event=>{if(activeStroke?.pointerId===event.pointerId)finishStroke();});
canvas.addEventListener('pointermove', event => {
  hover = pointerCell(event);
  $('pointer-label').textContent = hover ? `第 ${hover[0] + 1} 列 · 第 ${hover[1] + 1} 行` : '网格内点击编辑';
  if(activeStroke?.pointerId===event.pointerId){
    if(!(event.buttons&1)){finishStroke();draw();}
    else if(!paintStroke(hover))draw();
  }else draw();
});
canvas.addEventListener('pointerleave', () => { hover = null; $('pointer-label').textContent = '网格内点击编辑'; draw(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('focus', draw); canvas.addEventListener('blur', draw);
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => chooseMode(button.dataset.mode));
$('undo-button').addEventListener('click', undo);
$('cell-size').addEventListener('input', () => {
  finishStroke();
  cellSize = Number($('cell-size').value); $('cell-size-label').textContent = `${cellSize} 像素/格`; draw();
});
$('reset-view').addEventListener('click', () => {
  finishStroke();
  cellSize = 28; $('cell-size').value = '28'; $('cell-size-label').textContent = '28 像素/格'; viewport.scrollTo(0, 0); draw();
});
viewport.addEventListener('scroll', draw, { passive: true });
$('control-panel').addEventListener('toggle', () => {
  $('control-panel-hint').textContent = $('control-panel').open ? '收起控制，扩大地图' : '展开搜索、统计与移动';
  requestAnimationFrame(draw);
});
function startSearch(compare = false) {
  finishStroke();
  playback.reset(); robot = null; planner = null; searching = true; requestId++;
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
$('robot-start').addEventListener('click', () => { robot?.start(); lastFrame = null; syncRobotControls(); draw(); });
$('robot-pause').addEventListener('click', () => { planner?.pause(); syncRobotControls(); });
$('robot-reset').addEventListener('click', () => { robot?.reset(); if (robot?.state === 'blocked') setStatus('原路线已被新障碍阻断，机器人留在原格。请点「当前位置重规划」。', true); syncRobotControls(); draw(); });
$('replan-button').addEventListener('click', () => {
  if (!planner) return;
  try { dispatchReplan(planner.requestReplan()); }
  catch (error) { planner.fail(); setStatus(error.message, true); syncSearchControls(); draw(); }
});
$('robot-speed').addEventListener('input', () => { const speed = Number($('robot-speed').value); robot?.setSpeed(speed); $('robot-speed-label').textContent = `${speed} 格/秒`; });
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
$('dynamic-demo').addEventListener('click', () => {
  saveUndo(); grid = new Grid(3, 15, { start: [0, 1], goal: [14, 1] });
  restartLessonForMapChange(); syncInputs(); $('robot-speed').value = '1'; $('robot-speed-label').textContent = '1 格/秒';
  setStatus('动态示例已载入，移动速度设为 1 格/秒。先搜索并出发，再向剩余的金色路径添加障碍，观察 A* 绕行。'); refresh();
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
  finishStroke();
  if (document.fullscreenElement) await document.exitFullscreen();
  immersive = !immersive;
  if (immersive) { controlsWereOpen = $('control-panel').open; $('control-panel').open = false; }
  else $('control-panel').open = controlsWereOpen;
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
  if(event.key==='Escape')finishStroke();
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
      const px = geometry.left + focusCell[0] * cellSize, py = geometry.top + focusCell[1] * cellSize;
      if (px < 0) viewport.scrollLeft += px;
      else if (px + cellSize > viewport.clientWidth) viewport.scrollLeft += px + cellSize - viewport.clientWidth;
      if (py < 0) viewport.scrollTop += py;
      else if (py + cellSize > viewport.clientHeight) viewport.scrollTop += py + cellSize - viewport.clientHeight;
      draw();
    }
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault();finishStroke();edit(focusCell); }
  }
});
new ResizeObserver(draw).observe(viewport);
function animate(timestamp) {
  const previous = playback.index;
  const beforeState = playback.state;
  const robotIndex = robot?.index, robotState = robot?.state;
  if (lastFrame !== null) {
    const delta = (timestamp - lastFrame) / 1000;
    playback.update(delta); robot?.update(delta);
  }
  lastFrame = timestamp;
  if (previous !== playback.index || beforeState !== playback.state) { syncSearchControls(); draw(); }
  if (robotIndex !== robot?.index || robotState !== robot?.state) { syncSearchControls(); draw(); }
  requestAnimationFrame(animate);
}
window.addEventListener('blur',()=>{finishStroke();touchStart=null;});
document.addEventListener('visibilitychange', () => { lastFrame = null; if (document.hidden) { finishStroke();touchStart=null;playback.pause(); planner?.pause(); syncSearchControls(); } });
requestAnimationFrame(animate);
syncInputs(); refresh(); fullscreenUI(); syncSearchControls(); renderMetrics();
if (!hasSeenWelcome() || params.get('tutorial') === '1') openWelcome();
if (!validDimensions(initialRows, initialCols)) setStatus('网址中的地图尺寸无效，已载入 20×30 示例地图。', true);
