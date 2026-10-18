import { nodeScores,STRATEGIES } from './trace.mjs';
export function edgeKey(a,b) {return Math.min(a,b)*2+(Math.abs(a-b)===1?0:1);}
export function pathOverlap(left,right,size) {
  const edges=new Uint8Array(size*2);let shared=0,leftOnly=0,rightOnly=0;
  if(!left?.found||!right?.found)return {edges,shared,leftOnly,rightOnly,available:false};
  for(let i=1;i<left.path.length;i++)edges[edgeKey(left.path[i-1],left.path[i])]|=1;
  for(let i=1;i<right.path.length;i++)edges[edgeKey(right.path[i-1],right.path[i])]|=2;
  for(const flag of edges){if(flag===3)shared++;else if(flag===1)leftOnly++;else if(flag===2)rightOnly++;}
  return {edges,shared,leftOnly,rightOnly,available:true};
}
export function inspectNode(maze,result,id,visibleCount) {
  if(!result||!Number.isInteger(id)||id<0||id>=maze.walls.length)return null;
  const index=result.visitedOrder.indexOf(id),algorithm=result.algorithm??'astar';
  if(maze.walls[id])return {id,wall:true,message:'这是墙体，算法不能进入。'};
  if(index<0&&visibleCount>=result.visitedCount&&result.found&&result.path.includes(id))return {id,pathOnly:true,message:'此格在最终路径上，但未被单独扩展。双向连接后即可回溯路径，不能据此提供扩展时的评分或队列快照。'};
  if(index<0||index>=visibleCount)return {id,pending:true,message:'此格尚未在当前播放进度中展开。单步后再观察。'};
  const frame=result.teachingFrames?.[index];
  return {...nodeScores(maze,algorithm,id,result.visitedG?.[index]??0,result.visitedSides[index]),index,
    frontierSize:result.visitedFrontier?.[index],structure:STRATEGIES[algorithm][0],rule:STRATEGIES[algorithm][1],
    candidates:frame?.candidates??[],snapshotAvailable:!!frame};
}
export function completedComparisons(summaries) {
  return {eligible:summaries.filter(s=>s.status==='found'),excluded:summaries.filter(s=>s.status!=='found')};
}
export class EffectsPolicy {
  constructor(){this.slow=0;this.healthy=0;this.reduced=false;}
  observe(ms){if(!Number.isFinite(ms)||ms<0)return;if(ms>24){this.slow++;this.healthy=0;}else{this.healthy++;this.slow=Math.max(0,this.slow-1);}if(this.slow>=4)this.reduced=true;if(this.healthy>=60)this.reduced=false;}
  intensity(enabled,strength){return enabled?Math.max(0,Math.min(1,strength/100))*(this.reduced?.35:1):0;}
}
