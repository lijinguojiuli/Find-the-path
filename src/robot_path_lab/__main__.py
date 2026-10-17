"""Command-line entry point for Robot Path Planning Lab."""

from argparse import ArgumentParser
from importlib.metadata import version


def main() -> int:
    """Parse entry-point options and report the current project stage."""
    parser = ArgumentParser(
        prog="robot-path-lab",
        description="二维网格机器人路径规划实验台。",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {version('robot-path-planning-lab')}",
    )
    parser.parse_args()

    print("Robot Path Planning Lab")
    print("工程入口可用；地图与寻路功能将在后续阶段实现。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
