# Robot Path Planning Lab

使用 Python 和 Pygame 学习二维网格机器人路径规划，同时练习 Codex 的需求分析、
代码修改、终端操作、测试、调试和 Git 交付流程。

当前主交付是**中文浏览器网站**：提供首次进入教程、四步动手练习、中文按钮、撤销与大屏模式。
大屏模式铺满浏览器可用区域，不进入原生全屏，保留底部 Windows 任务栏。
数字键或中文工具按钮选择模式，左键点击编辑地图；支持三算法搜索动画、性能对比、地形成本和机器人移动。
支持移动中添加障碍，影响剩余路径时自动从当前位置用 A* 重新规划，无路时安全停止。
完整路线见 `PLAN.md`，协作约定见 `AGENTS.md`。

Python 独立 BFS、Dijkstra、A* 算法已实现，分别见 [BFS 说明](docs/bfs.md)、
[Dijkstra 说明](docs/dijkstra.md) 和 [A* 说明](docs/astar.md)。
三者使用统一的 `SearchResult`，四方向移动；普通地面成本 1、高成本地形 5，进入格子时计费，起点不收费。
BFS 优化步数，Dijkstra/A* 优化累计成本；A* 使用最小进入成本乘曼哈顿距离。
网页已接入搜索和移动；Pygame 保留原地图编辑原型。
完整教程、原理与逐项验收见 [搜索与机器人实验说明](docs/simulation.md)。

