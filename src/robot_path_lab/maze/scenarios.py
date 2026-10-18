"""Fixed small teaching cases, matching the browser's scene identifiers."""
from dataclasses import replace
from .model import Maze, generate_maze

SCENARIOS = {
    "loops": ("dfs", "astar"), "misleading": ("greedy", "astar"),
    "corridor": ("bfs", "iddfs"), "unreachable": ("bfs", "astar"), "open": ("bfs", "dijkstra"),
}


def create_scenario(name, version=0):
    if name not in SCENARIOS:
        raise ValueError("未知教学场景。")
    if name == "loops":
        return generate_maze(15, 25, seed=20261018, type="braided", version=version)
    if name == "corridor":
        return generate_maze(11, 25, seed=42, type="corridors", version=version)
    rows, cols = 15, 25
    if name == "unreachable":
        maze = generate_maze(rows, cols, seed=20261018, version=version)
        walls = bytearray(maze.walls)
        walls[7*cols:8*cols] = bytes([1]) * cols
        return replace(maze, walls=walls)
    walls = bytearray([1]) * (rows * cols)
    if name == "open":
        for y in range(1, rows-1):
            for x in range(1, cols-1):
                walls[y*cols+x] = 0
        walls[1] = walls[-2] = 0
        return Maze(rows, cols, walls, (1, 0), (23, 14), version=version)
    for y in range(1, 8):
        walls[y*cols+1] = walls[y*cols+23] = 0
    for x in range(1, 24):
        walls[cols+x] = 0
    for x in range(1, 21):
        walls[7*cols+x] = 0
    return Maze(rows, cols, walls, (1, 7), (23, 7), version=version)
