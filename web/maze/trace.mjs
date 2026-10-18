// Measurement and bounded teaching records. No DOM, clocks, or waiting here.
export const STRATEGIES = Object.freeze({
  bfs:['队列','先入队的先处理，逐层展开','逐层与松弛'], dijkstra:['优先队列','优先取累计成本 g 最小的节点','逐层与松弛'],
  astar:['优先队列','优先取 f=g+h 最小的节点','启发式'], dfs:['栈','最后压入的候选先处理','深入与迭代'],
  greedy:['优先队列','只比较估计距离 h','启发式'], weighted:['优先队列','优先取 g+1.5h 最小的节点','启发式'],
  bibfs:['双向队列','比较两侧层距离，扩展较小的一侧','双向'], bidijkstra:['双向优先队列','比较两侧最小 g，达到连接下界时结束','双向'],
  spfa:['队列','有更短距离的节点重新入队','逐层与松弛'], bellmanford:['全图扫描','按格子编号反复松弛，不使用候选队列','逐层与松弛'],
  iddfs:['深度栈','在当前深度限制内深入，再提高限制','深入与迭代'], idastar:['深度栈','在当前 g+h 阈值内深入，再提高阈值','深入与迭代'],
  beam:['分层候选','每层保留 h 最小的 12 个候选','启发式'], bigreedy:['双向优先队列','两端轮流按到对方的 h 选节点','双向'],
});
export function nodeScores(maze, algorithm, id, g, side=1) {
  const target=side===2?maze.start:maze.goal, h=Math.abs(id%maze.cols-target[0])+Math.abs(Math.floor(id/maze.cols)-target[1]);
  const f=['astar','idastar','weighted'].includes(algorithm)?g+(algorithm==='weighted'?1.5:1)*h:null;
  return {id,side,g,h,f,priority:f??(['greedy','bigreedy','beam'].includes(algorithm)?h:['bfs','dijkstra','bibfs','bidijkstra'].includes(algorithm)?g:null)};
}
export class SearchTrace {
  constructor(maze,algorithm,{captureDetails=true}={}) {
    this.maze=maze;this.algorithm=algorithm;this.expansionCount=0;this.repeatExpansionCount=0;this.edgeScans=0;
    this.maxFrontierSize=algorithm==='bellmanford'?null:0;
    this.seen=new Uint8Array(maze.walls.length);this.g=new Uint32Array(maze.walls.length);this.frontier=new Uint32Array(maze.walls.length);
    this.count=0;this.frames=[];this.capture=captureDetails;
  }
  observe(size) { if(this.maxFrontierSize!==null)this.maxFrontierSize=Math.max(this.maxFrontierSize,size); }
  expand(id,g,side=1,frontierSize=0,preview=null) {
    this.expansionCount++;
    if(this.seen[id]) {this.repeatExpansionCount++;return;}
    this.seen[id]=1;this.g[this.count]=g;this.frontier[this.count]=frontierSize;
    if(this.capture&&this.count<512) this.frames.push({...nodeScores(this.maze,this.algorithm,id,g,side),index:this.count,
      frontierSize,structure:STRATEGIES[this.algorithm][0],rule:STRATEGIES[this.algorithm][1],candidates:preview?preview().slice(0,6):[]});
    this.count++;
  }
  finish(base,workCount=this.expansionCount) {
    return {...base,expansionCount:this.expansionCount,repeatExpansionCount:this.repeatExpansionCount,maxFrontierSize:this.maxFrontierSize,
      edgeScans:this.edgeScans,workCount,visitedG:this.g.slice(0,this.count),visitedFrontier:this.frontier.slice(0,this.count),
      teachingFrames:this.frames,teachingLimit:512,algorithm:this.algorithm};
  }
}
