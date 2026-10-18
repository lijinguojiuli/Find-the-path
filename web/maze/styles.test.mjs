import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import { MAZE_TYPES,MAZE_INFO,CLASSIC_TYPES,generateMaze } from './model.mjs';
import { LANDSCAPE_INFO,connectPassages } from './generators.mjs';
import { searchMaze,ALGORITHMS } from './search.mjs';
import { executeRequest } from './worker.mjs';
import { Tasks } from './state.mjs';
function flood(m){const seen=new Uint8Array(m.walls.length),queue=new Uint32Array(m.walls.length);let head=0,tail=1;queue[0]=m.startId;seen[m.startId]=1;
  while(head<tail){const id=queue[head++],x=id%m.cols,y=Math.floor(id/m.cols);for(const [nx,ny]of [[x,y-1],[x+1,y],[x,y+1],[x-1,y]])if(nx>=0&&nx<m.cols&&ny>=0&&ny<m.rows){const next=ny*m.cols+nx;if(!m.walls[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}}}return {seen,count:tail};}
function common(m){const reached=flood(m);assert.equal(reached.seen[m.goalId],1);assert.equal(reached.count,m.walls.filter(x=>!x).length);
  for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++)if(!x||!y||x===m.cols-1||y===m.rows-1){const id=y*m.cols+x;assert.equal(m.walls[id],id===m.startId||id===m.goalId?0:1);}}
