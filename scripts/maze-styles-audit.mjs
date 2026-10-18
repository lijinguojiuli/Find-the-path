// New-family scale checks. This audit verifies correctness, not performance rank.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';
import{MAZE_TYPES,generateMaze}from'../web/maze/model.mjs';
import{measure}from'../web/maze/worker.mjs';
const records=[];
for(const size of [301,1001])for(const type of Object.keys(MAZE_TYPES)){
  const started=performance.now(),maze=generateMaze({rows:size,cols:size,type,seed:20261018}),generationMs=performance.now()-started;let expected;
  for(const algorithm of ['bfs','dijkstra','astar']){
    globalThis.gc?.();const{result,summary}=measure(maze,algorithm);
    assert.ok(result.found,`${size}/${type}/${algorithm}`);assert.equal(result.path[0],maze.startId);assert.equal(result.path.at(-1),maze.goalId);
    for(let i=0;i<result.path.length;i++){const id=result.path[i];assert.equal(maze.walls[id],0);if(i){const prev=result.path[i-1];assert.equal(Math.abs(prev%size-id%size)+Math.abs(Math.floor(prev/size)-Math.floor(id/size)),1);}}
    if(algorithm==='bfs')expected=result.totalCost;else assert.equal(result.totalCost,expected);
    const record={size,type,seed:maze.seed,start:maze.start,goal:maze.goal,generationMs,...summary,rssMiB:process.memoryUsage().rss/1048576};
    records.push(record);console.log(JSON.stringify(record));
  }
}
mkdirSync(fileURLToPath(new URL('../.test_tmp/',import.meta.url)),{recursive:true});
writeFileSync(fileURLToPath(new URL('../.test_tmp/maze-styles-scale.json',import.meta.url)),JSON.stringify({runtime:process.version,records},null,2));
console.log(`PASS: ${records.length} style/size/search checks; all paths valid and optimal costs agree.`);
