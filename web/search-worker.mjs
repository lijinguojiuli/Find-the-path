import { Grid } from './model.mjs';
import { measureSearch, compareAlgorithms } from './metrics.mjs';

self.onmessage = ({ data }) => {
  const { id, version, map, algorithm, compare = false } = data;
  try {
    const grid = new Grid(map.rows, map.cols, map);
    const measurements = compare ? compareAlgorithms(grid) : [measureSearch(grid, algorithm)];
    const selected = measurements.find(item => item.algorithm === algorithm);
    self.postMessage({ id, version, result: selected.result, measurements });
  } catch (error) {
    self.postMessage({ id, version, error: error.message });
  }
};
