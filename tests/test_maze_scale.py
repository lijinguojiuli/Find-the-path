"""Default-size behavior; full million-cell browser audit lives in scripts/."""
import pytest

from robot_path_lab.maze import ALGORITHMS, OPTIMAL, generate_maze, search_maze
from robot_path_lab.maze import metrics


@pytest.mark.parametrize("kind", ["corridors", "branches", "braided"])
def test_301_maze_all_algorithms(kind):
    m = generate_maze(301, 301, type=kind, seed=20261018)
    expected = search_maze(m, "bfs").total_cost
    for algorithm in ALGORITHMS:
        result = search_maze(m, algorithm)
        assert result.found and result.path[0] == m.start_id and result.path[-1] == m.goal_id
        assert all(not m.walls[cell] for cell in result.path)
        assert all(abs(a % m.cols - b % m.cols) + abs(a // m.cols - b // m.cols) == 1
                   for a, b in zip(result.path, result.path[1:]))
        if algorithm in OPTIMAL:
            assert result.total_cost == expected


def test_algorithm_timer_uses_only_compute_interval(monkeypatch):
    times = iter([100_000_000, 112_500_000])
    monkeypatch.setattr(metrics, "perf_counter_ns", lambda: next(times))
    result, elapsed = metrics.measure_search(generate_maze(11, 11))
    assert result.found and elapsed == 12.5
