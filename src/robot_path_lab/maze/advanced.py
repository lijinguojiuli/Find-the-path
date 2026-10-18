"""Budgeted teaching strategies; incomplete work never means unreachable."""
from array import array
from collections import deque
from dataclasses import replace
from heapq import heappop, heappush
from math import inf

from .search import _chain, _result, neighbors


def advanced_search(m, algorithm, *, max_expansions=250000, beam_width=12):
    if type(max_expansions) is not int or max_expansions < 1 or type(beam_width) is not int or beam_width < 1:
        raise ValueError("搜索预算和束宽须为正整数。")
    n, visits, sides = len(m.walls), array("I"), bytearray()
    marked, parents = bytearray(n), array("i", [-2]) * n
    parents[m.start_id] = -1
    work = 0
    def touch(cell, side=1):
        if marked[cell]:
            return False
        marked[cell] = 1
        visits.append(cell)
        sides.append(side)
        return True
    def finish(path=(), status=None, reason=""):
        return replace(_result(path, visits, sides), status=status or ("found" if path else "unreachable"), reason=reason)
    def limited():
        return finish(status="limited", reason=f"达到 {max_expansions:,} 次计算上限，可改用 A* 或减小地图。")
    def h(cell, target=None):
        target = m.goal if target is None else target
        return abs(cell % m.cols - target[0]) + abs(cell // m.cols - target[1])
    if algorithm in ("spfa", "bellmanford"):
        distance = array("d", [inf]) * n
        distance[m.start_id] = 0
        if algorithm == "spfa":
            queue, inside = deque([m.start_id]), bytearray(n)
            inside[m.start_id] = 1
            while queue:
                work += 1
                if work > max_expansions:
                    return limited()
                cell = queue.popleft()
                inside[cell] = 0
                if touch(cell):
                    yield cell, 1
                if cell == m.goal_id:
                    return finish(list(reversed(_chain(parents, cell))))
                for next_cell in neighbors(m, cell):
                    if distance[cell] + 1 < distance[next_cell]:
                        distance[next_cell], parents[next_cell] = distance[cell] + 1, cell
                        if not inside[next_cell]:
                            queue.append(next_cell)
                            inside[next_cell] = 1
            return finish()
        for _ in range(n):
            changed = False
            for cell in range(n):
                if m.walls[cell]:
                    continue
                work += 1
                if work > max_expansions:
                    return limited()
                if distance[cell] == inf:
                    continue
                if touch(cell):
                    yield cell, 1
                for next_cell in neighbors(m, cell):
                    if distance[cell] + 1 < distance[next_cell]:
                        distance[next_cell], parents[next_cell] = distance[cell] + 1, cell
                        changed = True
            if not changed:
                break
        return finish(list(reversed(_chain(parents, m.goal_id))) if distance[m.goal_id] != inf else ())
    if algorithm == "beam":
        frontier, discarded = [m.start_id], False
        while frontier:
            candidates = []
            for cell in frontier:
                work += 1
                if work > max_expansions:
                    return limited()
                if touch(cell):
                    yield cell, 1
                if cell == m.goal_id:
                    return finish(list(reversed(_chain(parents, cell))))
                for next_cell in neighbors(m, cell):
                    if parents[next_cell] == -2:
                        parents[next_cell] = cell
                        candidates.append(next_cell)
            candidates.sort(key=h)
            discarded |= len(candidates) > beam_width
            frontier = candidates[:beam_width]
        return finish(status="limited", reason="束搜索舍弃了分支，未找到路径不代表迷宫不可达。") if discarded else finish()
    if algorithm == "bigreedy":
        p = [parents, array("i", [-2]) * n]
        p[1][m.goal_id] = -1
        heaps = [[(h(m.start_id), 0, m.start_id)], [(h(m.goal_id, m.start), 0, m.goal_id)]]
        side, sequence = 0, 0
        def join(cell):
            return list(reversed(_chain(p[0], cell))) + _chain(p[1], cell)[1:]
        while heaps[0] and heaps[1]:
            work += 1
            if work > max_expansions:
                return limited()
            other = 1 - side
            cell = heappop(heaps[side])[2]
            if touch(cell, side + 1):
                yield cell, side + 1
            if p[other][cell] != -2:
                return finish(join(cell))
            for next_cell in neighbors(m, cell):
                if p[side][next_cell] == -2:
                    p[side][next_cell] = cell
                    sequence += 1
                    heappush(heaps[side], (h(next_cell, m.start if side else m.goal), sequence, next_cell))
                if p[other][next_cell] != -2:
                    return finish(join(next_cell))
            side = other
        return finish()
    bound = h(m.start_id) if algorithm == "idastar" else 0
    while True:
        next_bound = inf
        stack = [{"id": m.start_id, "depth": 0, "next": -1}]
        in_path, best_depth = bytearray(n), array("i", [0x7FFFFFFF]) * n
        in_path[m.start_id] = 1
        while stack:
            frame = stack[-1]
            if frame["next"] == -1:
                score = frame["depth"] + (h(frame["id"]) if algorithm == "idastar" else 0)
                if score > bound:
                    next_bound = min(next_bound, score)
                    in_path[frame["id"]] = 0
                    stack.pop()
                    continue
                if frame["depth"] >= best_depth[frame["id"]]:
                    in_path[frame["id"]] = 0
                    stack.pop()
                    continue
                best_depth[frame["id"]] = frame["depth"]
                work += 1
                if work > max_expansions:
                    return limited()
                if touch(frame["id"]):
                    yield frame["id"], 1
                if frame["id"] == m.goal_id:
                    return finish([f["id"] for f in stack])
                frame["adjacent"], frame["next"] = list(neighbors(m, frame["id"])), 0
            if frame["next"] == len(frame["adjacent"]):
                in_path[frame["id"]] = 0
                stack.pop()
                continue
            next_cell = frame["adjacent"][frame["next"]]
            frame["next"] += 1
            if not in_path[next_cell]:
                in_path[next_cell] = 1
                stack.append({"id": next_cell, "depth": frame["depth"] + 1, "next": -1})
        if next_bound == inf:
            return finish()
        bound = next_bound if algorithm == "idastar" else bound + 1
