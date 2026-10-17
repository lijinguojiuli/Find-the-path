"""Search metrics use controlled clocks rather than real timing thresholds."""

import pytest

from robot_path_lab.grid import Grid
from robot_path_lab.metrics import compare_algorithms, measure_search


@pytest.mark.parametrize("algorithm", ["bfs", "dijkstra", "astar"])
def test_measurements_have_exact_injected_duration_and_correct_length(algorithm):
    values = iter([100, 137])
    measurement = measure_search(Grid(2, 3, start=(0, 0), goal=(2, 1)), algorithm, clock=lambda: next(values))
    assert measurement.elapsed_ns == 37
    assert measurement.path_length == 3
    assert measurement.result.visited_count == len(measurement.result.visited_order)


def test_comparison_uses_the_same_map_and_separate_timing_windows():
    grid = Grid(3, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0), (1, 1)})
    before = grid.obstacles
    times = iter([0, 7, 1000, 1011, 2000, 2013])
    results = compare_algorithms(grid, clock=lambda: next(times))
    assert [item.algorithm for item in results] == ["bfs", "dijkstra", "astar"]
    assert [item.elapsed_ns for item in results] == [7, 11, 13]
    assert [item.path_length for item in results] == [6, 6, 6]
    assert grid.obstacles == before


def test_unreachable_and_same_endpoint_lengths_and_repeated_calls():
    assert measure_search(Grid(1, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0)})).path_length is None
    assert measure_search(Grid(1, 1, start=(0, 0), goal=(0, 0))).path_length == 0
    for _ in range(3):
        values = iter([5, 9])
        assert measure_search(Grid(1, 1, start=(0, 0), goal=(0, 0)), clock=lambda: next(values)).elapsed_ns == 4


def test_unknown_algorithm_is_rejected():
    with pytest.raises(ValueError, match="算法"):
        measure_search(Grid(1, 1), "unknown")
