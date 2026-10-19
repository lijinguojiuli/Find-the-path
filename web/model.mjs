export const MODES = Object.freeze({ obstacle: 'obstacle', start: 'start', goal: 'goal', terrain: 'terrain', plain: 'plain' });
const equal = (a, b) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
const key = ([x, y]) => `${x},${y}`;

export class Grid {
  constructor(rows, cols, { start = null, goal = null, obstacles = [], costs = [] } = {}) {
    if (![rows, cols].every(value => Number.isSafeInteger(value) && value > 0)) {
      throw new Error('行数和列数必须是正整数。');
    }
    this.rows = rows;
    this.cols = cols;
    this._start = null;
    this._goal = null;
    this._obstacles = new Set();
    this._costs = new Map();
    for (const cell of obstacles) this.addObstacle(cell);
    this.setStart(start);
    this.setGoal(goal);
    for (const [x, y, cost] of costs) this.setCost([x, y], cost);
  }
  get start() { return this._start; }
  get goal() { return this._goal; }
  get obstacles() { return new Set(this._obstacles); }
  get obstacleCount() { return this._obstacles.size; }
  get costs() { return new Map(this._costs); }
  get minimumCost() {
    if (this._costs.size + this._obstacles.size < this.rows * this.cols) return 1;
    return this._costs.size ? Math.min(...this._costs.values()) : 1;
  }
  setCost(cell, cost) {
    this.requireCell(cell);
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('通行成本必须是正整数。');
    if (this.isBlocked(cell)) throw new Error('请先清除障碍，再设置地形。');
    if (cost === 1) this._costs.delete(key(cell)); else this._costs.set(key(cell), cost);
  }
  costAt(cell) {
    this.requireCell(cell);
    if (this.isBlocked(cell)) throw new Error('障碍物不可通行。');
    return this._costs.get(key(cell)) ?? 1;
  }
  inBounds(cell) {
    return Array.isArray(cell) && cell.length === 2 && cell.every(Number.isSafeInteger)
      && cell[0] >= 0 && cell[0] < this.cols && cell[1] >= 0 && cell[1] < this.rows;
  }
  requireCell(cell) {
    if (!this.inBounds(cell)) throw new Error('这个位置不在地图内。');
  }
  setStart(cell) { this._start = this.endpoint(cell); }
  setGoal(cell) { this._goal = this.endpoint(cell); }
  endpoint(cell) {
    if (cell === null) return null;
    this.requireCell(cell);
    if (this.isBlocked(cell)) throw new Error('请先清除这里的障碍，再放置起终点。');
    return Object.freeze([...cell]);
  }
  isBlocked(cell) { this.requireCell(cell); return this._obstacles.has(key(cell)); }
  addObstacle(cell) {
    this.requireCell(cell);
    if (equal(cell, this.start) || equal(cell, this.goal)) throw new Error('起点和终点受到保护，不能放置障碍。');
    this._obstacles.add(key(cell));
    this._costs.delete(key(cell));
  }
  removeObstacle(cell) { this.requireCell(cell); this._obstacles.delete(key(cell)); }
  snapshot() {
    return { rows: this.rows, cols: this.cols, start: this.start && [...this.start],
      goal: this.goal && [...this.goal], obstacles: [...this._obstacles].map(item => item.split(',').map(Number)),
      costs: [...this._costs].map(([cell, cost]) => [...cell.split(',').map(Number), cost]) };
  }
}

export function createDemoGrid(rows = 20, cols = 30) {
  const grid = new Grid(rows, cols, { start: [0, 0], goal: [cols - 1, rows - 1] });
  for (let y = Math.floor(rows / 4); y < Math.floor(3 * rows / 4); y++) {
    const cell = [Math.floor(cols / 2), y];
    if (y !== Math.floor(rows / 2) && !equal(cell, grid.start) && !equal(cell, grid.goal)) grid.addObstacle(cell);
  }
  return grid;
}

export function applyEdit(grid, mode, cell) {
  const unchanged = message => ({ changed: false, action: 'none', message, cell });
  if (!grid.inBounds(cell)) return unchanged('请点击网格里的格子，地图外不会发生修改。');
  if (!Object.values(MODES).includes(mode)) return unchanged('请先选择一个地图编辑工具。');
  const location = `第 ${cell[0] + 1} 列、第 ${cell[1] + 1} 行`;
  if (mode === MODES.terrain || mode === MODES.plain) {
    if (grid.isBlocked(cell)) return unchanged('请先清除障碍，再设置地形。');
    const cost = mode === MODES.terrain ? 5 : 1;
    if (grid.costAt(cell) === cost) return unchanged('这里已经是该地形。');
    grid.setCost(cell, cost);
    return { changed: true, action: 'terrain', cell, message: `已设置${cost === 5 ? '高成本地形（5）' : '普通地面（1）'}：${location}。` };
  }
  if (mode === MODES.obstacle) {
    return applyObstacleEdit(grid, cell, !grid.isBlocked(cell));
  }
  if (grid.isBlocked(cell)) return unchanged('这里是障碍。请切换到「障碍物」工具，点一下清除后再设置端点。');
  const name = mode === MODES.start ? '起点' : '终点';
  if (equal(cell, mode === MODES.start ? grid.start : grid.goal)) return unchanged(`${name}已经在这里了，试试另一块空地。`);
  if (mode === MODES.start) grid.setStart(cell); else grid.setGoal(cell);
  return { changed: true, action: mode, cell,
    message: equal(grid.start, grid.goal) ? '起点与终点已重合，当前允许这种测试情况。' : `${name}已移到${location}。` };
}

// Explicit intent is idempotent: dragging over an existing wall must not toggle it.
export function applyObstacleEdit(grid, cell, blocked) {
  const unchanged = message => ({ changed:false, action:'none', message, cell });
  if (!grid.inBounds(cell)) return unchanged('请点击网格里的格子，地图外不会发生修改。');
  if (typeof blocked !== 'boolean') return unchanged('障碍编辑状态无效。');
  if (equal(cell, grid.start) || equal(cell, grid.goal)) return unchanged('起点和终点受到保护。请先把端点移到别处。');
  if (grid.isBlocked(cell) === blocked) return unchanged(blocked ? '这里已经是障碍。' : '这里已经是空地。');
  if (blocked) grid.addObstacle(cell); else grid.removeObstacle(cell);
  return { changed:true, action:blocked?'add':'remove', cell,
    message:`${blocked?'已添加':'已清除'}障碍：第 ${cell[0]+1} 列、第 ${cell[1]+1} 行。` };
}

export function cellFromPoint(x, y, geometry, rows, cols) {
  const { left, top, size } = geometry;
  if (![x, y, left, top, size].every(Number.isFinite) || size <= 0
    || x < left || y < top || x >= left + cols * size || y >= top + rows * size) return null;
  return [Math.floor((x - left) / size), Math.floor((y - top) / size)];
}

export function validDimensions(rows, cols) {
  return [rows, cols].every(value => Number.isInteger(value) && value >= 1 && value <= 80);
}
