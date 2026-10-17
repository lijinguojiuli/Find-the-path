"""A* on four-direction grids using a cost-scaled Manhattan lower bound."""

from collections.abc import Generator
from heapq import heappop, heappush
from itertools import count
from math import inf

from robot_path_lab.algorithms.common import (
    GridSnapshot,
    SearchResult,
    capture_grid,
    reconstruct_path,
    run_to_completion,
)
from robot_path_lab.grid import Grid, Position


def manhattan_distance(first: Position, second: Position) -> int:
    """Return the obstacle-free distance using only horizontal/vertical steps."""
    return abs(first[0] - second[0]) + abs(first[1] - second[1])


def astar(grid: Grid) -> SearchResult:
    """Return the shortest path and processing trace on a map snapshot."""
    return run_to_completion(iter_astar(grid))


def iter_astar(grid: Grid) -> Generator[Position, None, SearchResult]:
    """Capture the map now; yield each processed node and return SearchResult."""
    return _search(capture_grid(grid))


def _search(snapshot: GridSnapshot) -> Generator[Position, None, SearchResult]:
    g_scores = [[inf] * snapshot.cols for _ in range(snapshot.rows)]
    sx, sy = snapshot.start
    g_scores[sy][sx] = 0
    parents: dict[Position, Position | None] = {snapshot.start: None}
    sequence = count()
    start_h = snapshot.minimum_cost * manhattan_distance(snapshot.start, snapshot.goal)
    # Heap entries: (f, h, insertion order, g, position). Lower h breaks f ties.
    frontier = [(0 + start_h, start_h, next(sequence), 0, snapshot.start)]
    visited: list[Position] = []

    while frontier:
        _, _, _, current_g, current = heappop(frontier)
        x, y = current
        if current_g != g_scores[y][x]:
            continue  # A shorter route has replaced this queued entry.
        visited.append(current)
        if current == snapshot.goal:
            yield current
            return SearchResult(True, reconstruct_path(parents, snapshot.goal), tuple(visited), current_g)

        for neighbor in snapshot.neighbors(current):
            nx, ny = neighbor
            candidate_g = current_g + snapshot.cost_at(neighbor)
            if candidate_g < g_scores[ny][nx]:
                g_scores[ny][nx] = candidate_g
                parents[neighbor] = current
                h = snapshot.minimum_cost * manhattan_distance(neighbor, snapshot.goal)
                f = candidate_g + h
                heappush(frontier, (f, h, next(sequence), candidate_g, neighbor))
        yield current

    return SearchResult(False, (), tuple(visited))
