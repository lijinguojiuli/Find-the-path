import { Maze,generateMaze } from './model.mjs';
export const SCENARIOS=Object.freeze({
  loops:{name:'多环路 · 路线长短',question:'DFS 为什么找到路线却绕得更远？',recommended:['dfs','astar']},
  misleading:{name:'误导岔路 · 启发式',question:'离终点更近的死胡同，为什么仍会被探索？',recommended:['greedy','astar']},
  corridor:{name:'长走廊 · 唯一路线',question:'路线相同，为什么探索量和重复计算不同？',recommended:['bfs','iddfs']},
  unreachable:{name:'封闭地图 · 不可达',question:'什么情况才算确认不可达，而不是计算上限？',recommended:['bfs','astar']},
  open:{name:'开阔地图 · 单位成本',question:'单位成本下 BFS 和 Dijkstra 为什么常有相同的访问顺序？',recommended:['bfs','dijkstra']},
});
export function createScenario(id,version=0) {
  if(!Object.hasOwn(SCENARIOS,id))throw new Error('未知教学场景。');
  if(id==='loops')return generateMaze({rows:15,cols:25,seed:20261018,type:'braided',version});
  if(id==='corridor')return generateMaze({rows:11,cols:25,seed:42,type:'corridors',version});
  const rows=15,cols=25,n=rows*cols;
  if(id==='unreachable') {
    const m=generateMaze({rows,cols,seed:20261018,version});
    m.walls.fill(1,7*cols,8*cols);return m;
  }
  const walls=new Uint8Array(n).fill(1);
  if(id==='open') {
    for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++)walls[y*cols+x]=0;
    walls[1]=walls[n-2]=0;
    return new Maze(rows,cols,{walls,start:[1,0],goal:[23,14],version});
  }
  // One true upper route and a tempting horizontal dead end near the goal.
  for(let y=1;y<=7;y++){walls[y*cols+1]=0;walls[y*cols+23]=0;}
  for(let x=1;x<=23;x++)walls[cols+x]=0;
  for(let x=1;x<=20;x++)walls[7*cols+x]=0;
  return new Maze(rows,cols,{walls,start:[1,7],goal:[23,7],version});
}
