// Canvas-only presentation: data and algorithms never import this module.
const palette = { wall: '#283e55', open: '#101e2d', forward: '#236d89', backward: '#6a4f91', path: '#ffc76b', start: '#4ce8c3', goal: '#ff8b98' };
const rasterCache = new WeakMap();
const comparisonCache=new WeakMap(),pathLayerCache=new WeakMap();
function raster(maze, playback) {
  let entry = rasterCache.get(playback);
  if (!entry || entry.maze !== maze || entry.result !== playback.result || playback.index < entry.index) {
    const canvas = document.createElement('canvas'); canvas.width = maze.cols; canvas.height = maze.rows;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(maze.cols, maze.rows);
    const wallRGB=maze.type==='scatter'?[223,234,231,255]:[40,62,85,255];
    for (let id = 0; id < maze.walls.length; id++) image.data.set(maze.walls[id] ? wallRGB : [16, 30, 45, 255], id * 4);
    entry = { maze, result:playback.result, canvas, ctx, image, index: 0, done: false, dirty:true }; rasterCache.set(playback, entry);
  }
  let changed = entry.dirty;
  for (; entry.index < playback.index; entry.index++) {
    const id = playback.result.visitedOrder[entry.index]; entry.image.data.set(playback.result.visitedSides[entry.index] === 2 ? [106, 79, 145, 255] : [35, 109, 137, 255], id * 4); changed = true;
  }
  if (playback.state === 'completed' && !entry.done) {
    for (const id of playback.result.path) entry.image.data.set([255, 199, 107, 255], id * 4);
    entry.done = true; changed = true;
  }
  if (changed) {entry.ctx.putImageData(entry.image, 0, 0);entry.dirty=false;}
  return entry.canvas;
}
export function drawMaze(canvas, maze, playback, g, { time = 0, effects = true, intensity=1, highlight=null, width, height } = {}) {
  const glow=effects?Math.max(0,Math.min(1,intensity)):0;
  const ctx = canvas.getContext('2d'), ratio = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#0a1522'; ctx.fillRect(0, 0, width, height);
  // One opaque pixel per actual cell, scaled without smoothing: walls stay solid
  // at every zoom. Incremental uploads avoid rebuilding geometry on glow frames.
  ctx.imageSmoothingEnabled=false;ctx.drawImage(raster(maze,playback),g.left,g.top,maze.cols*g.size,maze.rows*g.size);
  const point = id => [g.left + (id % maze.cols + .5) * g.size, g.top + (Math.floor(id / maze.cols) + .5) * g.size];
  if (glow && playback.state === 'playing' && playback.result) for (let i = Math.max(0, playback.index - Math.ceil(6*glow)); i < playback.index; i++) {
    const [x, y] = point(playback.result.visitedOrder[i]); ctx.fillStyle = '#a4fff4'; ctx.shadowColor = '#4ce8c3'; ctx.shadowBlur = 13*glow;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, g.size * .17), 0, Math.PI * 2); ctx.fill();
  }
  if (glow && playback.state === 'completed' && playback.result?.found) {
    const path = playback.result.path;
    const particles=Math.max(1,Math.ceil(7*glow));
    for (let i = 0; i < particles; i++) {
      const pos = (time / 85 + i * path.length / particles) % path.length, a = point(path[Math.floor(pos)]), b = point(path[Math.min(path.length - 1, Math.floor(pos) + 1)]), t = pos % 1;
      ctx.fillStyle = '#fff4d5'; ctx.shadowColor = '#ffd277'; ctx.shadowBlur = 12*glow;
      ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.max(1.5, g.size * .14), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  for (const [id, color, label] of [[maze.startId, palette.start, '起'], [maze.goalId, palette.goal, '终']]) {
    const [x, y] = point(id), radius = Math.max(3, g.size * .39);
    ctx.shadowColor = color; ctx.shadowBlur = glow ? (10 + 4 * Math.sin(time / 550))*glow : 0; ctx.fillStyle = color;
    ctx.beginPath(); if(label==='起')ctx.arc(x, y, radius, 0, Math.PI * 2);else ctx.roundRect(x-radius,y-radius,radius*2,radius*2,Math.max(1,radius*.2)); ctx.fill(); ctx.shadowBlur = 0;
    if (g.size >= 14) { ctx.fillStyle = '#122234'; ctx.font = `bold ${Math.max(9, g.size * .45)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + .5); }
  }
  if(Number.isInteger(highlight)&&highlight>=0&&highlight<maze.walls.length){const[x,y]=point(highlight);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Math.max(4,g.size*.45),0,7);ctx.stroke();}
}
export function drawComparison(canvas, maze, result, color,{playback=null,overlap=null,time=0,intensity=0}={}) {
  const width = Math.max(1, canvas.clientWidth), height = Math.max(1,canvas.clientHeight||210), ratio = Math.min(2, devicePixelRatio || 1);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width = Math.round(width * ratio); canvas.height = Math.round(height*ratio);}
  const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#0a1522'; ctx.fillRect(0, 0, width, height);
  const size = Math.min((width - 16) / maze.cols, (height - 16) / maze.rows), left = (width - size * maze.cols) / 2, top = (height - size * maze.rows) / 2;
  const key=playback??result??maze,visible=playback?playback.index:result?.visitedCount??0;
  let terrain=comparisonCache.get(key);
  if(!terrain||terrain.maze!==maze||terrain.result!==result||visible<terrain.index){
    const image=document.createElement('canvas');image.width=maze.cols;image.height=maze.rows;const ic=image.getContext('2d'),pixels=ic.createImageData(maze.cols,maze.rows);
    const wallRGB=maze.type==='scatter'?[223,234,231,255]:[40,62,85,255];
    for(let id=0;id<maze.walls.length;id++)pixels.data.set(maze.walls[id]?wallRGB:[16,30,45,255],id*4);
    terrain={maze,result,image,ic,pixels,index:0,dirty:true};comparisonCache.set(key,terrain);
  }
  for(;terrain.index<visible;terrain.index++){terrain.pixels.data.set([34,76,96,255],result.visitedOrder[terrain.index]*4);terrain.dirty=true;}
  if(terrain.dirty){terrain.ic.putImageData(terrain.pixels,0,0);terrain.dirty=false;}
  ctx.imageSmoothingEnabled=false;ctx.drawImage(terrain.image,left,top,maze.cols*size,maze.rows*size);
  const point=id=>[left+(id%maze.cols+.5)*size,top+(Math.floor(id/maze.cols)+.5)*size];
  const complete=!playback||playback.state==='completed';
  if(result?.found&&complete){
    let layer=pathLayerCache.get(key);
    if(!layer||layer.result!==result||layer.width!==width||layer.height!==height||layer.ratio!==ratio||layer.color!==color||layer.overlap!==overlap){
      const image=document.createElement('canvas');image.width=Math.round(width*ratio);image.height=Math.round(height*ratio);const pc=image.getContext('2d');pc.setTransform(ratio,0,0,ratio,0,0);
      pc.lineWidth=Math.max(1.5,size*.30);pc.lineCap='round';pc.lineJoin='round';
      for(const common of [false,true]){
        pc.strokeStyle=common?'#ffc76b':color;pc.beginPath();
        for(let i=1;i<result.path.length;i++){const a=result.path[i-1],b=result.path[i],edge=Math.min(a,b)*2+(Math.abs(a-b)===1?0:1);if((overlap?.edges[edge]===3)!==common)continue;const p=point(a),q=point(b);pc.moveTo(...p);pc.lineTo(...q);}pc.stroke();
      }
      layer={result,width,height,ratio,color,overlap,image};pathLayerCache.set(key,layer);
    }
    ctx.drawImage(layer.image,0,0,width,height);
    if(intensity>0){const path=result.path,p=point(path[Math.floor(time/100)%path.length]);ctx.fillStyle='#fff8df';ctx.shadowColor=color;ctx.shadowBlur=8*intensity;ctx.beginPath();ctx.arc(...p,Math.max(2,size*.14),0,7);ctx.fill();ctx.shadowBlur=0;}
  }else if(playback?.index){const p=point(result.visitedOrder[playback.index-1]);ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,Math.max(2,size*.25),0,7);ctx.fill();}
  for (const [id, c] of [[maze.startId, '#4ce8c3'], [maze.goalId, '#ff8b98']]) { const[x,y]=point(id),r=Math.max(2.5,size*.4);ctx.fillStyle=c;ctx.beginPath();if(id===maze.startId)ctx.arc(x,y,r,0,7);else ctx.roundRect(x-r,y-r,r*2,r*2,Math.max(1,r*.2));ctx.fill(); }
}
