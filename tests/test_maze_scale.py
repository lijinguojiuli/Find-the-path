"""Default-size behavior; full million-cell browser audit lives in scripts/."""
import pytest

from robot_path_lab.maze import ALGORITHMS, OPTIMAL, generate_maze, search_maze
from robot_path_lab.maze import metrics
from robot_path_lab.maze.search import CORE_ALGORITHMS


@pytest.mark.parametrize("kind", ["corridors", "branches", "braided"])
def test_301_maze_all_algorithms(kind):
    m = generate_maze(301, 301, type=kind, seed=20261018)
    expected = search_maze(m, "bfs").total_cost
    for algorithm in CORE_ALGORITHMS:
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


def test_compact_default_map_fourteen_algorithms():
    m = generate_maze(15, 25, seed=20261018)
    expected = search_maze(m, "bfs").total_cost
    for algorithm in ALGORITHMS:
        r = search_maze(m, algorithm)
        assert r.found, (algorithm, r.status, r.reason)
        if algorithm in OPTIMAL:
            assert r.total_cost == expected


@pytest.mark.parametrize("algorithm", ["spfa", "bellmanford", "iddfs", "idastar", "beam", "bigreedy"])
def test_budget_is_not_reported_as_unreachable(algorithm):
    m = generate_maze(15, 25)
    result = search_maze(m, algorithm, max_expansions=1)
    assert result.status == "limited" and result.reason
    assert not result.found and result.total_cost is None
