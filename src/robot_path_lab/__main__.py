"""Command-line entry point for Robot Path Planning Lab."""

from argparse import ArgumentParser
from importlib.metadata import version


def main() -> int:
    """Open the Chinese website, or the retained desktop prototype."""
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
    parser.add_argument("--port", type=int, default=8765, help="本地网站端口，默认 8765。")
    parser.add_argument("--no-browser", action="store_true", help="只启动网站服务，不自动打开浏览器。")
    parser.add_argument("--desktop", action="store_true", help="打开保留的 Pygame 桌面原型。")
    args = parser.parse_args()
    if args.rows <= 0 or args.cols <= 0:
        parser.error("--rows 和 --cols 必须是正整数。")

    try:
        if args.desktop:
            from robot_path_lab.ui.app import create_demo_grid, run
            return run(create_demo_grid(args.rows, args.cols))
        if args.rows > 80 or args.cols > 80:
            parser.error("网站的行数和列数不能超过 80。")
        if not 1 <= args.port <= 65535:
            parser.error("端口必须在 1–65535 之间。")
        from robot_path_lab.web_server import run
        return run(args.rows, args.cols, port=args.port, open_browser=not args.no_browser)
    except ValueError as error:
        parser.error(str(error))
    except OSError as error:
        parser.error(f"无法启动网站，端口可能已被占用：{error}")


if __name__ == "__main__":
    raise SystemExit(main())
