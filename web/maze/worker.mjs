import { Maze, generateMaze } from './model.mjs';
import { ALGORITHMS, iterSearch } from './search.mjs';

export function measure(maze, algorithm, now = () => performance.now()) {
  const steps = iterSearch(maze, algorithm); // Snapshot copying is outside the timer.
  const started = now(); let step;
  do { step = steps.next(); } while (!step.done);
  const elapsedMs = Math.max(0, now() - started), result = step.value;
  return { result, summary: { algorithm, found: result.found, pathLength: result.found ? result.path.length - 1 : null,
    totalCost: result.totalCost, visitedCount: result.visitedCount, elapsedMs } };
}
export function executeRequest(data, send, now = () => performance.now()) {
  const { id, version, kind } = data;
  const emit = response => send({ id, version, ...response });
  try {
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(version) || version < 0) throw new Error('任务编号无效。');
    if (kind === 'generate') {
      const start = now(), maze = generateMaze({ ...data.options, version });
      emit({ kind: 'map', map: maze, generationMs: Math.max(0, now() - start) }); return;
    }
    if (kind !== 'search' && kind !== 'compare') throw new Error('未知任务。');
    if (data.map.version !== version) throw new Error('地图版本不匹配。');
    if (!Object.hasOwn(ALGORITHMS, data.algorithm)) throw new Error('未知算法。');
    const maze = new Maze(data.map.rows, data.map.cols, data.map);
    if (kind === 'search') {
      const { result, summary } = measure(maze, data.algorithm, now);
      emit({ kind: 'result', algorithm: data.algorithm, result, summary });
    } else {
      for (const algorithm of Object.keys(ALGORITHMS)) {
        emit({ kind: 'progress', algorithm });
        const { result, summary } = measure(maze, algorithm, now);
        emit({ kind: 'measurement', algorithm, summary, ...(algorithm === data.algorithm ? { result } : {}) });
      }
      emit({ kind: 'done' });
    }
  } catch (error) { emit({ kind: 'error', error: error.message }); }
}
if (typeof self !== 'undefined') self.onmessage = ({ data }) => executeRequest(data, response => {
  const buffers = response.map ? [response.map.walls.buffer] : response.result
    ? [response.result.path.buffer, response.result.visitedOrder.buffer, response.result.visitedSides.buffer] : [];
  self.postMessage(response, buffers);
});
