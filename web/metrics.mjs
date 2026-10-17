import { Grid } from './model.mjs';
import { ALGORITHMS, searchGrid } from './search.mjs';

export function measureSearch(grid, algorithm, now = () => performance.now()) {
  const map = grid.snapshot(), snapshot = new Grid(map.rows, map.cols, map);
  const started = now();
  const result = searchGrid(snapshot, algorithm);
  const elapsedMs = now() - started;
  return { algorithm, result, pathLength: result.found ? result.path.length - 1 : null, totalCost: result.totalCost, elapsedMs };
}
export function compareAlgorithms(grid, now = () => performance.now()) {
  const map = grid.snapshot(), snapshot = new Grid(map.rows, map.cols, map);
  return Object.keys(ALGORITHMS).map(name => measureSearch(snapshot, name, now));
}
