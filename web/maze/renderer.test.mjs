import test from 'node:test';
import assert from 'node:assert/strict';
import { drawMaze,drawComparison } from './renderer.mjs';

function fakeCanvas() {
  const context = { createImageData(w,h) { return { data:new Uint8ClampedArray(w*h*4) }; },
    putImageData(image) { this.pixels = [...image.data]; }, drawImage(image) { this.image = image; },
    setTransform() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {}, roundRect() {},stroke(){},moveTo(){},lineTo(){} };
  return { width:0,height:0,clientWidth:200,clientHeight:160,style:{},getContext() { return context; },context };
}
test('回归：更换结果且进度相同，大图栅格必须使旧路径失效', () => {
  const oldDocument=globalThis.document,oldRatio=globalThis.devicePixelRatio;
  globalThis.document={createElement:fakeCanvas}; globalThis.devicePixelRatio=1;
  try {
    const canvas=fakeCanvas(),maze={rows:1,cols:4,walls:new Uint8Array(4),startId:0,goalId:3};
    const p={index:2,state:'completed',result:{visitedOrder:[0,1],visitedSides:[1,1],path:[0,1]}};
    const g={size:1,left:0,top:0};
    drawMaze(canvas,maze,p,g,{width:100,height:100,effects:false});
    assert.deepEqual(canvas.context.image.context.pixels.slice(0,4),[255,199,107,255]);
    p.result={visitedOrder:[2,3],visitedSides:[2,2],path:[2,3]};
    drawMaze(canvas,maze,p,g,{width:100,height:100,effects:false});
    assert.deepEqual(canvas.context.image.context.pixels.slice(0,4),[16,30,45,255]);
    assert.deepEqual(canvas.context.image.context.pixels.slice(8,12),[255,199,107,255]);
  } finally { globalThis.document=oldDocument;globalThis.devicePixelRatio=oldRatio; }
});
test('同步对比的增量栅格在重播、等长结果替换时清除旧探索色',()=>{
  const oldDocument=globalThis.document,oldRatio=globalThis.devicePixelRatio;globalThis.document={createElement:fakeCanvas};globalThis.devicePixelRatio=1;
  try{
    const canvas=fakeCanvas(),maze={rows:1,cols:4,walls:new Uint8Array(4),startId:0,goalId:3};
    const first={found:false,visitedOrder:[0,1],visitedCount:2},second={found:false,visitedOrder:[2,3],visitedCount:2};
    const p={index:2,state:'completed',result:first};drawComparison(canvas,maze,first,'#4ce8c3',{playback:p});
    assert.deepEqual(canvas.context.image.context.pixels.slice(0,4),[34,76,96,255]);
    p.result=second;drawComparison(canvas,maze,second,'#4ce8c3',{playback:p});
    assert.deepEqual(canvas.context.image.context.pixels.slice(0,4),[16,30,45,255]);
    assert.deepEqual(canvas.context.image.context.pixels.slice(8,12),[34,76,96,255]);
    p.index=0;p.state='paused';drawComparison(canvas,maze,second,'#4ce8c3',{playback:p});
    assert.deepEqual(canvas.context.image.context.pixels.slice(8,12),[16,30,45,255]);
  }finally{globalThis.document=oldDocument;globalThis.devicePixelRatio=oldRatio;}
});
test('窄视图画布使用实际CSS尺寸，保证节点评分点击坐标与绘制一致',()=>{
  const oldDocument=globalThis.document,oldRatio=globalThis.devicePixelRatio;globalThis.document={createElement:fakeCanvas};globalThis.devicePixelRatio=1;
  try{const canvas=fakeCanvas();canvas.clientWidth=130;canvas.clientHeight=120;
    drawComparison(canvas,{rows:1,cols:4,walls:new Uint8Array(4),startId:0,goalId:3},null,'#4ce8c3');
    assert.equal(canvas.width,130);assert.equal(canvas.height,120);
  }finally{globalThis.document=oldDocument;globalThis.devicePixelRatio=oldRatio;}
});
test('散墙预览与缩小主图使用相同的浅色墙体，仍以实际墙体数据绘制',()=>{
  const oldDocument=globalThis.document,oldRatio=globalThis.devicePixelRatio;globalThis.document={createElement:fakeCanvas};globalThis.devicePixelRatio=1;
  try{const canvas=fakeCanvas(),maze={rows:1,cols:3,type:'scatter',walls:new Uint8Array([0,1,0]),startId:0,goalId:2};
    drawComparison(canvas,maze,null,'#4ce8c3');assert.deepEqual(canvas.context.image.context.pixels.slice(4,8),[223,234,231,255]);
    const p={index:0,state:'idle',result:null};drawMaze(canvas,maze,p,{size:1,left:0,top:0},{width:100,height:100,effects:false});assert.deepEqual(canvas.context.image.context.pixels.slice(4,8),[223,234,231,255]);
  }finally{globalThis.document=oldDocument;globalThis.devicePixelRatio=oldRatio;}
});
