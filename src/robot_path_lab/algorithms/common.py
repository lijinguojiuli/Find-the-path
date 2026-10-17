"""Shared search data and small helpers, independent of any interface."""

from collections.abc import Generator, Iterator, Mapping
from dataclasses import dataclass

from robot_path_lab.grid import Grid, Position

_DIRECTIONS = ((0, -1), (1, 0), (0, 1), (-1, 0))


@dataclass(frozen=True)
class SearchResult:
    """Paths contain both endpoints; visits count processed nodes only."""

    found: bool
    path: tuple[Position, ...]
    visited_order: tuple[Position, ...]
    total_cost: int | None = None

    @property
    def visited_count(self) -> int:
        return len(self.visited_order)


@dataclass(frozen=True)
class GridSnapshot:
    rows: int
    cols: int
    start: Position
    goal: Position
    obstacles: frozenset[Position]
    costs: Mapping[Position, int]
    minimum_cost: int

    def cost_at(self, position: Position) -> int:
        return self.costs.get(position, 1)

    def neighbors(self, position: Position) -> Iterator[Position]:
        """Yield valid four-direction neighbors in up/right/down/left order."""
        x, y = position
        for dx, dy in _DIRECTIONS:
            neighbor = (x + dx, y + dy)
            nx, ny = neighbor
            if 0 <= nx < self.cols and 0 <= ny < self.rows and neighbor not in self.obstacles:
                yield neighbor


def capture_grid(grid: Grid) -> GridSnapshot:
    start, goal = grid.start, grid.goal
    if start is None or goal is None:
        raise ValueError("搜索前必须同时设置起点和终点。")
    return GridSnapshot(grid.rows, grid.cols, start, goal, grid.obstacles, grid.costs, grid.minimum_cost)


def reconstruct_path(
    parents: dict[Position, Position | None], goal: Position,
) -> tuple[Position, ...]:
    path: list[Position] = []
    current: Position | None = goal
    while current is not None:
        path.append(current)
        current = parents[current]
    path.reverse()
    return tuple(path)


def run_to_completion(search: Generator[Position, None, SearchResult]) -> SearchResult:
    while True:
        try:
            next(search)
        except StopIteration as complete:
            return complete.value
