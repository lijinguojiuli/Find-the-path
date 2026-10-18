// Compare the old ordinary-search pipeline with the new single-run pipeline.
// These are Node wall times, excluding browser Worker startup, transfer and paint.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generateMaze} from '../web/maze/model.mjs';
import {executeRequest,benchmark,timingSummary} from '../web/maze/worker.mjs';
const records=[];
for(const [size,type,algorithm]of [[301,'scatter','astar'],[1001,'scatter','bfs'],[1001,'braided','astar']]){
  const map=generateMaze({rows:size,cols:size,type,seed:20261018,version:1}),single=[],repeated=[];let expected;
  for(let trial=0;trial<3;trial++)for(const mode of trial%2?['previous','current']:['current','previous']){
    globalThis.gc?.();const started=performance.now();let value;
    if(mode==='current')executeRequest({id:trial+1,version:1,kind:'search',map,algorithm},m=>{if(m.kind==='result')value=m;});
    else value=benchmark(map,algorithm);
    const elapsed=performance.now()-started;
    assert.ok(value.result.found);expected??=value.result.totalCost;assert.equal(value.result.totalCost,expected);
    (mode==='current'?single:repeated).push(elapsed);
  }
  const record={size,type,algorithm,cost:expected,singleRunWallMs:single,previousPipelineWallMs:repeated,
    currentMedianMs:timingSummary(single).elapsedMs,previousMedianMs:timingSummary(repeated).elapsedMs,rssMiB:process.memoryUsage().rss/1048576};
  records.push(record);console.log(JSON.stringify(record));
}
mkdirSync(fileURLToPath(new URL('../.test_tmp/',import.meta.url)),{recursive:true});
writeFileSync(fileURLToPath(new URL('../.test_tmp/maze-response-audit.json',import.meta.url)),JSON.stringify({runtime:process.version,records},null,2));
