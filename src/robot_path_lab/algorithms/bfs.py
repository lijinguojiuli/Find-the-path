"""Four-direction breadth-first search for grids with equal step costs."""

from collections import deque
from collections.abc import Generator

from robot_path_lab.algorithms.common import (
    GridSnapshot,
    SearchResult,
    capture_grid,
    reconstruct_path,
    run_to_completion,
)
from robot_path_lab.grid import Grid, Position

# Preserve the original public import while both algorithms share one type.
BFSResult = SearchResult


def bfs(grid: Grid) -> SearchResult:
    """Search a snapshot of grid, without changing the map or calling a UI."""
    return run_to_completion(iter_bfs(grid))


def iter_bfs(grid: Grid) -> Generator[Position, None, SearchResult]:
    """Capture the map now, then yield each processed node one step at a time.

    The final SearchResult is available as StopIteration.value. Most callers
    should use bfs(); this iterator allows later animation without putting
    drawing, waiting or event handling inside the search algorithm.
    """
    return _search(capture_grid(grid))


def _search(snapshot: GridSnapshot) -> Generator[Position, None, SearchResult]:
    frontier = deque([snapshot.start])
    # Inserting a parent at enqueue time also marks the cell as discovered.
    parents: dict[Position, Position | None] = {snapshot.start: None}
    visited: list[Position] = []

    while frontier:
        current = frontier.popleft()
        visited.append(current)
        if current == snapshot.goal:
            yield current
            path = reconstruct_path(parents, snapshot.goal)
            return SearchResult(True, path, tuple(visited), sum(snapshot.cost_at(cell) for cell in path[1:]))

        for neighbor in snapshot.neighbors(current):
            if neighbor in parents:
                continue
            parents[neighbor] = current
            frontier.append(neighbor)
        yield current

    return SearchResult(False, (), tuple(visited))
