// UI-free task identity, bounded cache, and time-based animation state.
export class Tasks {
  constructor() { this.sequence = 0; this.active = null; }
  begin(kind, version, algorithm = 'astar') {
    this.active = { kind, id: ++this.sequence, version, algorithm }; return { ...this.active };
  }
  accepts(message) { return !!this.active && message.id === this.active.id && message.version === this.active.version; }
  finish(message) { if (!this.accepts(message)) return false; this.active = null; return true; }
  cancel() { this.sequence++; this.active = null; }
}
export class ResultCache {
  constructor() { this.results = new Map(); this.summaries = new Map(); }
  put(algorithm, result, summary) {
    this.summaries.set(algorithm, summary);
    if (!result) return;
    this.results.delete(algorithm); this.results.set(algorithm, result);
    while (this.results.size > 2) this.results.delete(this.results.keys().next().value);
  }
  get(algorithm) {
    const result = this.results.get(algorithm);
    if (result) { this.results.delete(algorithm); this.results.set(algorithm, result); }
    return result;
  }
  clear() { this.results.clear(); this.summaries.clear(); }
}
export class MazePlayback {
  constructor(size, rate = 20000) {
    this.mask = new Uint8Array(size); this.pathMask = new Uint8Array(size);
    this.rate = rate; this.result = null; this.state = 'idle'; this.index = 0; this.remainder = 0;
  }
  load(result, play = true) { this.result = result; this.rewind(play); }
  rewind(play = false) {
    this.mask.fill(0); this.pathMask.fill(0); this.index = 0; this.remainder = 0;
    this.state = this.result ? (play ? 'playing' : 'paused') : 'idle';
    if (this.result && !this.result.visitedCount) this.advance(0);
  }
  toggle() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
  advance(count) {
    if (!this.result) return;
    const end = Math.min(this.result.visitedCount, this.index + count);
    for (; this.index < end; this.index++) this.mask[this.result.visitedOrder[this.index]] = this.result.visitedSides[this.index];
    if (this.index === this.result.visitedCount) {
      this.state = 'completed'; this.remainder = 0;
      for (const id of this.result.path) this.pathMask[id] = 1;
    }
  }
  step() { if (!this.result) return; this.state = 'paused'; this.advance(1); }
  finish() { if (this.result) this.advance(this.result.visitedCount - this.index); }
  update(seconds) {
    if (this.state !== 'playing' || !Number.isFinite(seconds) || seconds < 0) return;
    const budget = seconds * this.rate + this.remainder, count = Math.floor(budget);
    this.remainder = budget - count; this.advance(count);
  }
}
export function minimapTarget(px, py, width, height, maze) {
  return [Math.max(0, Math.min(maze.cols - 1, Math.floor(px / width * maze.cols))),
    Math.max(0, Math.min(maze.rows - 1, Math.floor(py / height * maze.rows)))];
}
