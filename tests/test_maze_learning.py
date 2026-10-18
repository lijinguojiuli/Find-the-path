"""Measured expansions, scene parity, and repeatable benchmark statistics."""
import json
from pathlib import Path
import shutil
import subprocess

import pytest
from robot_path_lab.maze import Maze, search_maze
from robot_path_lab.maze import metrics
from robot_path_lab.maze.scenarios import SCENARIOS, create_scenario


@pytest.mark.parametrize("algorithm", ["bfs", "dijkstra", "astar", "dfs", "greedy", "weighted", "spfa", "beam"])
def test_linear_map_real_expansions(algorithm):
    m = Maze(1, 3, bytes(3), (0, 0), (2, 0))
    result = search_maze(m, algorithm)
    assert result.expansion_count == 3 and result.repeat_expansion_count == 0
    assert result.max_frontier_size == 1
    assert result.visited_g == (0, 1, 2)
    assert result.expansion_count == result.visited_count + result.repeat_expansion_count


def test_repeated_expansions_are_not_hidden_by_deduplicated_visit_order():
    m = Maze(1, 3, bytes(3), (0, 0), (2, 0))
    deep = search_maze(m, "iddfs")
    assert (deep.expansion_count, deep.repeat_expansion_count, deep.max_frontier_size) == (6, 3, 3)
    scan = search_maze(m, "bellmanford")
    assert (scan.expansion_count, scan.repeat_expansion_count, scan.edge_scans) == (6, 3, 8)
    assert scan.max_frontier_size is None


def test_beam_peak_counts_both_pending_and_new_candidates():
    cells = ["#...#", "#...#", "##.##"]
    m = Maze(3,5,bytes(c=="#" for row in cells for c in row),(2,1),(1,0))
    assert search_maze(m,"beam").max_frontier_size == 5


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_fixed_teaching_scenes(scenario):
    m = create_scenario(scenario, 5)
    assert m == create_scenario(scenario, 5) and m.version == 5
    for algorithm in SCENARIOS[scenario]:
        result = search_maze(m, algorithm)
        assert result.found == (scenario != "unreachable")


def test_warmup_not_counted_and_median_ignores_single_outlier(monkeypatch):
    ticks = iter([0, 10_000_000, 0, 100_000_000, 0, 11_000_000, 0, 9_000_000, 0, 12_000_000])
    monkeypatch.setattr(metrics, "perf_counter_ns", lambda: next(ticks))
    result, timing = metrics.benchmark_search(create_scenario("loops"), "astar")
    assert result.found and timing["elapsed_ms"] == 11
    assert timing["sample_count"] == 5 and timing["warmup_count"] == 1


def test_browser_scene_and_statistics_parity():
    if not shutil.which("node"):
        pytest.skip("Node.js unavailable")
    script = """import{SCENARIOS,createScenario}from'./web/maze/scenarios.mjs';import{ALGORITHMS,searchMaze}from'./web/maze/search.mjs';
const out=[];for(const name of Object.keys(SCENARIOS)){const m=createScenario(name,3);const results={};for(const a of Object.keys(ALGORITHMS)){const r=searchMaze(m,a);results[a]={cost:r.totalCost,expanded:r.expansionCount,repeated:r.repeatExpansionCount,edges:r.edgeScans,g:[...r.visitedG]};}out.push({name,walls:[...m.walls],start:m.start,goal:m.goal,results});}console.log(JSON.stringify(out));"""
    output = subprocess.run(["node", "--input-type=module", "-e", script], cwd=Path(__file__).resolve().parents[1],
                            capture_output=True, encoding="utf-8", check=True)
    for row in json.loads(output.stdout):
        m = create_scenario(row["name"], 3)
        assert list(m.walls) == row["walls"] and list(m.start) == row["start"] and list(m.goal) == row["goal"]
        for algorithm, expected in row["results"].items():
            actual = search_maze(m, algorithm)
            assert actual.total_cost == expected["cost"]
            assert actual.expansion_count == expected["expanded"]
            assert actual.repeat_expansion_count == expected["repeated"]
            assert actual.edge_scans == expected["edges"]
            assert list(actual.visited_g) == expected["g"]
