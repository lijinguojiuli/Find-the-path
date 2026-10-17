"""Measure completed searches; animation and UI time are never included."""

from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter_ns

from robot_path_lab.algorithms import SearchResult, astar, bfs, dijkstra
from robot_path_lab.grid import Grid

ALGORITHMS = {"bfs": bfs, "dijkstra": dijkstra, "astar": astar}


@dataclass(frozen=True)
class SearchMeasurement:
    algorithm: str
    result: SearchResult
    elapsed_ns: int

    @property
    def path_length(self) -> int | None:
        return len(self.result.path) - 1 if self.result.found else None

    @property
    def total_cost(self) -> int | None:
        return self.result.total_cost


def _clone(grid: Grid) -> Grid:
    return Grid(grid.rows, grid.cols, start=grid.start, goal=grid.goal, obstacles=grid.obstacles, costs=grid.costs)


def measure_search(
    grid: Grid, algorithm: str = "astar", *, clock: Callable[[], int] = perf_counter_ns,
) -> SearchMeasurement:
    if algorithm not in ALGORITHMS:
        raise ValueError("未知的寻路算法。")
    snapshot = _clone(grid)  # Map preparation is outside the timed region.
    started = clock()
    result = ALGORITHMS[algorithm](snapshot)
    elapsed = clock() - started
    return SearchMeasurement(algorithm, result, elapsed)


def compare_algorithms(
    grid: Grid, *, clock: Callable[[], int] = perf_counter_ns,
) -> tuple[SearchMeasurement, ...]:
    snapshot = _clone(grid)
    return tuple(measure_search(snapshot, name, clock=clock) for name in ALGORITHMS)
