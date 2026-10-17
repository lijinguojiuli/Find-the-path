// Pure search logic for the static website; no DOM, animation or timers.
export const ALGORITHMS = Object.freeze({ bfs: 'BFS', dijkstra: 'Dijkstra', astar: 'A*' });
const key = cell => cell.join(',');
const position = value => value.split(',').map(Number);
export const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

class MinHeap {
  constructor() { this.items = []; }
  less(a, b) { return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order))); }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(items[index], items[parent])) break;
      [items[index], items[parent]] = [items[parent], items[index]];
      index = parent;
    }
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        let next = index;
        for (const child of [index * 2 + 1, index * 2 + 2]) {
          if (child < this.items.length && this.less(this.items[child], this.items[next])) next = child;
        }
        if (next === index) break;
        [this.items[index], this.items[next]] = [this.items[next], this.items[index]];
        index = next;
      }
    }
    return first;
  }
}

function neighbors(grid, cell) {
  return [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => [cell[0] + dx, cell[1] + dy])
    .filter(next => grid.inBounds(next) && !grid.isBlocked(next));
}
function result(found, parents, goal, visitedOrder) {
  const path = [];
  if (found) for (let current = key(goal); current !== null; current = parents.get(current)) path.push(position(current));
  path.reverse();
  return { found, path, visitedOrder, visitedCount: visitedOrder.length };
}
export function searchGrid(grid, algorithm = 'astar') {
  if (!Object.hasOwn(ALGORITHMS, algorithm)) throw new Error('未知的寻路算法。');
  if (!grid.start || !grid.goal) throw new Error('搜索前必须同时设置起点和终点。');
  return algorithm === 'bfs' ? bfs(grid) : prioritySearch(grid, algorithm);
}
function bfs(grid) {
  const queue = [grid.start], parents = new Map([[key(grid.start), null]]), visited = [];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    visited.push(current);
    if (key(current) === key(grid.goal)) return result(true, parents, grid.goal, visited);
    for (const neighbor of neighbors(grid, current)) {
      if (parents.has(key(neighbor))) continue;
      parents.set(key(neighbor), key(current));
      queue.push(neighbor);
    }
  }
  return result(false, parents, grid.goal, visited);
}
function prioritySearch(grid, algorithm) {
  const heap = new MinHeap(), scores = new Map([[key(grid.start), 0]]);
  const parents = new Map([[key(grid.start), null]]), visited = [];
  let sequence = 0;
  const estimate = cell => algorithm === 'astar' ? manhattan(cell, grid.goal) : 0;
  heap.push({ cell: grid.start, g: 0, h: estimate(grid.start), f: estimate(grid.start), order: sequence++ });
  while (heap.items.length) {
    const { cell: current, g } = heap.pop();
    if (g !== scores.get(key(current))) continue;
    visited.push(current);
    if (key(current) === key(grid.goal)) return result(true, parents, grid.goal, visited);
    for (const neighbor of neighbors(grid, current)) {
      const candidate = g + 1;
      if (candidate >= (scores.get(key(neighbor)) ?? Infinity)) continue;
      scores.set(key(neighbor), candidate);
      parents.set(key(neighbor), key(current));
      const h = estimate(neighbor);
      heap.push({ cell: neighbor, g: candidate, h, f: candidate + h, order: sequence++ });
    }
  }
  return result(false, parents, grid.goal, visited);
}
