"""Path invariants, optimality against an independent BFS, and browser parity."""
from collections import deque
import json
from pathlib import Path
import random
import shutil
import subprocess

import pytest

from robot_path_lab.maze import ALGORITHMS, OPTIMAL, Maze, generate_maze, iter_search, search_maze

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "maze-cases.json").read_text(encoding="utf-8"))


def fixture_maze(case):
    return Maze(len(case["cells"]), len(case["cells"][0]), bytes(c == "#" for row in case["cells"] for c in row),
                tuple(case["start"]), tuple(case["goal"]))


def reference(m):
    queue, seen = deque([(*m.start, 0)]), {m.start}
    while queue:
        x, y, distance = queue.popleft()
        if (x, y) == m.goal:
            return distance
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < m.cols and 0 <= ny < m.rows and not m.walls[ny * m.cols + nx] and (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny, distance + 1))
    return None


def check_path(m, result, expected, algorithm):
    assert result.found == (expected is not None)
    assert result.visited_count == len(set(result.visited_order)) == len(result.visited_sides)
    assert all(not m.walls[cell] for cell in result.visited_order)
    assert all(side in (1, 2) for side in result.visited_sides)
    if not result.found:
        assert result.path == () and result.total_cost is None
        return
    assert result.path[0] == m.start_id and result.path[-1] == m.goal_id
    assert result.total_cost == len(result.path) - 1
    assert len(set(result.path)) == len(result.path)
    assert all(not m.walls[cell] for cell in result.path)
    for before, after in zip(result.path, result.path[1:]):
        assert abs(before % m.cols - after % m.cols) + abs(before // m.cols - after // m.cols) == 1
    if algorithm in OPTIMAL:
        assert result.total_cost == expected
    else:
        assert result.total_cost >= expected


@pytest.mark.parametrize("case", FIXTURES, ids=lambda c: c["name"])
@pytest.mark.parametrize("algorithm", ALGORITHMS)
def test_hand_built_maps(case, algorithm):
    m = fixture_maze(case)
    check_path(m, search_maze(m, algorithm), reference(m), algorithm)


@pytest.mark.parametrize("seed", [0, 42, 20261018])
def test_seeded_random_optimality_and_legality(seed):
    rng = random.Random(seed)
    for _ in range(50):
        rows, cols = rng.randrange(2, 14), rng.randrange(2, 15)
        walls = bytearray(rng.random() < .32 for _ in range(rows * cols))
        walls[0] = walls[-1] = 0
        m = Maze(rows, cols, walls, (0, 0), (cols - 1, rows - 1))
        expected = reference(m)
        for algorithm in ALGORITHMS:
            check_path(m, search_maze(m, algorithm), expected, algorithm)


def test_nonoptimal_algorithms_have_counterexamples():
    worse = set()
    for seed in range(50):
        m = generate_maze(31, 31, seed=seed)
        expected = reference(m)
        for algorithm in ("dfs", "greedy", "weighted"):
            if search_maze(m, algorithm).total_cost > expected:
                worse.add(algorithm)
        if len(worse) == 3:
            break
    assert worse == {"dfs", "greedy", "weighted"}


def test_iterated_states_and_repeatability():
    m = generate_maze(11, 11)
    for algorithm in ALGORITHMS:
        result = search_maze(m, algorithm)
        assert list(iter_search(m, algorithm)) == list(zip(result.visited_order, result.visited_sides))
        assert search_maze(m, algorithm) == result
    with pytest.raises(ValueError):
        search_maze(m, "unknown")


def test_shared_fixtures_match_browser_algorithms():
    if not shutil.which("node"):
        pytest.skip("Node.js unavailable")
    script = """import{readFileSync}from'node:fs';import{Maze}from'./web/maze/model.mjs';import{ALGORITHMS,searchMaze}from'./web/maze/search.mjs';
const cases=JSON.parse(readFileSync('tests/fixtures/maze-cases.json'));const out=[];
for(const c of cases){const m=new Maze(c.cells.length,c.cells[0].length,{walls:c.cells.flatMap(r=>[...r].map(v=>v==='#'?1:0)),start:c.start,goal:c.goal});
for(const a of Object.keys(ALGORITHMS)){const r=searchMaze(m,a);out.push({name:c.name,a,found:r.found,path:[...r.path],visited:[...r.visitedOrder],sides:[...r.visitedSides],cost:r.totalCost});}}
console.log(JSON.stringify(out));"""
    output = subprocess.run(["node", "--input-type=module", "-e", script], cwd=Path(__file__).resolve().parents[1],
                            capture_output=True, encoding="utf-8", check=True)
    for item in json.loads(output.stdout):
        m = fixture_maze(next(c for c in FIXTURES if c["name"] == item["name"]))
        result = search_maze(m, item["a"])
        assert result.found == item["found"] and result.total_cost == item["cost"]
        assert list(result.path) == item["path"]
        assert list(result.visited_order) == item["visited"]
        assert list(result.visited_sides) == item["sides"]
