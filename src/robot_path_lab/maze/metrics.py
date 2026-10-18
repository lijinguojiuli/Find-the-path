"""Keep algorithm compute time separate from generation and visualization."""
from time import perf_counter_ns

from .search import iter_search


def measure_search(maze, algorithm="astar"):
    steps = iter_search(maze, algorithm)
    start = perf_counter_ns()
    while True:
        try:
            next(steps)
        except StopIteration as done:
            result = done.value
            break
    return result, (perf_counter_ns() - start) / 1_000_000
