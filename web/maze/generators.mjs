// Seven geometric maze families. Inputs are validated by model.mjs.
// Integer geometry and the caller's PRNG keep Python/browser seeds identical.
export const LANDSCAPE_INFO=Object.freeze({
  scatter:{name:'不规则散墙',group:'开阔与自然',description:'参考手绘：开阔区域里散布长短、方向和弯曲程度不同的墙段。弯墙按网格近似。',recommended:['astar','bfs']},
  rooms:{name:'房间与走廊',group:'建筑与分隔',description:'大小不同的房间，通过折线走廊连通，像建筑平面图。',recommended:['bfs','astar']},
  cave:{name:'自然洞穴',group:'开阔与自然',description:'随机地形经过细胞演化，形成有机洞室和狭窄连接。',recommended:['greedy','astar']},
  division:{name:'递归分割',group:'建筑与分隔',description:'长直墙不断分割区域，在每道墙上留下门洞。',recommended:['dfs','astar']},
  spiral:{name:'螺旋通道',group:'规则与绕行',description:'从外侧入口沿旋转通道进入中央终点；圈距和旋转方向随种子变化。',recommended:['bfs','astar']},
  gates:{name:'交错栅栏',group:'规则与绕行',description:'交错排列的长墙和缺口，形成来回绕行的路线。',recommended:['greedy','dijkstra']},
  random:{name:'随机障碍',group:'开阔与自然',description:'开阔地图里分布随机障碍块，适合观察搜索波前。',recommended:['bfs','astar']},
});
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));

// Label every open component, then grow fronts through walls. When fronts meet,
// union their components and dig their predecessor chains. Each cell is queued
// once per pass; union-find avoids repeated full-map reachability searches.
export function connectPassages(walls,rows,cols,start,goal){
  const n=walls.length,labels=new Int32Array(n).fill(-1),queue=new Uint32Array(n);
  const neighbors=id=>{const x=id%cols,y=Math.floor(id/cols),out=[];if(y)out.push(id-cols);if(x<cols-1)out.push(id+1);if(y<rows-1)out.push(id+cols);if(x)out.push(id-1);return out;};
  let components=0;
  for(let id=0;id<n;id++)if(!walls[id]&&labels[id]<0){
    let head=0,tail=1;queue[0]=id;labels[id]=components;
    while(head<tail)for(const next of neighbors(queue[head++]))if(!walls[next]&&labels[next]<0){labels[next]=components;queue[tail++]=next;}
    components++;
  }
  if(components<2)return;
  const roots=Int32Array.from({length:components},(_,i)=>i),rank=new Uint8Array(components),parent=new Int32Array(n).fill(-1);
  const find=id=>{while(roots[id]!==id){roots[id]=roots[roots[id]];id=roots[id];}return id;};
  let head=0,tail=0;for(let id=0;id<n;id++)if(!walls[id])queue[tail++]=id;
  const startId=start[1]*cols+start[0],goalId=goal[1]*cols+goal[0];
  const dig=id=>{while(walls[id]){walls[id]=0;id=parent[id];}};
  while(head<tail&&components>1){
    const id=queue[head++];
    for(const next of neighbors(id)){
      const x=next%cols,y=Math.floor(next/cols);
      if((!x||!y||x===cols-1||y===rows-1)&&next!==startId&&next!==goalId)continue;
      if(labels[next]<0){labels[next]=labels[id];parent[next]=id;queue[tail++]=next;}
      else{
        let a=find(labels[id]),b=find(labels[next]);if(a===b)continue;
        if(rank[a]<rank[b])[a,b]=[b,a];roots[b]=a;if(rank[a]===rank[b])rank[a]++;components--;dig(id);dig(next);
      }
    }
  }
}

