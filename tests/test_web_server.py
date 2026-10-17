"""The local website serves Chinese HTML and browser modules."""

from threading import Thread
from urllib.error import HTTPError
from urllib.request import urlopen

import pytest

from robot_path_lab.web_server import create_server


@pytest.fixture
def website_url():
    with create_server(0) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        yield f"http://127.0.0.1:{server.server_port}"
        server.shutdown()
        thread.join(timeout=5)


def test_homepage_is_chinese_and_contains_tutorial_and_large_view(website_url):
    with urlopen(website_url, timeout=5) as response:
        source = response.read().decode("utf-8")
    assert 'lang="zh-CN"' in source
    assert "大屏模式" in source
    assert "保留底部系统任务栏" in source
    assert "开始四步动手教程" in source


def test_browser_module_has_javascript_mime_type(website_url):
    with urlopen(f"{website_url}/model.mjs", timeout=5) as response:
        assert response.headers.get_content_type() == "text/javascript"


def test_project_files_outside_web_directory_are_not_served(website_url):
    with pytest.raises(HTTPError) as error:
        urlopen(f"{website_url}/../AGENTS.md", timeout=5)
    assert error.value.code == 404
