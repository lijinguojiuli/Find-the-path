"""Count real processing, including repeated expansions; no UI dependencies."""
from array import array
from dataclasses import replace


class SearchTrace:
    def __init__(self, maze, algorithm):
        self.expansion_count = self.repeat_expansion_count = self.edge_scans = 0
        self.max_frontier_size = None if algorithm == "bellmanford" else 0
        self.seen = bytearray(len(maze.walls))
        self.g, self.frontier = array("I"), array("I")

    def observe(self, size):
        if self.max_frontier_size is not None:
            self.max_frontier_size = max(self.max_frontier_size, size)

    def expand(self, cell, g, frontier_size=0):
        self.expansion_count += 1
        if self.seen[cell]:
            self.repeat_expansion_count += 1
        else:
            self.seen[cell] = 1
            self.g.append(int(g))
            self.frontier.append(frontier_size)

    def finish(self, result, work_count=None):
        return replace(result, expansion_count=self.expansion_count, repeat_expansion_count=self.repeat_expansion_count,
                       max_frontier_size=self.max_frontier_size, edge_scans=self.edge_scans,
                       work_count=self.expansion_count if work_count is None else work_count,
                       visited_g=tuple(self.g), visited_frontier=tuple(self.frontier))
