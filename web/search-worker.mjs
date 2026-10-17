import { Grid } from './model.mjs';
import { searchGrid } from './search.mjs';

self.onmessage = ({ data }) => {
  const { id, version, map, algorithm } = data;
  try {
    const grid = new Grid(map.rows, map.cols, map);
    self.postMessage({ id, version, result: searchGrid(grid, algorithm) });
  } catch (error) {
    self.postMessage({ id, version, error: error.message });
  }
};
