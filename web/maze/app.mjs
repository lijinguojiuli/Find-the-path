import { Maze,MAZE_TYPES,MAZE_INFO,MAZE_STYLE_ORDER,parseOptions } from './model.mjs';
import { ALGORITHMS } from './search.mjs';
import { STRATEGIES } from './trace.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { Tasks,ResultCache,MazePlayback,PairPlayback,minimapTarget,fitGeometry,compareSummaries,stageHeight,menuOffset } from './state.mjs';
import { inspectNode,pathOverlap,completedComparisons,EffectsPolicy } from './learning.mjs';
import { calculateViewport } from '../viewport.mjs';
import { drawMaze,drawComparison } from './renderer.mjs';

const $=id=>document.getElementById(id),tasks=new Tasks(),cache=new ResultCache(),quality=new EffectsPolicy();
const catalogTasks=new Tasks();let catalogWorker=null,catalogSeed=null;
const viewport=$('viewport'),canvas=$('maze-canvas'),mini=$('minimap'),miniCtx=mini.getContext('2d');
let maze=null,worker=null,playback=null,pairPlayback=null,overlap=null,version=0,scene='custom';
let dirty=true,comparisonDirty=true,layoutDirty=true,lastTime=null,lastPaint=0,lastMiniTime=0,geometry=null;
let miniBase=null,miniPixels=null,miniIndex=0,miniFinished=false,fit=true,comparing=false,inspectorId=null,studyRows=[];
let lastInspection=null,lastInspectionPaint=0;
const selected=()=>$('algorithm').value,reference=()=>$('reference').value,active=()=>comparing?pairPlayback:playback;
const rate=()=>Math.round(10**Number($('speed').value));
const intensity=()=>quality.intensity($('effects').checked,Number($('effect-level').value));
const coordinate=id=>`(${id%maze.cols}, ${Math.floor(id/maze.cols)})`;
const duration=n=>n<.01?'<0.01':n.toFixed(2);
const stateName=s=>({found:'找到路径',unreachable:'确认不可达',limited:'未完成 / 达限制'})[s]??'等待计算';
function status(message){if($('status').textContent!==message){$('status').textContent=message;layoutDirty=true;}}

