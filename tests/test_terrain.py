"""Weighted routes are checked against known answers and independent DFS."""

import pytest

from robot_path_lab.algorithms import astar, bfs, dijkstra, iter_astar
from robot_path_lab.grid import Grid
from robot_path_lab.metrics import compare_algorithms


@pytest.mark.parametrize("cost", [0, -1, -10])
def test_nonpositive_cost_is_rejected_without_changing_map(cost):
    grid = Grid(1, 2, costs={(1, 0): 5})
    with pytest.raises(ValueError):
        grid.set_cost((1, 0), cost)
    assert grid.cost_at((1, 0)) == 5


@pytest.mark.parametrize("cost", [True, 1.5, "5", None, float("inf"), float("nan")])
def test_cost_must_be_an_integer(cost):
    with pytest.raises(TypeError):
        Grid(1, 1).set_cost((0, 0), cost)


def test_cost_bounds_obstacles_and_read_only_snapshot():
    grid = Grid(2, 2, costs={(1, 0): 5})
    costs = grid.costs
    with pytest.raises(TypeError):
        costs[(1, 0)] = 9
    grid.set_cost((1, 0), 1)
    assert costs[(1, 0)] == 5
    assert not grid.costs
    with pytest.raises(ValueError):
        grid.set_cost((2, 0), 5)
    grid.add_obstacle((1, 0))
    with pytest.raises(ValueError):
        grid.set_cost((1, 0), 5)
    with pytest.raises(ValueError):
        grid.cost_at((1, 0))
    grid.remove_obstacle((1, 0))
    assert grid.cost_at((1, 0)) == 1


def test_shorter_route_can_cost_more_and_comparison_preserves_terrain():
    grid = Grid(3, 5, start=(0, 1), goal=(4, 1), costs={(x, 1): 5 for x in (1, 2, 3)})
    results = [item.result for item in compare_algorithms(grid)]
    assert [len(result.path) - 1 for result in results] == [4, 6, 6]
    assert [result.total_cost for result in results] == [16, 6, 6]
    for result in results:
        assert result.total_cost == sum(grid.cost_at(cell) for cell in result.path[1:])


@pytest.mark.parametrize("algorithm", [bfs, dijkstra, astar])
def test_enter_goal_cost_is_paid_but_start_cost_is_not(algorithm):
    grid = Grid(1, 2, start=(0, 0), goal=(1, 0), costs={(0, 0): 9, (1, 0): 5})
    assert algorithm(grid).total_cost == 5
    grid.set_goal((0, 0))
    assert algorithm(grid).total_cost == 0


def test_costs_are_captured_before_iteration_and_all_high_cost_map():
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0), costs={(x, 0): 5 for x in range(3)})
    assert grid.minimum_cost == 5
    search = iter_astar(grid)
    grid.set_cost((1, 0), 1)
    assert grid.minimum_cost == 1
    while True:
        try:
            next(search)
        except StopIteration as complete:
            assert complete.value.total_cost == 10
            break


@pytest.mark.parametrize("algorithm", [bfs, dijkstra, astar])
def test_unreachable_weighted_map_has_no_cost(algorithm):
    grid = Grid(1, 3, start=(0, 0), goal=(2, 0), obstacles={(1, 0)}, costs={(2, 0): 5})
    assert algorithm(grid).total_cost is None


def exhaustive_cost(grid):
    """Enumerate simple paths on a tiny map, with no heap or heuristic."""
    best = float("inf")

    def visit(cell, seen, cost):
        nonlocal best
        if cell == grid.goal:
            best = min(best, cost)
            return
        if cost >= best:
            return
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            neighbor = (cell[0] + dx, cell[1] + dy)
            if grid.in_bounds(neighbor) and neighbor not in seen and not grid.is_blocked(neighbor):
                visit(neighbor, seen | {neighbor}, cost + grid.cost_at(neighbor))

    visit(grid.start, {grid.start}, 0)
    return None if best == float("inf") else best


def test_weighted_algorithms_match_independent_oracle_on_128_terrain_layouts():
    cells = [(x, y) for y in range(3) for x in range(3) if (x, y) not in {(0, 0), (2, 2)}]
    for mask in range(128):
        grid = Grid(3, 3, start=(0, 0), goal=(2, 2), costs={cell: 5 for i, cell in enumerate(cells) if mask & (1 << i)})
        expected = exhaustive_cost(grid)
        for algorithm in (dijkstra, astar):
            result = algorithm(grid)
            assert result.total_cost == expected, mask
            assert result.total_cost == sum(grid.cost_at(cell) for cell in result.path[1:])
