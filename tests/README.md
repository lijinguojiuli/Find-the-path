# 测试说明

- `test_grid.py`：53 项模型行为测试，覆盖尺寸、坐标、起终点、障碍、失败时状态保持与实例隔离。
- `test_controller.py`：40 项无窗口交互测试，覆盖模式、切换障碍、端点保护、允许重合、非法输入和反馈。
- `test_renderer.py`：25 项离屏绘制与像素映射测试，覆盖四条外边界、内部分隔线、小格子与非正方形地图。
- `test_app.py`：3 项 SDL dummy 事件适配测试，覆盖数字键/小键盘、鼠标、无效输入和 Esc 后不再编辑。
- 模型及控制器依赖隔离检查在 `-I -S` 子进程中执行，禁用第三方包仍能运行核心逻辑。
- 合计 121 项测试。真实 Windows 事件链路与预览图的验证记录见 `PLAN.md`，不混计为 pytest 测试。

从项目根目录使用项目虚拟环境运行：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

配置文件把缓存放在 `.cache/pytest`，把 `tmp_path` 基础目录放在 `.test_tmp/pytest`。
后者是 pytest 专用临时目录，运行时会被清空，不得存放其他文件。

核心正确性案例与动态重规划场景见根目录的 `PLAN.md`。
