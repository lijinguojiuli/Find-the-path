"""Observable generator properties and Python/browser seed parity."""
from collections import deque
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from robot_path_lab.maze import MAZE_TYPES, Maze, generate_maze
from robot_path_lab.maze.model import validate_size, CLASSIC_TYPES


@pytest.mark.parametrize("kind", CLASSIC_TYPES)
@pytest.mark.parametrize("seed", [0, 42, 20261018])
@pytest.mark.parametrize("size", [(11, 11), (13, 15), (31, 31)])
def test_generator_is_reproducible_connected_and_has_only_two_entrances(kind, seed, size):
    rows, cols = size
    maze = generate_maze(rows, cols, type=kind, seed=seed, version=7)
    assert maze == generate_maze(rows, cols, type=kind, seed=seed, version=7)
    assert maze.version == 7
    assert maze.start == (1, 0) and maze.goal == (cols - 2, rows - 1)
    seen, queue = {maze.start_id}, deque([maze.start_id])
    while queue:
        cell = queue.popleft()
        x, y = cell % cols, cell // cols
        for nx, ny in ((x, y - 1), (x + 1, y), (x, y + 1), (x - 1, y)):
            next_cell = ny * cols + nx
            if 0 <= nx < cols and 0 <= ny < rows and not maze.walls[next_cell] and next_cell not in seen:
                seen.add(next_cell)
                queue.append(next_cell)
    assert maze.goal_id in seen
    assert len(seen) == maze.walls.count(0)
    for y in range(rows):
        for x in range(cols):
            if x in (0, cols - 1) or y in (0, rows - 1):
                assert maze.walls[y * cols + x] == (0 if (x, y) in (maze.start, maze.goal) else 1)
            if x % 2 and y % 2:
                assert maze.walls[y * cols + x] == 0


@pytest.mark.parametrize("kind", CLASSIC_TYPES)
def test_tree_and_loop_topology(kind):
    m = generate_maze(31, 31, type=kind, seed=42)
    edges = sum((i % m.cols < m.cols - 1 and not m.walls[i + 1])
                + (i + m.cols < len(m.walls) and not m.walls[i + m.cols])
                for i, wall in enumerate(m.walls) if not wall)
    if kind == "braided":
        assert edges > m.walls.count(0) - 1
    else:
        assert edges == m.walls.count(0) - 1


@pytest.mark.parametrize("value", [0, 10, 12, 1003, 11.5, True, "31"])
def test_invalid_generation_size(value):
    with pytest.raises(ValueError):
        validate_size(value, 31)


def test_invalid_metadata_and_immutable_input_copy():
    for seed in (-1, 2**32, 1.2, True):
        with pytest.raises(ValueError):
            generate_maze(seed=seed)
    with pytest.raises(ValueError):
        generate_maze(type="unknown")
    with pytest.raises(ValueError):
        Maze(1, 2, bytes([0, 1]), (0, 0), (1, 0))
    data = bytearray(2)
    m = Maze(1, 2, data, (0, 0), (1, 0))
    data[1] = 1
    assert m.walls == bytes(2)


def test_python_and_browser_generators_share_seed_behavior():
    if not shutil.which("node"):
        pytest.skip("Node.js unavailable")
    script = """import {generateMaze} from './web/maze/model.mjs';
const cases=[];for(const type of ['corridors','branches','braided'])for(const seed of [0,42,20261018]){
 const m=generateMaze({rows:13,cols:15,type,seed});cases.push({type,seed,walls:[...m.walls]});}console.log(JSON.stringify(cases));"""
    result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=Path(__file__).resolve().parents[1],
                            check=True, capture_output=True, encoding="utf-8")
    for case in json.loads(result.stdout):
        assert list(generate_maze(13, 15, type=case["type"], seed=case["seed"]).walls) == case["walls"]
