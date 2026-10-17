"""The static browser implementation must obey the Python search contract."""

import json
from pathlib import Path
import shutil
import subprocess

import pytest

from robot_path_lab.algorithms import astar, bfs, dijkstra
from robot_path_lab.grid import Grid


def test_python_and_browser_algorithms_agree_on_shared_maps():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js 未安装；网页跨语言对照需 Node.js。")
    root = Path(__file__).resolve().parents[1]
    maps = [
        dict(rows=1, cols=1, start=[0, 0], goal=[0, 0]),
        dict(rows=3, cols=5, start=[0, 1], goal=[4, 1], costs=[[1, 1, 5], [2, 1, 5], [3, 1, 5]]),
        dict(rows=3, cols=3, start=[0, 0], goal=[2, 0], obstacles=[[1, 0], [1, 1]]),
        dict(rows=2, cols=2, start=[0, 0], goal=[1, 1], obstacles=[[1, 0], [0, 1]]),
        dict(rows=1, cols=3, start=[0, 0], goal=[2, 0], costs=[[0, 0, 5], [1, 0, 5], [2, 0, 5]]),
        dict(rows=4, cols=3, start=[2, 3], goal=[0, 0], obstacles=[[1, 1]], costs=[[2, 2, 9], [1, 2, 2], [0, 0, 5]]),
    ]
    code = (
        "import {readFileSync} from 'node:fs';"
        f"import {{Grid}} from {json.dumps((root / 'web/model.mjs').as_uri())};"
        f"import {{searchGrid}} from {json.dumps((root / 'web/search.mjs').as_uri())};"
        "const maps=JSON.parse(readFileSync(0,'utf8'));"
        "console.log(JSON.stringify(maps.map(map=>['bfs','dijkstra','astar'].map(name=>searchGrid(new Grid(map.rows,map.cols,map),name)))));"
    )
    completed = subprocess.run(
        [node, "--input-type=module", "-e", code], input=json.dumps(maps),
        text=True, encoding="utf-8", capture_output=True, check=True, timeout=20,
    )
    browser_results = json.loads(completed.stdout)
    for data, browser_row in zip(maps, browser_results, strict=True):
        grid = Grid(data["rows"], data["cols"], start=tuple(data["start"]), goal=tuple(data["goal"]),
                    obstacles=[tuple(cell) for cell in data.get("obstacles", [])],
                    costs={(x, y): cost for x, y, cost in data.get("costs", [])})
        for algorithm, actual in zip((bfs, dijkstra, astar), browser_row, strict=True):
            expected = algorithm(grid)
            assert actual == dict(found=expected.found, path=[list(cell) for cell in expected.path],
                                  visitedOrder=[list(cell) for cell in expected.visited_order],
                                  visitedCount=expected.visited_count, totalCost=expected.total_cost)
