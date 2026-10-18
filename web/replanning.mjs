// Pure control logic. The UI can calculate a request in a Worker and apply it later.
import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';
const equal = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const fingerprint = grid => JSON.stringify(grid.snapshot());

export function runReplan(request) {
  return searchGrid(new Grid(request.map.rows, request.map.cols, request.map), 'astar');
}
export class DynamicPlanner {
  constructor(robot) {
    this.robot = robot; this.grid = robot.grid;
    this.version = 0; this.sequence = 0; this.pending = null; this.replanCount = 0; this.resumeState = 'ready';
  }
  changeObstacle(cell, blocked = true) {
    if (typeof blocked !== 'boolean') throw new Error('blocked 必须是布尔值。');
    const previous = this.grid.isBlocked(cell);
    if (blocked && equal(cell, this.robot.position)) throw new Error('不能把障碍物放在机器人当前所在格子。');
    if (previous === blocked) return null;
    const affected = blocked && this.robot.remainingPath.slice(1).some(item => equal(item, cell));
    if (blocked) this.grid.addObstacle(cell); else this.grid.removeObstacle(cell);
    this.version++;
    return affected || this.pending ? this.requestReplan() : null;
  }
  requestReplan() {
    if (!this.pending) this.resumeState = ['moving', 'paused'].includes(this.robot.state) ? this.robot.state : 'ready';
    const origin = this.robot.position;
    this.robot.beginReplanning();
    try {
      const map = this.grid.snapshot(); map.start = [...origin];
      if (!map.goal) throw new Error('搜索前必须同时设置起点和终点。');
      // Freeze the request so outside code cannot change the in-flight map.
      for (const cell of [...map.obstacles, ...map.costs]) Object.freeze(cell);
      Object.freeze(map.obstacles); Object.freeze(map.costs); Object.freeze(map.start);
      if (map.goal) Object.freeze(map.goal);
      Object.freeze(map);
      this.pending = Object.freeze({ token: ++this.sequence, version: this.version, map, fingerprint: fingerprint(this.grid) });
      return this.pending;
    } catch (error) { this.fail(); throw error; }
  }
  pause() { if (this.pending) this.resumeState = 'paused'; this.robot.pause(); }
  fail() { this.pending = null; this.robot.stop(); }
  finishReplan(request, result) {
    if (!this.pending || request.token !== this.pending.token || request.version !== this.version) return false;
    if (!equal(this.robot.position, request.map.start) || this.robot.state !== 'replanning' || fingerprint(this.grid) !== request.fingerprint) {
      this.fail(); return false;
    }
    this.pending = null; this.replanCount++;
    if (!result.found) { this.robot.stop(); return true; }
    try { this.robot.replacePath(result.path); } catch (error) { this.robot.stop(); throw error; }
    if (['moving', 'paused'].includes(this.resumeState)) this.robot.start();
    if (this.resumeState === 'paused') this.robot.pause();
    return true;
  }
  addObstacle(cell) {
    const request = this.changeObstacle(cell);
    if (!request) return null;
    const result = runReplan(request); this.finishReplan(request, result); return result;
  }
}
