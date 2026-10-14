"""Tests that run without Windows or the game. A fake backend stands in for the
game window, the mouse and keyboard, and the process."""
import ctypes
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import d2ai  # noqa: E402
import winio  # noqa: E402

GAME_SIZE = (1920, 1080)


def make_cfg(**overrides):
    cfg = dict(d2ai.DEFAULT_CONFIG)
    cfg.update(settle_seconds=0.0, **overrides)
    return cfg


class FakeBackend:
    """Records what d2ai sends; the 'screen' is a dark image with a red life globe."""

    def __init__(self, size=GAME_SIZE, life=1.0):
        self.size = size
        self.left, self.top = 100, 50
        self.calls = []
        self.foreground = True
        self.cursor = (500, 500)
        self.lose_focus_after_moves = None
        self.image = Image.new("RGB", size, (20, 20, 20))
        self.set_life(life)

    def set_life(self, fraction):
        # Globe column at x=100, from y=900 (top) to y=1000 (bottom), filled from the bottom.
        for y in range(900, 1001):
            for x in range(96, 105):
                filled = y >= 1000 - round(100 * fraction) + 1
                self.image.putpixel((x, y), (200, 20, 20) if filled else (30, 30, 40))

    def find_windows(self, title, process_names):
        return [d2ai.Window(hwnd=7, title="Diablo II", pid=42, exe="Game.exe")]

    def window_alive(self, hwnd, pid):
        return (hwnd, pid) == (7, 42)

    def client_box(self, hwnd):
        return (self.left, self.top, *self.size)

    def capture(self, box):
        left, top, width, height = box
        x, y = left - self.left, top - self.top
        self.calls.append(("capture", (x, y, width, height)))
        return self.image.crop((x, y, x + width, y + height))

    def focus(self, hwnd):
        self.calls.append(("focus",))
        return True

    def is_foreground(self, hwnd):
        return self.foreground

    def cursor_pos(self):
        return self.cursor

    def move(self, x, y):
        self.calls.append(("move", x, y))
        self.cursor = (x, y)
        moves = sum(1 for call in self.calls if call[0] == "move")
        if self.lose_focus_after_moves is not None and moves >= self.lose_focus_after_moves:
            self.foreground = False

    def button(self, name, down):
        self.calls.append(("button", name, down))

    def key(self, name, down):
        self.calls.append(("key", name, down))

    def suspend(self, pid):
        self.calls.append(("suspend", pid))

    def resume(self, pid):
        self.calls.append(("resume", pid))

    def names(self):
        return [call[0] for call in self.calls]


# --- Actions ---------------------------------------------------------------


def test_parse_click():
    action, warnings = d2ai.parse_action("click:640,300", (1280, 720))
    assert (action.kind, action.x, action.y) == ("click", 640, 300)
    assert warnings == []


def test_parse_clamps_points_outside_the_screenshot():
    action, warnings = d2ai.parse_action("rclick:1500,-5", (1280, 720))
    assert (action.x, action.y) == (1279, 0)
    assert "outside" in warnings[0]


def test_parse_hold_key_and_wait():
    hold, _ = d2ai.parse_action("hold:10,20,1.5", (1280, 720))
    assert (hold.x, hold.y, hold.seconds) == (10, 20, 1.5)
    keyhold, _ = d2ai.parse_action("keyhold:ALT,1", (1280, 720))
    assert (keyhold.key, keyhold.seconds) == ("alt", 1.0)
    tap, _ = d2ai.parse_action(" key:f2 ", (1280, 720))
    assert tap.key == "f2"
    wait, warnings = d2ai.parse_action("wait:9", (1280, 720))
    assert wait.seconds == d2ai.MAX_SECONDS and warnings


@pytest.mark.parametrize("token", [
    "jump:1,2", "click", "click:1", "click:a,b", "hold:1,2", "key:pageup",
    "key:", "wait:0", "wait:-1", "wait:nan", "click:1,2,3",
])
def test_parse_rejects_bad_tokens(token):
    with pytest.raises(d2ai.ActionError):
        d2ai.parse_action(token, (1280, 720))


def test_turn_limits_trim_actions():
    cfg = make_cfg(max_actions=3)
    actions, warnings = d2ai.parse_actions(["key:1", "key:2", "key:3", "key:4"], (1280, 720), cfg)
    assert [a.key for a in actions] == ["1", "2", "3"]
    assert warnings

    cfg = make_cfg(max_turn_seconds=4.0)
    actions, warnings = d2ai.parse_actions(["hold:5,5,3", "hold:5,5,3", "click:5,5"], (1280, 720), cfg)
    assert [a.seconds for a in actions] == [3.0, 1.0]
    assert any("shortened" in w for w in warnings) and any("skipped" in w for w in warnings)


def test_one_bad_token_rejects_the_whole_turn():
    with pytest.raises(d2ai.ActionError):
        d2ai.parse_actions(["click:5,5", "fly:1,1"], (1280, 720), make_cfg())


