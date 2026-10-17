"""A* contracts, Manhattan guarantees, and Dijkstra comparisons."""

from pathlib import Path
import subprocess
import sys

import pytest

from robot_path_lab.algorithms import SearchResult, astar, dijkstra, iter_astar, manhattan_distance
from robot_path_lab.grid import Grid


def assert_valid_result(grid: Grid, result: SearchResult) -> None:
    assert type(result) is SearchResult
    assert result.visited_count == len(result.visited_order)
    assert len(set(result.visited_order)) == result.visited_count
    assert result.visited_order[0] == grid.start
    for cell in (*result.path, *result.visited_order):
        assert grid.in_bounds(cell)
        assert not grid.is_blocked(cell)
    if result.found:
        assert result.path[0] == grid.start
        assert result.path[-1] == grid.goal
        assert result.visited_order[-1] == grid.goal
        for first, second in zip(result.path, result.path[1:]):
            assert abs(first[0] - second[0]) + abs(first[1] - second[1]) == 1
    else:
        assert result.path == ()


@pytest.mark.parametrize(
    "rows, cols, start, goal, obstacles, expected_steps",
    [
        (1, 5, (0, 0), (4, 0), set(), 4),
        (3, 4, (0, 0), (3, 2), set(), 5),
        (3, 3, (0, 0), (2, 0), {(1, 0), (1, 1)}, 6),
        (3, 5, (0, 0), (4, 0), {(2, 0), (2, 1)}, 8),
        (2, 2, (0, 0), (1, 1), set(), 2),
        (4, 1, (0, 0), (0, 3), set(), 3),
        (1, 1, (0, 0), (0, 0), set(), 0),
        (3, 3, (0, 0), (2, 0), {(1, 0), (1, 1), (1, 2)}, None),
        (2, 2, (0, 0), (1, 1), {(1, 0), (0, 1)}, None),
        (3, 4, (3, 2), (0, 0), set(), 5),
    ],
    ids=["straight", "rectangle", "detour", "wall-gap", "equal-paths", "column",
         "same-endpoint", "unreachable", "no-diagonal", "reverse-boundaries"],
)
def test_known_shortest_lengths_match_dijkstra(
    rows, cols, start, goal, obstacles, expected_steps,
) -> None:
    grid = Grid(rows, cols, start=start, goal=goal, obstacles=obstacles)
    before = (grid.start, grid.goal, grid.obstacles)

    result, baseline = astar(grid), dijkstra(grid)

    assert_valid_result(grid, result)
    assert result.found == baseline.found == (expected_steps is not None)
    assert len(result.path) == len(baseline.path)
    if expected_steps is not None:
        assert len(result.path) - 1 == expected_steps
        assert manhattan_distance(start, goal) <= expected_steps
    if start == goal:
        assert result.path == (start,)
        assert result.visited_count == 1
    assert (grid.start, grid.goal, grid.obstacles) == before


def test_g_plus_h_avoids_a_longer_route_that_only_looks_closer_to_goal() -> None:
    rows = (".........", ".#######.", "S......#G", "######.#.", "######.#.", "######...")
    obstacles = {(x, y) for y, row in enumerate(rows) for x, cell in enumerate(row) if cell == "#"}
    grid = Grid(6, 9, start=(0, 2), goal=(8, 2), obstacles=obstacles)

    result = astar(grid)

    assert_valid_result(grid, result)
    assert len(result.path) - 1 == len(dijkstra(grid).path) - 1 == 12
    assert (0, 0) in result.path  # The upper route is 12 steps; the lower route is 14.


@pytest.mark.parametrize(
    "first, second, expected",
    [((0, 0), (0, 0), 0), ((0, 0), (3, 4), 7), ((3, 4), (0, 0), 7),
     ((-2, 1), (3, -4), 10), ((2, 7), (2, 3), 4)],
)
def test_manhattan_distance_uses_absolute_coordinate_differences(first, second, expected) -> None:
    assert manhattan_distance(first, second) == expected