for(const type of Object.keys(LANDSCAPE_INFO))for(const seed of [0,42,20261018])for(const [rows,cols]of [[11,11],[15,25],[31,45],[11,51],[51,11]])test(`${type} ${rows}×${cols} seed=${seed}：全通道连通、边界和复现`,()=>{
  const m=generateMaze({rows,cols,type,seed,version:8});assert.deepEqual(m,generateMaze({rows,cols,type,seed,version:8}));assert.equal(m.version,8);common(m);
});
test('十种风格确实不同，同风格换种子也有变化',()=>{
  assert.equal(Object.keys(MAZE_TYPES).length,10);const hashes=new Set();
  for(const type of Object.keys(MAZE_TYPES)){const a=generateMaze({rows:51,cols:75,type,seed:42}),b=generateMaze({rows:51,cols:75,type,seed:43});
    const hash=m=>createHash('sha256').update(m.walls).digest('hex');hashes.add(hash(a));assert.notEqual(hash(a),hash(b),type);assert.ok(MAZE_INFO[type].description&&MAZE_INFO[type].recommended.length===2);}
  assert.equal(hashes.size,10);
});
test('经典三种迷宫的旧种子地图保持逐字节一致',()=>{
  const hashes={corridors:'0a020f364bb4bc31196eab3fba12f85516096793dc8f6ee5bfe350d01d70a76e',branches:'6961a6544a6e43df42992b2fcf8eb3a7039a04d6f5134b9e267fb6a1049883c0',braided:'1c914ea329465dcd957b2c79dbeb6b575c7aaa9f9d0ff4ee242c4c468b399dfe'};
  for(const type of CLASSIC_TYPES)assert.equal(createHash('sha256').update(generateMaze({rows:31,cols:45,type,seed:42}).walls).digest('hex'),hashes[type]);
});
test('参考手绘的散墙以开阔空间为主，包含折转与非轴向墙段',()=>{
  const m=generateMaze({rows:51,cols:75,type:'scatter',seed:42});let open=0,turns=0;
  for(let y=1;y<m.rows-1;y++)for(let x=1;x<m.cols-1;x++){const id=y*m.cols+x;if(!m.walls[id])open++;else if((m.walls[id-1]||m.walls[id+1])&&(m.walls[id-m.cols]||m.walls[id+m.cols]))turns++;}
  assert.ok(open/(49*73)>.75);assert.ok(turns>0);
});
test('螺旋到达内部终点，通道是一条连贯路线',()=>{
  const m=generateMaze({rows:31,cols:45,type:'spiral',seed:42});assert.ok(m.goal[0]>0&&m.goal[0]<m.cols-1&&m.goal[1]>0&&m.goal[1]<m.rows-1);
  for(let id=0;id<m.walls.length;id++)if(!m.walls[id]){const x=id%m.cols,y=Math.floor(id/m.cols);let degree=0;for(const[nx,ny]of [[x,y-1],[x+1,y],[x,y+1],[x-1,y]])if(nx>=0&&nx<m.cols&&ny>=0&&ny<m.rows&&!m.walls[ny*m.cols+nx])degree++;assert.equal(degree,id===m.startId||id===m.goalId?1:2);}
  assert.equal(searchMaze(m,'bfs').totalCost,m.walls.filter(v=>!v).length-1);
});
test('连通修复保留原有通道，连接孤立洞室且不额外打开边界',()=>{
  const walls=new Uint8Array(25).fill(1),open=[1,6,8,18,23];for(const id of open)walls[id]=0;
  connectPassages(walls,5,5,[1,0],[3,4]);for(const id of open)assert.equal(walls[id],0);
  common({rows:5,cols:5,walls,startId:1,goalId:23});
});
test('新风格的最优算法同成本，所有返回路径合法；未完成结果必须明确',()=>{
  for(const type of Object.keys(LANDSCAPE_INFO)){
    const m=generateMaze({rows:15,cols:25,type,seed:42}),cost=searchMaze(m,'bfs').totalCost;
    for(const [algorithm,info]of Object.entries(ALGORITHMS)){
      const r=searchMaze(m,algorithm);if(!r.found){assert.equal(r.status,'limited');assert.ok(r.reason);continue;}
      assert.equal(r.path[0],m.startId);assert.equal(r.path.at(-1),m.goalId);for(let i=0;i<r.path.length;i++){assert.equal(m.walls[r.path[i]],0);if(i){const a=r.path[i-1],b=r.path[i];assert.equal(Math.abs(a%m.cols-b%m.cols)+Math.abs(Math.floor(a/m.cols)-Math.floor(b/m.cols)),1);}}
      if(info.optimal)assert.equal(r.totalCost,cost,`${type}/${algorithm}`);
    }
    assert.equal(searchMaze(m,'astar').totalCost,cost);assert.equal(searchMaze(m,'dijkstra').totalCost,cost);
  }
});
test('七种新增风格支持1001×1001，入口和终点均有合法路径',()=>{
  for(const type of Object.keys(LANDSCAPE_INFO)){const m=generateMaze({rows:1001,cols:1001,type,seed:20261018});common(m);assert.ok(searchMaze(m,'bfs').found,type);}
});
test('风格图鉴在Worker内生成十种小预览，并保留种子、版本与请求号',()=>{
  const out=[];executeRequest({id:15,version:3,kind:'catalog',options:{seed:42}},m=>out.push(m));
  const maps=out.filter(m=>m.kind==='preview');assert.equal(maps.length,10);assert.equal(new Set(maps.map(m=>m.type)).size,10);
  for(const m of maps){assert.equal(m.id,15);assert.equal(m.version,3);assert.equal(m.map.version,3);assert.equal(m.map.seed,42);assert.equal(m.map.rows,31);assert.equal(m.map.cols,45);common(m.map);}
  assert.equal(out.at(-1).kind,'catalog-done');
  const errors=[];executeRequest({id:16,version:3,kind:'catalog',options:{seed:-1}},m=>errors.push(m));assert.equal(errors.length,1);assert.equal(errors[0].kind,'error');
});
test('预览取消不取消当前地图搜索，两个任务域独立拒绝各自旧结果',()=>{
  const search=new Tasks(),catalog=new Tasks(),a=search.begin('search',2),b=catalog.begin('catalog',0);
  catalog.cancel();assert.equal(catalog.accepts(b),false);assert.equal(search.accepts(a),true);
  const c=catalog.begin('catalog',0);assert.equal(catalog.accepts(b),false);assert.equal(catalog.accepts(c),true);
});