def test_esc_key_not_allowed_with_esc_pausing():
    with pytest.raises(d2ai.ActionError):
        d2ai.parse_actions(["key:esc"], (1280, 720), make_cfg(pause_method="esc"))
    actions, _ = d2ai.parse_actions(["key:esc"], (1280, 720), make_cfg(pause_method="suspend"))
    assert actions[0].key == "esc"


# --- Images ----------------------------------------------------------------


def test_scale_and_map_coordinates():
    assert d2ai.scale_size(1920, 1080, 1280) == (1280, 720)
    assert d2ai.scale_size(800, 600, 1280) == (800, 600)
    assert d2ai.to_client(640, 360, (1280, 720), (1920, 1080)) == (960, 540)
    assert d2ai.to_client(0, 0, (1280, 720), (1920, 1080)) == (2, 2)
    assert d2ai.to_client(1279, 719, (1280, 720), (1920, 1080)) == (1917, 1077)


def test_read_life():
    backend = FakeBackend(life=0.6)
    globe = {"x": 100, "top": 900, "bottom": 1000}
    assert d2ai.read_life(backend.image, globe) == pytest.approx(0.6, abs=0.02)
    backend.set_life(1.0)
    assert d2ai.read_life(backend.image, globe) == pytest.approx(1.0, abs=0.02)
    assert d2ai.read_life(backend.image, None) is None
    assert d2ai.read_life(backend.image, {"x": 5000, "top": 1, "bottom": 2}) is None


def test_read_life_counts_poisoned_green():
    image = Image.new("RGB", (50, 50), (0, 150, 0))
    assert d2ai.read_life(image, {"x": 25, "top": 0, "bottom": 49}) == 1.0


def test_draw_grid_keeps_size():
    image = Image.new("RGB", (1280, 720), (10, 10, 10))
    out = d2ai.draw_grid(image, 100)
    assert out.size == image.size and out.mode == "RGB"
    assert out.getpixel((100, 400)) != (10, 10, 10)  # a grid line
    crop = d2ai.draw_grid(Image.new("RGB", (300, 200)), 10, label_step=50, origin=(0, 880))
    assert crop.size == (300, 200)


# --- The game --------------------------------------------------------------


def test_look_then_act(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(life_globe={"x": 100, "top": 900, "bottom": 1000}), backend, tmp_path)
    shot = game.look()
    assert backend.names()[-1] == "suspend" and game.paused
    assert shot.size == (1280, 720) and shot.path.exists() and shot.life == pytest.approx(1.0, abs=0.02)

    backend.calls.clear()
    actions, _ = d2ai.parse_actions(["click:640,360", "key:i"], shot.size, game.cfg)
    shot = game.act(actions)
    names = backend.names()
    assert names[0] == "resume" and names[-1] == "suspend"
    # The click lands in the middle of the 1920x1080 window, which starts at (100, 50).
    assert ("move", 100 + 960, 50 + 540) in backend.calls
    presses = [call for call in backend.calls if call[0] in ("button", "key")]
    assert presses == [("button", "left", True), ("button", "left", False), ("key", "i", True), ("key", "i", False)]
    assert shot.turn == 2 and shot.aborted is None

    # A new Game (the next command) picks up the saved state.
    again = d2ai.Game(game.cfg, backend, tmp_path)
    assert again.paused and again.state["last_shot"]["turn"] == 2
    assert again.look().turn == 2  # already paused: same screenshot, no new capture


def test_act_stops_when_the_person_takes_over(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    game.look()
    backend.lose_focus_after_moves = 1
    actions, _ = d2ai.parse_actions(["hold:600,300,2", "click:10,10"], (1280, 720), game.cfg)
    shot = game.act(actions)
    assert "lost focus" in shot.aborted
    # The held button was released, only one move happened, and the game is paused again.
    assert ("button", "left", False) in backend.calls
    assert backend.names().count("move") == 1
    assert game.paused and backend.names()[-1] == "suspend"
    assert shot.turn == 1  # no new screenshot while another window is in front


def test_mouse_in_corner_is_an_emergency_stop(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    game.look()
    backend.calls.clear()
    backend.cursor = (0, 0)
    actions, _ = d2ai.parse_actions(["click:5,5"], (1280, 720), game.cfg)
    shot = game.act(actions)
    # Nothing at all is sent and the game stays paused.
    assert "corner" in shot.aborted and backend.calls == [] and game.paused


def test_screen_left_of_the_main_one_is_not_the_corner(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    game.look()
    backend.cursor = (-500, -10)
    shot = game.act(d2ai.parse_actions(["click:5,5"], (1280, 720), game.cfg)[0])
    assert shot.aborted is None and "move" in backend.names()


def test_auto_potion(tmp_path):
    backend = FakeBackend(life=0.3)
    cfg = make_cfg(life_globe={"x": 100, "top": 900, "bottom": 1000}, potion_keys=["1", "2"])
    game = d2ai.Game(cfg, backend, tmp_path)
    game.look()
    shot = game.act(d2ai.parse_actions(["wait:0.3"], (1280, 720), cfg)[0])
    assert ("key", "1", True) in backend.calls
    assert any("auto-potion" in note for note in shot.notes)


def test_esc_pausing(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(pause_method="esc"), backend, tmp_path)
    game.look()
    taps = [call[1] for call in backend.calls if call[0] == "key" and call[2]]
    assert taps == ["space", "esc"] and game.paused
    game.resume()
    taps = [call[1] for call in backend.calls if call[0] == "key" and call[2]]
    assert taps == ["space", "esc", "esc"] and not game.paused


def test_restarted_game_resets_state(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    game.look()
    backend.window_alive = lambda hwnd, pid: False
    again = d2ai.Game(make_cfg(), backend, tmp_path)
    assert not again.paused and "last_shot" not in again.state


def test_config_validation(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"pause_method": "suspend", "potion_keys": ["1"]}))
    assert d2ai.load_config(path)["potion_keys"] == ["1"]
    path.write_text(json.dumps({"colour": "blue"}))
    with pytest.raises(d2ai.GameError):
        d2ai.load_config(path)
    path.write_text(json.dumps({"life_globe": {"x": 1, "top": 5, "bottom": 2}}))
    with pytest.raises(d2ai.GameError):
        d2ai.load_config(path)


def test_shipped_config_matches_defaults():
    assert d2ai.load_config(d2ai.CONFIG_FILE) == d2ai.DEFAULT_CONFIG


# --- Autopilot -------------------------------------------------------------


def reply(plan="walking", actions=("click:600,300",), notes="goal: den", stop_reason="end_turn"):
    text = json.dumps({"plan": plan, "actions": list(actions), "notes": notes})
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=None,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=1800, output_tokens=900, cache_read_input_tokens=1600, cache_creation_input_tokens=0),
    )


class FakeClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **params):
        self.requests.append(params)
        return self.replies.pop(0)


def test_request_params():
    params = d2ai.request_params(make_cfg(), "system text", [{"type": "text", "text": "hi"}])
    assert params["model"] == "claude-opus-5-5"
    assert params["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert params["output_config"]["format"]["schema"] == d2ai.TURN_SCHEMA
    assert params["output_config"]["effort"] == "medium"
    assert params["fallbacks"] == "default" and params["betas"] == ["server-side-fallback-2026-07-01"]
    assert "thinking" not in params and "tool_choice" not in params
    plain = d2ai.request_params(make_cfg(use_fallbacks=False, effort=None), "s", [])
    assert "fallbacks" not in plain and "betas" not in plain and "effort" not in plain["output_config"]


def test_autopilot_plays_turns(tmp_path, capsys):
    backend = FakeBackend()
    cfg = make_cfg()
    game = d2ai.Game(cfg, backend, tmp_path)
    client = FakeClient([
        reply(),
        reply(stop_reason="max_tokens"),  # unusable, asked again
        reply(actions=["fly:1,1"]),  # rejected, nothing sent
        reply(plan="attacking", actions=["sclick:700,350"], notes="den is north"),
    ])
    assert d2ai.autopilot(cfg, "Clear the Den of Evil", 3, game=game, client=client, run_dir=tmp_path) == 0
    assert len(client.requests) == 4
    first = client.requests[0]["messages"][0]["content"]
    assert first[0]["type"] == "image" and first[0]["source"]["media_type"] == "image/jpeg"
    assert "Goal: Clear the Den of Evil" in first[1]["text"]
    last = client.requests[3]["messages"][0]["content"][1]["text"]
    assert "nothing was done" in last and "Recent turns" in last
    assert (tmp_path / "notes.md").read_text() == "den is north"
    assert len((tmp_path / "autopilot-log.jsonl").read_text().splitlines()) == 3
    assert not game.paused and backend.names()[-1] == "resume"
    assert "~$" in capsys.readouterr().out


def test_autopilot_stops_on_refusal(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    refused = reply(stop_reason="refusal")
    assert d2ai.autopilot(make_cfg(), "goal", 5, game=game, client=FakeClient([refused]), run_dir=tmp_path) == 1
    assert not game.paused  # the game is unpaused when autopilot ends


def test_autopilot_stops_when_the_person_takes_over(tmp_path):
    backend = FakeBackend()
    game = d2ai.Game(make_cfg(), backend, tmp_path)
    backend.lose_focus_after_moves = 1
    client = FakeClient([reply(), reply()])
    assert d2ai.autopilot(make_cfg(), "goal", 5, game=game, client=client, run_dir=tmp_path) == 0
    assert len(client.requests) == 1


def test_cost_estimate():
    usage = SimpleNamespace(input_tokens=1_000_000, output_tokens=0, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    assert d2ai.estimate_cost("claude-opus-5-5", usage) == pytest.approx(4.0)
    assert d2ai.estimate_cost("some-other-model", usage) is None


def test_guide_lists_every_action():
    guide = d2ai.GUIDE_FILE.read_text(encoding="utf-8")
    for name in d2ai.ARG_COUNTS:
        assert f"`{name}:" in guide


# --- Windows structures ----------------------------------------------------


def test_input_struct_matches_windows_layout():
    expected = 40 if ctypes.sizeof(ctypes.c_void_p) == 8 else 28
    assert ctypes.sizeof(winio.INPUT) == expected
