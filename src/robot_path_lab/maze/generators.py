"""Geometric generators with deterministic integer rasterization and repair."""
from array import array

LANDSCAPE_TYPES = ("scatter", "rooms", "cave", "division", "spiral", "gates", "random")


def connect_passages(walls, rows, cols, start, goal):
    """Join open components by merging multi-source wavefronts through walls."""
    n = len(walls)
    labels, queue = array("i", [-1])*n, array("I", [0])*n
    def neighbors(cell):
        x, y = cell % cols, cell // cols
        if y:
            yield cell-cols
        if x < cols-1:
            yield cell+1
        if y < rows-1:
            yield cell+cols
        if x:
            yield cell-1
    components = 0
    for cell in range(n):
        if walls[cell] or labels[cell] >= 0:
            continue
        head, tail = 0, 1
        queue[0], labels[cell] = cell, components
        while head < tail:
            current = queue[head]
            head += 1
            for other in neighbors(current):
                if not walls[other] and labels[other] < 0:
                    labels[other] = components
                    queue[tail] = other
                    tail += 1
        components += 1
    if components < 2:
        return
    roots, rank, parent = array("i", range(components)), bytearray(components), array("i", [-1])*n
    def find(cell):
        while roots[cell] != cell:
            roots[cell] = roots[roots[cell]]
            cell = roots[cell]
        return cell
    def dig(cell):
        while walls[cell]:
            walls[cell] = 0
            cell = parent[cell]
    head, tail = 0, 0
    for cell in range(n):
        if not walls[cell]:
            queue[tail] = cell
            tail += 1
    endpoints = (start[1]*cols+start[0], goal[1]*cols+goal[0])
    while head < tail and components > 1:
        current = queue[head]
        head += 1
        for other in neighbors(current):
            x, y = other % cols, other // cols
            if (x in (0, cols-1) or y in (0, rows-1)) and other not in endpoints:
                continue
            if labels[other] < 0:
                labels[other], parent[other] = labels[current], current
                queue[tail] = other
                tail += 1
            else:
                a, b = find(labels[current]), find(labels[other])
                if a == b:
                    continue
                if rank[a] < rank[b]:
                    a, b = b, a
                roots[b] = a
                if rank[a] == rank[b]:
                    rank[a] += 1
                components -= 1
                dig(current)
                dig(other)


