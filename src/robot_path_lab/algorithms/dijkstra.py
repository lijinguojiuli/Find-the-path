"""Dijkstra search using a min-heap and positive cell entry costs."""

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


def dijkstra(grid: Grid) -> SearchResult:
    """Return the shortest path and processing trace on a map snapshot."""
    return run_to_completion(iter_dijkstra(grid))


def iter_dijkstra(grid: Grid) -> Generator[Position, None, SearchResult]:
    """Capture the map now; yield each finalized node and return SearchResult."""
    return _search(capture_grid(grid))


def _search(snapshot: GridSnapshot) -> Generator[Position, None, SearchResult]:
    # Each row is a distinct list. Access order is distances[y][x].
    distances = [[inf] * snapshot.cols for _ in range(snapshot.rows)]
    sx, sy = snapshot.start
    distances[sy][sx] = 0
    parents: dict[Position, Position | None] = {snapshot.start: None}
    sequence = count()
    # The sequence number preserves insertion order when distances are equal.
    frontier = [(0, next(sequence), snapshot.start)]
    visited: list[Position] = []

    while frontier:
        distance, _, current = heappop(frontier)
        x, y = current
        if distance != distances[y][x]:
            continue  # Ignore an entry superseded by a shorter route.
        visited.append(current)
        if current == snapshot.goal:
            yield current
            return SearchResult(True, reconstruct_path(parents, snapshot.goal), tuple(visited), distance)

        for neighbor in snapshot.neighbors(current):
            nx, ny = neighbor
            candidate_distance = distance + snapshot.cost_at(neighbor)
            if candidate_distance < distances[ny][nx]:
                distances[ny][nx] = candidate_distance
                parents[neighbor] = current
                heappush(frontier, (candidate_distance, next(sequence), neighbor))
        yield current

    return SearchResult(False, (), tuple(visited))