const groups=new Map();
for(const [id,info] of Object.entries(ALGORITHMS)){
  const name=STRATEGIES[id][2];if(!groups.has(name)){const group=document.createElement('optgroup');group.label=name;groups.set(name,group);$('algorithm').append(group);}
  const option=document.createElement('option');option.value=id;option.textContent=info.name;groups.get(name).append(option);
}
for(const group of groups.values())$('reference').append(group.cloneNode(true));
$('algorithm').value='astar';$('reference').value='bfs';
const styleGroups=new Map(),formGroups=new Map();
for(const id of MAZE_STYLE_ORDER){
  const info=MAZE_INFO[id];
  for(const [target,groupMap,prefix]of [[$('scenario'),styleGroups,'style:'],[$('maze-type'),formGroups,'']]){
    if(!groupMap.has(info.group)){const group=document.createElement('optgroup');group.label=`随机迷宫 · ${info.group}`;groupMap.set(info.group,group);target.append(group);}
    const option=document.createElement('option');option.value=prefix+id;option.textContent=info.name;groupMap.get(info.group).append(option);
  }
}
const sceneGroup=document.createElement('optgroup');sceneGroup.label='固定教学场景';$('scenario').append(sceneGroup);
for(const [id,info] of Object.entries(SCENARIOS)){const option=document.createElement('option');option.value=id;option.textContent=info.name;sceneGroup.append(option);}
$('maze-type').value='scatter';
const recommendation=()=>maze?(SCENARIOS[scene]?.recommended??MAZE_INFO[maze.type].recommended):null;
for(const name of groups.keys()){
  const group=document.createElement('details'),summary=document.createElement('summary');summary.textContent=name;group.append(summary);
  for(const [id,info] of Object.entries(ALGORITHMS))if(STRATEGIES[id][2]===name){const card=document.createElement('div');card.className='algorithm-card';const title=document.createElement('strong');title.textContent=info.name;const rule=document.createElement('p');rule.textContent=`${STRATEGIES[id][0]} · ${info.description}`;const optimal=document.createElement('p');optimal.textContent=info.optimal?'完成且找到路径时保证最短；达到计算上限不算完成。':'不保证最短路径。';card.append(title,rule,optimal);group.append(card);}
  $('algorithm-cards').append(group);
}
function text(id,value){const el=$(id);if(el.textContent!==String(value))el.textContent=String(value);}
function note(){const info=ALGORITHMS[selected()];text('current-algorithm',info.name+' · 如何选择下一格');text('algorithm-note',info.description);}
function buttons(){
  for(const id of ['run','compare','pair','study','locate-start','locate-goal'])$(id).disabled=!maze;
  $('recommend').disabled=!recommendation();$('cancel').disabled=!tasks.active;$('cancel').hidden=!tasks.active;
  $('shuffle').disabled=!maze;$('shuffle').hidden=!!SCENARIOS[scene];
  const p=active();for(const id of ['pause','step','reset','replay','finish'])$(id).disabled=!p?.result;
  $('pause').disabled=!p?.result||p.state==='completed';
  text('pause',!p?.result?'播放':p.state==='playing'?(comparing?'同步暂停':'暂停'):p.state==='completed'?'已完成':comparing?'同步播放':'继续');
  $('explain').setAttribute('aria-expanded',String($('inspector').open));
}
function table(){
  $('results').replaceChildren();
  for(const [algorithm,info] of Object.entries(ALGORITHMS)){
    const row=document.createElement('tr');row.classList.toggle('selected',algorithm===selected());const name=document.createElement('td'),button=document.createElement('button');button.textContent=info.name;button.onclick=()=>{$('algorithm').value=algorithm;choose();};name.append(button);row.append(name);
    const s=cache.summaries.get(algorithm),values=s?[stateName(s.status),s.pathLength??'—',s.visitedCount,s.expansionCount,s.repeatExpansionCount,s.maxFrontierSize??'不适用',duration(s.elapsedMs)+(s.timingKind==='median'?' 中位数':' 单次')]:Array(7).fill('—');
    for(const value of values){const td=document.createElement('td');td.textContent=typeof value==='number'?value.toLocaleString():value;row.append(td);}
    if(s)row.title=`${s.reason||info.description}；热身 ${s.warmupCount} 次，采样 ${s.sampleCount} 次${s.timingKind==='median'?'取中位数':''}。`;
    $('results').append(row);
  }
  comparisonDirty=true;
}
function pauseAll(){for(const p of [playback,pairPlayback])if(p?.state==='playing')p.toggle();dirty=true;}
function autoplayAllowed(){return !document.hidden&&!$('styles-dialog').open&&!$('tutorial').open;}
function stopWorker(){worker?.terminate();worker=null;tasks.cancel();buttons();}
function loadPair(){
  const left=cache.get(selected()),right=cache.get(reference());if(!left||!right)return false;
  pairPlayback=new PairPlayback(maze.walls.length,rate());pairPlayback.load(left,right,autoplayAllowed());overlap=pathOverlap(left,right,maze.walls.length);inspectorId=null;dirty=comparisonDirty=true;return true;
}
function launch(kind,options){
  if(tasks.active)stopWorker();pauseAll();inspectorId=null;lastInspection=null;
  if(['pair','compare'].includes(kind)){pairPlayback=new PairPlayback(maze.walls.length,rate());overlap=null;}
  if(kind==='study'){studyRows=[];$('study-body').replaceChildren();$('study-results').hidden=false;}
  const job=tasks.begin(kind,['generate','scenario'].includes(kind)?version+1:version,selected());
  try{
    worker??=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(!tasks.accepts(data))return;
      if(data.kind==='map')adoptMap(data);
      else if(data.kind==='progress')status(`${data.scenario?SCENARIOS[data.scenario].name+' · ':''}${ALGORITHMS[data.algorithm].name}${data.sample?`：样本 ${data.sample}/${data.total}`:'：准备实测'}……`);
      else if(['measurement','result'].includes(data.kind)){
        cache.put(data.algorithm,data.result,data.summary);table();
        if(data.result&&data.algorithm===selected()){playback.load(data.result,data.kind==='result'&&!comparing&&autoplayAllowed());resetMini();}
        if(data.kind==='result')status(`${ALGORITHMS[selected()].name}：${stateName(data.result.status)}。单次计算 ${duration(data.summary.elapsedMs)} ms（含讲解记录）。${data.result.status==='limited'?data.result.reason:'可暂停或单步；多次实测请用对比实验。'}`);
      }else if(data.kind==='done'){
        loadPair();status(pairPlayback.state==='playing'?'实测完成，已自动开始同步播放。可暂停、单步或重播。':pairPlayback.state==='completed'?'实测完成，已显示最终结果。可重播或重新搜索。':'实测完成，当前保持暂停。点击「同步播放」继续，或用「单步」观察。');
      }
      else if(data.kind==='study-result'){studyRows.push(data);renderStudy();}
      else if(data.kind==='study-done')status('多场景实验完成，各场景独立统计；当前地图和播放结果保持不变。');
      else if(data.kind==='error'){$('form-error').textContent=data.error;status(`任务未完成：${data.error}。当前地图已保留。`);}
      if(['map','result','done','error','study-done'].includes(data.kind))tasks.finish(data);
      dirty=true;buttons();
    };
    worker.onerror=event=>{event.preventDefault();if(!tasks.accepts(job))return;stopWorker();status('后台任务出现错误，请重试或换较小地图；当前地图保留。');};
    worker.postMessage({...job,reference:reference(),...(['generate','scenario'].includes(kind)?{options}:{map:maze})});
    status(['generate','scenario'].includes(kind)?'正在准备地图……':kind==='search'?'正在搜索，结果就绪后立即播放……':'正在进行多次实测，可随时取消计算。');
  }catch(error){stopWorker();status(`无法启动任务：${error.message}`);}
  dirty=comparisonDirty=true;buttons();
}
function adoptMap(data){
  maze=new Maze(data.map.rows,data.map.cols,data.map);version=maze.version;scene=data.scenario??'custom';lastInspection=null;
  document.body.dataset.mazeStyle=maze.type;
  cache.clear();playback=new MazePlayback(maze.walls.length,rate());pairPlayback=new PairPlayback(maze.walls.length,rate());overlap=null;geometry=null;inspectorId=null;
  studyRows=[];$('study-results').hidden=true;$('study-body').replaceChildren();
  $('scenario').value=SCENARIOS[scene]?scene:`style:${maze.type}`;$('scenario-question').textContent=SCENARIOS[scene]?.question??MAZE_INFO[maze.type].description;
  if(SCENARIOS[scene]){[$('algorithm').value,$('reference').value]=SCENARIOS[scene].recommended;note();}
  const label=`${maze.rows}×${maze.cols} · ${SCENARIOS[scene]?.name??MAZE_TYPES[maze.type]}`;
  $('map-title').textContent=label;$('map-meta').textContent=`种子 ${maze.seed} · ${maze.walls.length.toLocaleString()} 格`;$('settings-label').textContent=label;$('compact-meta').textContent=`${maze.rows}×${maze.cols}`;
  $('settings').open=false;$('generation-time').textContent=`生成 ${duration(data.generationMs)} ms。点击小地图定位；白框为当前视图。`;
  $('rows').value=maze.rows;$('cols').value=maze.cols;$('seed').value=maze.seed;$('maze-type').value=maze.type;
  buildMini();viewport.scrollLeft=viewport.scrollTop=0;table();layoutDirty=true;
  status('地图就绪。点击开始搜索，或按推荐组合进行同步对比。');
}
function formOptions(){return {rows:$('rows').value,cols:$('cols').value,seed:$('seed').value,type:$('maze-type').value};}
function generate(options){try{const parsed=parseOptions(options);$('form-error').textContent='';launch('generate',parsed);}catch(error){$('form-error').textContent=error.message;layoutDirty=true;}}
function example(){launch('scenario',{scenario:'loops'});}
function chooseStyle(type,seed=maze?.seed??20261018){
  $('rows').value=maze?.rows??15;$('cols').value=maze?.cols??25;$('seed').value=seed;$('maze-type').value=type;
  generate(formOptions());
}
function stopCatalog(){catalogWorker?.terminate();catalogWorker=null;catalogTasks.cancel();}
function closeCatalog(){if($('styles-dialog').open)$('styles-dialog').close();stopCatalog();dirty=true;}
function openCatalog(){
  pauseAll();stopCatalog();dirty=true;
  if(!$('styles-dialog').open)$('styles-dialog').showModal();
  const seed=maze?.seed??20261018;if(catalogSeed===seed&&$('styles-grid').childElementCount===10)return;
  catalogSeed=null;$('styles-grid').replaceChildren();$('styles-note').textContent='正在准备十种风格预览……';
  const job=catalogTasks.begin('catalog',0);
  try{
    catalogWorker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    catalogWorker.onmessage=({data})=>{
      if(!catalogTasks.accepts(data))return;
      if(data.kind==='preview'){
        const map=new Maze(data.map.rows,data.map.cols,data.map),info=MAZE_INFO[map.type],card=document.createElement('button');card.className='style-card';card.dataset.style=map.type;
        const preview=document.createElement('canvas');preview.setAttribute('role','img');preview.setAttribute('aria-label',`${info.name}预览`);
        const title=document.createElement('strong');title.textContent=info.name;const group=document.createElement('span');group.className='style-group';group.textContent=info.group;
        const description=document.createElement('span');description.textContent=info.description;card.append(preview,title,group,description);card.onclick=()=>{closeCatalog();chooseStyle(map.type,seed);};
        $('styles-grid').append(card);drawComparison(preview,map,null,'#4ce8c3');
      }else if(data.kind==='catalog-done'){
        $('styles-note').textContent=`十种预览均为 31×45、种子 ${seed}。选择后使用当前地图尺寸；「换一张」会更换种子。弯墙仍按四方向网格判定。`;
        catalogSeed=seed;catalogTasks.finish(data);catalogWorker?.terminate();catalogWorker=null;
      }else if(data.kind==='error'){$('styles-note').textContent=`预览未完成：${data.error}`;stopCatalog();}
    };
    catalogWorker.onerror=event=>{event.preventDefault();if(!catalogTasks.accepts(job))return;$('styles-note').textContent='风格预览暂时未完成，请关闭后重试。';stopCatalog();};
    catalogWorker.postMessage({...job,options:{seed}});
  }catch(error){$('styles-note').textContent=`无法准备预览：${error.message}`;stopCatalog();}
}
function choose(){
  note();if(!maze)return;if(comparing){table();launch('pair');return;}
  if(tasks.active)stopWorker();pauseAll();inspectorId=null;lastInspection=null;playback=new MazePlayback(maze.walls.length,rate());resetMini();const result=cache.get(selected());
  if(result){playback.load(result,autoplayAllowed());status('正在重播缓存结果；地图与实测统计保持相同。');}else launch('search');table();buttons();dirty=true;
}
function setFit(value){fit=value;document.body.classList.toggle('fit',fit);$('fit').textContent=fit?'完整地图 ✓':'放大查看';$('fit').setAttribute('aria-pressed',String(fit));if(fit)viewport.scrollLeft=viewport.scrollTop=0;dirty=true;}
function view(){return fit?fitGeometry(maze.rows,maze.cols,Math.max(1,viewport.clientWidth),Math.max(1,viewport.clientHeight),Number($('zoom').value)):calculateViewport({rows:maze.rows,cols:maze.cols,width:Math.max(1,viewport.clientWidth),height:Math.max(1,viewport.clientHeight),cellSize:Number($('zoom').value),scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop});}
function locate(cell){if(!maze)return;if(fit)setFit(false);const g=view();viewport.scrollLeft=g.left+viewport.scrollLeft+(cell[0]+.5)*g.size-viewport.clientWidth/2;viewport.scrollTop=g.top+viewport.scrollTop+(cell[1]+.5)*g.size-viewport.clientHeight/2;dirty=true;}
function sizeStage(){
  const element=comparing?$('compare-stage'):viewport;
  const bottom=[$('playbar'),$('viewbar'),$('status'),$('progress-track'),$('playback-progress'),...(!comparing?[$('legend')]:[])].reduce((sum,el)=>sum+el.getBoundingClientRect().height,0);
  const height=stageHeight(innerHeight,element.getBoundingClientRect().top,bottom,scrollY);
  if(element.style.height!==`${height}px`)element.style.height=`${height}px`;
  if(comparing){const canvasHeight=Math.max(120,Math.min(260,height-160));for(const id of ['left-map','right-map'])$(id).style.height=`${canvasHeight}px`;}
  layoutDirty=false;dirty=comparisonDirty=true;
}
function paintSingle(time){
  if(!maze)return;geometry=view();const g=geometry;$('spacer').style.width=`${g.contentWidth}px`;$('spacer').style.height=`${g.contentHeight}px`;
  drawMaze(canvas,maze,playback,g,{width:viewport.clientWidth,height:viewport.clientHeight,time,effects:intensity()>0,intensity:intensity(),highlight:inspectorId});
  $('zoom-label').textContent=fit?`自动 ${g.size.toFixed(1)} px`:`${g.size} 像素`;
}
function mode(value,run=true){
  if(value!==comparing){pauseAll();if(tasks.active&&['pair','compare','study'].includes(tasks.active.kind))stopWorker();}
  comparing=value;document.body.classList.toggle('comparing',value);$('explore-stage').hidden=value;$('compare-stage').hidden=!value;
  for(const [id,isActive] of [['mode-explore',!value],['mode-compare',value]]){$(id).classList.toggle('active',isActive);$(id).setAttribute('aria-pressed',String(isActive));}
  if(value&&run&&maze){if(!loadPair())launch('pair');}
  inspectorId=null;layoutDirty=dirty=comparisonDirty=true;buttons();
}
function renderBars(){
  const metric=$('bar-metric').value,groups=completedComparisons([...cache.summaries.values()]),values=groups.eligible.filter(s=>s[metric]!==null),max=Math.max(1,...values.map(s=>s[metric]??0));$('differences').replaceChildren();
  for(const s of groups.eligible){const row=document.createElement('div');row.className='bar-row';const name=document.createElement('span');name.textContent=ALGORITHMS[s.algorithm].name;const track=document.createElement('span');track.className='bar-track';const fill=document.createElement('i');fill.style.width=`${s[metric]===null?0:(s[metric]??0)/max*100}%`;track.append(fill);const number=document.createElement('span');number.textContent=s[metric]===null?'不适用':(s[metric]??0).toLocaleString();row.append(name,track,number);$('differences').append(row);}
  $('excluded-results').textContent=groups.excluded.map(s=>`${ALGORITHMS[s.algorithm].name}：${stateName(s.status)}${s.reason?'（'+s.reason+'）':''}；单独列出，不参加完整路径比较。`).join('\n');
}
function paintPair(time,refresh){
  if(!maze)return;const a=selected(),b=reference(),left=cache.summaries.get(a),right=cache.summaries.get(b),lp=pairPlayback.left,rp=pairPlayback.right;
  if(refresh){
    $('left-name').textContent=ALGORITHMS[a].name;$('right-name').textContent=ALGORITHMS[b].name;
    const d=compareSummaries(left,right);$('difference-summary').textContent=!d.ready?'正在计算同图对照……':d.comparable?`路线${d.pathDelta===0?'同样长':`相差 ${Math.abs(d.pathDelta)} 步，${d.pathDelta>0?ALGORITHMS[b].name:ALGORITHMS[a].name} 更短`}；${ALGORITHMS[a].name} ${d.visitedDelta<=0?'少':'多'}探索 ${Math.abs(d.visitedDelta)} 个格子。`:'本次有算法未返回路径；请区分计算上限、舍弃分支和确认不可达。';
    $('strategy-summary').textContent=`${ALGORITHMS[a].name}：${ALGORITHMS[a].description} ${ALGORITHMS[b].name}：${ALGORITHMS[b].description}`;renderBars();
  }
  const stats=(s,p)=>!s?'等待计算':`${stateName(s.status)}${s.found?` · 最终 ${s.pathLength} 步`:''}\n扩展 ${s.expansionCount} 次 / 重复 ${s.repeatExpansionCount} 次\n播放 ${p.index}/${p.result?.visitedCount??0} 格 · ${s.timingKind==='median'?'中位数':'单次'} ${duration(s.elapsedMs)} ms`;
  text('left-stats',stats(left,lp));text('right-stats',stats(right,rp));
  const common=$('common-paths').checked&&pairPlayback.state==='completed'?overlap:null;
  drawComparison($('left-map'),maze,lp.result,'#4ce8c3',{playback:lp,overlap:common,time,intensity:intensity()});
  drawComparison($('right-map'),maze,rp.result,'#ff8b98',{playback:rp,overlap:common,time,intensity:intensity()});
  $('common-stats').textContent=common?.available?`共同 ${common.shared} 段 · 左独有 ${common.leftOnly} 段 · 右独有 ${common.rightOnly} 段`:pairPlayback.state==='completed'?'本次没有同时找到两条路径，不能比较共同路段。':'两边播放完成后显示共同与独有路段。';
}
function inspector(force=false){
  if(!$('inspector').open||!maze)return;
  const p=comparing?($('inspect-side').value==='right'?pairPlayback.right:pairPlayback.left):playback;
  const id=inspectorId??(p?.index?p.result.visitedOrder[p.index-1]:null),now=performance.now();
  if(!force&&lastInspection?.result===p?.result&&lastInspection?.id===id&&lastInspection?.index===p?.index)return;
  if(!force&&p?.state==='playing'&&now-lastInspectionPaint<80)return;
  lastInspection={result:p?.result,id,index:p?.index};lastInspectionPaint=now;
  const detail=inspectNode(maze,p?.result,id,p?.index??0);
  $('inspect-node').textContent=id===null?'—':coordinate(id);
  for(const [element,key] of [['inspect-g','g'],['inspect-h','h'],['inspect-f','f'],['inspect-frontier','frontierSize']])$(element).textContent=detail?.[key]??'—';
  $('frontier-preview').replaceChildren();
  if(!detail||detail.pending||detail.wall||detail.pathOnly){$('inspect-rule').textContent=detail?.message??'点击播放或单步，观察本步选择。';$('inspect-note').textContent='g 为首次扩展时的已走成本；仅 A* 家族使用 f。';return;}
  if(detail.structure==='全图扫描')$('inspect-frontier').textContent='不适用';
  $('inspect-rule').textContent=`${detail.side===2?'终点侧，g 从终点累计。':''}${detail.structure}：${detail.rule}。本步取出 ${coordinate(id)}${detail.priority===null?'':`，排序值 ${detail.priority}`}。`;
  for(const candidate of detail.candidates){const item=document.createElement('li');item.textContent=coordinate(candidate);$('frontier-preview').append(item);}
  $('inspect-note').textContent=detail.snapshotAvailable?(detail.structure==='深度栈'?'栈祖先预览，从栈顶向下。':detail.structure==='全图扫描'?'此算法扫描全图，不使用候选队列。':'取出本节点后、扩展邻居前的容器预览，最多 6 格。'):'详细容器快照只保留前 512 个新探索格子；评分数据仍来自真实首次扩展。';
}
function inspectClick(event,element,side){
  if(!maze)return;const rect=element.getBoundingClientRect();let g;
  if(side){const w=element.clientWidth,h=element.clientHeight,size=Math.min((w-16)/maze.cols,(h-16)/maze.rows);g={size,left:(w-maze.cols*size)/2,top:(h-maze.rows*size)/2};$('inspect-side').value=side;}
  else g=geometry;
  if(!g)return;const x=Math.floor((event.clientX-rect.left-g.left)/g.size),y=Math.floor((event.clientY-rect.top-g.top)/g.size);
  if(x<0||x>=maze.cols||y<0||y>=maze.rows)return;inspectorId=y*maze.cols+x;$('inspector').open=true;dirty=true;inspector(true);
}
function renderStudy(){
  $('study-body').replaceChildren();for(const row of studyRows){const tr=document.createElement('tr'),s=row.summary;for(const text of [SCENARIOS[row.scenario].name,ALGORITHMS[s.algorithm].name,stateName(s.status),s.pathLength??'—',s.expansionCount,duration(s.elapsedMs)]){const td=document.createElement('td');td.textContent=String(text);tr.append(td);}$('study-body').append(tr);}
}
function playbackLabels(){
  const p=active(),total=comparing?p?.total??0:p?.result?.visitedCount??0,index=p?.index??0;
  $('progress-fill').style.width=`${total?index/total*100:0}%`;
  const text={idle:'等待搜索',paused:'已暂停',playing:'播放中',completed:'播放完成'}[p?.state??'idle'];
  const progress=comparing?`${text} · 同步步 ${index}/${total} · 左 ${pairPlayback?.left.index??0} 格 / 右 ${pairPlayback?.right.index??0} 格`:`${text} · 已展示 ${index}/${total} 个首次探索格子${p?.state==='completed'&&p.result?.status==='limited'?' · 达限制不代表不可达':''}`;
  if($('playback-progress').textContent!==progress)$('playback-progress').textContent=progress;
}
function buildMini(){
  mini.width=Math.min(320,maze.cols);mini.height=Math.max(1,Math.round(mini.width*maze.rows/maze.cols));if(mini.height>320){mini.height=320;mini.width=Math.max(1,Math.round(320*maze.cols/maze.rows));}
  const counts=new Uint32Array(mini.width*mini.height),totals=new Uint32Array(counts.length);for(let id=0;id<maze.walls.length;id++){const p=Math.floor(Math.floor(id/maze.cols)*mini.height/maze.rows)*mini.width+Math.floor(id%maze.cols*mini.width/maze.cols);totals[p]++;if(!maze.walls[id])counts[p]++;}
  const wallRGB=maze.type==='scatter'?[223,234,231]:[40,62,85];
  miniBase=miniCtx.createImageData(mini.width,mini.height);for(let p=0;p<counts.length;p++){const open=counts[p]/Math.max(1,totals[p]);for(let c=0;c<3;c++)miniBase.data[p*4+c]=Math.round(wallRGB[c]+open*([16,30,45][c]-wallRGB[c]));miniBase.data[p*4+3]=255;}resetMini();
}
function resetMini(){if(!miniBase)return;miniPixels=new ImageData(new Uint8ClampedArray(miniBase.data),mini.width,mini.height);miniIndex=0;miniFinished=false;dirty=true;}
function miniPixel(id,rgb){const x=Math.floor(id%maze.cols*mini.width/maze.cols),y=Math.floor(Math.floor(id/maze.cols)*mini.height/maze.rows);miniPixels.data.set(rgb,(y*mini.width+x)*4);}
function drawMini(){
  if(!maze||!miniPixels)return;if(playback.index<miniIndex)resetMini();for(;miniIndex<playback.index;miniIndex++)miniPixel(playback.result.visitedOrder[miniIndex],playback.result.visitedSides[miniIndex]===2?[106,79,145,255]:[35,109,137,255]);
  if(playback.state==='completed'&&!miniFinished){for(const id of playback.result.path)miniPixel(id,[255,199,107,255]);miniFinished=true;}miniCtx.putImageData(miniPixels,0,0);
  const sx=mini.width/maze.cols,sy=mini.height/maze.rows;for(const[cell,color]of [[maze.start,'#4ce8c3'],[maze.goal,'#ff8b98']]){miniCtx.fillStyle=color;miniCtx.fillRect(cell[0]*sx-2,cell[1]*sy-2,5,5);}
  const g=comparing?{firstCol:0,firstRow:0,lastCol:maze.cols,lastRow:maze.rows}:geometry;if(g){miniCtx.strokeStyle='white';miniCtx.lineWidth=2;miniCtx.strokeRect(g.firstCol*sx+.5,g.firstRow*sy+.5,Math.max(2,(g.lastCol-g.firstCol)*sx-1),Math.max(2,(g.lastRow-g.firstRow)*sy-1));}
}
function frame(time){
  const dt=lastTime===null?0:Math.min(.1,(time-lastTime)/1000);lastTime=time;const p=active(),before=p?.index,beforeState=p?.state;p?.update(dt);if(p?.index!==before||p?.state!==beforeState)dirty=true;
  if(layoutDirty)sizeStage();const animate=intensity()>0&&p?.result&&['playing','completed'].includes(p.state)&&!document.hidden;
  if(dirty||comparisonDirty||(animate&&time-lastPaint>=(quality.reduced?66:33))){const start=performance.now();if(comparing)paintPair(time,comparisonDirty);else paintSingle(time);if(dirty||comparisonDirty){playbackLabels();buttons();inspector();}quality.observe(performance.now()-start);text('effect-quality',quality.reduced?'已自动降低光效，保持操作响应':'自动性能调节 · 强度 '+$('effect-level').value+'%');dirty=comparisonDirty=false;lastPaint=time;}
  if(time-lastMiniTime>120){const r=mini.getBoundingClientRect();if(r.width&&r.top<innerHeight&&r.bottom>0)drawMini();lastMiniTime=time;}requestAnimationFrame(frame);
}

