import test from 'node:test';import assert from 'node:assert/strict';
import { Maze,generateMaze } from './model.mjs';import { searchMaze,ALGORITHMS } from './search.mjs';
import { PairPlayback,stageHeight,menuOffset } from './state.mjs';
import { pathOverlap,edgeKey,inspectNode,completedComparisons,EffectsPolicy } from './learning.mjs';
import { measure,benchmark,timingSummary,executeRequest } from './worker.mjs';
import { SCENARIOS,createScenario } from './scenarios.mjs';

const line=new Maze(1,3,{walls:[0,0,0],start:[0,0],goal:[2,0]});
test('统计区分重复扩展：BFS 3 次、迭代加深 6 次、扫描算法没有队列峰值',()=>{
  for(const a of ['bfs','dijkstra','astar','dfs','greedy','weighted','spfa','beam']){
    const r=searchMaze(line,a);assert.equal(r.expansionCount,3,a);assert.equal(r.repeatExpansionCount,0,a);assert.equal(r.maxFrontierSize,1,a);
    assert.deepEqual([...r.visitedG],[0,1,2]);assert.equal(r.expansionCount,r.visitedCount+r.repeatExpansionCount);
  }
  const deep=searchMaze(line,'iddfs');assert.equal(deep.expansionCount,6);assert.equal(deep.repeatExpansionCount,3);assert.equal(deep.maxFrontierSize,3);
  const scan=searchMaze(line,'bellmanford');assert.equal(scan.expansionCount,6);assert.equal(scan.repeatExpansionCount,3);assert.equal(scan.maxFrontierSize,null);assert.equal(scan.edgeScans,8);
});
test('教学记录是当时的队列、g/h/f，超过512步不无限保留对象',()=>{
  const r=searchMaze(line,'astar');assert.equal(r.teachingFrames[1].g,1);assert.equal(r.teachingFrames[1].h,1);assert.equal(r.teachingFrames[1].f,2);
  const m=new Maze(30,30,{walls:new Uint8Array(900),start:[0,0],goal:[29,29]}),large=searchMaze(m,'bfs');
  assert.equal(large.teachingFrames.length,512);assert.equal(large.visitedG.length,large.visitedCount);
  const q=searchMaze(new Maze(2,2,{walls:[0,0,0,0],start:[0,0],goal:[1,1]}),'bfs');
  assert.deepEqual(q.teachingFrames[1].candidates,[2]);
  assert.equal(searchMaze(line,'astar',{captureDetails:false}).teachingFrames.length,0);
});
test('双图同步单步、暂停、不同终止长度、重播和时间分数',()=>{
  const a=searchMaze(line,'bfs'),b=searchMaze(line,'bibfs'),p=new PairPlayback(3,10);p.load(a,b);
  p.step();assert.equal(p.left.index,1);assert.equal(p.right.index,1);assert.equal(p.state,'paused');
  p.update(10);assert.equal(p.index,1);p.toggle();p.update(.05);assert.equal(p.index,1);p.update(.05);assert.equal(p.index,2);
  assert.equal(p.right.state,'completed');assert.notEqual(p.left.state,'completed');p.finish();assert.equal(p.left.index,3);assert.equal(p.right.index,2);assert.equal(p.state,'completed');
  p.rewind();assert.equal(p.left.mask.some(Boolean),false);assert.equal(p.right.mask.some(Boolean),false);p.step();assert.equal(p.index,1);
});
test('共同路段按无向边计算，反向共享路段也正确',()=>{
  const a={found:true,path:[0,1,2,5]},b={found:true,path:[0,3,4,1,2,5]},overlap=pathOverlap(a,b,6);
  assert.equal(overlap.shared,2);assert.equal(overlap.leftOnly,1);assert.equal(overlap.rightOnly,3);
  assert.equal(overlap.edges[edgeKey(2,1)],3);assert.equal(pathOverlap(a,{found:false},6).available,false);
});
test('点击未播放节点不会泄露未来信息；墙体、选中节点和结果归属明确',()=>{
  const m=generateMaze({rows:11,cols:11}),r=searchMaze(m,'astar'),id=r.visitedOrder[2];
  assert.ok(inspectNode(m,r,id,2).pending);const detail=inspectNode(m,r,id,3);assert.equal(detail.id,id);assert.equal(detail.f,detail.g+detail.h);
  assert.ok(inspectNode(m,r,0,3).wall);assert.equal(inspectNode(m,r,-1,3),null);
});
test('双向连接点可在路径中却未被扩展，完成后不能提示继续单步或伪造评分',()=>{
  const r=searchMaze(line,'bibfs');assert.equal(r.visitedOrder.includes(1),false);
  assert.equal(inspectNode(line,r,1,1).pending,true);
  assert.equal(inspectNode(line,r,1,r.visitedCount).pathOnly,true);
});
test('达到上限及不可达结果单独列出，不以少探索格子参与路径优劣图',()=>{
  const rows=[{status:'found',visitedCount:100},{status:'limited',visitedCount:1},{status:'unreachable',visitedCount:2}];
  const groups=completedComparisons(rows);assert.deepEqual(groups.eligible,[rows[0]]);assert.deepEqual(groups.excluded,rows.slice(1));
});
test('中位数抵抗单次异常；5次样本排除热身和讲解采集计时',()=>{
  assert.equal(timingSummary([10,100,11,9,12]).elapsedMs,11);
  assert.equal(timingSummary([2,4]).elapsedMs,3);assert.throws(()=>timingSummary([]));
  const ticks=[0,10,0,100,0,11,0,9,0,12];let calls=0;
  const r=benchmark(line,'astar',{now:()=>ticks[calls++],warmups:1,samples:5});
  assert.equal(calls,10);assert.equal(r.summary.elapsedMs,11);assert.equal(r.summary.sampleCount,5);assert.equal(r.summary.warmupCount,1);assert.equal(r.summary.timingKind,'median');assert.ok(r.result.teachingFrames.length);
  let single=0;measure(line,'bfs',()=>++single);assert.equal(single,2);
  const map=createScenario('loops');
  for(const algorithm of Object.keys(ALGORITHMS)){
    const teaching=searchMaze(map,algorithm),sample=searchMaze(map,algorithm,{captureDetails:false});
    assert.deepEqual(sample.path,teaching.path);assert.deepEqual(sample.visitedOrder,teaching.visitedOrder);
    assert.equal(sample.expansionCount,teaching.expansionCount);assert.equal(sample.maxFrontierSize,teaching.maxFrontierSize);
  }
});
test('五个教学场景可复现、推荐组合有效、不可达场景确实封闭',()=>{
  for(const id of Object.keys(SCENARIOS)){
    const a=createScenario(id,5),b=createScenario(id,5);assert.deepEqual(a,b);
    for(const algorithm of SCENARIOS[id].recommended){const r=searchMaze(a,algorithm);assert.equal(r.found,id!=='unreachable');}
    assert.equal(a.version,5);
  }
  const m=createScenario('loops');assert.ok(searchMaze(m,'dfs').totalCost>searchMaze(m,'astar').totalCost);
});
test('多场景实验不返回另一张地图的轨迹，当前版本和场景标签明确',()=>{
  const map=createScenario('loops',7),messages=[];executeRequest({id:20,version:7,kind:'study',map,algorithm:'bfs',reference:'astar'},m=>messages.push(m));
  const rows=messages.filter(m=>m.kind==='study-result');assert.equal(rows.length,10);assert.ok(rows.every(m=>m.version===7&&!m.result&&SCENARIOS[m.scenario]));
  assert.equal(messages.at(-1).kind,'study-done');assert.equal(rows.filter(m=>m.scenario==='unreachable').every(m=>m.summary.status==='unreachable'),true);
});
test('布局使用实际工具栏高度，窗口变矮仍提供明确的最小地图高度',()=>{
  assert.equal(stageHeight(768,260,70),426);assert.equal(stageHeight(500,350,80),200);assert.equal(stageHeight(1600,100,40),850);
});
test('光效强度不改变算法和播放，慢绘制自动降级并在稳定后恢复',()=>{
  const q=new EffectsPolicy();assert.equal(q.intensity(false,80),0);assert.equal(q.intensity(true,50),.5);
  for(let i=0;i<4;i++)q.observe(30);assert.equal(q.reduced,true);assert.equal(q.intensity(true,100),.35);
  for(let i=0;i<60;i++)q.observe(5);assert.equal(q.reduced,false);assert.equal(q.intensity(true,100),1);
});
test('束搜索峰值包含当前层未处理节点和下一层候选，避免低报占用',()=>{
  const cells=['#...#','#...#','##.##'],m=new Maze(3,5,{walls:cells.flatMap(r=>[...r].map(c=>c==='#'?1:0)),start:[2,1],goal:[1,0]});
  assert.equal(searchMaze(m,'beam').maxFrontierSize,5);
});
test('窄窗口的展开菜单始终留在可见范围内',()=>{
  for(const [left,width,viewport]of [[542,165,649],[5,190,320],[100,260,360]]){
    const offset=menuOffset(left,width,viewport);assert.ok(left+offset>=8);assert.ok(left+offset+width<=viewport-8);
  }
});
test('回归：页面滚动后地图高度保持稳定，不挤走播放按钮',()=>{
  assert.equal(stageHeight(720,200,150),358);
  assert.equal(stageHeight(720,138,150,62),358);
  assert.equal(stageHeight(720,-80,150,280),358);
});
test('节点索引在长访问记录、暂停回退和切换算法后仍返回各自数据',()=>{
  const m=generateMaze({rows:101,cols:101,type:'braided',seed:42}),first=searchMaze(m,'bfs'),second=searchMaze(m,'dfs');
  const id=first.visitedOrder.at(-1),index=first.visitedCount-1;
  assert.ok(index>512);
  assert.equal(inspectNode(m,first,id,first.visitedCount).index,index);
  assert.equal(inspectNode(m,first,id,0).pending,true);
  const j=second.visitedOrder.indexOf(id),detail=inspectNode(m,second,id,second.visitedCount);
  if(j>=0){assert.equal(detail.index,j);assert.equal(detail.g,second.visitedG[j]);}
  else assert.ok(detail.pathOnly||detail.pending);
  assert.equal(inspectNode(m,first,id,first.visitedCount).g,first.visitedG[index]);
});
