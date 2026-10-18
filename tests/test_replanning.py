"""Dynamic obstacle scenarios, safe route replacement and stale result guards."""

import pytest

from robot_path_lab.algorithms import SearchResult, astar, dijkstra
from robot_path_lab.grid import Grid
from robot_path_lab.replanning import DynamicPlanner, run_replan
from robot_path_lab.robot import Robot


def moving_robot(rows=5):
    y = rows // 2
    grid = Grid(rows, 7, start=(0, y), goal=(6, y))
    robot = Robot(grid, astar(grid).path, speed=2)
    robot.start(); robot.update(1)
    return grid, robot, DynamicPlanner(robot)


def assert_valid_route(grid, path, origin):
    assert path[0] == origin and path[-1] == grid.goal
    assert all(grid.in_bounds(cell) and not grid.is_blocked(cell) for cell in path)
    assert all(sum(abs(a - b) for a, b in zip(first, second)) == 1 for first, second in zip(path, path[1:]))


def test_obstacle_outside_remaining_route_does_not_interrupt_movement():
    grid, robot, planner = moving_robot()
    before = robot.path
    robot.update(.25)
    assert planner.add_obstacle((0, 0)) is None
    assert grid.is_blocked((0, 0))
    assert robot.state == "moving" and robot.path == before and planner.replan_count == 0
    robot.update(.25)
    assert robot.position == (3, 2)  # The partial step was preserved.


def test_blocking_remaining_route_discards_old_path_before_search():
    _, robot, planner = moving_robot()
    origin = robot.position
    request = planner.change_obstacle((3, 2))
    assert request is not None
    assert robot.state == "replanning" and robot.path == (origin,)
    robot.start(); robot.update(100)
    assert robot.position == origin
    assert request.snapshot.start == origin


def test_successful_replan_starts_here_preserves_map_start_and_resumes():
    grid, robot, planner = moving_robot()
    origin, original_start = robot.position, grid.start
    result = planner.add_obstacle((3, 2))
    assert result.found
    assert_valid_route(grid, result.path, origin)
    assert grid.start == original_start
    assert robot.position == origin and robot.speed == 2 and robot.state == "moving"
    assert planner.replan_count == 1
    baseline = Grid(grid.rows, grid.cols, start=origin, goal=grid.goal, obstacles=grid.obstacles)
    assert result.total_cost == dijkstra(baseline).total_cost
    robot.update(100)
    assert robot.position == grid.goal and robot.state == "arrived"


def test_failed_replan_stops_safely_and_never_resurrects_old_route():
    grid, robot, planner = moving_robot(1)
    origin = robot.position
    result = planner.add_obstacle((3, 0))
    assert not result.found and result.path == ()
    assert robot.state == "blocked" and robot.path == (origin,)
    for _ in range(3):
        robot.start(); robot.update(100); robot.reset()
        assert robot.position == origin and robot.state == "blocked"
    assert origin != grid.goal


def test_current_robot_cell_and_endpoints_are_protected_without_mutation():
    grid, robot, planner = moving_robot()
    for cell in [robot.position, grid.start, grid.goal]:
        before = (grid.obstacles, robot.path, robot.state, planner.version)
        with pytest.raises(ValueError):
            planner.add_obstacle(cell)
        assert (grid.obstacles, robot.path, robot.state, planner.version) == before


def test_obstacle_on_traversed_part_does_not_trigger_replanning():
    _, robot, planner = moving_robot()
    assert planner.add_obstacle((1, 2)) is None
    assert robot.state == "moving" and planner.replan_count == 0
    robot.update(100)
    assert robot.state == "arrived"


def test_repeated_obstacle_is_a_noop_and_removal_keeps_current_position():
    grid, robot, planner = moving_robot()
    planner.add_obstacle((0, 0)); version = planner.version
    planner.add_obstacle((0, 0))
    assert planner.version == version
    origin = robot.position
    assert planner.change_obstacle((0, 0), blocked=False) is None
    assert not grid.is_blocked((0, 0)) and robot.position == origin


def test_already_paused_robot_stays_paused_after_success():
    _, robot, planner = moving_robot()
    robot.pause()
    origin = robot.position
    assert planner.add_obstacle((3, 2)).found
    assert robot.state == "paused"
    robot.update(100)
    assert robot.position == origin


def test_pause_during_pending_search_prevents_automatic_resume():
    _, robot, planner = moving_robot()
    request = planner.change_obstacle((3, 2))
    planner.pause()
    assert planner.finish_replan(request, run_replan(request))
    assert robot.state == "paused"