def generate_landscape(rows, cols, kind, random):
    n, size = rows*cols, min(rows, cols)
    walls, start, goal = bytearray(n), (1, 0), (cols-2, rows-1)
    def clamp(value, low, high):
        return max(low, min(high, value))
    def paint(x, y, value=1, radius=0):
        for yy in range(max(1, y-radius), min(rows-2, y+radius)+1):
            for xx in range(max(1, x-radius), min(cols-2, x+radius)+1):
                walls[yy*cols+xx] = value
    def line(x0, y0, x1, y1, value=1, radius=0):
        dx, dy, sx, sy = abs(x1-x0), abs(y1-y0), 1 if x0 < x1 else -1, 1 if y0 < y1 else -1
        error = dx-dy
        while True:
            paint(x0, y0, value, radius)
            if x0 == x1 and y0 == y1:
                break
            doubled, old_y, moved_x = error*2, y0, False
            if doubled > -dy:
                error -= dy
                x0 += sx
                moved_x = True
            if doubled < dx:
                error += dx
                y0 += sy
                if moved_x:
                    paint(x0, old_y, value, radius)
    if kind == "scatter":
        radius, count = size//120, max(6, min(20, size//4))
        for _ in range(count):
            x0, y0 = 2+random()%(cols-4), 2+random()%(rows-4)
            x2 = clamp(x0+(2+random()%max(2, cols//3))*(1 if random()%2 else -1), 1, cols-2)
            y2 = clamp(y0+(2+random()%max(2, rows//3))*(1 if random()%2 else -1), 1, rows-2)
            cx = clamp((x0+x2)//2+random()%max(3, cols//4)-cols//8, 1, cols-2)
            cy = clamp((y0+y2)//2+random()%max(3, rows//4)-rows//8, 1, rows-2)
            px, py = x0, y0
            for t in range(1, 33):
                a = 32-t
                x, y = (a*a*x0+2*a*t*cx+t*t*x2+512)//1024, (a*a*y0+2*a*t*cy+t*t*y2+512)//1024
                line(px, py, x, y, 1, radius)
                px, py = x, y
    elif kind == "rooms":
        walls[:] = bytes([1])*n
        tile, centers = max(7, min(31, size//3)), [(1, 1)]
        for y in range(1, rows-2, tile):
            for x in range(1, cols-2, tile):
                end_x, end_y = min(cols-2, x+tile-2), min(rows-2, y+tile-2)
                if end_x-x < 2 or end_y-y < 2:
                    continue
                left, top = x+random()%2, y+random()%2
                if end_x-left < 2 or end_y-top < 2:
                    continue
                width, height = 3+random()%max(1, end_x-left-1), 3+random()%max(1, end_y-top-1)
                for yy in range(top, top+height):
                    walls[yy*cols+left:yy*cols+left+width] = bytes(width)
                centers.append((left+width//2, top+height//2))
        centers.append((cols-2, rows-2))
        for (a,b),(c,d) in zip(centers,centers[1:]):
            if random()%2:
                line(a,b,c,b,0)
                line(c,b,c,d,0)
            else:
                line(a,b,a,d,0)
                line(a,d,c,d,0)
    elif kind == "cave":
        walls[:] = bytes([1])*n
        for y in range(1, rows-1):
            for x in range(1, cols-1):
                walls[y*cols+x] = int(random()%100 < 45)
        previous, next_map = walls[:], bytearray([1])*n
        for _ in range(4):
            for y in range(1, rows-1):
                for x in range(1, cols-1):
                    blocked = sum(previous[(y+dy)*cols+x+dx] for dy in (-1,0,1) for dx in (-1,0,1) if dx or dy)
                    next_map[y*cols+x] = 1 if blocked > 4 else 0 if blocked < 4 else previous[y*cols+x]
            previous, next_map = next_map, previous
        walls[:] = previous
    elif kind == "division":
        stack = [(1,1,cols-2,rows-2)]
        while stack:
            x0,y0,x1,y1 = stack.pop()
            width,height = x1-x0+1,y1-y0+1
            if width < 5 or height < 5:
                continue
            vertical = width > height or (width == height and random()%2 == 0)
            if vertical:
                x,door = x0+1+2*(random()%((width-1)//2)), y0+2*(random()%((height+1)//2))
                for y in range(y0,y1+1):
                    walls[y*cols+x] = int(y != door)
                stack.extend(((x0,y0,x-1,y1),(x+1,y0,x1,y1)))
            else:
                y,door = y0+1+2*(random()%((height-1)//2)), x0+2*(random()%((width+1)//2))
                for x in range(x0,x1+1):
                    walls[y*cols+x] = int(x != door)
                stack.extend(((x0,y0,x1,y-1),(x0,y+1,x1,y1)))
    elif kind == "spiral":
        walls[:] = bytes([1])*n
        xs,ys = [1],[1]
        while xs[-1]+3 < cols-1:
            xs.append(xs[-1]+2+random()%2)
        while ys[-1]+3 < rows-1:
            ys.append(ys[-1]+2+random()%2)
        transpose = bool(random()%2)
        width,height = (len(ys),len(xs)) if transpose else (len(xs),len(ys))
        left,right,top,bottom,order = 0,width-1,0,height-1,[]
        def add(x,y):
            order.append((xs[y],ys[x]) if transpose else (xs[x],ys[y]))
        while left <= right and top <= bottom:
            for x in range(left,right+1):
                add(x,top)
            for y in range(top+1,bottom+1):
                add(right,y)
            if top < bottom:
                for x in range(right-1,left-1,-1):
                    add(x,bottom)
            if left < right:
                for y in range(bottom-1,top,-1):
                    add(left,y)
            left,right,top,bottom = left+1,right-1,top+1,bottom-1
        for a,b in zip(order,order[1:]):
            line(*a,*b,0)
        goal = order[-1]
    elif kind == "gates":
        vertical = bool(random()%2)
        extent,span = (cols,rows) if vertical else (rows,cols)
        spacing,gap = max(3,extent//8),max(1,span//12)
        for index,p in enumerate(range(3,extent-2,spacing)):
            offset = random()%max(1,span//6)
            door = 1+offset if index%2 else span-1-gap-offset
            for v in range(1,span-1):
                if v < door or v >= door+gap:
                    walls[v*cols+p if vertical else p*cols+v] = 1
    elif kind == "random":
        block = max(1,size//40)
        for y in range(1,rows-1,block):
            for x in range(1,cols-1,block):
                if random()%100 < 23:
                    for yy in range(y,min(rows-1,y+block)):
                        walls[yy*cols+x:yy*cols+min(cols-1,x+block)] = bytes([1])*min(block,cols-1-x)
    else:
        raise ValueError("未知迷宫类型。")
    for x in range(cols):
        walls[x] = walls[(rows-1)*cols+x] = 1
    for y in range(rows):
        walls[y*cols] = walls[y*cols+cols-1] = 1
    walls[start[1]*cols+start[0]] = walls[cols+1] = walls[goal[1]*cols+goal[0]] = 0
    if kind != "spiral":
        walls[(rows-2)*cols+cols-2] = 0
    connect_passages(walls,rows,cols,start,goal)
    return walls,start,goal
