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
export function fitGeometry(rows, cols, width, height, cap = 28) {
  const size = Math.min(cap, Math.max(.05, (width - 24) / cols), Math.max(.05, (height - 24) / rows));
  return { size, left: (width - cols * size) / 2, top: (height - rows * size) / 2,
    contentWidth: width, contentHeight: height, firstCol: 0, lastCol: cols, firstRow: 0, lastRow: rows };
}
export function compareSummaries(left, right) {
  if (!left || !right) return { ready: false };
  return { ready: true, comparable: left.found && right.found,
    pathDelta: left.found && right.found ? left.pathLength - right.pathLength : null,
    visitedDelta: left.visitedCount - right.visitedCount,
    explorationReduction: right.visitedCount ? (1 - left.visitedCount / right.visitedCount) * 100 : null };
}
export class PairPlayback {
  constructor(size,rate=100) { this.left=new MazePlayback(size,rate);this.right=new MazePlayback(size,rate);this.rate=rate;this.index=0;this.remainder=0;this.state='idle'; }
  get result() {return this.left.result&&this.right.result?this.left.result:null;}
  get total() {return Math.max(this.left.result?.visitedCount??0,this.right.result?.visitedCount??0);}
  load(left,right,play=false) {this.left.load(left,false);this.right.load(right,false);this.rewind(play);}
  rewind(play=false) {
    this.left.rewind(false);this.right.rewind(false);this.index=0;this.remainder=0;
    this.state=!this.result?'idle':!this.total?'completed':play?'playing':'paused';this.syncStates();
  }
  syncStates() {for(const p of [this.left,this.right])if(p.result&&p.state!=='completed')p.state=this.state==='playing'?'playing':'paused';}
  toggle() {if(!this.result||this.state==='completed')return;this.state=this.state==='playing'?'paused':'playing';this.syncStates();}
  advance(count) {
    if(!this.result)return;const end=Math.min(this.total,this.index+count);
    this.left.advance(Math.max(0,end-this.left.index));this.right.advance(Math.max(0,end-this.right.index));this.index=end;
    if(this.index===this.total){this.state='completed';this.remainder=0;}this.syncStates();
  }
  step() {if(!this.result)return;this.state='paused';this.advance(1);}
  finish() {this.advance(this.total-this.index);}
  update(seconds) {if(this.state!=='playing'||!Number.isFinite(seconds)||seconds<0)return;const value=seconds*this.rate+this.remainder;this.remainder=value-Math.floor(value);this.advance(Math.floor(value));}
}
export function stageHeight(viewportHeight,top,footerHeight) {
  return Math.max(200,Math.min(850,Math.floor(viewportHeight-top-footerHeight-12)));
}
export function menuOffset(left,width,viewportWidth) {return Math.max(8,Math.min(left,viewportWidth-width-8))-left;}
