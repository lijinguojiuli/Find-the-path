"""Grid state and validation, with no dependency on a graphical library."""

from collections.abc import Iterable, Mapping
from types import MappingProxyType

Position = tuple[int, int]


class Grid:
    """Store a fixed-size grid using (x, y) coordinates.

    Width is ``cols`` and height is ``rows``. Endpoints may overlap each
    other, but neither may occupy an obstacle. All changes go through
    validated methods; callers receive an immutable obstacle snapshot.
    """

    def __init__(
        self,
        rows: int,
        cols: int,
        *,
        start: Position | None = None,
        goal: Position | None = None,
        obstacles: Iterable[Position] = (),
        costs: Mapping[Position, int] | None = None,
    ) -> None:
        for name, value in (("rows", rows), ("cols", cols)):
            if type(value) is not int:
                raise TypeError(f"{name} must be an integer.")
            if value <= 0:
                raise ValueError(f"{name} must be positive.")

        self._rows = rows
        self._cols = cols
        self._start: Position | None = None
        self._goal: Position | None = None
        self._obstacles: set[Position] = set()
        self._costs: dict[Position, int] = {}
        for position in obstacles:
            self.add_obstacle(position)
        self.set_start(start)
        self.set_goal(goal)
        for position, cost in (costs or {}).items():
            self.set_cost(position, cost)

    @property
    def rows(self) -> int:
        return self._rows

    @property
    def cols(self) -> int:
        return self._cols

    @property
    def start(self) -> Position | None:
        return self._start

    @property
    def goal(self) -> Position | None:
        return self._goal

    @property
    def obstacles(self) -> frozenset[Position]:
        return frozenset(self._obstacles)

    @property
    def costs(self) -> Mapping[Position, int]:
        """Return a read-only copy of non-default entry costs."""
        return MappingProxyType(self._costs.copy())

    @property
    def minimum_cost(self) -> int:
        if len(self._costs) + len(self._obstacles) < self.rows * self.cols:
            return 1
        return min(self._costs.values(), default=1)

    def set_cost(self, position: Position, cost: int) -> None:
        self._require_in_bounds(position)
        if type(cost) is not int:
            raise TypeError("通行成本必须是正整数。")
        if cost <= 0:
            raise ValueError("通行成本必须是正整数。")
        if position in self._obstacles:
            raise ValueError("请先清除障碍，再设置地形成本。")
        if cost == 1:
            self._costs.pop(position, None)
        else:
            self._costs[position] = cost

    def cost_at(self, position: Position) -> int:
        self._require_in_bounds(position)
        if position in self._obstacles:
            raise ValueError("障碍物不可通行。")
        return self._costs.get(position, 1)

    def in_bounds(self, position: Position) -> bool:
        """Return whether a well-formed coordinate lies inside the grid."""
        if not isinstance(position, tuple) or len(position) != 2:
            raise TypeError("A position must be an (x, y) tuple.")
        x, y = position
        if type(x) is not int or type(y) is not int:
            raise TypeError("Position coordinates must be integers.")
        return 0 <= x < self.cols and 0 <= y < self.rows

    def _require_in_bounds(self, position: Position) -> None:
        if not self.in_bounds(position):
            raise ValueError(f"Position {position} is outside the grid.")

    def _validate_endpoint(self, position: Position | None) -> None:
        if position is not None:
            self._require_in_bounds(position)
            if position in self._obstacles:
                raise ValueError("An endpoint cannot occupy an obstacle.")

    def set_start(self, position: Position | None) -> None:
        self._validate_endpoint(position)
        self._start = position

    def set_goal(self, position: Position | None) -> None:
        self._validate_endpoint(position)
        self._goal = position

    def add_obstacle(self, position: Position) -> None:
        self._require_in_bounds(position)
        if position == self.start or position == self.goal:
            raise ValueError("An obstacle cannot occupy an endpoint.")
        self._obstacles.add(position)
        self._costs.pop(position, None)

    def remove_obstacle(self, position: Position) -> None:
        self._require_in_bounds(position)
        self._obstacles.discard(position)

    def is_blocked(self, position: Position) -> bool:
        self._require_in_bounds(position)
        return position in self._obstacles
