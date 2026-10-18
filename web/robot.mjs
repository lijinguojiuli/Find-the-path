import { manhattan } from './search.mjs';
const equal = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

function validatedRoute(grid, path, start) {
  if (!path.length || !equal(path[0], start) || !equal(path.at(-1), grid.goal)) throw new Error('路径必须从指定位置开始，在地图终点结束。');
  path.forEach((cell, index) => {
    if (!grid.inBounds(cell) || grid.isBlocked(cell)) throw new Error('机器人路径不能越界或穿过障碍。');
    if (index && manhattan(cell, path[index - 1]) !== 1) throw new Error('路径节点必须上下左右相邻。');
  });
  return Object.freeze(path.map(cell => Object.freeze([...cell])));
}

export class Robot {
  constructor(grid, path, speed = 3) {
    this.grid = grid;
    this.path = validatedRoute(grid, path, grid.start);
    this.setSpeed(speed); this.reset();
  }
  setSpeed(speed) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('机器人速度必须为正的有限数。');
    this.speed = speed;
  }
  get position() { return this.path[this.index]; }
  get remainingPath() { return this.path.slice(this.index); }
  replacePath(path) { this.path = validatedRoute(this.grid, path, this.position); this.reset(); }
  stop() { this.path = Object.freeze([this.position]); this.index = 0; this.progress = 0; this.state = 'blocked'; }
  beginReplanning() { this.stop(); this.state = 'replanning'; }
  reset() {
    if (this.path.some(cell => this.grid.isBlocked(cell))) { this.stop(); return; }
    this.index = 0; this.progress = 0; this.state = this.path.length > 1 ? 'ready' : equal(this.position, this.grid.goal) ? 'arrived' : 'blocked';
  }
  start() { if (['ready', 'paused'].includes(this.state)) this.state = 'moving'; }
  pause() { if (this.state === 'moving') this.state = 'paused'; }
  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('时间增量必须是非负有限数。');
    if (this.state !== 'moving') return;
    this.progress += deltaSeconds * this.speed;
    while (this.progress >= 1 - 1e-9 && this.state === 'moving') {
      const next = this.path[this.index + 1];
      if (this.grid.isBlocked(this.position) || this.grid.isBlocked(next)) { this.state = 'blocked'; this.progress = 0; return; }
      this.progress = Math.max(0, this.progress - 1); this.index++;
      if (this.index === this.path.length - 1) { this.state = 'arrived'; this.progress = 0; }
    }
  }
}
