"""Behavior audit using reproducible maps and independent path validation."""

import random

import pytest

from robot_path_lab.algorithms import astar, bfs, dijkstra
from robot_path_lab.grid import Grid
from robot_path_lab.replanning import DynamicPlanner
from robot_path_lab.robot import Robot

SEEDS = (0, 7, 42, 20261018)
ALGORITHMS = (bfs, dijkstra, astar)


def map_state(grid):
    return grid.rows, grid.cols, grid.start, grid.goal, grid.obstacles, dict(grid.costs)


def validate_result(grid, result):
    """Check observable contracts without using production neighbor helpers."""
    assert result.visited_order[0] == grid.start
    assert result.visited_count == len(result.visited_order) == len(set(result.visited_order))
    for cell in (*result.path, *result.visited_order):
        assert grid.in_bounds(cell), f"Out of bounds: {cell}"
        assert not grid.is_blocked(cell), f"Path/visit through wall: {cell}"
    if not result.found:
        assert result.path == () and result.total_cost is None
        assert grid.goal not in result.visited_order
        return
    assert result.path[0] == grid.start and result.path[-1] == grid.goal
    assert result.visited_order[-1] == grid.goal
    assert len(set(result.path)) == len(result.path)
    for first, second in zip(result.path, result.path[1:]):
        assert abs(first[0] - second[0]) + abs(first[1] - second[1]) == 1
    assert result.total_cost == sum(grid.cost_at(cell) for cell in result.path[1:])


CASES = [
    ("empty", 5, 7, (0, 0), (6, 4), set(), {}, 10, 10),
    ("sealed", 5, 5, (0, 0), (4, 4), {(x, y) for y in range(5) for x in range(5)} - {(0, 0), (4, 4)}, {}, None, None),
    ("same", 1, 1, (0, 0), (0, 0), set(), {(0, 0): 9}, 0, 0),
    ("top-edge", 5, 5, (4, 0), (4, 4), set(), {}, 4, 4),
    ("left-edge", 5, 5, (0, 4), (4, 4), set(), {}, 4, 4),
    ("reverse-corner", 5, 5, (4, 4), (0, 0), set(), {}, 8, 8),
    ("single-row", 1, 15, (0, 0), (14, 0), set(), {}, 14, 14),
    ("single-column", 15, 1, (0, 0), (0, 14), set(), {}, 14, 14),
    ("goal-enclosed", 5, 5, (0, 0), (2, 2), {(1, 2), (3, 2), (2, 1), (2, 3)}, {}, None, None),
    ("weighted-detour", 3, 5, (0, 1), (4, 1), set(), {(x, 1): 5 for x in (1, 2, 3)}, 6, 6),
]


@pytest.mark.parametrize("algorithm", ALGORITHMS, ids=lambda item: item.__name__)
@pytest.mark.parametrize("case", CASES, ids=lambda item: item[0])
def test_required_edge_cases_have_legal_paths_and_known_answers(algorithm, case):
    name, rows, cols, start, goal, obstacles, costs, steps, total = case
    grid = Grid(rows, cols, start=start, goal=goal, obstacles=obstacles, costs=costs)
    before = map_state(grid)
    result = algorithm(grid)
    validate_result(grid, result)
    assert result.found == (steps is not None)
    if name == "weighted-detour" and algorithm is bfs:
        steps, total = 4, 16  # BFS optimizes steps, not terrain cost.
    assert result.total_cost == total
    if steps is not None:
        assert len(result.path) - 1 == steps
    assert map_state(grid) == before


@pytest.mark.parametrize("algorithm", ALGORITHMS, ids=lambda item: item.__name__)
def test_all_cells_blocked_cannot_have_legal_endpoints(algorithm):
    grid = Grid(3, 3, obstacles={(x, y) for y in range(3) for x in range(3)})
    with pytest.raises(ValueError, match="起点.*终点"):
        algorithm(grid)
    with pytest.raises(ValueError):
        grid.set_start((0, 0))


def random_grid(seed, case, *, small=False):
    rng = random.Random(seed * 100_000 + case)
    limit = 6 if small else 19
    rows, cols = rng.randrange(1, limit), rng.randrange(1, limit)
    start = rng.randrange(cols), rng.randrange(rows)
    goal = start if case % 17 == 0 else (rng.randrange(cols), rng.randrange(rows))
    density = (0, .15, .35, .55)[case % 4]
    obstacles, costs = set(), {}
    for y in range(rows):
        for x in range(cols):
            cell = (x, y)
            if cell not in (start, goal) and rng.random() < density:
                obstacles.add(cell)
            else:
                cost = 5 if case % 10 == 0 else 1 if case % 3 == 0 else rng.choice((1, 2, 5, 9, 17))
                if cost != 1:
                    costs[cell] = cost
    return Grid(rows, cols, start=start, goal=goal, obstacles=obstacles, costs=costs)


