"""Command-line entry point for Robot Path Planning Lab."""

from argparse import ArgumentParser
from importlib.metadata import version


def main() -> int:
    """Parse map dimensions and open the grid preview."""
    parser = ArgumentParser(
        prog="robot-path-lab",
        description="二维网格机器人路径规划实验台。",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {version('robot-path-planning-lab')}",
    )
    parser.add_argument("--rows", type=int, default=20, help="地图行数，默认 20。")
    parser.add_argument("--cols", type=int, default=30, help="地图列数，默认 30。")
    args = parser.parse_args()
    if args.rows <= 0 or args.cols <= 0:
        parser.error("--rows 和 --cols 必须是正整数。")

    from robot_path_lab.ui.app import create_demo_grid, run

    try:
        return run(create_demo_grid(args.rows, args.cols))
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
