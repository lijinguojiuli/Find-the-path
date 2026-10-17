"""Exercise the event adapter using SDL's dummy display, without a real window."""

import pygame
import pytest

from robot_path_lab.controller import EditMode
from robot_path_lab.grid import Grid
from robot_path_lab.ui.app import run
from robot_path_lab.ui.renderer import GridRenderer


@pytest.fixture(autouse=True)
def dummy_display(monkeypatch):
    monkeypatch.setenv("SDL_VIDEODRIVER", "dummy")
    yield
    pygame.quit()


def cell_center(renderer, grid, position):
    area = renderer.grid_rect(grid)
    x, y = position
    return (area.left + x * renderer.cell_size + renderer.cell_size // 2,
            area.top + y * renderer.cell_size + renderer.cell_size // 2)


def test_keyboard_modes_and_left_clicks_reach_the_model(monkeypatch) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    original_draw = GridRenderer.draw
    frames = []

    def draw_and_queue(self, surface, displayed_grid, **kwargs):
        original_draw(self, surface, displayed_grid, **kwargs)
        frames.append(kwargs)
        if len(frames) == 1:
            for key, position in [
                (pygame.K_2, (1, 1)),
                (pygame.K_KP3, (3, 1)),
                (pygame.K_1, (2, 1)),
            ]:
                pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=key))
                pygame.event.post(pygame.event.Event(
                    pygame.MOUSEBUTTONDOWN, button=1,
                    pos=cell_center(self, displayed_grid, position),
                ))
        else:
            pygame.event.post(pygame.event.Event(pygame.QUIT))

    monkeypatch.setattr(GridRenderer, "draw", draw_and_queue)
    assert run(grid) == 0
    assert grid.start == (1, 1)
    assert grid.goal == (3, 1)
    assert grid.obstacles == frozenset({(2, 1)})
    assert frames[-1]["mode"] is EditMode.OBSTACLE
    assert "Added" in frames[-1]["status"]


def test_outside_right_click_motion_and_unknown_keys_do_not_edit(monkeypatch) -> None:
    grid = Grid(3, 5, start=(0, 0), goal=(4, 2))
    original_draw = GridRenderer.draw
    frames = []

    def draw_and_queue(self, surface, displayed_grid, **kwargs):
        original_draw(self, surface, displayed_grid, **kwargs)
        frames.append(kwargs)
        if len(frames) == 1:
            area = self.grid_rect(displayed_grid)
            inside = cell_center(self, displayed_grid, (2, 1))
            for position in [(area.right, area.top), (area.left, area.bottom), (0, 0)]:
                pygame.event.post(pygame.event.Event(
                    pygame.MOUSEBUTTONDOWN, button=1, pos=position,
                ))
            pygame.event.post(pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=3, pos=inside))
            pygame.event.post(pygame.event.Event(pygame.MOUSEMOTION, pos=inside, buttons=(1, 0, 0)))
            pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_x))
        else:
            pygame.event.post(pygame.event.Event(pygame.QUIT))

    monkeypatch.setattr(GridRenderer, "draw", draw_and_queue)
    assert run(grid) == 0
    assert (grid.start, grid.goal, grid.obstacles) == ((0, 0), (4, 2), frozenset())
    assert frames[-1]["mode"] is EditMode.OBSTACLE


def test_escape_stops_before_later_mouse_events_are_applied(monkeypatch) -> None:
    grid = Grid(3, 5)
    original_draw = GridRenderer.draw

    def draw_and_exit(self, surface, displayed_grid, **kwargs):
        original_draw(self, surface, displayed_grid, **kwargs)
        pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_ESCAPE))
        pygame.event.post(pygame.event.Event(
            pygame.MOUSEBUTTONDOWN, button=1,
            pos=cell_center(self, displayed_grid, (2, 1)),
        ))

    monkeypatch.setattr(GridRenderer, "draw", draw_and_exit)
    assert run(grid) == 0
    assert grid.obstacles == frozenset()
