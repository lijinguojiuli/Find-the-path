"""Restart A* from the robot's current cell after a relevant obstacle edit."""

from dataclasses import dataclass

from robot_path_lab.algorithms import SearchResult, astar
from robot_path_lab.algorithms.common import GridSnapshot, capture_grid
from robot_path_lab.grid import Grid, Position
from robot_path_lab.robot import Robot


@dataclass(frozen=True)
class ReplanRequest:
    token: int
    version: int
    snapshot: GridSnapshot


def run_replan(request: ReplanRequest) -> SearchResult:
    snapshot = request.snapshot
    return astar(Grid(snapshot.rows, snapshot.cols, start=snapshot.start, goal=snapshot.goal,
                      obstacles=snapshot.obstacles, costs=snapshot.costs))


class DynamicPlanner:
    """Separate obstacle handling, search calculation and result acceptance."""

    def __init__(self, robot: Robot) -> None:
        self.robot = robot
        self.grid = robot.grid
        self.version = 0
        self.pending: ReplanRequest | None = None
        self.replan_count = 0
        self._sequence = 0
        self._resume_state = "ready"

    def change_obstacle(self, position: Position, *, blocked: bool = True) -> ReplanRequest | None:
        if type(blocked) is not bool:
            raise TypeError("blocked 必须是布尔值。")
        already_blocked = self.grid.is_blocked(position)  # Validate before changing anything.
        if blocked and position == self.robot.position:
            raise ValueError("不能把障碍物放在机器人当前所在格子。")
        if already_blocked == blocked:
            return None
        affects_route = blocked and position in self.robot.remaining_path[1:]
        if blocked:
            self.grid.add_obstacle(position)
        else:
            self.grid.remove_obstacle(position)
        self.version += 1
        # Even a harmless edit invalidates an in-flight map snapshot.
        if affects_route or self.pending is not None:
            return self.request_replan()
        return None

    def request_replan(self) -> ReplanRequest:
        if self.pending is None:
            self._resume_state = self.robot.state if self.robot.state in {"moving", "paused"} else "ready"
        origin = self.robot.position
        self.robot.begin_replanning()  # Drop the unsafe route before doing any search work.
        snapshot = capture_grid(Grid(self.grid.rows, self.grid.cols, start=origin, goal=self.grid.goal,
                                     obstacles=self.grid.obstacles, costs=self.grid.costs))
        self._sequence += 1
        self.pending = ReplanRequest(self._sequence, self.version, snapshot)
        return self.pending

    def pause(self) -> None:
        if self.pending is not None:
            self._resume_state = "paused"
        self.robot.pause()

    def fail(self) -> None:
        self.pending = None
        self.robot.stop()

    def finish_replan(self, request: ReplanRequest, result: SearchResult) -> bool:
        if self.pending is None or request.token != self.pending.token or request.version != self.version:
            return False
        snapshot = request.snapshot
        if (self.robot.position != snapshot.start or self.robot.state != "replanning"
                or self.grid.goal != snapshot.goal or self.grid.obstacles != snapshot.obstacles
                or self.grid.costs != snapshot.costs):
            self.fail()
            return False
        self.pending = None
        self.replan_count += 1
        if not result.found:
            self.robot.stop()
            return True
        try:
            self.robot.replace_path(result.path)
        except (TypeError, ValueError):
            self.robot.stop()
            raise
        if self._resume_state in {"moving", "paused"}:
            self.robot.start()
        if self._resume_state == "paused":
            self.robot.pause()
        return True

    def add_obstacle(self, position: Position) -> SearchResult | None:
        """Convenience API for a synchronous Python simulation."""
        request = self.change_obstacle(position)
        if request is None:
            return None
        result = run_replan(request)
        self.finish_replan(request, result)
        return result
