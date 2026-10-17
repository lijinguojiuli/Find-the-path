"""Map editing rules without Pygame events or an open window."""

from pathlib import Path
import subprocess
import sys

import pytest

from robot_path_lab.controller import EditController, EditMode
from robot_path_lab.grid import Grid


def snapshot(grid: Grid):
    return grid.start, grid.goal, grid.obstacles


def test_editor_defaults_to_obstacle_mode_without_changing_map() -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    before = snapshot(grid)
    editor = EditController(grid)

    assert editor.mode is EditMode.OBSTACLE
    assert snapshot(grid) == before
    assert editor.status


@pytest.mark.parametrize(
    "key, mode", [("1", EditMode.OBSTACLE), ("2", EditMode.START), ("3", EditMode.GOAL)],
)
def test_number_keys_select_mode_without_editing(key: str, mode: EditMode) -> None:
    grid = Grid(3, 5)
    editor = EditController(grid)
    before = snapshot(grid)

    assert editor.select_mode(key)
    assert editor.mode is mode
    assert snapshot(grid) == before


@pytest.mark.parametrize("key", ["", "0", "4", "x", " "])
def test_unrecognized_keys_leave_mode_and_feedback_unchanged(key: str) -> None:
    editor = EditController(Grid(3, 5))
    editor.select_mode("2")
    before_status = editor.status

    assert not editor.select_mode(key)
    assert editor.mode is EditMode.START
    assert editor.status == before_status


def test_obstacle_mode_toggles_a_cell() -> None:
    grid = Grid(3, 5)
    editor = EditController(grid)

    assert editor.edit_cell((2, 1))
    assert grid.is_blocked((2, 1))
    assert editor.edit_cell((2, 1))
    assert not grid.is_blocked((2, 1))


@pytest.mark.parametrize("position", [(0, 0), (4, 2)])
def test_endpoints_are_protected_in_obstacle_mode(position: tuple[int, int]) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    editor = EditController(grid)
    before = snapshot(grid)

    assert not editor.edit_cell(position)
    assert snapshot(grid) == before
    assert "protected" in editor.status.lower()


@pytest.mark.parametrize("key, endpoint", [("2", "start"), ("3", "goal")])
def test_endpoint_mode_moves_only_selected_endpoint(key: str, endpoint: str) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    editor = EditController(grid)
    editor.select_mode(key)

    assert editor.edit_cell((2, 1))
    assert getattr(grid, endpoint) == (2, 1)
    assert grid.goal == (4, 2) if endpoint == "start" else grid.start == (0, 0)


@pytest.mark.parametrize("key", ["2", "3"])
def test_endpoint_on_obstacle_is_rejected_until_explicitly_cleared(key: str) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2), obstacles={(2, 1)})
    editor = EditController(grid)
    editor.select_mode(key)
    before = snapshot(grid)

    assert not editor.edit_cell((2, 1))
    assert snapshot(grid) == before
    assert "clear" in editor.status.lower()

    editor.select_mode("1")
    assert editor.edit_cell((2, 1))
    editor.select_mode(key)
    assert editor.edit_cell((2, 1))


@pytest.mark.parametrize("key, position", [("2", (4, 2)), ("3", (0, 0))])
def test_endpoints_may_overlap_but_overlap_remains_protected(
    key: str, position: tuple[int, int],
) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    editor = EditController(grid)
    editor.select_mode(key)

    assert editor.edit_cell(position)
    assert grid.start == grid.goal == position
    editor.select_mode("1")
    assert not editor.edit_cell(position)
    assert not grid.is_blocked(position)


@pytest.mark.parametrize("key, position", [("2", (0, 0)), ("3", (4, 2))])
def test_clicking_current_endpoint_is_a_safe_no_op(key: str, position: tuple[int, int]) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    editor = EditController(grid)
    editor.select_mode(key)
    before = snapshot(grid)

    assert not editor.edit_cell(position)
    assert snapshot(grid) == before


@pytest.mark.parametrize("key", ["1", "2", "3"])
@pytest.mark.parametrize("position", [None, (-1, 0), (0, -1), (5, 0), (0, 3)])
def test_outside_clicks_are_safe_in_all_modes(key: str, position) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    editor = EditController(grid)
    editor.select_mode(key)
    before = snapshot(grid)

    assert not editor.edit_cell(position)
    assert snapshot(grid) == before
    assert editor.status


@pytest.mark.parametrize("position", [(True, 0), (0.5, 1), (1,), [1, 1]])
def test_malformed_cell_input_is_rejected_without_changing_map(position) -> None:
    grid = Grid(3, 5)
    editor = EditController(grid)

    assert not editor.edit_cell(position)
    assert snapshot(grid) == (None, None, frozenset())


def test_controller_runs_without_site_packages() -> None:
    source_root = Path(__file__).resolve().parents[1] / "src"
    code = (
        "import sys; "
        f"sys.path.insert(0, {str(source_root)!r}); "
        "from robot_path_lab.grid import Grid; "
        "from robot_path_lab.controller import EditController; "
        "grid = Grid(2, 3); "
        "assert EditController(grid).edit_cell((1, 1)); "
        "assert grid.is_blocked((1, 1)); "
        "assert 'pygame' not in sys.modules"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-B", "-c", code],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
