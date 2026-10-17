"""Time-based movement along a validated path, independent of any UI."""

from collections.abc import Iterable
from math import isfinite

from robot_path_lab.grid import Grid, Position


class Robot:
    def __init__(self, grid: Grid, path: Iterable[Position], *, speed: float = 3) -> None:
        route = tuple(path)
        if not route or route[0] != grid.start or route[-1] != grid.goal:
            raise ValueError("路径必须从地图起点开始，在终点结束。")
        for index, cell in enumerate(route):
            if not grid.in_bounds(cell) or grid.is_blocked(cell):
                raise ValueError("机器人路径不能越界或穿过障碍。")
            if index and sum(abs(a - b) for a, b in zip(cell, route[index - 1])) != 1:
                raise ValueError("路径相邻节点必须上下左右相邻。")
        self._grid = grid
        self._path = route
        self.speed = speed
        self.reset()

    @property
    def path(self) -> tuple[Position, ...]:
        return self._path

    @property
    def position(self) -> Position:
        return self.path[self._index]

    @property
    def steps_moved(self) -> int:
        return self._index

    @property
    def state(self) -> str:
        return self._state

    @property
    def speed(self) -> float:
        return self._speed

    @speed.setter
    def speed(self, value: float) -> None:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value <= 0:
            raise ValueError("机器人速度必须是正的有限数。")
        self._speed = value

    def reset(self) -> None:
        self._index = 0
        self._progress = 0.0
        self._state = "arrived" if len(self.path) == 1 else "ready"

    def start(self) -> None:
        if self.state in {"ready", "paused"}:
            self._state = "moving"

    def pause(self) -> None:
        if self.state == "moving":
            self._state = "paused"

    def update(self, delta_seconds: float) -> None:
        if isinstance(delta_seconds, bool) or not isinstance(delta_seconds, (int, float)) or not isfinite(delta_seconds) or delta_seconds < 0:
            raise ValueError("时间增量必须是非负有限数。")
        if self.state != "moving":
            return
        self._progress += delta_seconds * self.speed
        while self._progress >= 1 - 1e-9 and self.state == "moving":
            next_cell = self.path[self._index + 1]
            if self._grid.is_blocked(self.position) or self._grid.is_blocked(next_cell):
                self._state = "blocked"
                self._progress = 0.0
                return
            self._progress = max(0.0, self._progress - 1)
            self._index += 1
            if self._index == len(self.path) - 1:
                self._state = "arrived"
                self._progress = 0.0