另有独立的 [大型迷宫演示](https://robot-path-planning-lab.solarshore32.chatgpt.site/maze/)：
三种随机迷宫、14 种搜索算法；默认 15×25 完整展示，大地图最高 1001×1001。
从原实验台顶部「迷宫演示」进入；提供五个教学场景、双图同步播放、共同路段高亮和节点 g/h/f 讲解。
推荐地图自动适配视图；字体与按钮放大，光效可调强度并自动降级。计时热身后采样 5 次取中位数。详见 [迷宫教程与验收](docs/maze.md) 和 [本轮优化验收](docs/maze-optimization.md)。

## 先打开网站，再跟着教程操作

在线网站：[寻路实验室](https://robot-path-planning-lab.solarshore32.chatgpt.site)。
当前为本人可访问的私有站点，首次访问可能需要登录对应的 ChatGPT 账号。

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab
```

命令会启动本地网站并自动打开浏览器，默认地址为 `http://127.0.0.1:8765/`。
保留运行命令的终端；关闭服务使用 Ctrl+C。端口被占用时可增加 `--port 8766`。

1. 首次打开会出现中文介绍，点击「开始四步动手教程」。
2. 在空格放一块障碍，再点同一格清除；教程会提示并自动切换下一步工具。
3. 按提示在新的空地设置起点、终点，完成后进入自由编辑。
4. 右上角「新手教程」随时可重新打开。左侧也保留教程和当前步骤。
5. 点击「大屏模式」扩大地图，任务栏仍然保留；按 Esc、F 或「退出大屏」恢复。
6. 如果需要整个浏览器窗口最大化，使用窗口右上角的最大化按钮，不使用 F11。

点错了可以点撤销或按 Ctrl+Z。尺寸输入非法时显示中文错误并保留原地图。
网页不需要安装 npm 依赖，使用原生 HTML/CSS/JavaScript；Python 标准库提供本地服务。

操作顺序：选择算法 → 开始搜索 → 暂停/单步观察 → 路径显示完成 → 机器人出发。
搜索与机器人控制默认收起，点击「寻路与机器人控制」展开。地图默认每格 28 像素，
使用「格子大小」在 16–48 像素间调整；地图放不下时在地图内部滚动，不会自动缩成小点。
「重置视图」恢复 28 像素与左上视角，不改变地图或搜索进度。大屏模式会收起控制区，保留系统任务栏。
「对比三种算法」在同图显示步数、总代价、访问数和算法耗时；小屏对比表在地图下方。
按 4 涂高成本，按 5 恢复普通地面；成本示例可验证 4 步/成本 16 与 6 步/成本 6 的区别。
播放和移动分别调速、暂停与重置；修改端点、地形或尺寸会清除旧结果，需要重新搜索。
移动中的障碍编辑会保留当前位置：路径外不打断，路径被堵则自动重规划。蓝色机器人当前格禁止放障碍。
点击「载入动态重规划示例」可练习；无路时清除障碍，再点「当前位置重规划」重试。
完整规则与四类验收见 [动态重规划说明](docs/replanning.md)。

## 保留的桌面原型

原 Pygame 窗口可用 `--desktop` 启动，方便对照 Python 模型与事件处理：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --desktop
```

## 环境与依赖

- Python >=3.11；当前可用解释器为 Windows 64 位 Python 3.13.9。
- Pygame 2.6.1：窗口、绘图和输入。
- pytest 9.1.1：模型、交互、绘制与事件适配测试，属于 `dev` 可选依赖组。
- setuptools 80.9.0：由 pip 在隔离构建环境中使用的构建后端。
- Git：保存通过验收的阶段。

依赖安装和窗口兼容性以实际验证记录为准，见 `PLAN.md`。

## 安装

在 PowerShell 中执行。首次安装才需要创建 `.venv`，已有虚拟环境时跳过对应命令。
临时文件和 pip 缓存都保留在项目目录；环境变量仅影响当前终端及其子进程。

```powershell
Set-Location -LiteralPath 'D:\codex\寻路'

$projectTemp = 'D:\codex\寻路\.tmp'
New-Item -ItemType Directory -Force -Path $projectTemp | Out-Null
$env:TEMP = $projectTemp
$env:TMP = $projectTemp
$env:TMPDIR = $projectTemp
$env:PIP_CACHE_DIR = 'D:\codex\寻路\.cache\pip'
$env:PYTHONUTF8 = '1'

python -X utf8 -B -m venv 'D:\codex\寻路\.venv'
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pip install --only-binary=pygame -e '.[dev]'
```

`-e` 表示可编辑安装：修改 `src` 中的 Python 文件后，下一次启动使用修改后的源码。
`.[dev]` 表示同时安装项目和开发依赖。修改项目元数据或命令入口后需要重新安装。
详见 [pip 的本地项目安装说明](https://pip.pypa.io/en/stable/topics/local-project-installs/)。

## 运行与检查

不必激活虚拟环境，直接调用其中的解释器，避免使用错误的全局 Python。

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --rows 12 --cols 18
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --help
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --version
& 'D:\codex\寻路\.venv\Scripts\robot-path-lab.exe' --version
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pip check
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest --version
```

`-X utf8` 固定 Python 的文本编码。本机默认管道输出为 GBK，工具捕获日志时可能乱码；
加入此选项后已验证中文命令帮助可正确输出，不需要修改系统编码。

## 桌面原型手动验收（使用 --desktop）

1. 使用 `--desktop` 启动，应出现标题为 `Robot Path Planning Lab - 20 x 30` 的窗口。
2. 顶部显示 `20 rows x 30 columns`；地图有 20 行、30 列，包含一段带缺口的示例障碍墙。
3. 浅色为空地，深灰为障碍，左上角绿色 `S` 为起点，右下角红色 `G` 为终点。
4. 先点击窗口取得焦点，再按下表逐项检查；顶部蓝色区域表示当前键盘模式，底部 `Status` 显示反馈。

| 操作 | 预期结果 |
| --- | --- |
| 按 `1`，左键点空地，再点同一格 | 第一次添加深灰障碍，第二次清除；顶部障碍数同步变化 |
| 按 `2`，左键点空地 | 绿色起点移动，原起点恢复空地（若不是终点） |
| 按 `3`，左键点空地 | 红色终点移动，原终点恢复空地（若不是起点） |
| 按 `1`，分别点击起点和终点 | 地图不变，底部提示端点受保护 |
| 按 `2` 或 `3`，点击深灰障碍 | 地图不变，提示先在模式 `1` 清除障碍；显式清除后可设置端点 |
| 按 `2` 点击终点，或按 `3` 点击起点 | 允许重合，同一格显示绿、红两部分和 `S/G`；该格仍不能设为障碍 |
| 点击标题、底部、网格四周外侧及右/下外边线 | 不越界、不崩溃，地图外点击不改地图 |
| 右键、中键、滚轮或按 `4`、`X`、空格 | 不修改地图，不改变当前模式 |
| 点击关闭按钮，或按 Esc | 正常退出；退出后同批剩余鼠标事件不再修改地图 |

主键盘和小键盘的 `1/2/3` 都可使用；只处理左键按下事件，不支持拖动连续绘制。
顶部模式提示不是鼠标菜单，请用数字键切换。网格左、上边界属于第一行/列，
右、下边界按地图外处理；内部分隔线归入右侧或下侧格子。
边界判定使用 [Pygame Rect 的碰撞规则](https://www.pygame.org/docs/ref/rect.html#pygame.Rect.collidepoint)。

可使用 `--rows 12 --cols 18` 检查非正方形地图，或 `--rows 1 --cols 1` 检查重合端点保护。
行列数必须为正整数；绘制会根据屏幕大小缩小格子，超过可显示范围时提示减少行列数。

## 数据模型与绘制分离

`Grid(rows, cols)` 在创建时指定行列数，使用 `(x, y)` 坐标：`x` 对应列，`y` 对应行。
起终点可以为空或重合；障碍不能覆盖起终点。修改失败时已有状态保持不变。
通过 `set_start`、`set_goal`、`add_obstacle`、`remove_obstacle` 修改数据。

内部用集合保存障碍，重复添加不会产生重复项；对外返回不可变的 `frozenset` 快照，
避免调用者直接修改集合绕过校验。行列数创建后只读，改变尺寸时应新建地图。

`Grid` 不导入 Pygame。`GridRenderer` 根据地图状态绘图，核心换算为
`像素 x = 网格左边距 + 列号 × 格子大小`，纵向同理；它不修改地图。
`EditController` 保存 `EditMode`，处理格子编辑与拒绝原因，不导入 Pygame。
`ui.app` 只将按键转换为模式选择、将鼠标像素转换为格子，再调用控制器；
控制器通过 `Grid` 的校验方法修改数据。绘制器只读取模式和反馈，不执行编辑。
坐标转换先检查是否处于网格矩形内部，再用相对像素整除格子大小，避免负数或右/下边界越界。
示例障碍只在启动预览时组装，不属于 `Grid` 的默认状态。

## 测试

从项目根目录运行测试：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

Python 当前共 930 项测试，包含固定种子随机地图、独立参考算法、动态重规划与独立迷宫模块。
此前审计范围和未实现的保存加载缺口见 [测试审计报告](docs/test-audit.md)；新增迷宫验证见 [迷宫验收](docs/maze.md)。
模型和控制器通过禁用 `site-packages` 的子进程检查，确认不依赖 Pygame。
事件循环测试使用 SDL dummy 驱动，不打开真实窗口；真实 Windows 窗口验证另记于 `PLAN.md`。
pytest 的缓存和临时目录已配置在项目内；`.test_tmp/pytest` 专供测试使用，运行时会清空。
详见 [pytest 临时目录说明](https://docs.pytest.org/en/stable/how-to/tmp_path.html)。

网页模型、搜索、播放、统计、地形、机器人、视图、重规划与迷宫提供 266 项 Node.js 原生测试：

```powershell
node --test web/model.test.mjs web/search.test.mjs web/metrics.test.mjs web/terrain.test.mjs web/robot.test.mjs web/viewport.test.mjs web/replanning.test.mjs web/search-worker.test.mjs web/audit.test.mjs
node --test web/maze/model.test.mjs web/maze/search.test.mjs web/maze/state.test.mjs web/maze/learning.test.mjs web/maze/renderer.test.mjs
```

## 结构与 Git

远程仓库：[lijinguojiuli/Find-the-path](https://github.com/lijinguojiuli/Find-the-path)。
桌面原始 README 与远程初始说明内容一致，已收录到 [docs/desktop/README.md](docs/desktop/README.md)。

- `src/robot_path_lab/grid.py`：独立网格数据模型和校验。
- `src/robot_path_lab/algorithms`：统一搜索结果、地图快照，以及独立 BFS、Dijkstra、A* 算法。
- `src/robot_path_lab/metrics.py`：高精度搜索计时与同图对比。
- `src/robot_path_lab/robot.py`：独立于绘制帧率的机器人移动模型。
- `src/robot_path_lab/replanning.py`：动态障碍、从当前位置重跑 A*、过期结果校验与安全停止。
- `src/robot_path_lab/controller.py`：独立的编辑模式、合法性判断与操作反馈。
- `src/robot_path_lab/ui/renderer.py`：格子、颜色、图例与标签绘制。
- `src/robot_path_lab/ui/app.py`：示例地图组装及窗口事件循环。
- `src/robot_path_lab/__main__.py`：命令行尺寸参数与启动入口。
- `src/robot_path_lab/web_server.py`：中文网站本地服务，仅提供 `web` 目录。
- `web`：中文网站、教程、纯逻辑模块、搜索 Worker 与结果播放。
- `web/maze`：独立的大型迷宫、14 种算法、后台计算与可见区域绘制。
- `src/robot_path_lab/maze`：对应的纯 Python 迷宫模型、生成器、14 种算法与计时。
- `tests`：模型、控制器、像素映射及事件适配测试。
- `pyproject.toml`：构建、依赖、入口与 pytest 设置。
- `PLAN.md`：阶段路线、验收标准和实际验证记录。
- `AGENTS.md`：Codex 在本仓库内应遵守的协作规则。
- `.venv`、`.cache`、`.tmp`、`.test_tmp` 和构建产物均由 Git 忽略。

每阶段先检查 `git status` 和新增文件，阅读差异后定向暂存，再检查暂存差异。
验证通过后建立本地里程碑提交。完成当前独立阶段后停止，等待用户选择下一步。