@pytest.mark.parametrize("seed,case", [pytest.param(seed, case, id=f"seed-{seed}-map-{case}") for seed in SEEDS for case in range(75)])
def test_300_seeded_maps_astar_and_dijkstra_have_identical_optimal_cost(seed, case):
    grid = random_grid(seed, case)
    before = map_state(grid)
    first, second, breadth = astar(grid), dijkstra(grid), bfs(grid)
    for result in (first, second, breadth):
        validate_result(grid, result)
    assert first.found == second.found == breadth.found
    assert first.total_cost == second.total_cost
    if first.found:
        assert first.total_cost <= breadth.total_cost
        entry_costs = {grid.cost_at((x, y)) for y in range(grid.rows) for x in range(grid.cols) if (x, y) not in grid.obstacles}
        if len(entry_costs) == 1:
            assert breadth.total_cost == first.total_cost
    assert map_state(grid) == before


def reference_cost(grid):
    """Bellman-Ford on tiny maps: no heap, heuristic or shared neighbors."""
    cells = [(x, y) for y in range(grid.rows) for x in range(grid.cols) if not grid.is_blocked((x, y))]
    distances = {cell: float("inf") for cell in cells}
    distances[grid.start] = 0
    for _ in range(len(cells) - 1):
        changed = False
        for x, y in cells:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                neighbor = x + dx, y + dy
                if neighbor not in distances:
                    continue
                candidate = distances[(x, y)] + grid.cost_at(neighbor)
                if candidate < distances[neighbor]:
                    distances[neighbor] = candidate
                    changed = True
        if not changed:
            break
    best = distances[grid.goal]
    return None if best == float("inf") else best


@pytest.mark.parametrize("seed,case", [pytest.param(seed, case, id=f"seed-{seed}-small-{case}") for seed in SEEDS for case in range(10)])
def test_40_small_random_maps_also_match_independent_bellman_ford(seed, case):
    grid = random_grid(seed, case, small=True)
    expected = reference_cost(grid)
    assert astar(grid).total_cost == dijkstra(grid).total_cost == expected


@pytest.mark.parametrize("seed,case", [pytest.param(seed, case, id=f"seed-{seed}-replan-{case}") for seed in SEEDS for case in range(25)])
def test_100_seeded_dynamic_maps_preserve_position_and_match_optimal_cost(seed, case):
    rng = random.Random(seed * 100_000 + case)
    rows, cols = rng.randint(3, 9), rng.randint(6, 12)
    middle = rows // 2
    obstacles, costs = set(), {}
    for y in range(rows):
        for x in range(cols):
            if y == middle:
                continue
            if rng.random() < .3:
                obstacles.add((x, y))
            else:
                costs[(x, y)] = rng.choice((2, 5, 9))
    obstacles.discard((0, 0))
    grid = Grid(rows, cols, start=(0, middle), goal=(cols - 1, middle), obstacles=obstacles, costs=costs)
    robot = Robot(grid, astar(grid).path, speed=2)
    robot.start(); robot.update(1)
    if case % 2:
        robot.pause()
    planner = DynamicPlanner(robot)
    origin, state, route = robot.position, robot.state, robot.path
    assert planner.add_obstacle((0, 0)) is None
    assert robot.position == origin and robot.state == state and robot.path == route
    wall_x = rng.randrange(3, cols - 1)
    if case % 5 == 0:
        for y in range(rows):
            if y != middle:
                assert planner.add_obstacle((wall_x, y)) is None
    result = planner.add_obstacle((wall_x, middle))
    assert result is not None and planner.replan_count == 1
    assert robot.position == origin and grid.start == (0, middle)
    snapshot = Grid(rows, cols, start=origin, goal=grid.goal, obstacles=grid.obstacles, costs=grid.costs)
    baseline = dijkstra(snapshot)
    validate_result(snapshot, result)
    assert result.found == baseline.found and result.total_cost == baseline.total_cost
    if result.found:
        assert robot.state == state
        robot.start(); robot.update(10000)
        assert robot.state == "arrived" and robot.position == grid.goal
    else:
        assert robot.state == "blocked" and robot.path == (origin,)
        robot.start(); robot.update(10000)
        assert robot.position == origin
    assert not grid.is_blocked(robot.position)
