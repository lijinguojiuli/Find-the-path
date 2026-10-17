"""Hand-calculated BFS cases and search contract checks."""

from pathlib import Path
import subprocess
import sys

import pytest

from robot_path_lab.algorithms import bfs, iter_bfs
from robot_path_lab.grid import Grid


def grid_from_rows(*rows: str) -> Grid:
    """Read small maps: S=start, G=goal, B=both, #=wall, .=empty."""
    start = goal = None
    obstacles = set()
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0])
        for x, cell in enumerate(row):
            assert cell in "SGB#."
            if cell in "SB":
                start = (x, y)
            if cell in "GB":
                goal = (x, y)
            if cell == "#":
                obstacles.add((x, y))
    return Grid(len(rows), len(rows[0]), start=start, goal=goal, obstacles=obstacles)


@pytest.mark.parametrize(
    "rows, expected_steps",
    [
        (("S...G",), 4),
        (("S...", "....", "...G"), 5),
        (("S#G", ".#.", "..."), 6),
        (("S.#.G", "..#..", "....."), 8),
        (("S.", ".G"), 2),
        (("S", ".", ".", "G"), 3),
    ],
    ids=["straight", "rectangle", "unique-detour", "wall-gap", "equal-paths", "single-column"],
)
def test_hand_calculated_shortest_paths(rows: tuple[str, ...], expected_steps: int) -> None:
    grid = grid_from_rows(*rows)
    before = (grid.start, grid.goal, grid.obstacles)

    result = bfs(grid)

    assert result.found
    assert result.path[0] == grid.start
    assert result.path[-1] == grid.goal
    assert len(result.path) - 1 == expected_steps
    assert len(set(result.path)) == len(result.path)
    for first, second in zip(result.path, result.path[1:]):
        assert abs(first[0] - second[0]) + abs(first[1] - second[1]) == 1
    for cell in (*result.path, *result.visited_order):
        assert grid.in_bounds(cell)
        assert not grid.is_blocked(cell)
    assert result.visited_order[0] == grid.start
    assert result.visited_order[-1] == grid.goal
    assert result.visited_count == len(result.visited_order)
    assert len(set(result.visited_order)) == result.visited_count
    assert (grid.start, grid.goal, grid.obstacles) == before


def test_unique_detour_has_the_exact_hand_calculated_path() -> None:
    result = bfs(grid_from_rows("S#G", ".#.", "..."))

    assert result.path == ((0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (2, 1), (2, 0))
    assert result.visited_count == 7


def test_visit_order_is_deterministic_and_counts_processed_nodes() -> None:
    grid = grid_from_rows("S.", ".G")
    result = bfs(grid)

    assert result.visited_order == ((0, 0), (1, 0), (0, 1), (1, 1))
    assert result.path == ((0, 0), (1, 0), (1, 1))
    assert result.visited_count == 4
    assert bfs(grid) == result


def test_open_map_visits_non_decreasing_distance_layers() -> None:
    result = bfs(grid_from_rows("S...", "....", "...G"))
    distances = [x + y for x, y in result.visited_order]

    assert distances == sorted(distances)


def test_start_equals_goal_is_a_zero_step_path() -> None:
    result = bfs(grid_from_rows("B"))

    assert result.found
    assert result.path == ((0, 0),)
    assert result.visited_order == ((0, 0),)
    assert result.visited_count == 1


def test_unreachable_goal_exhausts_only_the_reachable_component() -> None:
    result = bfs(grid_from_rows("S#G", ".#.", ".#."))

    assert not result.found
    assert result.path == ()
    assert result.visited_order == ((0, 0), (0, 1), (0, 2))
    assert result.visited_count == 3


def test_diagonal_moves_and_corner_cutting_are_not_allowed() -> None:
    result = bfs(grid_from_rows("S#", "#G"))

    assert not result.found
    assert result.path == ()
    assert result.visited_order == ((0, 0),)
    assert result.visited_count == 1


def test_search_stops_when_goal_is_processed_not_when_all_cells_are_visited() -> None:
    # (0, 1) is already queued when the goal is processed; it is not a visit.
    result = bfs(grid_from_rows("SG...", "....."))

    assert result.path == ((0, 0), (1, 0))
    assert result.visited_order == ((0, 0), (1, 0))
    assert result.visited_count == 2


@pytest.mark.parametrize("start, goal", [(None, (1, 1)), ((0, 0), None), (None, None)])
def test_missing_endpoints_are_invalid_input(start, goal) -> None:
    with pytest.raises(ValueError, match="起点.*终点"):
        bfs(Grid(2, 2, start=start, goal=goal))


def test_repeated_searches_have_no_shared_visited_state() -> None:
    blocked = grid_from_rows("S#G")
    assert not bfs(blocked).found
    blocked.remove_obstacle((1, 0))

    assert bfs(blocked).path == ((0, 0), (1, 0), (2, 0))


def test_long_paths_are_reconstructed_without_recursion() -> None:
    grid = Grid(1, 1501, start=(0, 0), goal=(1500, 0))
    result = bfs(grid)

    assert len(result.path) == 1501
    assert result.path[-1] == (1500, 0)
    assert result.visited_count == 1501


def finish_search(search):
    visited = []
    while True:
        try:
            visited.append(next(search))
        except StopIteration as complete:
            return tuple(visited), complete.value


def test_step_iterator_and_complete_search_return_the_same_result() -> None:
    grid = grid_from_rows("S.", ".G")
    visited, result = finish_search(iter_bfs(grid))

    assert result == bfs(grid)
    assert visited == result.visited_order


def test_search_uses_a_snapshot_even_when_map_changes_between_steps() -> None:
    grid = grid_from_rows("S.G")
    search = iter_bfs(grid)
    grid.add_obstacle((1, 0))
    grid.set_goal((0, 0))
    visited, result = finish_search(search)

    assert result.path == ((0, 0), (1, 0), (2, 0))
    assert visited == result.visited_order
    assert grid.goal == (0, 0)
    assert grid.is_blocked((1, 0))


def test_bfs_runs_without_pygame_or_other_site_packages() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(source_root)!r}); "
        "from robot_path_lab.grid import Grid; "
        "from robot_path_lab.algorithms import bfs; "
        "result = bfs(Grid(1, 2, start=(0, 0), goal=(1, 0))); "
        "assert result.found and len(result.path) == 2; "
        "assert 'pygame' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", code],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
