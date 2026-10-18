"""Independent large-maze teaching models; the original lab is unchanged."""
from .model import MAZE_TYPES, Maze, generate_maze
from .search import ALGORITHMS, OPTIMAL, MazeSearchResult, iter_search, search_maze

__all__ = ["MAZE_TYPES", "Maze", "generate_maze", "ALGORITHMS", "OPTIMAL", "MazeSearchResult", "iter_search", "search_maze"]
