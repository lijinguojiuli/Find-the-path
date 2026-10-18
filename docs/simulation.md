# 第 7–10 天：搜索播放、统计、地形与机器人

主界面是中文网站；Python 保留独立核心模型和 pytest，Pygame 原型通过 `--desktop` 打开。
以下保留第 7–10 天的阶段教学；当前新增的动态障碍与重规划见 [重规划说明](replanning.md)。
仍不包含对角移动或 JSON 保存加载。

## 打开与手动验收

在线地址：https://robot-path-planning-lab.solarshore32.chatgpt.site/ 。保留原有本人私有访问范围。
本地运行：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -B -m robot_path_lab
```

1. 展开「寻路与机器人控制」，选择 A*，把播放速度调慢，点击「开始搜索」。节点按访问顺序逐步变蓝，最后显示金色路径。
2. 点击「暂停」，记住访问数；等待后应保持不变。「单步」只推进一节点，仍保持暂停。
   点击「继续」恢复，调高播放速度后应更快显示完整路径。
3. 点击「重置搜索」，搜索覆盖消失、地图保留。再次搜索应得到相同合法路线。
4. 点击「对比三种算法」，在「同一地图，公平比较」卡片查看表格。
   单位成本下三者步数相同，访问数可以不同；耗时不随暂停或播放延长。
5. 点击「载入成本对比示例」，再对比：BFS 应是 4 步、成本 16，Dijkstra/A* 应是 6 步、成本 6。
   小屏对比卡片位于地图下方，大屏时在可滚动侧栏。
6. 按 4 或点「高成本 5」涂地形；按 5 恢复普通地面。障碍格须先清除才能涂地形。
   起终点允许在地形上，起点成本不计；撤销应恢复地形，改图会清除旧结果和机器人。
7. 搜索播放结束后点「机器人出发」。蓝色圆形机器人沿路径逐格移动，位置文字同步更新。
   暂停后位置保持，继续后再前进；重置回起点，调速改变移动快慢，到达终点自动停止。
8. 创建 1 行 3 列地图，阻断中间格：搜索显示不可达，机器人不能出发。
   将起点移到终点：搜索为 0 步、成本 0、访问 1，机器人显示已经到达。
9. 切换标签页再返回，播放和移动会自动暂停，防止后台时间使画面突然跳到结尾。
10. 大屏模式扩展浏览器可用区域，保留系统任务栏；Esc 或退出按钮恢复。
    控制区会自动收起，可再次展开；地图每格默认 28 像素，支持缩放和内部滚动。
    页面允许滚动，为地图保留足够高度；不会为了塞进一屏把 20×30 地图缩成几像素的格子。

## 模块职责

- `Grid`：尺寸、端点、障碍和正整数进入成本；普通地面 1，高成本工具写入 5。
- `algorithms/common.py`：共享结果、只读快照、四邻域与路径回溯。
- BFS：FIFO 队列逐层处理，优化步数，另外计算该路径的实际成本。
- Dijkstra：按累计进入成本排序，距离改善时更新前驱。
- A*：`f=g+h`，其中 `h=minimum_cost × Manhattan`，是四方向规则下可采纳且一致的下界。
- `metrics.py`：高精度计时与同图对比，计时不包含动画。
- `robot.py`：校验路线并按时间推进，不导入 Pygame 或操作文件。
- 网页纯逻辑模块：`model.mjs`、`search.mjs`、`metrics.mjs`、`playback.mjs`、`robot.mjs`。
- `search-worker.mjs`：后台线程计算；`app.js` 负责事件与绘制。

静态托管网站在浏览器执行 JavaScript；Python 核心用于学习、测试及后续复用。
跨语言测试在六张共享地图上对照路径、访问顺序、访问数和总代价。

## 成本与统计口径

从 `a` 走到相邻格 `b` 支付 `cost(b)`：起点不收费、终点收费，同起终点成本为 0。
示例直行成本为 `5+5+5+1=16`，绕行普通地面六步的成本为 6。
增加障碍会清除该格地形，再清除障碍则恢复普通地面；撤销可恢复完整快照。

`SearchResult` 保留 found、path、visited_order、visited_count，新增 total_cost。
路径包括起终点，成功时步数为 `len(path)-1`；不可达路径为空，成本为空，不显示 -1 步。
访问数只计有效弹出并处理的节点，不计等待中或过期的堆条目。

Python 使用 `perf_counter_ns`，网页使用 `performance.now()`。
计时只包住搜索调用，地图准备、Worker 消息、播放、暂停和绘制都在计时区间外。
浏览器可能降低时钟精度，`<0.001` 表示记录差值低于显示精度。
不能由一次测量断言某算法总是最快，测试也不使用真实毫秒阈值。

## 播放与移动原理

搜索先完成，再按 visited_order 播放；播放结束显示最终路径并解锁机器人。
SearchPlayback 保存播放位置、状态和不足一节点的时间余量；暂停不累积时间，单步后保持暂停。

机器人使用 `progress += delta_seconds × cells_per_second`。
每累积一格就检查下一格并移动，不足一格的余量留到下一帧。
15 次 0.1 秒与一次 1.5 秒产生相同位置；大时间增量也不能跳过中间障碍。
地形成本决定规划路线，本阶段不把成本解释为物理移动耗时。

状态为 ready、moving、paused、arrived、blocked。重置回起点并清除时间余量；单节点路径直接到达。
网页改图时增加版本号，废弃旧搜索、停止并清除机器人，需要再次搜索，没有自动动态重规划。

## Python 调用

```python
from robot_path_lab.algorithms import astar
from robot_path_lab.grid import Grid
from robot_path_lab.metrics import compare_algorithms
from robot_path_lab.robot import Robot

grid = Grid(3, 5, start=(0, 1), goal=(4, 1), costs={(x, 1): 5 for x in (1, 2, 3)})
for item in compare_algorithms(grid):
    print(item.algorithm, item.path_length, item.total_cost, item.elapsed_ns)
robot = Robot(grid, astar(grid).path, speed=2)
robot.start()
robot.update(0.5)  # 一格，与绘制帧率无关。
print(robot.position, robot.state)
robot.pause()
robot.reset()
```

## 测试命令

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -B -m pytest -q
node --test web/model.test.mjs web/search.test.mjs web/metrics.test.mjs web/terrain.test.mjs web/robot.test.mjs web/viewport.test.mjs
```

加权正确性用已知答案与独立简单路径穷举验证，覆盖 128 种地形布局。
计时使用可控时钟，移动使用人工时间增量，不通过真实 sleep 等待。
浏览器验收与自动测试分别记录于 `PLAN.md`。
