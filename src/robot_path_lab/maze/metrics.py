"""Keep algorithm compute time separate from generation and visualization."""
from time import perf_counter_ns
from statistics import median

from .search import iter_search
from .search import search_maze


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


def benchmark_search(maze, algorithm="astar", *, warmups=1, samples=5):
    if type(samples) is not int or not 1 <= samples <= 9 or type(warmups) is not int or not 0 <= warmups <= 3:
        raise ValueError("实验次数无效。")
    for _ in range(warmups):
        search_maze(maze, algorithm)
    timings = []
    for _ in range(samples):
        result, elapsed = measure_search(maze, algorithm)
        timings.append(elapsed)
    return result, {"elapsed_ms": median(timings), "min_ms": min(timings), "max_ms": max(timings),
                    "sample_count": samples, "warmup_count": warmups, "timing_kind": "median"}
