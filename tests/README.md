# 测试说明

- `test_grid.py`：53 项模型行为测试，覆盖尺寸、坐标、起终点、障碍、失败时状态保持与实例隔离。
- `test_renderer.py`：3 项离屏绘制测试，覆盖格子颜色、坐标映射、重合端点与绘制不修改模型。
- 模型依赖隔离检查在 `-I -S` 子进程中执行，禁用第三方包仍能导入和使用 `Grid`。
- 窗口启动、关闭按钮与 Esc 的真实 Windows 冒烟验收记录见 `PLAN.md`。

从项目根目录使用项目虚拟环境运行：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

配置文件把缓存放在 `.cache/pytest`，把 `tmp_path` 基础目录放在 `.test_tmp/pytest`。
后者是 pytest 专用临时目录，运行时会被清空，不得存放其他文件。

核心正确性案例与动态重规划场景见根目录的 `PLAN.md`。
