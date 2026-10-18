"""Eight explicit search strategies, yielding cells without animation or I/O."""
from array import array
from collections import deque
from dataclasses import dataclass
from heapq import heappop, heappush
from math import inf

from .model import Maze

CORE_ALGORITHMS = ("bfs", "dijkstra", "astar", "dfs", "greedy", "bibfs", "bidijkstra", "weighted")
ALGORITHMS = CORE_ALGORITHMS + ("spfa", "bellmanford", "iddfs", "idastar", "beam", "bigreedy")
OPTIMAL = ("bfs", "dijkstra", "astar", "bibfs", "bidijkstra", "spfa", "bellmanford", "iddfs", "idastar")


@dataclass(frozen=True, slots=True)
class MazeSearchResult:
    found: bool
    path: tuple[int, ...]
    visited_order: tuple[int, ...]
    visited_sides: tuple[int, ...]
    total_cost: int | None
    status: str = "unreachable"
    reason: str = ""

    @property
    def visited_count(self):
        return len(self.visited_order)


def neighbors(m, cell):
    x, y = cell % m.cols, cell // m.cols
    for nx, ny in ((x, y - 1), (x + 1, y), (x, y + 1), (x - 1, y)):
        if 0 <= nx < m.cols and 0 <= ny < m.rows:
            next_cell = ny * m.cols + nx
            if not m.walls[next_cell]:
                yield next_cell


def _chain(parents, end):
    path = []
    while end != -1:
        path.append(end)
        end = parents[end]
    return path


def _result(path, visits, sides):
    return MazeSearchResult(bool(path), tuple(path), tuple(visits), tuple(sides), len(path) - 1 if path else None,
                            "found" if path else "unreachable")


def _single(m, algorithm):
    n = len(m.walls)
    parents, scores, marked = array("i", [-2]) * n, array("d", [inf]) * n, bytearray(n)
    visits, sides, queue, heap = array("I"), bytearray(), deque(), []
    linear = algorithm in ("bfs", "dfs")
    def priority(cell, g):
        h = abs(cell % m.cols - m.goal[0]) + abs(cell // m.cols - m.goal[1])
        return h if algorithm == "greedy" else g + (0 if algorithm == "dijkstra" else (1.5 if algorithm == "weighted" else 1) * h)
    parents[m.start_id], scores[m.start_id] = -1, 0
    sequence = 0
    if linear:
        queue.append(m.start_id)
    else:
        heappush(heap, (priority(m.start_id, 0), sequence, m.start_id, 0))
    while queue if linear else heap:
        if linear:
            cell = queue.pop() if algorithm == "dfs" else queue.popleft()
        else:
            _, _, cell, old_g = heappop(heap)
            if old_g != scores[cell]:
                continue
        if not marked[cell]:
            marked[cell] = 1
            visits.append(cell)
            sides.append(1)
            yield (cell, 1)
        if cell == m.goal_id:
            return _result(list(reversed(_chain(parents, cell))), visits, sides)
        adjacent = list(neighbors(m, cell))
        if algorithm == "dfs":
            adjacent.reverse()
        for next_cell in adjacent:
            g = scores[cell] + 1
            if linear or algorithm == "greedy":
                if parents[next_cell] != -2:
                    continue
            elif g >= scores[next_cell]:
                continue
            parents[next_cell], scores[next_cell] = cell, g
            if linear:
                queue.append(next_cell)
            else:
                sequence += 1
                heappush(heap, (priority(next_cell, g), sequence, next_cell, g))
    return _result([], visits, sides)


def _bidirectional(m, algorithm):
    n = len(m.walls)
    distances = [array("d", [inf]) * n for _ in range(2)]
    parents = [array("i", [-1]) * n for _ in range(2)]
    queues = [deque([m.start_id]), deque([m.goal_id])]
    heaps = [[(0, 0, m.start_id)], [(0, 0, m.goal_id)]]
    use_heap = algorithm == "bidijkstra"
    distances[0][m.start_id] = distances[1][m.goal_id] = 0
    visits, sides, marked = array("I"), bytearray(), bytearray(n)
    best, meeting, sequence = inf, -1, 0
    def minimum(side):
        if use_heap:
            while heaps[side] and heaps[side][0][0] != distances[side][heaps[side][0][2]]:
                heappop(heaps[side])
            return heaps[side][0][0] if heaps[side] else inf
        return distances[side][queues[side][0]] if queues[side] else inf
    while True:
        a, b = minimum(0), minimum(1)
        if a == inf or b == inf or a + b >= best:
            break
        side = 0 if a <= b else 1
        other = 1 - side
        cell = heappop(heaps[side])[2] if use_heap else queues[side].popleft()
        if not marked[cell]:
            marked[cell] = 1
            visits.append(cell)
            sides.append(side + 1)
            yield (cell, side + 1)
        if distances[side][cell] + distances[other][cell] < best:
            best, meeting = distances[side][cell] + distances[other][cell], cell
        for next_cell in neighbors(m, cell):
            candidate = distances[side][cell] + 1
            if candidate < distances[side][next_cell]:
                distances[side][next_cell], parents[side][next_cell] = candidate, cell
                if use_heap:
                    sequence += 1
                    heappush(heaps[side], (candidate, sequence, next_cell))
                else:
                    queues[side].append(next_cell)
            connection = distances[side][next_cell] + distances[other][next_cell]
            if connection < best:
                best, meeting = connection, next_cell
    path = [] if meeting < 0 else list(reversed(_chain(parents[0], meeting))) + _chain(parents[1], meeting)[1:]
    return _result(path, visits, sides)


def iter_search(maze: Maze, algorithm="astar", **options):
    if not isinstance(maze, Maze) or algorithm not in ALGORITHMS:
        raise ValueError("地图或算法无效。")
    if algorithm not in CORE_ALGORITHMS:
        from .advanced import advanced_search
        return advanced_search(maze, algorithm, **options)
    # Maze is frozen and owns immutable bytes, so this already is a snapshot.
    return _bidirectional(maze, algorithm) if algorithm in ("bibfs", "bidijkstra") else _single(maze, algorithm)


def search_maze(maze: Maze, algorithm="astar", **options) -> MazeSearchResult:
    steps = iter_search(maze, algorithm, **options)
    while True:
        try:
            next(steps)
        except StopIteration as done:
            return done.value
