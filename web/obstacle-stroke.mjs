// Shared UI-free brush geometry; mutation, robot protection and undo stay outside.
import {MODES} from './model.mjs';
export const PAINT_MODES=Object.freeze([MODES.obstacle,MODES.terrain,MODES.plain]);
export class PaintStroke {
  constructor(grid, origin, mode=MODES.obstacle) {
    if(!PAINT_MODES.includes(mode))throw new Error('此工具不支持连续涂抹。');
    grid.requireCell(origin);
    this.grid=grid;this.mode=mode;this.blocked=mode===MODES.obstacle?!grid.isBlocked(origin):null;
    this.seen=new Set();this.previous=null;this.active=true;
  }
  visit(cell) {
    if(!this.active)return [];
    if(!this.grid.inBounds(cell)){this.previous=null;return [];}
    const cells=[],add=(x,y)=>{const id=y*this.grid.cols+x;if(!this.seen.has(id)){this.seen.add(id);cells.push([x,y]);}};
    let [x,y]=this.previous??cell;const [endX,endY]=cell;
    const dx=Math.abs(endX-x),dy=Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;let error=dx-dy;
    while(true){
      add(x,y);if(x===endX&&y===endY)break;
      const doubled=error*2,oldY=y;let movedX=false;
      if(doubled>-dy){error-=dy;x+=sx;movedX=true;}
      if(doubled<dx){error+=dx;y+=sy;if(movedX)add(x,oldY);}
    }
    this.previous=[...cell];return cells;
  }
  end(){this.active=false;this.previous=null;}
}
// Preserve the obstacle-specific API and all previous stroke regression tests.
export class ObstacleStroke extends PaintStroke {
  constructor(grid,origin){super(grid,origin,MODES.obstacle);}
}
