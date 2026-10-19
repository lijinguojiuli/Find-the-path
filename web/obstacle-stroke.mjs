// UI-free drag geometry. Mutation, robot protection and undo belong to callers.
export class ObstacleStroke {
  constructor(grid, origin) {
    grid.requireCell(origin);
    this.grid=grid;this.blocked=!grid.isBlocked(origin);
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
