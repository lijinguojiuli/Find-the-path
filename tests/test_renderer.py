"""Check drawing on an off-screen Surface without opening a window."""

import pygame
import pytest

from robot_path_lab.grid import Grid
from robot_path_lab.ui.renderer import GridRenderer


@pytest.fixture(autouse=True)
def font_module():
    pygame.font.init()
    yield
    pygame.font.quit()


def cell_sample(surface, renderer, grid, position):
    area = renderer.grid_rect(grid)
    x, y = position
    return tuple(surface.get_at((area.left + x * renderer.cell_size + 4,
                                 area.top + y * renderer.cell_size + 4)))[:3]


def test_non_square_grid_draws_four_distinct_cell_types_in_correct_positions() -> None:
    grid = Grid(2, 4, start=(0, 0), goal=(3, 1), obstacles={(2, 0)})
    renderer = GridRenderer()
    surface = pygame.Surface(renderer.window_size(grid))

    renderer.draw(surface, grid)

    empty = cell_sample(surface, renderer, grid, (0, 1))
    blocked = cell_sample(surface, renderer, grid, (2, 0))
    start = cell_sample(surface, renderer, grid, (0, 0))
    goal = cell_sample(surface, renderer, grid, (3, 1))
    assert len({empty, blocked, start, goal}) == 4
    assert min(empty) > max(blocked)
    assert start[1] > start[0]
    assert goal[0] > goal[1]


def test_drawing_does_not_change_model() -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2), obstacles={(2, 1)})
    before = (grid.rows, grid.cols, grid.start, grid.goal, grid.obstacles)
    renderer = GridRenderer()

    renderer.draw(pygame.Surface(renderer.window_size(grid)), grid)

    assert (grid.rows, grid.cols, grid.start, grid.goal, grid.obstacles) == before


def test_overlapping_endpoints_show_both_colors() -> None:
    grid = Grid(1, 1, start=(0, 0), goal=(0, 0))
    renderer = GridRenderer()
    surface = pygame.Surface(renderer.window_size(grid))
    renderer.draw(surface, grid)
    area = renderer.grid_rect(grid)

    upper_left = surface.get_at((area.left + 4, area.top + 4))
    lower_right = surface.get_at((area.right - 4, area.bottom - 4))
    assert upper_left.g > upper_left.r
    assert lower_right.r > lower_right.g
