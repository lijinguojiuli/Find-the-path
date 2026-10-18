import { Grid } from './model.mjs';
import { measureSearch, compareAlgorithms } from './metrics.mjs';

export function executeSearchRequest(data) {
  const { id, version, map, algorithm, compare = false, kind = 'search' } = data;
  try {
    const grid = new Grid(map.rows, map.cols, map);
    const selectedAlgorithm = kind === 'replan' ? 'astar' : algorithm;
    const measurements = compare && kind !== 'replan' ? compareAlgorithms(grid) : [measureSearch(grid, selectedAlgorithm)];
    const selected = measurements.find(item => item.algorithm === selectedAlgorithm);
    return { id, version, kind, result: selected.result, measurements };
  } catch (error) {
    return { id, version, kind, error: error.message };
  }
}
if (typeof self !== 'undefined') self.onmessage = ({ data }) => self.postMessage(executeSearchRequest(data));
