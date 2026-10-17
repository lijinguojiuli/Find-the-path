// Playback consumes a completed trace. deltaSeconds is supplied by the UI.
export class SearchPlayback {
  constructor(rate = 30) { this.setRate(rate); this.reset(); }
  setRate(rate) {
    if (!Number.isFinite(rate) || rate < 1 || rate > 2000) throw new Error('播放速度必须在 1–2000 之间。');
    this.rate = rate;
  }
  reset() { this.result = null; this.index = 0; this.remainder = 0; this.state = 'idle'; }
  load(result, autoplay = true) {
    this.reset();
    this.result = result;
    this.state = autoplay ? 'playing' : 'paused';
    if (!result.visitedOrder.length) this.state = 'completed';
  }
  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  advance(count) {
    this.index = Math.min(this.result.visitedOrder.length, this.index + count);
    if (this.index === this.result.visitedOrder.length) { this.state = 'completed'; this.remainder = 0; }
  }
  step() {
    if (!this.result || this.state === 'completed') return;
    this.pause(); this.remainder = 0; this.advance(1);
  }
  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('时间增量必须是非负有限数。');
    if (this.state !== 'playing') return;
    this.remainder += deltaSeconds * this.rate;
    const count = Math.floor(this.remainder + 1e-9);
    this.remainder -= count;
    this.advance(count);
  }
  get visited() { return this.result ? this.result.visitedOrder.slice(0, this.index) : []; }
  get path() { return this.state === 'completed' ? this.result.path : []; }
}
