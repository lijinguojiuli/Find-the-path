"""Dijkstra correctness, BFS comparisons, and the shared search contract."""

from pathlib import Path
import subprocess
import sys

import pytest

from robot_path_lab.algorithms import BFSResult, SearchResult, bfs, dijkstra, iter_dijkstra
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
    ],
    ids=["straight", "rectangle", "detour", "wall-gap", "equal-paths", "column",
         "same-endpoint", "unreachable", "no-diagonal"],
)
def test_known_shortest_lengths_match_bfs(
    rows, cols, start, goal, obstacles, expected_steps,
) -> None:
    grid = Grid(rows, cols, start=start, goal=goal, obstacles=obstacles)
    before = (grid.start, grid.goal, grid.obstacles)

    result = dijkstra(grid)
    baseline = bfs(grid)

    assert_valid_result(grid, result)
    assert result.found == baseline.found == (expected_steps is not None)
    assert len(result.path) == len(baseline.path)
    if expected_steps is not None:
        assert len(result.path) - 1 == expected_steps
    assert (grid.start, grid.goal, grid.obstacles) == before


def test_both_algorithms_share_one_result_type_and_keep_bfs_alias() -> None:
    from robot_path_lab.algorithms.bfs import BFSResult as OriginalImport

    grid = Grid(1, 2, start=(0, 0), goal=(1, 0))
    assert BFSResult is OriginalImport is SearchResult
    assert type(bfs(grid)) is type(dijkstra(grid)) is SearchResult


def test_priority_queue_processes_non_decreasing_distance_layers() -> None:
    grid = Grid(3, 4, start=(0, 0), goal=(3, 2))
    distances = [x + y for x, y in dijkstra(grid).visited_order]

    assert distances == sorted(distances)


@pytest.mark.parametrize("start, goal", [(None, (1, 1)), ((0, 0), None), (None, None)])
def test_missing_endpoints_raise_the_shared_input_error(start, goal) -> None:
    with pytest.raises(ValueError, match="起点.*终点"):
        dijkstra(Grid(2, 2, start=start, goal=goal))


def test_queued_but_unprocessed_cells_are_not_counted() -> None:
    result = dijkstra(Grid(2, 5, start=(0, 0), goal=(1, 0)))

    assert result.path == ((0, 0), (1, 0))
    assert result.visited_order == ((0, 0), (1, 0))
    assert result.visited_count == 2


def finish_search(search):
    processed = []
    while True:
        try:
            processed.append(next(search))
        except StopIteration as complete:
            return tuple(processed), complete.value


def test_step_search_captures_the_map_before_the_first_step() -> None:
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0))
    search = iter_dijkstra(grid)
    grid.add_obstacle((1, 0))
    grid.set_goal((0, 0))

    visited, result = finish_search(search)

    assert result.path == ((0, 0), (1, 0), (2, 0))
    assert visited == result.visited_order
    assert grid.goal == (0, 0)
    assert grid.is_blocked((1, 0))


def test_repeated_searches_do_not_share_distances_or_predecessors() -> None:
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0)})
    assert not dijkstra(grid).found
    grid.remove_obstacle((1, 0))

    assert dijkstra(grid).path == ((0, 0), (1, 0), (2, 0))


def test_long_path_uses_iterative_shared_reconstruction() -> None:
    result = dijkstra(Grid(1, 1501, start=(0, 0), goal=(1500, 0)))

    assert len(result.path) == 1501
    assert result.visited_count == 1501


def test_step_and_complete_searches_have_identical_results() -> None:
    grid = Grid(2, 3, start=(0, 0), goal=(2, 1))
    visited, result = finish_search(iter_dijkstra(grid))

    assert result == dijkstra(grid)
    assert visited == result.visited_order


def test_unreachable_goal_processes_only_the_start_component() -> None:
    grid = Grid(3, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0), (1, 1), (1, 2)})
    result = dijkstra(grid)

    assert not result.found
    assert result.path == ()
    assert result.visited_order == ((0, 0), (0, 1), (0, 2))
    assert result.visited_count == 3


def test_equal_priorities_use_a_reproducible_insertion_order() -> None:
    grid = Grid(2, 2, start=(0, 0), goal=(1, 1))
    result = dijkstra(grid)

    assert result.path == ((0, 0), (1, 0), (1, 1))
    assert result.visited_order == ((0, 0), (1, 0), (0, 1), (1, 1))
    assert dijkstra(grid) == result


def test_dijkstra_runs_without_pygame_or_site_packages() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(source_root)!r}); "
        "from robot_path_lab.algorithms import dijkstra; "
        "from robot_path_lab.grid import Grid; "
        "assert dijkstra(Grid(1, 2, start=(0, 0), goal=(1, 0))).found; "
        "assert 'pygame' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", code],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


def test_all_128_obstacle_layouts_on_a_three_by_three_grid_match_bfs() -> None:
    start, goal = (0, 0), (2, 2)
    candidates = [(x, y) for y in range(3) for x in range(3) if (x, y) not in (start, goal)]
    for mask in range(1 << len(candidates)):
        obstacles = {cell for index, cell in enumerate(candidates) if mask & (1 << index)}
        grid = Grid(3, 3, start=start, goal=goal, obstacles=obstacles)
        baseline, result = bfs(grid), dijkstra(grid)
        assert result.found == baseline.found, f"Obstacle mask: {mask}"
        assert len(result.path) == len(baseline.path), f"Obstacle mask: {mask}"
        assert_valid_result(grid, result)
