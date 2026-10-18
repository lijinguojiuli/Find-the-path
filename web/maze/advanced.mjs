// Additional teaching strategies. A deterministic work budget prevents runaway
// iterative deepening / relaxation; hitting it is never reported as unreachable.
export function* advancedSearch(m, algorithm, options, common) {
  const { neighbors, chain, result, Heap } = common, n = m.walls.length;
  const budget = options.maxExpansions ?? 250000, width = options.beamWidth ?? 12;
  if (!Number.isInteger(budget) || budget < 1 || !Number.isInteger(width) || width < 1) throw new Error('搜索预算和束宽须为正整数。');
  const visits = new Uint32Array(n), sides = new Uint8Array(n), marked = new Uint8Array(n);
  let count = 0, work = 0;
  const touch = (id, side = 1) => { if (marked[id]) return false; marked[id] = 1; visits[count] = id; sides[count++] = side; return true; };
  const finish = (path = [], status, reason = '') => ({ ...result(path, visits, sides, count),
    status: status ?? (path.length ? 'found' : 'unreachable'), reason });
  const limited = () => finish([], 'limited', `达到 ${budget.toLocaleString()} 次计算上限，可改用 A* 或减小地图。`);
  const h = (id, target = m.goal) => Math.abs(id % m.cols - target[0]) + Math.abs(Math.floor(id / m.cols) - target[1]);
  const parents = new Int32Array(n).fill(-2); parents[m.startId] = -1;
  if (algorithm === 'spfa' || algorithm === 'bellmanford') {
    const distance = new Float64Array(n).fill(Infinity); distance[m.startId] = 0;
    if (algorithm === 'spfa') {
      const queue = new Uint32Array(n), inside = new Uint8Array(n); let head = 0, tail = 1, length = 1; queue[0] = m.startId; inside[m.startId] = 1;
      while (length) {
        if (++work > budget) return limited();
        const id = queue[head]; head = (head + 1) % n; length--; inside[id] = 0;
        if (touch(id)) yield { id, side: 1 };
        if (id === m.goalId) return finish(chain(parents, id).reverse()); // Unit costs: FIFO distances are nondecreasing.
        for (const next of neighbors(m, id)) if (distance[id] + 1 < distance[next]) {
          distance[next] = distance[id] + 1; parents[next] = id;
          if (!inside[next]) { queue[tail % n] = next; tail = (tail + 1) % n; length++; inside[next] = 1; }
        }
      }
      return finish();
    }
    for (let pass = 0; pass < n; pass++) {
      let changed = false;
      for (let id = 0; id < n; id++) if (!m.walls[id]) {
        if (++work > budget) return limited();
        if (!Number.isFinite(distance[id])) continue;
        if (touch(id)) yield { id, side: 1 };
        for (const next of neighbors(m, id)) if (distance[id] + 1 < distance[next]) {
          distance[next] = distance[id] + 1; parents[next] = id; changed = true;
        }
      }
      if (!changed) break;
    }
    return finish(Number.isFinite(distance[m.goalId]) ? chain(parents, m.goalId).reverse() : []);
  }
  if (algorithm === 'beam') {
    let frontier = [m.startId], discarded = false;
    while (frontier.length) {
      const candidates = [];
      for (const id of frontier) {
        if (++work > budget) return limited();
        if (touch(id)) yield { id, side: 1 };
        if (id === m.goalId) return finish(chain(parents, id).reverse());
        for (const next of neighbors(m, id)) if (parents[next] === -2) { parents[next] = id; candidates.push(next); }
      }
      candidates.sort((a, b) => h(a) - h(b));
      if (candidates.length > width) discarded = true;
      frontier = candidates.slice(0, width);
    }
    return discarded ? finish([], 'limited', '束搜索舍弃了分支，未找到路径不代表迷宫不可达。') : finish();
  }
  if (algorithm === 'bigreedy') {
    const p = [parents, new Int32Array(n).fill(-2)], heaps = [new Heap(n), new Heap(n)];
    p[1][m.goalId] = -1; heaps[0].put(m.startId, h(m.startId)); heaps[1].put(m.goalId, h(m.goalId, m.start)); let side = 0;
    const join = id => chain(p[0], id).reverse().concat(chain(p[1], id).slice(1));
    while (heaps[0].size && heaps[1].size) {
      if (++work > budget) return limited();
      const other = 1 - side, id = heaps[side].pop();
      if (touch(id, side + 1)) yield { id, side: side + 1 };
      if (p[other][id] !== -2) return finish(join(id));
      for (const next of neighbors(m, id)) {
        if (p[side][next] === -2) { p[side][next] = id; heaps[side].put(next, h(next, side ? m.start : m.goal)); }
        if (p[other][next] !== -2) return finish(join(next));
      }
      side = other;
    }
    return finish();
  }
  // Explicit DFS frames avoid recursion limits, including on long corridors.
  const inPath = new Uint8Array(n), bestDepth = new Int32Array(n); let bound = algorithm === 'idastar' ? h(m.startId) : 0;
  while (true) {
    let nextBound = Infinity; const stack = [{ id: m.startId, depth: 0, next: -1 }]; inPath.fill(0); bestDepth.fill(0x7fffffff); inPath[m.startId] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.next === -1) {
        const score = frame.depth + (algorithm === 'idastar' ? h(frame.id) : 0);
        if (score > bound) { nextBound = Math.min(nextBound, score); inPath[frame.id] = 0; stack.pop(); continue; }
        if (frame.depth >= bestDepth[frame.id]) { inPath[frame.id] = 0; stack.pop(); continue; }
        bestDepth[frame.id] = frame.depth;
        if (++work > budget) return limited();
        if (touch(frame.id)) yield { id: frame.id, side: 1 };
        if (frame.id === m.goalId) return finish(stack.map(f => f.id));
        frame.adjacent = neighbors(m, frame.id); frame.next = 0;
      }
      if (frame.next === frame.adjacent.length) { inPath[frame.id] = 0; stack.pop(); continue; }
      const next = frame.adjacent[frame.next++];
      if (!inPath[next]) { inPath[next] = 1; stack.push({ id: next, depth: frame.depth + 1, next: -1 }); }
    }
    if (!Number.isFinite(nextBound)) return finish();
    bound = algorithm === 'idastar' ? nextBound : bound + 1;
  }
}