def test_rapid_edits_reject_old_results_and_accept_latest_snapshot():
    grid, robot, planner = moving_robot()
    first = planner.change_obstacle((3, 2)); old_result = run_replan(first)
    second = planner.change_obstacle((0, 0))  # Harmless, but snapshot version changed.
    assert second.token != first.token and second.version > first.version
    assert not planner.finish_replan(first, old_result)
    assert robot.state == "replanning"
    assert planner.finish_replan(second, run_replan(second))
    assert_valid_route(grid, robot.path, (2, 2))


def test_stale_success_after_a_newer_failure_cannot_restart_robot():
    _, robot, planner = moving_robot(3)
    first = planner.change_obstacle((3, 1)); old_result = run_replan(first)
    planner.change_obstacle((3, 0))
    last = planner.change_obstacle((3, 2)); failed = run_replan(last)
    assert not failed.found
    assert planner.finish_replan(last, failed)
    assert not planner.finish_replan(first, old_result)
    robot.start(); robot.update(100)
    assert robot.state == "blocked" and robot.position == (2, 1)


def test_remove_blockage_and_retry_from_stopped_position():
    _, robot, planner = moving_robot(1)
    planner.add_obstacle((3, 0))
    planner.change_obstacle((3, 0), blocked=False)
    request = planner.request_replan()
    assert request.snapshot.start == (2, 0)
    assert planner.finish_replan(request, run_replan(request))
    assert robot.state == "ready"
    robot.start(); robot.update(100)
    assert robot.state == "arrived"


def test_weighted_replanning_uses_entry_costs_and_excludes_origin():
    grid, robot, planner = moving_robot(3)
    grid.set_cost(robot.position, 9)
    for x in range(2, 7):
        grid.set_cost((x, 0), 5)
    result = planner.add_obstacle((3, 1))
    assert result.found and (2, 2) in result.path
    assert result.total_cost == sum(grid.cost_at(cell) for cell in result.path[1:]) == 6


def test_invalid_replacement_is_rejected_and_old_route_stays_discarded():
    _, robot, planner = moving_robot()
    request = planner.change_obstacle((3, 2))
    with pytest.raises(ValueError):
        planner.finish_replan(request, SearchResult(True, ((0, 2), (6, 2)), (), 1))
    assert robot.state == "blocked" and robot.path == ((2, 2),)


def test_direct_map_change_while_searching_cannot_install_stale_path():
    grid, robot, planner = moving_robot()
    request = planner.change_obstacle((3, 2)); result = run_replan(request)
    grid.add_obstacle((2, 1))
    assert not planner.finish_replan(request, result)
    assert robot.state == "blocked"


def test_reset_cannot_teleport_back_into_a_new_obstacle_on_the_replanned_origin():
    grid, robot, planner = moving_robot()
    planner.add_obstacle((3, 2))
    replanned_origin = robot.position
    robot.update(.5)
    current = robot.position
    assert current != replanned_origin
    planner.add_obstacle(replanned_origin)  # Already traversed, so keep moving.
    robot.reset()
    assert robot.position == current
    assert not grid.is_blocked(robot.position)
    assert robot.state == "blocked"


@pytest.mark.parametrize("position", [(-1, 0), (7, 0), (0, 5)])
def test_outside_map_is_rejected_without_changing_movement(position):
    grid, robot, planner = moving_robot()
    before = grid.obstacles
    with pytest.raises(ValueError):
        planner.add_obstacle(position)
    assert grid.obstacles == before and robot.state == "moving"


@pytest.mark.parametrize("pending", [False, True], ids=["first-request", "replace-pending"])
@pytest.mark.parametrize("entrypoint", ["request", "obstacle"])
def test_invalid_replan_preparation_cleans_request_and_stops_safely(pending, entrypoint):
    grid, robot, planner = moving_robot()
    if pending:
        planner.change_obstacle((3, 2))
    origin, goal = robot.position, grid.goal
    grid.set_goal(None)
    with pytest.raises(ValueError, match="起点.*终点"):
        if entrypoint == "request":
            planner.request_replan()
        else:
            planner.add_obstacle((4, 2) if pending else (3, 2))
    assert planner.pending is None
    assert robot.state == "blocked" and robot.path == (origin,)
    robot.start(); robot.update(100)
    assert robot.position == origin
    grid.set_goal(goal)
    request = planner.request_replan()
    assert planner.finish_replan(request, run_replan(request))
    assert robot.state == "ready"