def test_manhattan_is_consistent_across_each_unit_cost_grid_edge() -> None:
    goal = (3, 2)
    assert manhattan_distance(goal, goal) == 0
    for y in range(3):
        for x in range(4):
            for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
                neighbor = (x + dx, y + dy)
                if 0 <= neighbor[0] < 4 and 0 <= neighbor[1] < 3:
                    assert manhattan_distance((x, y), goal) <= 1 + manhattan_distance(neighbor, goal)


def test_astar_returns_the_existing_shared_result_type() -> None:
    grid = Grid(1, 2, start=(0, 0), goal=(1, 0))
    assert type(astar(grid)) is type(dijkstra(grid)) is SearchResult


def test_equal_f_scores_prefer_smaller_h_with_reproducible_results() -> None:
    grid = Grid(2, 2, start=(0, 0), goal=(1, 1))
    result = astar(grid)

    assert result.path == ((0, 0), (1, 0), (1, 1))
    assert result.visited_order == ((0, 0), (1, 0), (1, 1))
    assert result.visited_count == 3
    assert astar(grid) == result


@pytest.mark.parametrize("start, goal", [(None, (1, 1)), ((0, 0), None), (None, None)])
def test_missing_endpoints_raise_the_shared_input_error(start, goal) -> None:
    with pytest.raises(ValueError, match="起点.*终点"):
        astar(Grid(2, 2, start=start, goal=goal))


def finish_search(search):
    visited = []
    while True:
        try:
            visited.append(next(search))
        except StopIteration as complete:
            return tuple(visited), complete.value


def test_iterator_captures_a_static_map_before_the_first_step() -> None:
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0))
    search = iter_astar(grid)
    grid.add_obstacle((1, 0))
    grid.set_goal((0, 0))

    visited, result = finish_search(search)

    assert result.path == ((0, 0), (1, 0), (2, 0))
    assert visited == result.visited_order
    assert grid.is_blocked((1, 0))
    assert grid.goal == (0, 0)


def test_repeated_searches_have_no_shared_scores_or_parents() -> None:
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0)})
    assert not astar(grid).found
    grid.remove_obstacle((1, 0))
    assert astar(grid).path == ((0, 0), (1, 0), (2, 0))


def test_long_path_is_reconstructed_without_recursion() -> None:
    result = astar(Grid(1, 1501, start=(0, 0), goal=(1500, 0)))
    assert len(result.path) == 1501
    assert result.visited_count == 1501


def test_step_and_complete_searches_have_identical_results() -> None:
    grid = Grid(3, 4, start=(0, 0), goal=(3, 2))
    visited, result = finish_search(iter_astar(grid))
    assert result == astar(grid)
    assert visited == result.visited_order


def test_astar_runs_without_pygame_or_site_packages() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(source_root)!r}); "
        "from robot_path_lab.algorithms import astar; "
        "from robot_path_lab.grid import Grid; "
        "assert astar(Grid(1, 2, start=(0, 0), goal=(1, 0))).found; "
        "assert 'pygame' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", code],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


def test_all_128_three_by_three_obstacle_layouts_match_dijkstra() -> None:
    start, goal = (0, 0), (2, 2)
    candidates = [(x, y) for y in range(3) for x in range(3) if (x, y) not in (start, goal)]
    for mask in range(1 << len(candidates)):
        obstacles = {cell for index, cell in enumerate(candidates) if mask & (1 << index)}
        grid = Grid(3, 3, start=start, goal=goal, obstacles=obstacles)
        result, baseline = astar(grid), dijkstra(grid)
        assert result.found == baseline.found, f"Obstacle mask: {mask}"
        assert len(result.path) == len(baseline.path), f"Obstacle mask: {mask}"
        assert_valid_result(grid, result)


def test_unprocessed_frontier_entries_are_not_counted() -> None:
    result = astar(Grid(2, 5, start=(0, 0), goal=(1, 0)))
    assert result.path == ((0, 0), (1, 0))
    assert result.visited_order == ((0, 0), (1, 0))
    assert result.visited_count == 2
