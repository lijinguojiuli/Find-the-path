"""Testable map editing rules, independent of Pygame."""

from enum import Enum

from robot_path_lab.grid import Grid, Position


class EditMode(Enum):
    OBSTACLE = "Obstacle"
    START = "Start"
    GOAL = "Goal"


MODE_KEYS = {"1": EditMode.OBSTACLE, "2": EditMode.START, "3": EditMode.GOAL}


class EditController:
    """Apply one explicit editing mode and report rejected actions safely."""

    def __init__(self, grid: Grid) -> None:
        self.grid = grid
        self._mode = EditMode.OBSTACLE
        self.status = "Mode 1: click a cell to add or clear an obstacle."

    @property
    def mode(self) -> EditMode:
        return self._mode

    def select_mode(self, key: str) -> bool:
        """Select modes 1/2/3; ignore unrelated keys without changing state."""
        mode = MODE_KEYS.get(key)
        if mode is None:
            return False
        self._mode = mode
        if mode is EditMode.OBSTACLE:
            self.status = "Mode 1: click a cell to add or clear an obstacle."
        else:
            self.status = f"Mode {key}: click an empty cell to set {mode.value.lower()}."
        return True

    def edit_cell(self, position: Position | None) -> bool:
        """Return whether the map changed; invalid user actions are no-ops."""
        if position is None:
            self.status = "No edit: click inside the grid."
            return False
        try:
            inside = self.grid.in_bounds(position)
        except TypeError:
            self.status = "No edit: invalid cell coordinates."
            return False
        if not inside:
            self.status = "No edit: click inside the grid."
            return False

        if self.mode is EditMode.OBSTACLE:
            if position in (self.grid.start, self.grid.goal):
                self.status = "Start / goal cells are protected. Move the endpoint first."
                return False
            if self.grid.is_blocked(position):
                self.grid.remove_obstacle(position)
                self.status = f"Cleared obstacle at {position}."
            else:
                self.grid.add_obstacle(position)
                self.status = f"Added obstacle at {position}."
            return True

        if self.grid.is_blocked(position):
            self.status = "Blocked cell. Clear it in mode 1 first."
            return False
        current = self.grid.start if self.mode is EditMode.START else self.grid.goal
        if current == position:
            self.status = f"{self.mode.value} is already at {position}."
            return False
        if self.mode is EditMode.START:
            self.grid.set_start(position)
        else:
            self.grid.set_goal(position)
        if self.grid.start == self.grid.goal:
            self.status = f"Start and goal share {position}. Allowed for testing."
        else:
            self.status = f"{self.mode.value} moved to {position}."
        return True