$('generate-form').noValidate=true;$('generate-form').onsubmit=e=>{e.preventDefault();generate(formOptions());};
$('preset').onchange=()=>{if($('preset').value==='compact'){$('rows').value=15;$('cols').value=25;}else if($('preset').value!=='custom')$('rows').value=$('cols').value=$('preset').value;};
for(const id of ['rows','cols'])$(id).oninput=()=>{$('preset').value='custom';};
$('random').onclick=()=>{const v=new Uint32Array(1);crypto.getRandomValues(v);$('seed').value=v[0];generate(formOptions());};$('example').onclick=example;
$('scenario').onchange=()=>{const value=$('scenario').value;if(value.startsWith('style:'))chooseStyle(value.slice(6));else if(SCENARIOS[value]){$('form-error').textContent='';launch('scenario',{scenario:value});}else{if(document.body.classList.contains('large'))large();$('settings').open=true;layoutDirty=true;}};
$('recommend').onclick=()=>{const pair=recommendation();if(!pair)return;[$('algorithm').value,$('reference').value]=pair;mode(true,false);launch('pair');};
$('shuffle').onclick=()=>{if(!maze)return;const values=new Uint32Array(1);crypto.getRandomValues(values);chooseStyle(maze.type,values[0]);};
$('style-gallery').onclick=openCatalog;$('styles-close').onclick=closeCatalog;$('styles-dialog').addEventListener('close',stopCatalog);
$('algorithm').onchange=choose;$('reference').onchange=()=>{if(maze&&comparing)launch('pair');};
$('run').onclick=()=>{if(!maze)return;if(comparing)launch('pair');else{playback=new MazePlayback(maze.walls.length,rate());resetMini();launch('search');}};
$('pair').onclick=()=>{if(maze)launch('pair');};$('compare').onclick=()=>{if(maze){mode(true,false);launch('compare');}};
$('study').onclick=()=>{if(maze){mode(true,false);launch('study');}};
$('cancel').onclick=()=>{stopWorker();status('已取消计算。当前地图、已完成统计和实验记录保留。');dirty=true;};
$('mode-explore').onclick=()=>mode(false);$('mode-compare').onclick=()=>mode(true);
$('pause').onclick=()=>{active()?.toggle();dirty=true;};$('step').onclick=()=>{inspectorId=null;active()?.step();dirty=true;};
$('reset').onclick=()=>{active()?.rewind();inspectorId=null;resetMini();dirty=true;};$('replay').onclick=()=>{active()?.rewind(true);inspectorId=null;resetMini();dirty=true;};$('finish').onclick=()=>{active()?.finish();dirty=true;};
$('speed').oninput=()=>{for(const p of [playback,pairPlayback])if(p)p.rate=rate();$('speed-label').textContent=`${rate().toLocaleString()} 格/秒`;};$('speed').oninput();
$('fit').onclick=()=>setFit(!fit);$('zoom').oninput=()=>{dirty=true;};$('locate-start').onclick=()=>locate(maze.start);$('locate-goal').onclick=()=>locate(maze.goal);
$('effects').onchange=$('effect-level').oninput=()=>{dirty=true;};if(matchMedia('(prefers-reduced-motion: reduce)').matches)$('effects').checked=false;
$('common-paths').onchange=()=>{dirty=true;};$('bar-metric').onchange=()=>{comparisonDirty=true;};
$('explain').onclick=()=>{$('inspector').open=!$('inspector').open;layoutDirty=dirty=true;};$('inspect-side').onchange=()=>{inspectorId=null;dirty=true;};
canvas.onclick=e=>inspectClick(e,canvas,null);$('left-map').onclick=e=>inspectClick(e,$('left-map'),'left');$('right-map').onclick=e=>inspectClick(e,$('right-map'),'right');
for(const id of ['maze-canvas','left-map','right-map'])$(id).onkeydown=e=>{if(e.key==='Enter'){$('inspect-side').value=id==='right-map'?'right':'left';inspectorId=null;$('inspector').open=true;layoutDirty=dirty=true;e.preventDefault();}};
viewport.addEventListener('scroll',()=>{dirty=true;},{passive:true});viewport.addEventListener('wheel',e=>{if(e.shiftKey){e.preventDefault();viewport.scrollLeft+=e.deltaY||e.deltaX;dirty=true;}},{passive:false});
const resize=new ResizeObserver(()=>{layoutDirty=dirty=comparisonDirty=true;});for(const id of ['controls','playbar','viewbar','inspector','legend','status','scenario-question'])resize.observe($(id));window.addEventListener('resize',()=>{layoutDirty=dirty=comparisonDirty=true;});
function positionMenu(menu){const panel=menu.querySelector('.menu-content');panel.style.left='0px';panel.style.right='auto';const r=panel.getBoundingClientRect();panel.style.left=`${menuOffset(r.left,r.width,document.documentElement.clientWidth)}px`;}
for(const menu of document.querySelectorAll('.menu'))menu.addEventListener('toggle',()=>{if(menu.open)positionMenu(menu);});
window.addEventListener('resize',()=>{for(const menu of document.querySelectorAll('.menu[open]'))positionMenu(menu);});
for(const id of ['settings','inspector'])$(id).addEventListener('toggle',()=>{layoutDirty=dirty=true;});
mini.onclick=e=>{if(maze){const r=mini.getBoundingClientRect();locate(minimapTarget(e.clientX-r.left,e.clientY-r.top,r.width,r.height,maze));}};
mini.onkeydown=e=>{if(e.key==='Enter'&&maze){locate(maze.goal);e.preventDefault();}if(e.key==='Home'&&maze){locate(maze.start);e.preventDefault();}};
function large(){const enabled=document.body.classList.toggle('large');$('large').setAttribute('aria-pressed',String(enabled));$('large').textContent=enabled?'退出大屏 F':'大屏模式 F';layoutDirty=dirty=true;}
function help(){pauseAll();if(!$('tutorial').open)$('tutorial').showModal();}
function closeHelp(){$('tutorial').close();try{localStorage.setItem('maze-tutorial-seen-v2','1');}catch{/* optional storage */}}
$('large').onclick=large;$('help').onclick=help;$('close-help').onclick=closeHelp;$('tutorial-example').onclick=()=>{closeHelp();example();};$('keep-map').onclick=closeHelp;
$('tutorial').addEventListener('cancel',()=>{try{localStorage.setItem('maze-tutorial-seen-v2','1');}catch{/* optional */}});
document.addEventListener('click',event=>{const menu=event.target.closest('.menu');for(const open of document.querySelectorAll('.menu[open]'))if(open!==menu||event.target.closest('button'))open.open=false;if(!event.target.closest('#settings'))$('settings').open=false;});
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey||$('styles-dialog').open)return;if(e.key==='Escape'&&!$('tutorial').open&&document.body.classList.contains('large'))large();if($('tutorial').open)return;if(e.key.toLowerCase()==='f'){large();e.preventDefault();}if(e.key.toLowerCase()==='h')help();if(e.code==='Space'&&e.target===document.body){active()?.toggle();e.preventDefault();dirty=true;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAll();lastTime=null;dirty=true;});window.addEventListener('pagehide',()=>{stopWorker();stopCatalog();});
note();table();buttons();generate(formOptions());requestAnimationFrame(frame);
try{if(!localStorage.getItem('maze-tutorial-seen-v2')||new URLSearchParams(location.search).get('tutorial')==='1')help();}catch{help();}
