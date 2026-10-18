"""Keep the teaching panel from displacing or accidentally closing the map."""
from html.parser import HTMLParser
from pathlib import Path


class PageStructure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.nodes, self.errors = [], {}, []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = attrs.get("id")
        if key:
            assert key not in self.nodes, f"duplicate id: {key}"
            self.nodes[key] = (len(self.nodes), tuple(self.stack))
        if tag not in {"meta", "link", "input", "img", "br", "hr"}:
            self.stack.append((tag, key, attrs.get("class", "")))

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append(tag)
        else:
            self.stack.pop()


def page():
    result = PageStructure()
    result.feed((Path(__file__).resolve().parents[1] / "web/maze/index.html").read_text(encoding="utf-8"))
    return result


def test_maze_controls_and_map_remain_inside_workspace():
    structure = page()
    assert structure.errors == [] and structure.stack == []
    for key in ("controls", "viewport", "compare-stage", "playbar", "viewbar", "status"):
        assert any("workspace" in classes.split() for _, _, classes in structure.nodes[key][1]), key
    order = [structure.nodes[key][0] for key in ("controls", "viewport", "playbar", "viewbar")]
    assert order == sorted(order), "Playback controls belong below the map"


def test_inspector_is_outside_map_workspace_and_after_map_on_small_screens():
    structure = page()
    ancestors = structure.nodes["inspector"][1]
    assert any(key == "learning-panel" for _, key, _ in ancestors)
    assert all("workspace" not in classes.split() for _, _, classes in ancestors)
    assert structure.nodes["inspector"][0] > structure.nodes["viewbar"][0]
    assert any(tag == "section" and "scenario-bar" in classes.split() for tag, _, classes in structure.nodes["settings"][1])
