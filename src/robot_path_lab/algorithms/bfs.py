"""Four-direction breadth-first search for grids with equal step costs."""

from collections import deque
from collections.abc import Generator
from dataclasses import dataclass

from robot_path_lab.grid import Grid, Position

# Fixed ordering makes equal-length routes and visit traces reproducible.
_DIRECTIONS = ((0, -1), (1, 0), (0, 1), (-1, 0))


@dataclass(frozen=True)
class BFSResult:
    """A path includes both endpoints; visits count processed, not queued, nodes."""

    found: bool
    path: tuple[Position, ...]
    visited_order: tuple[Position, ...]

    @property
    def visited_count(self) -> int:
        return len(self.visited_order)


def bfs(grid: Grid) -> BFSResult:
    """Search a snapshot of grid, without changing the map or calling a UI."""
    search = iter_bfs(grid)
    while True:
        try:
            next(search)
        except StopIteration as complete:
            return complete.value


def iter_bfs(grid: Grid) -> Generator[Position, None, BFSResult]:
    """Capture the map now, then yield each processed node one step at a time.

    The final BFSResult is available as StopIteration.value. Most callers
    should use bfs(); this iterator allows later animation without putting
    drawing, waiting or event handling inside the search algorithm.
    """
    start, goal = grid.start, grid.goal
    if start is None or goal is None:
        raise ValueError("搜索前必须同时设置起点和终点。")
    return _search(grid.rows, grid.cols, start, goal, grid.obstacles)


def _search(
    rows: int,
    cols: int,
    start: Position,
    goal: Position,
    obstacles: frozenset[Position],
) -> Generator[Position, None, BFSResult]:
    frontier = deque([start])
    # Inserting a parent at enqueue time also marks the cell as discovered.
    parents: dict[Position, Position | None] = {start: None}
    visited: list[Position] = []

    while frontier:
        current = frontier.popleft()
        visited.append(current)
        if current == goal:
            yield current
            return BFSResult(True, _reconstruct_path(parents, goal), tuple(visited))

        x, y = current
        for dx, dy in _DIRECTIONS:
            neighbor = (x + dx, y + dy)
            nx, ny = neighbor
            if not (0 <= nx < cols and 0 <= ny < rows):
                continue
            if neighbor in obstacles or neighbor in parents:
                continue
            parents[neighbor] = current
            frontier.append(neighbor)
        yield current

    return BFSResult(False, (), tuple(visited))


def _reconstruct_path(
    parents: dict[Position, Position | None], goal: Position,
) -> tuple[Position, ...]:
    path: list[Position] = []
    current: Position | None = goal
    while current is not None:
        path.append(current)
        current = parents[current]
    path.reverse()
    return tuple(path)
