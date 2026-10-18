import { Maze } from './model.mjs';
import { advancedSearch } from './advanced.mjs';
import { SearchTrace } from './trace.mjs';

export const ALGORITHMS = Object.freeze({
  bfs: { name: 'BFS 广度优先', optimal: true, description: '队列逐层扩展，保证最少步数。' },
  dijkstra: { name: 'Dijkstra', optimal: true, description: '优先处理累计成本最低的节点。单位成本下与 BFS 同样最优。' },
  astar: { name: 'A*', optimal: true, description: 'f = g + h，曼哈顿距离引导搜索，保证最短路径。' },
  dfs: { name: 'DFS 深度优先', optimal: false, description: '沿一个方向深入，再回溯。不保证最短路径。' },
  greedy: { name: '贪心最佳优先', optimal: false, description: '只按到终点的估计距离 h 排序。不保证最短路径。' },
  bibfs: { name: '双向 BFS', optimal: true, description: '从起点和终点分层搜索，按距离下界决定结束。' },
  bidijkstra: { name: '双向 Dijkstra', optimal: true, description: '两端用优先队列扩展；两侧下界之和达到最优连接成本时结束。' },
  weighted: { name: '加权 A*', optimal: false, description: 'f = g + 1.5h，更偏向目标。不保证最短路径。' },
  spfa: { name: 'SPFA', optimal: true, description: '队列维护需要松弛的节点；当前单位成本下与 BFS 访问顺序相同。' },
  bellmanford: { name: 'Bellman–Ford', optimal: true, description: '反复扫描边并松弛距离。适合观察松弛原理，计算量较大。' },
  iddfs: { name: '迭代加深 DFS', optimal: true, description: '逐次提高深度上限，兼顾深度搜索与最少步数；重复计算较多。' },
  idastar: { name: 'IDA*', optimal: true, description: '以 g+h 阈值逐次加深，使用曼哈顿下界；节省前沿内存。' },
  beam: { name: '束搜索（宽 12）', optimal: false, description: '每层仅保留估计最接近终点的 12 个候选；可能舍弃可行路线。' },
  bigreedy: { name: '双向贪心', optimal: false, description: '两端轮流按 h 朝对方搜索；首次连接即可返回，不保证最短。' },
});

