// Run with: node --expose-gc scripts/maze-scale-audit.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateMaze } from '../web/maze/model.mjs';
import { ALGORITHMS } from '../web/maze/search.mjs';
import { measure } from '../web/maze/worker.mjs';

const records = [];
for (const [size, type] of [[301, 'corridors'], [301, 'branches'], [301, 'braided'], [1001, 'corridors'], [1001, 'branches'], [1001, 'braided']]) {
  const started = performance.now(), maze = generateMaze({ rows: size, cols: size, type, seed: 20261018 });
  const generationMs = performance.now() - started; let optimal;
  for (const [algorithm, info] of Object.entries(ALGORITHMS)) {
    if (globalThis.gc) globalThis.gc();
    const { result, summary } = measure(maze, algorithm);
    assert.equal(result.expansionCount,result.visitedCount+result.repeatExpansionCount);
    assert.equal(result.visitedG.length,result.visitedCount);assert.equal(result.visitedFrontier.length,result.visitedCount);
    assert.ok(result.teachingFrames.length<=512);assert.ok(result.workCount>=result.expansionCount);
    if (['bfs','dijkstra','astar','dfs','greedy','bibfs','bidijkstra','weighted'].includes(algorithm)) assert.ok(result.found);
    if (result.found) {
      assert.equal(result.path[0], maze.startId); assert.equal(result.path.at(-1), maze.goalId);
      assert.equal(result.totalCost, result.path.length - 1);
    } else { assert.equal(result.status,'limited'); assert.equal(result.path.length,0); assert.equal(result.totalCost,null); }
    const seen = new Uint8Array(maze.walls.length);
    for (const id of result.visitedOrder) { assert.equal(maze.walls[id], 0); assert.equal(seen[id], 0); seen[id] = 1; }
    for (let i = 0; i < result.path.length; i++) {
      const id = result.path[i]; assert.equal(maze.walls[id], 0);
      if (i) { const a = result.path[i - 1]; assert.equal(Math.abs(a % maze.cols - id % maze.cols) + Math.abs(Math.floor(a / maze.cols) - Math.floor(id / maze.cols)), 1); }
    }
    if (algorithm === 'bfs') optimal = result.totalCost;
    if (info.optimal && result.found) assert.equal(result.totalCost, optimal);
    const memory = process.memoryUsage();
    const record = { size, type, generationMs, ...summary,
      traceMiB: (result.path.byteLength + result.visitedOrder.byteLength + result.visitedSides.byteLength +result.visitedG.byteLength+result.visitedFrontier.byteLength+Buffer.byteLength(JSON.stringify(result.teachingFrames))) / 1048576,
      rssMiB: memory.rss / 1048576, arrayBuffersMiB: memory.arrayBuffers / 1048576 };
    records.push(record); console.log(JSON.stringify(record));
  }
}
const output = fileURLToPath(new URL('../.test_tmp/maze-scale.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.test_tmp/', import.meta.url)), { recursive: true });
writeFileSync(output, JSON.stringify({ runtime: process.version, records }, null, 2));
console.log(`PASS: ${records.length} large-map searches; report ${output}`);
