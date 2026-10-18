"""Compact maze snapshots and iterative, seed-reproducible generators."""
from dataclasses import dataclass
from .generators import LANDSCAPE_TYPES, generate_landscape

CLASSIC_TYPES = ("corridors", "branches", "braided")
MAZE_TYPES = CLASSIC_TYPES + LANDSCAPE_TYPES


def validate_size(rows: int, cols: int) -> None:
    if any(type(n) is not int or not 11 <= n <= 1001 or n % 2 != 1 for n in (rows, cols)):
        raise ValueError("行数和列数须为 11–1001 之间的奇数。")


def validate_seed(seed: int) -> None:
    if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("种子须为 0–4294967295 的整数。")


@dataclass(frozen=True, slots=True)
class Maze:
    rows: int
    cols: int
    walls: bytes
    start: tuple[int, int]
    goal: tuple[int, int]
    seed: int = 0
    type: str = "braided"
    version: int = 0

    def __post_init__(self) -> None:
        if any(type(n) is not int or not 0 < n <= 1001 for n in (self.rows, self.cols)):
            raise ValueError("地图尺寸无效。")
        if len(self.walls) != self.rows * self.cols or any(v not in (0, 1) for v in self.walls):
            raise ValueError("墙体数据无效。")
        object.__setattr__(self, "walls", bytes(self.walls))
        validate_seed(self.seed)
        if self.type not in MAZE_TYPES or type(self.version) is not int or self.version < 0:
            raise ValueError("地图元数据无效。")
        for name in ("start", "goal"):
            cell = getattr(self, name)
            if (len(cell) != 2 or any(type(v) is not int for v in cell)
                    or not 0 <= cell[0] < self.cols or not 0 <= cell[1] < self.rows
                    or self.walls[cell[1] * self.cols + cell[0]]):
                raise ValueError("起点和终点必须位于地图内的通道上。")
            object.__setattr__(self, name, tuple(cell))

    @property
    def start_id(self) -> int:
        return self.start[1] * self.cols + self.start[0]

    @property
    def goal_id(self) -> int:
        return self.goal[1] * self.cols + self.goal[0]


def random_source(seed: int):
    validate_seed(seed)
    state = seed or 0x6D2B79F5
    def next_number() -> int:
        nonlocal state
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        return state
    return next_number


def generate_maze(rows=301, cols=301, *, type="braided", seed=20261018, version=0) -> Maze:
    validate_size(rows, cols)
    validate_seed(seed)
    if type not in MAZE_TYPES:
        raise ValueError("未知迷宫类型。")
    random = random_source(seed)
    if type not in CLASSIC_TYPES:
        walls,start,goal = generate_landscape(rows,cols,type,random)
        return Maze(rows,cols,walls,start,goal,seed,type,version)
    walls = bytearray([1]) * (rows * cols)
    jumps, halves = (-2 * cols, 2, 2 * cols, -2), (-cols, 1, cols, -1)
    def valid(cell, direction):
        x, y = cell % cols, cell // cols
        return (y > 1, x < cols - 2, y < rows - 2, x > 1)[direction]
    walls[cols + 1] = 0
    if type == "branches":
        frontier = []
        def add(cell):
            for d in range(4):
                if valid(cell, d) and walls[cell + jumps[d]]:
                    frontier.append(cell * 4 + d)
        add(cols + 1)
        while frontier:
            index = random() % len(frontier)
            edge = frontier[index]
            frontier[index] = frontier[-1]
            frontier.pop()
            cell, d = divmod(edge, 4)
            next_cell = cell + jumps[d]
            if not walls[next_cell]:
                continue
            walls[next_cell] = walls[cell + halves[d]] = 0
            add(next_cell)
    else:
        stack = [cols + 1]
        while stack:
            cell = stack[-1]
            choices = [d for d in range(4) if valid(cell, d) and walls[cell + jumps[d]]]
            if not choices:
                stack.pop()
                continue
            d = choices[random() % len(choices)]
            next_cell = cell + jumps[d]
            walls[next_cell] = walls[cell + halves[d]] = 0
            stack.append(next_cell)
        if type == "braided":
            for y in range(1, rows - 1):
                for x in range(1, cols - 1):
                    cell = y * cols + x
                    if (walls[cell] and ((y % 2 and not x % 2 and not walls[cell - 1] and not walls[cell + 1])
                            or (x % 2 and not y % 2 and not walls[cell - cols] and not walls[cell + cols]))
                            and random() % 100 < 15):
                        walls[cell] = 0
    walls[1] = walls[-2] = 0
    return Maze(rows, cols, walls, (1, 0), (cols - 2, rows - 1), seed, type, version)
