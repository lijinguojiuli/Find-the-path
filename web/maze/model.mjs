// Pure data and deterministic generation; no browser or rendering dependencies.
export const MAZE_TYPES = Object.freeze({ corridors: '长走廊', branches: '多分支', braided: '带环路' });
export function validateSize(rows, cols) {
  if (![rows, cols].every(n => Number.isInteger(n) && n >= 11 && n <= 1001 && n % 2 === 1))
    throw new Error('行数和列数须为 11–1001 之间的奇数。');
}
export function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('种子须为 0–4294967295 的整数。');
}
export function parseOptions({ rows, cols, seed, type }) {
  if ([rows, cols, seed].some(v => typeof v === 'string' && !v.trim())) throw new Error('请填写行数、列数和随机种子。');
  const options = { rows: Number(rows), cols: Number(cols), seed: Number(seed), type };
  validateSize(options.rows, options.cols); validateSeed(options.seed);
  if (!Object.hasOwn(MAZE_TYPES, type)) throw new Error('未知迷宫类型。');
  return options;
}
export class Maze {
  constructor(rows, cols, { walls, start, goal, seed = 0, type = 'braided', version = 0 }) {
    if (![rows, cols].every(n => Number.isInteger(n) && n > 0 && n <= 1001)) throw new Error('地图尺寸无效。');
    if (!walls || walls.length !== rows * cols || !walls.every(v => v === 0 || v === 1)) throw new Error('墙体数据无效。');
    validateSeed(seed);
    if (!Object.hasOwn(MAZE_TYPES, type) || !Number.isSafeInteger(version) || version < 0) throw new Error('地图元数据无效。');
    this.rows = rows; this.cols = cols; this.walls = Uint8Array.from(walls);
    this.seed = seed; this.type = type; this.version = version;
    for (const [name, cell] of [['start', start], ['goal', goal]]) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)
        || cell[0] < 0 || cell[0] >= cols || cell[1] < 0 || cell[1] >= rows || this.walls[cell[1] * cols + cell[0]])
        throw new Error('起点和终点必须位于地图内的通道上。');
      this[name] = Object.freeze([...cell]);
    }
  }
  get startId() { return this.start[1] * this.cols + this.start[0]; }
  get goalId() { return this.goal[1] * this.cols + this.goal[0]; }
  snapshot() { return new Maze(this.rows, this.cols, this); }
}
export function randomSource(seed) {
  validateSeed(seed);
  let state = seed || 0x6d2b79f5;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
}
export function generateMaze({ rows = 301, cols = 301, type = 'braided', seed = 20261018, version = 0 } = {}) {
  validateSize(rows, cols); validateSeed(seed);
  if (!Object.hasOwn(MAZE_TYPES, type)) throw new Error('未知迷宫类型。');
  const random = randomSource(seed), n = rows * cols, walls = new Uint8Array(n).fill(1);
  const jumps = [-2 * cols, 2, 2 * cols, -2], halves = [-cols, 1, cols, -1];
  const valid = (id, direction) => {
    const x = id % cols, y = Math.floor(id / cols);
    return direction === 0 ? y > 1 : direction === 1 ? x < cols - 2 : direction === 2 ? y < rows - 2 : x > 1;
  };
  walls[cols + 1] = 0;
  if (type === 'branches') {
    const frontier = new Uint32Array(n); let count = 0;
    const add = id => { for (let d = 0; d < 4; d++) if (valid(id, d) && walls[id + jumps[d]]) frontier[count++] = id * 4 + d; };
    add(cols + 1);
    while (count) {
      const index = random() % count, edge = frontier[index]; frontier[index] = frontier[--count];
      const from = Math.floor(edge / 4), d = edge % 4, next = from + jumps[d];
      if (!walls[next]) continue;
      walls[next] = walls[from + halves[d]] = 0; add(next);
    }
  } else {
    const stack = new Uint32Array(n), choices = new Uint8Array(4); let top = 1; stack[0] = cols + 1;
    while (top) {
      const id = stack[top - 1]; let count = 0;
      for (let d = 0; d < 4; d++) if (valid(id, d) && walls[id + jumps[d]]) choices[count++] = d;
      if (!count) { top--; continue; }
      const d = choices[random() % count], next = id + jumps[d];
      walls[next] = walls[id + halves[d]] = 0; stack[top++] = next;
    }
    if (type === 'braided') for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const id = y * cols + x;
      if (walls[id] && ((y % 2 && !(x % 2) && !walls[id - 1] && !walls[id + 1])
        || (x % 2 && !(y % 2) && !walls[id - cols] && !walls[id + cols])) && random() % 100 < 15) walls[id] = 0;
    }
  }
  walls[1] = walls[n - 2] = 0;
  return new Maze(rows, cols, { walls, start: [1, 0], goal: [cols - 2, rows - 1], seed, type, version });
}
