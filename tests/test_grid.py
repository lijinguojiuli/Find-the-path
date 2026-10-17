"""Behavior tests for the grid model, independent of Pygame."""

from pathlib import Path
import subprocess
import sys

import pytest

from robot_path_lab.grid import Grid


@pytest.mark.parametrize("rows, cols", [(3, 5), (1, 1), (20, 30)])
def test_grid_stores_dimensions_and_starts_empty(rows: int, cols: int) -> None:
    grid = Grid(rows, cols)

    assert (grid.rows, grid.cols) == (rows, cols)
    assert grid.start is None
    assert grid.goal is None
    assert grid.obstacles == frozenset()


@pytest.mark.parametrize("rows, cols", [(0, 5), (3, 0), (-1, 5), (3, -1)])
def test_dimensions_must_be_positive(rows: int, cols: int) -> None:
    with pytest.raises(ValueError):
        Grid(rows, cols)


@pytest.mark.parametrize("value", [True, 1.5, "3", None])
@pytest.mark.parametrize("dimension", ["rows", "cols"])
def test_dimensions_must_be_integers(value: object, dimension: str) -> None:
    dimensions = {"rows": 3, "cols": 5, dimension: value}

    with pytest.raises(TypeError):
        Grid(**dimensions)


@pytest.mark.parametrize(
    "position, expected",
    [((0, 0), True), ((4, 2), True), ((4, 0), True),
     ((-1, 0), False), ((0, -1), False), ((5, 0), False), ((0, 3), False)],
)
def test_bounds_use_x_for_columns_and_y_for_rows(
    position: tuple[int, int], expected: bool,
) -> None:
    assert Grid(3, 5).in_bounds(position) is expected


@pytest.mark.parametrize("position", [(-1, 0), (5, 0), (0, -1), (0, 3)])
@pytest.mark.parametrize("operation", ["set_start", "set_goal", "add_obstacle"])
def test_out_of_bounds_changes_are_rejected(
    position: tuple[int, int], operation: str,
) -> None:
    grid = Grid(3, 5)

    with pytest.raises(ValueError):
        getattr(grid, operation)(position)

    assert grid.start is None
    assert grid.goal is None
    assert grid.obstacles == frozenset()


@pytest.mark.parametrize(
    "position", [[0, 1], (0,), (0, 1, 2), ("0", 1), (True, 0), (0, 1.0)],
)
def test_positions_must_be_integer_pairs(position: object) -> None:
    with pytest.raises(TypeError):
        Grid(3, 5).add_obstacle(position)


def test_constructor_stores_endpoints_and_copies_obstacles() -> None:
    obstacles = {(1, 1), (2, 1)}
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2), obstacles=obstacles)
    obstacles.add((3, 1))

    assert grid.start == (0, 0)
    assert grid.goal == (4, 2)
    assert grid.obstacles == frozenset({(1, 1), (2, 1)})


def test_adding_and_removing_obstacles_is_idempotent() -> None:
    grid = Grid(3, 5)
    grid.add_obstacle((2, 1))
    grid.add_obstacle((2, 1))
    assert grid.is_blocked((2, 1))
    assert len(grid.obstacles) == 1

    grid.remove_obstacle((2, 1))
    grid.remove_obstacle((2, 1))
    assert not grid.is_blocked((2, 1))


@pytest.mark.parametrize("operation", ["set_start", "set_goal"])
def test_endpoint_cannot_replace_obstacle_and_failure_preserves_state(
    operation: str,
) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2), obstacles={(2, 1)})

    with pytest.raises(ValueError):
        getattr(grid, operation)((2, 1))

    assert (grid.start, grid.goal) == ((0, 0), (4, 2))
    assert grid.obstacles == frozenset({(2, 1)})


@pytest.mark.parametrize("position", [(0, 0), (4, 2)])
def test_obstacle_cannot_replace_endpoint(position: tuple[int, int]) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))

    with pytest.raises(ValueError):
        grid.add_obstacle(position)

    assert grid.obstacles == frozenset()


@pytest.mark.parametrize("endpoint", ["start", "goal"])
def test_constructor_rejects_blocked_endpoint(endpoint: str) -> None:
    with pytest.raises(ValueError):
        Grid(3, 5, obstacles={(1, 1)}, **{endpoint: (1, 1)})


def test_start_and_goal_may_overlap_and_be_cleared_independently() -> None:
    grid = Grid(1, 1, start=(0, 0), goal=(0, 0))
    grid.set_start(None)

    assert grid.start is None
    assert grid.goal == (0, 0)

    grid.set_start((0, 0))
    grid.set_goal(None)
    assert grid.start == (0, 0)
    assert grid.goal is None


def test_obstacle_snapshot_does_not_expose_mutable_state() -> None:
    grid = Grid(3, 5, obstacles={(1, 1)})
    snapshot = grid.obstacles
    grid.add_obstacle((2, 1))

    assert isinstance(snapshot, frozenset)
    assert snapshot == frozenset({(1, 1)})
    assert grid.obstacles == frozenset({(1, 1), (2, 1)})


def test_grids_do_not_share_obstacles() -> None:
    first = Grid(3, 5)
    second = Grid(3, 5)
    first.add_obstacle((1, 1))

    assert second.obstacles == frozenset()


def test_dimensions_are_read_only_after_creation() -> None:
    grid = Grid(3, 5)

    with pytest.raises(AttributeError):
        grid.rows = 1
    with pytest.raises(AttributeError):
        grid.cols = 1


def test_grid_can_be_imported_without_site_packages() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(source_root)!r}); "
        "from robot_path_lab.grid import Grid; "
        "assert Grid(2, 3).cols == 3; "
        "assert 'pygame' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", code],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
