# Robot Path Planning Lab

使用 Python 和 Pygame 学习二维网格机器人路径规划，同时练习 Codex 的需求分析、
代码修改、终端操作、测试、调试和 Git 交付流程。

当前阶段：第 2 天，最小工程已建立并通过环境与入口检查。入口仅提供启动提示、帮助和版本信息。
地图、算法与图形界面尚未实现。完整路线见 `PLAN.md`，协作约定见 `AGENTS.md`。

## 环境与依赖

- Python >=3.11；当前可用解释器为 Windows 64 位 Python 3.13.9。
- Pygame 2.6.1：窗口、绘图和输入。
- pytest 9.1.1：后续自动化测试，属于 `dev` 可选依赖组。
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
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --help
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m robot_path_lab --version
& 'D:\codex\寻路\.venv\Scripts\robot-path-lab.exe' --version
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pip check
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest --version
```

`-X utf8` 固定 Python 的文本编码。本机默认管道输出为 GBK，工具捕获日志时可能乱码；
加入此选项后已验证中文启动提示可正确输出，不需要修改系统编码。

## 测试

本阶段尚无业务测试；从第 3 天开始编写有实际行为断言的 pytest 用例。
从项目根目录运行测试：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

当前没有用例时，pytest 将报告未收集到测试，并返回退出码 5；这不是测试通过。
pytest 的缓存和临时目录已配置在项目内；`.test_tmp/pytest` 专供测试使用，运行时会清空。
详见 [pytest 临时目录说明](https://docs.pytest.org/en/stable/how-to/tmp_path.html)。

## 结构与 Git

远程仓库：[lijinguojiuli/Find-the-path](https://github.com/lijinguojiuli/Find-the-path)。
桌面原始 README 与远程初始说明内容一致，已收录到 [docs/desktop/README.md](docs/desktop/README.md)。

- `src/robot_path_lab`：可安装的 Python 包；后续按阶段添加模型、算法、控制器和界面。
- `tests`：测试计划与后续测试用例。
- `pyproject.toml`：构建、依赖、入口与 pytest 设置。
- `PLAN.md`：阶段路线、验收标准和实际验证记录。
- `AGENTS.md`：Codex 在本仓库内应遵守的协作规则。
- `.venv`、`.cache`、`.tmp`、`.test_tmp` 和构建产物均由 Git 忽略。

每阶段先检查 `git status` 和新增文件，阅读差异后定向暂存，再检查暂存差异。
验证通过后建立本地里程碑提交。第 2 天完成后停止，下一阶段是网格地图模型。
