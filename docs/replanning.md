# 动态障碍物与 A* 路径重新规划

后续测试审计发现并修复了准备阶段异常清理问题，最新测试范围与结果见 [测试审计报告](test-audit.md)。

本阶段只实现动态障碍与重新规划；JSON 保存加载留到下一阶段。
算法仍只允许四方向移动，进入成本沿用普通地面 1、高成本地形 5，不计当前起点成本。

## 怎么操作和验收

1. 点击「载入动态重规划示例」。它创建 3×15 空地图，并把移动速度设为 1 格/秒，方便操作。
2. 展开控制区，先搜索，等路径显示后点击「机器人出发」。
3. 选择障碍物工具，在路径外的空地添加障碍：移动和路线保持，重规划次数不增加。
4. 在机器人前方尚未走过的金色路径上添加障碍：立即暂停旧移动，A* 从蓝色机器人当前格重新搜索。
   搜索成功后更新剩余路线；原本正在移动则自动继续，原本暂停则保持暂停。
5. 点击蓝色机器人所在格，必须提示拒绝，障碍数和路线不变。地图起点、终点也继续受保护。
6. 创建 1×15 地图，搜索并出发，再阻断前方单通道：显示不可达，机器人留在原格。
   出发按钮禁用，重置也不能使它继续执行旧路线。
7. 清除刚才的障碍，点击「当前位置重规划」：从停止位置寻找新路线；成功后点击出发继续。
8. 快速连续添加障碍，或在重规划期间继续改图：只采用最新地图的结果，不恢复旧路线。

浏览器实测已覆盖路径外添加、阻断后绕行、当前位置保护、无路停止及移除障碍后的恢复。
示例中实测从第 9 列重新规划；单通道失败时停在第 7 列，重置后仍在原格。

## 关键模型和依赖

- `Robot.remaining_path`：含当前位置在内的剩余节点，不把已经走过的部分误判为未来障碍。
- `Robot.begin_replanning()`：先丢弃旧路线和半格时间余量，进入 replanning 状态，搜索期间不前进。
- `Robot.replace_path()`：校验新路径从当前位置开始、以原终点结束，步步四邻接、不越界、不穿障碍。
- `Robot.stop()`：只保留当前格并进入 blocked，阻止开始或重置复活旧路线。
- `DynamicPlanner`：负责障碍编辑、是否需要重规划、请求版本以及新结果的安全接入。
- `ReplanRequest`：请求序号、地图版本和不可变快照，快照起点为机器人当前位置。
- `run_replan()`：在快照上重新运行已有 A*，不实现增量寻路，不依赖 Pygame。

网页使用对应的 `robot.mjs` 和 `replanning.mjs`。搜索仍在 Worker 中运行，界面不等待计算完成。
请求包含全局请求 ID 和地图版本；控制器还检查自己的 token、版本、起始位置和地图指纹。
连续改图会废弃过期结果，即使旧结果成功而最新结果失败，也不能重新启动机器人。

起点标记表示地图原始起点，不随重规划移动；蓝色机器人位置才是新路线的起点。
重规划统计只描述当前位置至终点的剩余路径；改图时会清除旧地图的性能统计，避免混用。

## 安全规则

- 只检查新障碍是否位于剩余路径；路径外和已走过的格子不触发无必要的重规划。
- 搜索期间即使有与路径无关的改动，也会刷新快照，拒绝旧结果。
- 无路或搜索出错时清空可执行旧路线，保留当前位置，明确提示停止。
- 搜索期间按暂停或切走标签页，完成后也保持暂停。
- 移除障碍不自动让停住的机器人突然出发，可以用「当前位置重规划」显式重试。
- 修改起终点、地形、地图尺寸或撤销编辑会结束当前模拟并清除待返回请求，避免跨地图套用路线。
- 重置移动回到本段路径起点；如果旧路径已被新增障碍破坏，重置会留在原格并停止，不能瞬移到墙上。

## Python 示例

```python
from robot_path_lab.algorithms import astar
from robot_path_lab.grid import Grid
from robot_path_lab.replanning import DynamicPlanner
from robot_path_lab.robot import Robot

grid = Grid(5, 7, start=(0, 2), goal=(6, 2))
robot = Robot(grid, astar(grid).path, speed=2)
planner = DynamicPlanner(robot)
robot.start()
robot.update(1)  # 当前在 (2, 2)。

assert planner.add_obstacle((0, 0)) is None  # 路径外，不打断移动。
result = planner.add_obstacle((3, 2))        # 重新运行 A* 并接入新路线。
assert result.found and result.path[0] == (2, 2)
assert grid.start == (0, 2)                  # 原始地图起点不变。
assert robot.state == 'moving'
robot.update(100)
assert robot.position == grid.goal
```

需要异步执行时，使用 `change_obstacle()` 取得请求，单独调用 `run_replan()`，再交给 `finish_replan()`。
计算与状态提交分开，让暂停、版本校验和安全停止都能用可控测试验证。

## 测试记录

新增 19 项 pytest 重规划测试和 13 项网页重规划测试，覆盖用户要求的四类核心情况。
Worker 另有 3 项协议测试，验证默认 A*、请求身份、普通算法对比和错误返回。
全量 Python 265 项、网页 84 项通过；测试不依靠真实 sleep 等待或毫秒阈值。

开发中先用 Python/网页测试复现「重置瞬移到已封堵的本段起点」，两侧均失败。
随后让 reset 校验旧路线仍可通行，不安全时原地 stop；两侧回归测试均已通过。

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -B -m pytest -q
node --test web/model.test.mjs web/search.test.mjs web/metrics.test.mjs web/terrain.test.mjs web/robot.test.mjs web/viewport.test.mjs web/replanning.test.mjs web/search-worker.test.mjs
```
