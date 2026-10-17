"""Create a static preview and keep its Pygame window responsive."""

import pygame

from robot_path_lab.grid import Grid
from robot_path_lab.ui.renderer import FOOTER_HEIGHT, HEADER_HEIGHT, PADDING, GridRenderer


def create_demo_grid(rows: int, cols: int) -> Grid:
    """Provide visible sample data without coupling it to the Grid class."""
    grid = Grid(rows, cols, start=(0, 0), goal=(cols - 1, rows - 1))
    for y in range(rows // 4, 3 * rows // 4):
        position = (cols // 2, y)
        if y != rows // 2 and position not in (grid.start, grid.goal):
            grid.add_obstacle(position)
    return grid


def run(grid: Grid) -> int:
    """Show a real window until its close button or Escape is pressed."""
    try:
        pygame.display.init()
        pygame.font.init()
        desktop_width, desktop_height = pygame.display.get_desktop_sizes()[0]
        available_width = desktop_width - 80
        available_height = desktop_height - 100
        cell_size = min(
            24,
            (available_width - 2 * PADDING) // grid.cols,
            (available_height - HEADER_HEIGHT - FOOTER_HEIGHT) // grid.rows,
        )
        if cell_size < 8 or available_width < 720:
            raise ValueError("Map is too large for this display; use fewer rows or columns.")
        renderer = GridRenderer(cell_size)
        screen = pygame.display.set_mode(renderer.window_size(grid))
        pygame.display.set_caption(f"Robot Path Planning Lab - {grid.rows} x {grid.cols}")
        clock = pygame.time.Clock()

        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    running = False
            if running:
                renderer.draw(screen, grid)
                pygame.display.flip()
                clock.tick(60)
        return 0
    finally:
        pygame.quit()
