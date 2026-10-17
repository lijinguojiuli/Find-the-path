import pytest

from robot_path_lab.algorithms import astar
from robot_path_lab.grid import Grid
from robot_path_lab.robot import Robot


def make_robot(speed=2):
    grid = Grid(1, 5, start=(0, 0), goal=(4, 0))
    return grid, Robot(grid, astar(grid).path, speed=speed)


def test_time_based_movement_stops_at_goal_and_can_reset():
    _, robot = make_robot()
    assert robot.position == (0, 0) and robot.state == "ready"
    robot.update(100)
    assert robot.position == (0, 0)
    robot.start(); robot.update(.25)
    assert robot.position == (0, 0)
    robot.update(.25)
    assert robot.position == (1, 0)
    robot.update(100)
    assert robot.position == (4, 0) and robot.state == "arrived"
    robot.start(); robot.update(100)
    assert robot.position == (4, 0)
    robot.reset()
    assert robot.position == (0, 0) and robot.steps_moved == 0 and robot.state == "ready"


def test_pause_resume_preserves_partial_step_without_accumulating_paused_time():
    _, robot = make_robot()
    robot.start(); robot.update(.25); robot.pause(); robot.update(100)
    assert robot.position == (0, 0)
    robot.start(); robot.update(.25)
    assert robot.position == (1, 0)


def test_different_frame_partitions_have_identical_positions():
    _, first = make_robot(); _, second = make_robot()
    first.start(); second.start(); first.update(1.5)
    for _ in range(15):
        second.update(.1)
    assert first.position == second.position == (3, 0)


def test_large_delta_checks_every_cell_and_stops_before_obstacle():
    grid, robot = make_robot()
    grid.add_obstacle((2, 0))
    robot.start(); robot.update(100)
    assert robot.position == (1, 0) and robot.state == "blocked"
    robot.start(); robot.update(100)
    assert robot.position == (1, 0)


def test_same_endpoint_never_moves():
    grid = Grid(1, 1, start=(0, 0), goal=(0, 0))
    robot = Robot(grid, astar(grid).path)
    robot.start(); robot.update(100)
    assert robot.position == (0, 0) and robot.state == "arrived"


@pytest.mark.parametrize("path", [(), ((1, 0), (2, 0)), ((0, 0),), ((0, 0), (2, 0)), ((0, 0), (0, 1), (2, 0))])
def test_invalid_route_is_rejected(path):
    with pytest.raises(ValueError):
        Robot(Grid(1, 3, start=(0, 0), goal=(2, 0)), path)


def test_path_through_obstacle_is_rejected():
    with pytest.raises(ValueError):
        Robot(Grid(1, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0)}), ((0, 0), (1, 0), (2, 0)))


@pytest.mark.parametrize("value", [0, -1, True, float("inf"), float("nan"), "2"])
def test_invalid_speed_is_rejected(value):
    with pytest.raises(ValueError):
        make_robot(value)


@pytest.mark.parametrize("value", [-1, True, float("inf"), float("nan"), "2"])
def test_invalid_delta_is_rejected(value):
    _, robot = make_robot()
    with pytest.raises(ValueError):
        robot.update(value)


def test_terrain_changes_planning_cost_not_robot_cells_per_second():
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0), costs={(1, 0): 5})
    robot = Robot(grid, astar(grid).path, speed=1)
    robot.start(); robot.update(1)
    assert robot.position == (1, 0)
    robot.speed = 2; robot.update(.5)
    assert robot.position == (2, 0)
