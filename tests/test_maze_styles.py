"""New geometric families retain classic contracts and real path correctness."""
from collections import deque
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import pytest
from robot_path_lab.maze import MAZE_TYPES,generate_maze,search_maze
from robot_path_lab.maze.generators import LANDSCAPE_TYPES,connect_passages


def reached(m):
    queue,seen=deque([m.start_id]),{m.start_id}
    while queue:
        cell=queue.popleft()
        x,y=cell%m.cols,cell//m.cols
        for nx,ny in ((x,y-1),(x+1,y),(x,y+1),(x-1,y)):
            other=ny*m.cols+nx
            if 0<=nx<m.cols and 0<=ny<m.rows and not m.walls[other] and other not in seen:
                seen.add(other)
                queue.append(other)
    return seen


@pytest.mark.parametrize("kind",LANDSCAPE_TYPES)
@pytest.mark.parametrize("seed",[0,42,20261018])
@pytest.mark.parametrize("size",[(11,11),(15,25),(31,45),(11,51),(51,11)])
def test_style_connectivity_reproducibility_boundary(kind,seed,size):
    m=generate_maze(*size,type=kind,seed=seed,version=8)
    assert m==generate_maze(*size,type=kind,seed=seed,version=8) and m.version==8
    seen=reached(m)
    assert m.goal_id in seen and len(seen)==m.walls.count(0)
    for y in range(m.rows):
        for x in range(m.cols):
            if x in (0,m.cols-1) or y in (0,m.rows-1):
                assert m.walls[y*m.cols+x]==(0 if (x,y) in (m.start,m.goal) else 1)


def test_styles_are_distinct_and_classic_goldens_remain_unchanged():
    assert len(MAZE_TYPES)==10
    hashes=set()
    for kind in MAZE_TYPES:
        a=generate_maze(51,75,type=kind,seed=42)
        b=generate_maze(51,75,type=kind,seed=43)
        hashes.add(sha256(a.walls).digest())
        assert a.walls!=b.walls
    assert len(hashes)==10
    expected={"corridors":"0a020f364bb4bc31196eab3fba12f85516096793dc8f6ee5bfe350d01d70a76e","branches":"6961a6544a6e43df42992b2fcf8eb3a7039a04d6f5134b9e267fb6a1049883c0","braided":"1c914ea329465dcd957b2c79dbeb6b575c7aaa9f9d0ff4ee242c4c468b399dfe"}
    for kind,digest in expected.items():
        assert sha256(generate_maze(31,45,type=kind,seed=42).walls).hexdigest()==digest


@pytest.mark.parametrize("kind",LANDSCAPE_TYPES)
def test_algorithms_on_new_geometries(kind):
    m=generate_maze(15,25,type=kind,seed=42)
    expected=search_maze(m,"bfs").total_cost
    assert expected is not None
    for algorithm in ("dijkstra","astar"):
        result=search_maze(m,algorithm)
        assert result.total_cost==expected and result.path[0]==m.start_id and result.path[-1]==m.goal_id
        assert all(not m.walls[cell] for cell in result.path)
        assert all(abs(a%m.cols-b%m.cols)+abs(a//m.cols-b//m.cols)==1 for a,b in zip(result.path,result.path[1:]))


def test_repair_keeps_passages_and_boundary():
    from robot_path_lab.maze import Maze
    walls=bytearray([1])*25
    for cell in (1,6,8,18,23):
        walls[cell]=0
    connect_passages(walls,5,5,(1,0),(3,4))
    m=Maze(5,5,walls,(1,0),(3,4))
    assert len(reached(m))==m.walls.count(0)
    assert all(not m.walls[cell] for cell in (1,6,8,18,23))
    assert all(m.walls[y*5+x] for y in range(5) for x in range(5) if (x in (0,4) or y in (0,4)) and (x,y) not in (m.start,m.goal))


def test_all_new_types_match_browser_for_seeds_and_rectangles():
    if not shutil.which("node"):
        pytest.skip("Node.js unavailable")
    script="""import{generateMaze}from'./web/maze/model.mjs';import{LANDSCAPE_INFO}from'./web/maze/generators.mjs';
const out=[];for(const type of Object.keys(LANDSCAPE_INFO))for(const seed of [0,42,20261018])for(const[rows,cols]of[[11,11],[15,25],[31,45],[11,51],[51,11]]){const m=generateMaze({rows,cols,type,seed});out.push({rows,cols,type,seed,walls:[...m.walls],start:m.start,goal:m.goal});}console.log(JSON.stringify(out));"""
    out=subprocess.run(["node","--input-type=module","-e",script],cwd=Path(__file__).resolve().parents[1],check=True,capture_output=True,encoding="utf-8")
    for row in json.loads(out.stdout):
        m=generate_maze(row['rows'],row['cols'],type=row['type'],seed=row['seed'])
        assert list(m.walls)==row['walls'],(row['type'],row['seed'],row['rows'],row['cols'])
        assert list(m.start)==row['start'] and list(m.goal)==row['goal']