// Indexed heap: one entry per cell, decrease-key rather than duplicate objects.
class Heap {
  constructor(n) {
    this.ids = new Uint32Array(n); this.positions = new Int32Array(n).fill(-1);
    this.priorities = new Float64Array(n); this.orders = new Uint32Array(n);
    this.size = 0; this.sequence = 0;
  }
  less(a, b) { return this.priorities[a] < this.priorities[b] || (this.priorities[a] === this.priorities[b] && this.orders[a] < this.orders[b]); }
  swap(a, b) { const id = this.ids[a]; this.ids[a] = this.ids[b]; this.ids[b] = id; this.positions[this.ids[a]] = a; this.positions[id] = b; }
  put(id, priority) {
    let p = this.positions[id];
    if (p < 0) { p = this.size++; this.ids[p] = id; this.positions[id] = p; }
    this.orders[id] = this.sequence++;
    this.priorities[id] = priority;
    while (p > 0) { const parent = (p - 1) >> 1; if (!this.less(this.ids[p], this.ids[parent])) break; this.swap(p, parent); p = parent; }
  }
  get minimum() { return this.size ? this.priorities[this.ids[0]] : Infinity; }
  preview(limit=6) {
    const candidates=this.size?[0]:[],out=[];
    while(candidates.length&&out.length<limit) {
      candidates.sort((a,b)=>this.less(this.ids[a],this.ids[b])?-1:1);
      const i=candidates.shift();out.push(this.ids[i]);
      for(const child of [i*2+1,i*2+2])if(child<this.size)candidates.push(child);
    }
    return out;
  }
  pop() {
    const id = this.ids[0]; this.positions[id] = -1;
    if (--this.size) {
      this.ids[0] = this.ids[this.size]; this.positions[this.ids[0]] = 0;
      let p = 0;
      while (2 * p + 1 < this.size) {
        let child = 2 * p + 1;
        if (child + 1 < this.size && this.less(this.ids[child + 1], this.ids[child])) child++;
        if (!this.less(this.ids[child], this.ids[p])) break;
        this.swap(p, child); p = child;
      }
    }
    return id;
  }
}
function neighbors(m, id) {
  const x = id % m.cols, y = Math.floor(id / m.cols), out = [];
  if (y > 0 && !m.walls[id - m.cols]) out.push(id - m.cols);
  if (x < m.cols - 1 && !m.walls[id + 1]) out.push(id + 1);
  if (y < m.rows - 1 && !m.walls[id + m.cols]) out.push(id + m.cols);
  if (x > 0 && !m.walls[id - 1]) out.push(id - 1);
  return out;
}
function chain(parents, end) { const path = []; for (let id = end; id !== -1; id = parents[id]) path.push(id); return path; }
function result(path, visits, sides, count) {
  return { found: path.length > 0, path: Uint32Array.from(path), visitedOrder: visits.slice(0, count),
    visitedSides: sides.slice(0, count), visitedCount: count, totalCost: path.length ? path.length - 1 : null,
    status: path.length ? 'found' : 'unreachable', reason: '' };
}
function* single(m, algorithm, options) {
  const trace=new SearchTrace(m,algorithm,options);
  const n = m.walls.length, parents = new Int32Array(n).fill(-2), visits = new Uint32Array(n), sides = new Uint8Array(n);
  const marked = new Uint8Array(n), scores = new Float64Array(n).fill(Infinity);
  const linear = algorithm === 'bfs' || algorithm === 'dfs', queue = linear ? new Uint32Array(n) : null, heap = linear ? null : new Heap(n);
  const h = id => Math.abs(id % m.cols - m.goal[0]) + Math.abs(Math.floor(id / m.cols) - m.goal[1]);
  const priority = (id, g) => algorithm === 'greedy' ? h(id) : g + (algorithm === 'dijkstra' ? 0 : (algorithm === 'weighted' ? 1.5 : 1) * h(id));
  let head = 0, tail = 0, count = 0;
  parents[m.startId] = -1; scores[m.startId] = 0;
  if (linear) queue[tail++] = m.startId; else heap.put(m.startId, priority(m.startId, 0));
  trace.observe(1);
  while (linear ? head < tail : heap.size) {
    const id = linear ? (algorithm === 'dfs' ? queue[--tail] : queue[head++]) : heap.pop();
    trace.expand(id,scores[id],1,linear?tail-head:heap.size,()=>linear?(algorithm==='dfs'?Array.from(queue.subarray(Math.max(head,tail-6),tail)).reverse():Array.from(queue.subarray(head,Math.min(tail,head+6)))):heap.preview());
    if (!marked[id]) { marked[id] = 1; visits[count] = id; sides[count++] = 1; yield { id, side: 1 }; }
    if (id === m.goalId) return trace.finish(result(chain(parents, id).reverse(), visits, sides, count));
    const adjacent = neighbors(m, id);
    if (algorithm === 'dfs') adjacent.reverse(); // Stack pops up/right/down/left deterministically.
    for (const next of adjacent) {
      trace.edgeScans++;
      const g = scores[id] + 1;
      if (linear || algorithm === 'greedy') { if (parents[next] !== -2) continue; }
      else if (g >= scores[next]) continue;
      parents[next] = id; scores[next] = g;
      if (linear) queue[tail++] = next; else heap.put(next, priority(next, g));
      trace.observe(linear?tail-head:heap.size);
    }
  }
  return trace.finish(result([], visits, sides, count));
}
function* bidirectional(m, algorithm, options) {
  const trace=new SearchTrace(m,algorithm,options);
  const n = m.walls.length, distances = [new Float64Array(n).fill(Infinity), new Float64Array(n).fill(Infinity)];
  const parents = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
  const queues = [new Uint32Array(n), new Uint32Array(n)], heads = [0, 0], tails = [1, 1];
  const heaps = algorithm === 'bidijkstra' ? [new Heap(n), new Heap(n)] : null;
  const visits = new Uint32Array(n), sides = new Uint8Array(n), marked = new Uint8Array(n);
  distances[0][m.startId] = distances[1][m.goalId] = 0;
  queues[0][0] = m.startId; queues[1][0] = m.goalId;
  if (heaps) { heaps[0].put(m.startId, 0); heaps[1].put(m.goalId, 0); }
  const frontierSize=()=>heaps?heaps[0].size+heaps[1].size:tails[0]-heads[0]+tails[1]-heads[1];trace.observe(2);
  let best = Infinity, meeting = -1, count = 0;
  const minimum = s => heaps ? heaps[s].minimum : heads[s] < tails[s] ? distances[s][queues[s][heads[s]]] : Infinity;
  while (true) {
    const a = minimum(0), b = minimum(1);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a + b >= best) break;
    const side = a <= b ? 0 : 1, other = 1 - side;
    const id = heaps ? heaps[side].pop() : queues[side][heads[side]++];
    trace.expand(id,distances[side][id],side+1,frontierSize(),()=>heaps?heaps[side].preview():Array.from(queues[side].subarray(heads[side],Math.min(tails[side],heads[side]+6))));
    if (!marked[id]) { marked[id] = 1; visits[count] = id; sides[count++] = side + 1; yield { id, side: side + 1 }; }
    if (distances[side][id] + distances[other][id] < best) { best = distances[side][id] + distances[other][id]; meeting = id; }
    for (const next of neighbors(m, id)) {
      trace.edgeScans++;
      const candidate = distances[side][id] + 1;
      if (candidate < distances[side][next]) {
        distances[side][next] = candidate; parents[side][next] = id;
        if (heaps) heaps[side].put(next, candidate); else queues[side][tails[side]++] = next;
        trace.observe(frontierSize());
      }
      const connection = distances[side][next] + distances[other][next];
      if (connection < best) { best = connection; meeting = next; }
    }
  }
  const path = meeting < 0 ? [] : chain(parents[0], meeting).reverse().concat(chain(parents[1], meeting).slice(1));
  return trace.finish(result(path, visits, sides, count));
}
// Capture now, not on the generator's first next(): caller edits cannot leak in.
export function iterSearch(maze, algorithm = 'astar', options = {}) {
  if (!(maze instanceof Maze) || !Object.hasOwn(ALGORITHMS, algorithm)) throw new Error('地图或算法无效。');
  const snapshot = maze.snapshot();
  if (['spfa', 'bellmanford', 'iddfs', 'idastar', 'beam', 'bigreedy'].includes(algorithm))
    return advancedSearch(snapshot, algorithm, options, { neighbors, chain, result, Heap, SearchTrace });
  return algorithm === 'bibfs' || algorithm === 'bidijkstra' ? bidirectional(snapshot, algorithm,options) : single(snapshot, algorithm,options);
}
export function searchMaze(maze, algorithm = 'astar', options = {}) {
  const steps = iterSearch(maze, algorithm, options); let step;
  do { step = steps.next(); } while (!step.done);
  return step.value;
}
