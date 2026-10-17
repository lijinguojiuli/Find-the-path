"""Draw a grid without changing its state or handling user input."""

import pygame

from robot_path_lab.controller import EditMode
from robot_path_lab.grid import Grid, Position

PADDING = 24
HEADER_HEIGHT = 156
FOOTER_HEIGHT = 72

BACKGROUND = (15, 23, 42)
EMPTY = (238, 242, 247)
OBSTACLE = (51, 65, 85)
START = (34, 197, 94)
GOAL = (248, 113, 113)
GRID_LINE = (148, 163, 184)
TEXT = (226, 232, 240)
MUTED_TEXT = (148, 163, 184)
ACTIVE_MODE = (37, 99, 235)


class GridRenderer:
    """Translate grid coordinates to pixel rectangles and render them."""

    def __init__(self, cell_size: int = 24) -> None:
        if type(cell_size) is not int or cell_size < 8:
            raise ValueError("Cell size must be an integer of at least 8 pixels.")
        self.cell_size = cell_size
        self._title_font = pygame.font.Font(None, 32)
        self._font = pygame.font.Font(None, 22)
        self._small_font = pygame.font.Font(None, 18)

    def window_size(self, grid: Grid) -> tuple[int, int]:
        return (
            max(720, grid.cols * self.cell_size + 2 * PADDING),
            HEADER_HEIGHT + grid.rows * self.cell_size + FOOTER_HEIGHT,
        )

    def grid_rect(self, grid: Grid) -> pygame.Rect:
        width = grid.cols * self.cell_size
        height = grid.rows * self.cell_size
        return pygame.Rect((self.window_size(grid)[0] - width) // 2, HEADER_HEIGHT, width, height)

    def pixel_to_cell(self, grid: Grid, pixel: tuple[int, int]) -> Position | None:
        """Map pixels to a cell; right/bottom outer edges are outside."""
        area = self.grid_rect(grid)
        if not area.collidepoint(pixel):
            return None
        return (
            (pixel[0] - area.left) // self.cell_size,
            (pixel[1] - area.top) // self.cell_size,
        )

    def draw(
        self,
        surface: pygame.Surface,
        grid: Grid,
        *,
        mode: EditMode = EditMode.OBSTACLE,
        status: str = "Mode 1: click a cell to add or clear an obstacle.",
    ) -> None:
        surface.fill(BACKGROUND)
        surface.blit(self._title_font.render("Robot Path Planning Lab", True, TEXT), (PADDING, 18))
        obstacles = grid.obstacles
        summary = f"{grid.rows} rows x {grid.cols} columns  |  {len(obstacles)} obstacles"
        surface.blit(self._font.render(summary, True, MUTED_TEXT), (PADDING, 52))

        for index, (label, color) in enumerate(
            (("Empty", EMPTY), ("Obstacle", OBSTACLE), ("Start (S)", START), ("Goal (G)", GOAL))
        ):
            x = PADDING + index * 150
            pygame.draw.rect(surface, color, (x, 82, 14, 14))
            surface.blit(self._small_font.render(label, True, TEXT), (x + 22, 82))

        choices = (
            (EditMode.OBSTACLE, "[1] Obstacle toggle"),
            (EditMode.START, "[2] Set start"),
            (EditMode.GOAL, "[3] Set goal"),
        )
        for index, (choice, label) in enumerate(choices):
            x = PADDING + index * 220
            color = ACTIVE_MODE if mode is choice else OBSTACLE
            pygame.draw.rect(surface, color, (x, 112, 210, 28), border_radius=4)
            surface.blit(self._font.render(label, True, TEXT), (x + 10, 117))

        area = self.grid_rect(grid)
        for y in range(grid.rows):
            for x in range(grid.cols):
                position = (x, y)
                cell = pygame.Rect(
                    area.left + x * self.cell_size,
                    area.top + y * self.cell_size,
                    self.cell_size,
                    self.cell_size,
                )
                label = ""
                if position == grid.start == grid.goal:
                    pygame.draw.polygon(surface, START, (cell.topleft, cell.topright, cell.bottomleft))
                    pygame.draw.polygon(surface, GOAL, (cell.topright, cell.bottomright, cell.bottomleft))
                    label = "S/G"
                else:
                    color = EMPTY
                    if position in obstacles:
                        color = OBSTACLE
                    elif position == grid.start:
                        color, label = START, "S"
                    elif position == grid.goal:
                        color, label = GOAL, "G"
                    pygame.draw.rect(surface, color, cell)
                if label and self.cell_size >= 20:
                    text = self._small_font.render(label, True, BACKGROUND)
                    surface.blit(text, text.get_rect(center=cell.center))

        for x in range(grid.cols + 1):
            pixel_x = area.left + x * self.cell_size
            pygame.draw.line(surface, GRID_LINE, (pixel_x, area.top), (pixel_x, area.bottom))
        for y in range(grid.rows + 1):
            pixel_y = area.top + y * self.cell_size
            pygame.draw.line(surface, GRID_LINE, (area.left, pixel_y), (area.right, pixel_y))

        feedback = self._font.render(f"Status: {status}", True, TEXT)
        surface.blit(feedback, (PADDING, self.window_size(grid)[1] - 52))
        help_text = "Left click: apply mode | Outside/right clicks: ignored | Esc: exit"
        footer = self._small_font.render(help_text, True, MUTED_TEXT)
        surface.blit(footer, (PADDING, self.window_size(grid)[1] - 26))
