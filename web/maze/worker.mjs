import { Maze, generateMaze } from './model.mjs';
import { ALGORITHMS, iterSearch } from './search.mjs';
import { SCENARIOS,createScenario } from './scenarios.mjs';

export function measure(maze, algorithm, now = () => performance.now(),options={}) {
  const steps = iterSearch(maze, algorithm,options); // Snapshot copying is outside the timer.
  const started = now(); let step;
  do { step = steps.next(); } while (!step.done);
  const elapsedMs = Math.max(0, now() - started), result = step.value;
  return { result, summary: { algorithm, found: result.found, pathLength: result.found ? result.path.length - 1 : null,
    totalCost: result.totalCost, visitedCount: result.visitedCount, elapsedMs, status: result.status, reason: result.reason,
    expansionCount:result.expansionCount,repeatExpansionCount:result.repeatExpansionCount,maxFrontierSize:result.maxFrontierSize,
    edgeScans:result.edgeScans,workCount:result.workCount,sampleCount:1,warmupCount:0,timingKind:'single' } };
}
export function timingSummary(values) {
  if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))throw new Error('计时样本无效。');
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return {elapsedMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,
    minMs:sorted[0],maxMs:sorted.at(-1),q1Ms:sorted[Math.floor((sorted.length-1)*.25)],q3Ms:sorted[Math.floor((sorted.length-1)*.75)]};
}
export function benchmark(maze,algorithm,{now=()=>performance.now(),samples=5,warmups=1,onSample=()=>{}}={}) {
  if(!Number.isInteger(samples)||samples<1||samples>9||!Number.isInteger(warmups)||warmups<0||warmups>3)throw new Error('实验次数无效。');
  for(let i=0;i<warmups;i++){const steps=iterSearch(maze,algorithm,{captureDetails:false});while(!steps.next().done){/* No animation. */}}
  const times=[];let measured;
  for(let i=0;i<samples;i++){onSample(i+1,samples);measured=measure(maze,algorithm,now,{captureDetails:false});times.push(measured.summary.elapsedMs);}
  // Teaching snapshots are collected separately, outside all timing samples.
  const detailed=iterSearch(maze,algorithm);let step;do{step=detailed.next();}while(!step.done);
  return {result:step.value,summary:{...measured.summary,...timingSummary(times),sampleCount:samples,warmupCount:warmups,timingKind:'median'}};
}
export function executeRequest(data, send, now = () => performance.now()) {
  const { id, version, kind } = data;
  const emit = response => send({ id, version, ...response });
  try {
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(version) || version < 0) throw new Error('任务编号无效。');
    if (kind === 'generate'||kind==='scenario') {
      const start = now(), maze = kind==='scenario'?createScenario(data.options.scenario,version):generateMaze({ ...data.options, version });
      emit({ kind: 'map', map: maze, generationMs: Math.max(0, now() - start),scenario:kind==='scenario'?data.options.scenario:null }); return;
    }
    if (!['search', 'compare', 'pair','study'].includes(kind)) throw new Error('未知任务。');
    if (data.map.version !== version) throw new Error('地图版本不匹配。');
    if (!Object.hasOwn(ALGORITHMS, data.algorithm)) throw new Error('未知算法。');
    const maze = new Maze(data.map.rows, data.map.cols, data.map);
    const run=algorithm=>benchmark(maze,algorithm,{now,onSample:(sample,total)=>{if(kind!=='search')emit({kind:'progress',algorithm,sample,total});}});
    if(kind==='study') {
      const algorithms=[...new Set([data.algorithm,data.reference??'bfs'])];
      for(const scenario of Object.keys(SCENARIOS))for(const algorithm of algorithms) {
        emit({kind:'progress',algorithm,scenario});
        const scene=createScenario(scenario,version),measurement=benchmark(scene,algorithm,{now});
        emit({kind:'study-result',scenario,summary:measurement.summary});
      }
      emit({kind:'study-done'});return;
    }
    if (kind === 'search') {
      const { result, summary } = run(data.algorithm);
      emit({ kind: 'result', algorithm: data.algorithm, result, summary });
    } else {
      const algorithms = kind === 'pair' ? [...new Set([data.algorithm, data.reference ?? 'bfs'])] : Object.keys(ALGORITHMS);
      for (const algorithm of algorithms) {
        emit({ kind: 'progress', algorithm });
        const { result, summary } = run(algorithm);
        emit({ kind: 'measurement', algorithm, summary, ...([data.algorithm, data.reference].includes(algorithm) ? { result } : {}) });
      }
      emit({ kind: 'done' });
    }
  } catch (error) { emit({ kind: 'error', error: error.message }); }
}
if (typeof self !== 'undefined') self.onmessage = ({ data }) => executeRequest(data, response => {
  const buffers = response.map ? [response.map.walls.buffer] : response.result
    ? [response.result.path.buffer, response.result.visitedOrder.buffer, response.result.visitedSides.buffer,response.result.visitedG.buffer,response.result.visitedFrontier.buffer] : [];
  self.postMessage(response, buffers);
});