export function generateLandscape(rows,cols,type,random){
  const n=rows*cols,m=Math.min(rows,cols),walls=new Uint8Array(n),start=[1,0];let goal=[cols-2,rows-1];
  const paint=(x,y,value=1,radius=0)=>{for(let yy=Math.max(1,y-radius);yy<=Math.min(rows-2,y+radius);yy++)for(let xx=Math.max(1,x-radius);xx<=Math.min(cols-2,x+radius);xx++)walls[yy*cols+xx]=value;};
  const line=(x0,y0,x1,y1,value=1,radius=0)=>{
    const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let error=dx-dy;
    while(true){paint(x0,y0,value,radius);if(x0===x1&&y0===y1)break;const e=error*2,oldY=y0;let movedX=false;
      if(e>-dy){error-=dy;x0+=sx;movedX=true;}if(e<dx){error+=dx;y0+=sy;if(movedX)paint(x0,oldY,value,radius);}}
  };
  if(type==='scatter'){
    const radius=Math.floor(m/120),count=Math.max(6,Math.min(20,Math.floor(m/4)));
    for(let i=0;i<count;i++){
      const x0=2+random()%(cols-4),y0=2+random()%(rows-4);
      const x2=clamp(x0+(2+random()%Math.max(2,Math.floor(cols/3)))*(random()%2?1:-1),1,cols-2);
      const y2=clamp(y0+(2+random()%Math.max(2,Math.floor(rows/3)))*(random()%2?1:-1),1,rows-2);
      const cx=clamp(Math.floor((x0+x2)/2)+(random()%Math.max(3,Math.floor(cols/4)))-Math.floor(cols/8),1,cols-2);
      const cy=clamp(Math.floor((y0+y2)/2)+(random()%Math.max(3,Math.floor(rows/4)))-Math.floor(rows/8),1,rows-2);
      let px=x0,py=y0;for(let t=1;t<=32;t++){
        const a=32-t,x=Math.floor((a*a*x0+2*a*t*cx+t*t*x2+512)/1024),y=Math.floor((a*a*y0+2*a*t*cy+t*t*y2+512)/1024);
        line(px,py,x,y,1,radius);px=x;py=y;
      }
    }
  }else if(type==='rooms'){
    walls.fill(1);const tile=Math.max(7,Math.min(31,Math.floor(m/3))),centers=[[1,1]];
    for(let y=1;y<rows-2;y+=tile)for(let x=1;x<cols-2;x+=tile){
      const endX=Math.min(cols-2,x+tile-2),endY=Math.min(rows-2,y+tile-2);if(endX-x<2||endY-y<2)continue;
      const left=x+random()%2,top=y+random()%2;if(endX-left<2||endY-top<2)continue;
      const width=3+random()%Math.max(1,endX-left-1),height=3+random()%Math.max(1,endY-top-1);
      for(let yy=top;yy<top+height;yy++)walls.fill(0,yy*cols+left,yy*cols+left+width);
      centers.push([left+Math.floor(width/2),top+Math.floor(height/2)]);
    }
    centers.push([cols-2,rows-2]);
    for(let i=1;i<centers.length;i++){const[a,b]=centers[i-1],[c,d]=centers[i];if(random()%2){line(a,b,c,b,0);line(c,b,c,d,0);}else{line(a,b,a,d,0);line(a,d,c,d,0);}}
  }else if(type==='cave'){
    walls.fill(1);for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++)walls[y*cols+x]=random()%100<45?1:0;
    let previous=walls.slice(),next=new Uint8Array(n).fill(1);
    for(let round=0;round<4;round++){
      for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){let blocked=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)blocked+=previous[(y+dy)*cols+x+dx];next[y*cols+x]=blocked>4?1:blocked<4?0:previous[y*cols+x];}
      [previous,next]=[next,previous];
    }
    walls.set(previous);
  }else if(type==='division'){
    const stack=[[1,1,cols-2,rows-2]];
    while(stack.length){const[x0,y0,x1,y1]=stack.pop(),w=x1-x0+1,h=y1-y0+1;if(w<5||h<5)continue;
      const vertical=w>h||(w===h&&random()%2===0);
      if(vertical){const x=x0+1+2*(random()%Math.floor((w-1)/2)),door=y0+2*(random()%Math.ceil(h/2));for(let y=y0;y<=y1;y++)walls[y*cols+x]=y===door?0:1;stack.push([x0,y0,x-1,y1],[x+1,y0,x1,y1]);}
      else{const y=y0+1+2*(random()%Math.floor((h-1)/2)),door=x0+2*(random()%Math.ceil(w/2));for(let x=x0;x<=x1;x++)walls[y*cols+x]=x===door?0:1;stack.push([x0,y0,x1,y-1],[x0,y+1,x1,y1]);}
    }
  }else if(type==='spiral'){
    walls.fill(1);const xs=[1],ys=[1];
    while(xs.at(-1)+3<cols-1)xs.push(xs.at(-1)+2+random()%2);
    while(ys.at(-1)+3<rows-1)ys.push(ys.at(-1)+2+random()%2);
    const transpose=!!(random()%2),width=transpose?ys.length:xs.length,height=transpose?xs.length:ys.length,order=[];
    let left=0,right=width-1,top=0,bottom=height-1;
    const add=(x,y)=>order.push(transpose?[xs[y],ys[x]]:[xs[x],ys[y]]);
    while(left<=right&&top<=bottom){for(let x=left;x<=right;x++)add(x,top);for(let y=top+1;y<=bottom;y++)add(right,y);if(top<bottom)for(let x=right-1;x>=left;x--)add(x,bottom);if(left<right)for(let y=bottom-1;y>top;y--)add(left,y);left++;right--;top++;bottom--;}
    for(let i=1;i<order.length;i++)line(...order[i-1],...order[i],0);goal=order.at(-1);
  }else if(type==='gates'){
    const vertical=!!(random()%2),extent=vertical?cols:rows,span=vertical?rows:cols,spacing=Math.max(3,Math.floor(extent/8)),gap=Math.max(1,Math.floor(span/12));let index=0;
    for(let p=3;p<extent-2;p+=spacing,index++){
      const offset=random()%Math.max(1,Math.floor(span/6)),door=index%2?1+offset:span-1-gap-offset;
      for(let v=1;v<span-1;v++)if(v<door||v>=door+gap){if(vertical)walls[v*cols+p]=1;else walls[p*cols+v]=1;}
    }
  }else if(type==='random'){
    const block=Math.max(1,Math.floor(m/40));
    for(let y=1;y<rows-1;y+=block)for(let x=1;x<cols-1;x+=block)if(random()%100<23)for(let yy=y;yy<Math.min(rows-1,y+block);yy++)walls.fill(1,yy*cols+x,yy*cols+Math.min(cols-1,x+block));
  }else throw new Error('未知迷宫类型。');
  // Keep the enclosing boundary intact; only actual boundary endpoints open.
  for(let x=0;x<cols;x++){walls[x]=1;walls[(rows-1)*cols+x]=1;}
  for(let y=0;y<rows;y++){walls[y*cols]=1;walls[y*cols+cols-1]=1;}
  walls[start[1]*cols+start[0]]=0;walls[cols+1]=0;walls[goal[1]*cols+goal[0]]=0;
  if(type!=='spiral')walls[(rows-2)*cols+cols-2]=0;
  connectPassages(walls,rows,cols,start,goal);
  return {walls,start,goal};
}
