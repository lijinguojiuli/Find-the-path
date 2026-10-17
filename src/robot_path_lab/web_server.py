"""Serve the Chinese browser interface using only Python's standard library."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
import webbrowser

WEB_ROOT = Path(__file__).resolve().parents[2] / "web"


class WebHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def create_server(port: int = 8765) -> ThreadingHTTPServer:
    if not (WEB_ROOT / "index.html").is_file():
        raise ValueError("没有找到网页文件，请从项目源码目录运行。")
    handler = partial(WebHandler, directory=str(WEB_ROOT))
    return ThreadingHTTPServer(("127.0.0.1", port), handler)


def run(rows: int, cols: int, *, port: int = 8765, open_browser: bool = True) -> int:
    with create_server(port) as server:
        url = f"http://127.0.0.1:{server.server_port}/?{urlencode({'rows': rows, 'cols': cols})}"
        print(f"中文网站已启动：{url}", flush=True)
        print("网页支持保留系统任务栏的「大屏模式」；按 Ctrl+C 关闭本地服务。", flush=True)
        if open_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0
