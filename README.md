# Robot Path Planning Lab

使用 Python 和 Pygame 学习二维网格机器人路径规划，同时练习 Codex 的需求分析、
代码修改、终端操作、测试、调试和 Git 交付流程。

当前阶段：网格数据模型与基础绘制已实现。启动后显示静态地图，支持通过命令行设置行列数。
鼠标编辑、寻路和机器人移动仍属于后续阶段。完整路线见 `PLAN.md`，协作约定见 `AGENTS.md`。

## 环境与依赖

- Python >=3.11；当前可用解释器为 Windows 64 位 Python 3.13.9。
- Pygame 2.6.1：窗口、绘图和输入。
- pytest 9.1.1：地图模型与绘制测试，属于 `dev` 可选依赖组。
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

## 手动验收

1. 运行默认启动命令，应出现标题为 `Robot Path Planning Lab - 20 x 30` 的窗口。
2. 顶部显示 `20 rows x 30 columns`；地图有 20 行、30 列，包含一段带缺口的示例障碍墙。
3. 浅色为空地，深灰为障碍，左上角绿色 `S` 为起点，右下角红色 `G` 为终点。
4. 点击窗口关闭按钮应正常退出；重新启动后按 Esc 也应退出。
5. 使用 `--rows 12 --cols 18` 启动，确认行列数与窗口标题同步变化。
6. 可使用 `--rows 1 --cols 1` 检查起终点重合：唯一格子同时显示绿、红两部分。

当前鼠标点击不会编辑地图。行列数必须为正整数；绘制会根据屏幕大小缩小格子，
超过可显示范围时提示减少行列数。

## 数据模型与绘制分离

`Grid(rows, cols)` 在创建时指定行列数，使用 `(x, y)` 坐标：`x` 对应列，`y` 对应行。
起终点可以为空或重合；障碍不能覆盖起终点。修改失败时已有状态保持不变。
通过 `set_start`、`set_goal`、`add_obstacle`、`remove_obstacle` 修改数据。

内部用集合保存障碍，重复添加不会产生重复项；对外返回不可变的 `frozenset` 快照，
避免调用者直接修改集合绕过校验。行列数创建后只读，改变尺寸时应新建地图。

`Grid` 不导入 Pygame。`GridRenderer` 根据地图状态绘图，核心换算为
`像素 x = 网格左边距 + 列号 × 格子大小`，纵向同理；它不修改地图。
`ui.app` 负责窗口、事件处理和帧率；当前事件仅涉及退出，不修改地图数据。
示例障碍只在启动预览时组装，不属于 `Grid` 的默认状态。

## 测试

从项目根目录运行测试：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

当前共 56 项测试：53 项模型行为测试、3 项离屏绘制测试。模型还通过禁用
`site-packages` 的子进程检查，确认导入与使用不依赖 Pygame。绘制测试不打开窗口。
pytest 的缓存和临时目录已配置在项目内；`.test_tmp/pytest` 专供测试使用，运行时会清空。
详见 [pytest 临时目录说明](https://docs.pytest.org/en/stable/how-to/tmp_path.html)。

## 结构与 Git

远程仓库：[lijinguojiuli/Find-the-path](https://github.com/lijinguojiuli/Find-the-path)。
桌面原始 README 与远程初始说明内容一致，已收录到 [docs/desktop/README.md](docs/desktop/README.md)。

- `src/robot_path_lab/grid.py`：独立网格数据模型和校验。
- `src/robot_path_lab/ui/renderer.py`：格子、颜色、图例与标签绘制。
- `src/robot_path_lab/ui/app.py`：示例地图组装及窗口事件循环。
- `src/robot_path_lab/__main__.py`：命令行尺寸参数与启动入口。
- `tests`：模型与离屏绘制测试。
- `pyproject.toml`：构建、依赖、入口与 pytest 设置。
- `PLAN.md`：阶段路线、验收标准和实际验证记录。
- `AGENTS.md`：Codex 在本仓库内应遵守的协作规则。
- `.venv`、`.cache`、`.tmp`、`.test_tmp` 和构建产物均由 Git 忽略。

每阶段先检查 `git status` 和新增文件，阅读差异后定向暂存，再检查暂存差异。
验证通过后建立本地里程碑提交。完成当前独立阶段后停止，等待用户选择下一步。
