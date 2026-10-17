# 测试说明

- `test_grid.py`：53 项模型行为测试，覆盖尺寸、坐标、起终点、障碍、失败时状态保持与实例隔离。
- `test_controller.py`：40 项无窗口交互测试，覆盖模式、切换障碍、端点保护、允许重合、非法输入和反馈。
- `test_renderer.py`：25 项离屏绘制与像素映射测试，覆盖四条外边界、内部分隔线、小格子与非正方形地图。
- `test_app.py`：3 项 SDL dummy 事件适配测试，覆盖数字键/小键盘、鼠标、无效输入和 Esc 后不再编辑。
- 模型及控制器依赖隔离检查在 `-I -S` 子进程中执行，禁用第三方包仍能运行核心逻辑。
- `test_web_server.py`：3 项网站服务测试，验证中文页面、教程/大屏入口、JS MIME 类型与文件边界。
- 合计 124 项 Python 测试。真实窗口及浏览器验收另记于 `PLAN.md`，不混计为 pytest 测试。
- `web/model.test.mjs`：28 项独立网页逻辑测试，包括障碍、端点、像素边界、尺寸、快照和四步教程状态。

网页测试命令：`node --test web/model.test.mjs`。它不依赖 npm 包。

从项目根目录使用项目虚拟环境运行：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

配置文件把缓存放在 `.cache/pytest`，把 `tmp_path` 基础目录放在 `.test_tmp/pytest`。
后者是 pytest 专用临时目录，运行时会被清空，不得存放其他文件。

核心正确性案例与动态重规划场景见根目录的 `PLAN.md`。
