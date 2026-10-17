# 测试计划

第 2 天只建立工程，尚无业务测试用例；pytest 的版本检查不代表测试通过。
第 3 天从网格边界、邻居、障碍与成本校验开始添加 `test_grid.py`。

后续从项目根目录使用项目虚拟环境运行：

```powershell
& 'D:\codex\寻路\.venv\Scripts\python.exe' -X utf8 -m pytest
```

配置文件把缓存放在 `.cache/pytest`，把 `tmp_path` 基础目录放在 `.test_tmp/pytest`。
后者是 pytest 专用临时目录，运行时会被清空，不得存放其他文件。

核心正确性案例与动态重规划场景见根目录的 `PLAN.md`。
