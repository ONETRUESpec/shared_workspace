#!/usr/bin/env python3
"""d2ai: let Claude play Diablo II on this Windows PC (offline single player only).

The game is frozen while the AI thinks. Each turn d2ai unfreezes it, runs a few
mouse and keyboard actions, takes a screenshot and freezes it again, so even a
slow thinker can keep up with the monsters.

    python d2ai.py check                 find the game window, save a test screenshot
    python d2ai.py look                  screenshot the game and freeze it
    python d2ai.py act click:640,300     unfreeze, act, screenshot, freeze again
    python d2ai.py resume                unfreeze the game
    python d2ai.py calibrate             help set up automatic healing potions
    python d2ai.py autopilot --goal ...  let Claude play by itself (needs an API key)

The action syntax is in GAME_GUIDE.md and the settings are in config.json.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CONFIG_FILE = HERE / "config.json"
GUIDE_FILE = HERE / "GAME_GUIDE.md"
RUN_DIR = HERE / "run"

DEFAULT_CONFIG = {
    # The game window: its title contains window_title and it belongs to one
    # of process_names (classic Diablo II, PlugY and D2SE, or Resurrected).
    "window_title": "Diablo II",
    "process_names": ["Game.exe", "Diablo II.exe", "D2SE.exe", "D2R.exe"],
    # How the game is frozen between turns: "suspend" freezes the game's
    # process, "esc" opens the in-game menu (which pauses single player),
    # "none" never pauses.
    "pause_method": "suspend",
    # Screenshots the AI sees: scaled down to this width, with a coordinate grid.
    "image_width": 1280,
    "grid": True,
    "grid_step": 100,
    "jpeg_quality": 90,
    # Game time after the last action before the screenshot is taken.
    "settle_seconds": 0.3,
    # Limits per turn, so the AI never runs blind for long.
    "max_actions": 10,
    "max_turn_seconds": 4.0,
    "keep_screenshots": 300,
    # Automatic healing potions. life_globe is a vertical line through the
    # red life globe, in game-window pixels: {"x": .., "top": .., "bottom": ..}.
    # Set it up with `python d2ai.py calibrate`.
    "life_globe": None,
    "potion_below": 0.45,
    "potion_keys": ["1", "2"],
    # Autopilot only (Claude API).
    "model": "claude-opus-5-5",
    "effort": "medium",
    "use_fallbacks": True,
    "history_turns": 8,
}
PAUSE_METHODS = ("suspend", "esc", "none")


class GameError(Exception):
    """Something about the game or the PC that stops d2ai from working."""


class ActionError(ValueError):
    """An action that doesn't make sense. Nothing was sent to the game."""


class Abort(Exception):
    """Stop sending input now: the person took over, or the game lost focus."""


def load_config(path: Path = CONFIG_FILE) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if path.exists():
        try:
            user = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise GameError(f"{path.name} isn't valid JSON: {error}") from None
        unknown = sorted(set(user) - set(DEFAULT_CONFIG))
        if unknown:
            raise GameError(f"{path.name} has unknown settings: {', '.join(unknown)}")
        cfg.update(user)
    if cfg["pause_method"] not in PAUSE_METHODS:
        raise GameError(f'pause_method must be one of: {", ".join(PAUSE_METHODS)}')
    globe = cfg["life_globe"]
    if globe is not None and not (
        isinstance(globe, dict)
        and all(isinstance(globe.get(k), int) for k in ("x", "top", "bottom"))
        and globe["top"] < globe["bottom"]
    ):
        raise GameError('life_globe must look like {"x": 70, "top": 520, "bottom": 590}, or be null')
    return cfg


# --- Actions ---------------------------------------------------------------

POINT_ACTIONS = {"click", "sclick", "rclick", "hover"}
HOLD_ACTIONS = {"hold", "rhold"}
KEY_ACTIONS = {"key", "keyhold"}
TIMED_ACTIONS = HOLD_ACTIONS | {"keyhold", "wait"}
ARG_COUNTS = {
    "click": 2, "sclick": 2, "rclick": 2, "hover": 2,
    "hold": 3, "rhold": 3, "key": 1, "keyhold": 2, "wait": 1,
}
KEY_NAMES = {"tab", "space", "enter", "esc", "alt", "shift", "ctrl"} | {f"f{n}" for n in range(1, 13)}
MAX_SECONDS = 3.0
# Rough game time a click, tap or hover takes, counted against max_turn_seconds.
QUICK_SECONDS = 0.25


@dataclass
class Action:
    kind: str
    x: int = 0
    y: int = 0
    seconds: float = 0.0
    key: str = ""

    @property
    def game_seconds(self) -> float:
        return self.seconds if self.kind in TIMED_ACTIONS else QUICK_SECONDS


def _number(text: str, token: str) -> float:
    try:
        value = float(text)
    except ValueError:
        raise ActionError(f"{token!r}: {text!r} isn't a number") from None
    if not math.isfinite(value):
        raise ActionError(f"{token!r}: {text!r} isn't a number")
    return value


def parse_action(token: str, image_size: tuple[int, int]) -> tuple[Action, list[str]]:
    """Turn a token like 'click:640,300' into an Action, plus any warnings."""
    name, _, args = token.strip().partition(":")
    name = name.strip().lower()
    if name not in ARG_COUNTS:
        raise ActionError(f"{token!r}: unknown action {name!r} (see GAME_GUIDE.md)")
    parts = [part.strip() for part in args.split(",")] if args.strip() else []
    if len(parts) != ARG_COUNTS[name]:
        raise ActionError(f"{token!r}: {name} takes {ARG_COUNTS[name]} value(s), like in GAME_GUIDE.md")
    action = Action(name)
    warnings = []
    if name in POINT_ACTIONS or name in HOLD_ACTIONS:
        x, y = round(_number(parts[0], token)), round(_number(parts[1], token))
        width, height = image_size
        action.x, action.y = min(max(x, 0), width - 1), min(max(y, 0), height - 1)
        if (action.x, action.y) != (x, y):
            warnings.append(f"{token}: outside the {width}x{height} screenshot, used {action.x},{action.y}")
    if name in KEY_ACTIONS:
        key = parts[0].lower()
        if key not in KEY_NAMES and not (len(key) == 1 and key.isascii() and key.isalnum()):
            raise ActionError(f"{token!r}: unknown key {parts[0]!r}")
        action.key = key
    if name in TIMED_ACTIONS:
        seconds = _number(parts[-1], token)
        if seconds <= 0:
            raise ActionError(f"{token!r}: the number of seconds must be more than 0")
        if seconds > MAX_SECONDS:
            warnings.append(f"{token}: shortened to {MAX_SECONDS:g} seconds")
            seconds = MAX_SECONDS
        action.seconds = seconds
    return action, warnings


def parse_actions(tokens: list[str], image_size: tuple[int, int], cfg: dict) -> tuple[list[Action], list[str]]:
    """Check a whole turn. Any bad token rejects the turn; limits only trim it."""
    actions, warnings = [], []
    for token in tokens:
        action, notes = parse_action(token, image_size)
        actions.append(action)
        warnings += notes
    if cfg["pause_method"] == "esc" and any(a.kind in KEY_ACTIONS and a.key == "esc" for a in actions):
        raise ActionError("key:esc isn't allowed while pause_method is 'esc' (d2ai uses Esc to pause); use key:space to close panels")
    if len(actions) > cfg["max_actions"]:
        warnings.append(f"only the first {cfg['max_actions']} actions were used")
        actions = actions[: cfg["max_actions"]]
    limit, used, kept = cfg["max_turn_seconds"], 0.0, []
    for index, action in enumerate(actions):
        room = limit - used
        if action.kind in TIMED_ACTIONS and action.seconds > room and room >= 0.05:
            action.seconds = round(room, 2)
            warnings.append(f"action {index + 1} was shortened to {action.seconds:g}s (turn time limit {limit:g}s)")
        elif room <= 0 or (action.kind in TIMED_ACTIONS and action.seconds > room):
            warnings.append(f"turn time limit ({limit:g}s) reached, skipped the last {len(actions) - index} action(s)")
            break
        used += action.game_seconds
        kept.append(action)
    return kept, warnings


# --- Images ----------------------------------------------------------------

GRID_COLOR = (0, 255, 255)


def scale_size(width: int, height: int, max_width: int) -> tuple[int, int]:
    if width <= max_width:
        return width, height
    return max_width, max(1, round(height * max_width / width))


def to_client(x: int, y: int, image_size: tuple[int, int], client_size: tuple[int, int], margin: int = 2) -> tuple[int, int]:
    """Map a pixel in the screenshot to a pixel inside the game window."""
    image_w, image_h = image_size
    client_w, client_h = client_size
    cx = int((x + 0.5) * client_w / image_w)
    cy = int((y + 0.5) * client_h / image_h)
    return min(max(cx, margin), client_w - 1 - margin), min(max(cy, margin), client_h - 1 - margin)


def draw_grid(image: Image.Image, step: int, label_step: int | None = None, origin: tuple[int, int] = (0, 0)) -> Image.Image:
    """Faint lines every `step` pixels, labelled every `label_step` pixels along
    the top and left edges. `origin` is where the image sits in the game window,
    so crops are labelled in game-window pixels."""
    label_step = label_step or step
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default()
    width, height = image.size
    ox, oy = origin
    for x in range((-ox) % step or step, width, step):
        labelled = (ox + x) % label_step == 0
        draw.line([(x, 0), (x, height - 1)], fill=GRID_COLOR + ((90,) if labelled else (40,)))
        if labelled:
            _label(draw, (x + 2, 1), str(ox + x), font)
    for y in range((-oy) % step or step, height, step):
        labelled = (oy + y) % label_step == 0
        draw.line([(0, y), (width - 1, y)], fill=GRID_COLOR + ((90,) if labelled else (40,)))
        if labelled:
            _label(draw, (2, y + 1), str(oy + y), font)
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def _label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font) -> None:
    left, top, right, bottom = draw.textbbox(xy, text, font=font)
    draw.rectangle((left - 1, top - 1, right + 1, bottom + 1), fill=(0, 0, 0, 170))
    draw.text(xy, text, font=font, fill=GRID_COLOR + (255,))


def read_life(image: Image.Image, globe: dict | None) -> float | None:
    """How full the life globe is (0 to 1), measured along a vertical line
    through it. Red counts as life, and so does green (poisoned)."""
    if not globe:
        return None
    x, top, bottom = globe["x"], globe["top"], globe["bottom"]
    width, height = image.size
    if not (0 <= x < width and 0 <= top < bottom < height):
        return None
    pixels = image.convert("RGB").load()
    filled = 0
    for y in range(top, bottom + 1):
        hits = 0
        for dx in (-2, 0, 2):
            r, g, b = pixels[min(max(x + dx, 0), width - 1), y]
            if (r > 80 and r > 1.6 * g and r > 1.6 * b) or (g > 80 and g > 1.6 * r and g > 1.6 * b):
                hits += 1
        if hits >= 2:
            filled += 1
    return filled / (bottom - top + 1)


# --- The game --------------------------------------------------------------


@dataclass
class Window:
    hwnd: int
    title: str
    pid: int
    exe: str


@dataclass
class Shot:
    """A screenshot as the AI sees it."""

    turn: int
    path: Path
    size: tuple[int, int]
    life: float | None = None
    notes: list[str] = field(default_factory=list)
    aborted: str | None = None

    def report(self, paused: bool) -> dict:
        report = {
            "turn": self.turn,
            "screenshot": str(self.path),
            "size": list(self.size),
            "life": None if self.life is None else f"{self.life:.0%}",
            "paused": paused,
        }
        if self.aborted:
            report["stopped_early"] = self.aborted
        if self.notes:
            report["notes"] = self.notes
        return report


class WindowsBackend:
    """Windows input, screenshots and process control (the details are in winio.py)."""

    def __init__(self):
        if sys.platform != "win32":
            raise GameError("d2ai has to run on the Windows PC where Diablo II is running.")
        import mss
        import mss.exception
        import psutil

        import winio

        winio.make_dpi_aware()  # before anything measures the screen
        self.win = winio
        self.psutil = psutil
        self.screen = mss.mss()
        self._screenshot_error = mss.exception.ScreenShotError

    def _exe(self, pid: int) -> str:
        try:
            return self.psutil.Process(pid).name()
        except self.psutil.Error:
            return ""

    def find_windows(self, title: str, process_names: list[str]) -> list[Window]:
        wanted = {name.lower() for name in process_names}
        found = []
        for hwnd, text, pid, visible in self.win.list_windows():
            if title.lower() in text.lower():
                exe = self._exe(pid)
                if exe.lower() in wanted:
                    found.append((not visible, Window(hwnd, text, pid, exe)))
        return [window for _, window in sorted(found, key=lambda item: item[0])]

    def windows_named(self, word: str) -> list[tuple[str, str]]:
        """(title, program) of every window with `word` in its title, for troubleshooting."""
        return [(text, self._exe(pid)) for _, text, pid, _ in self.win.list_windows() if word.lower() in text.lower()]

    def window_alive(self, hwnd: int, pid: int) -> bool:
        return self.win.window_pid(hwnd) == pid

    def client_box(self, hwnd: int) -> tuple[int, int, int, int]:
        return self.win.client_box(hwnd)

    def capture(self, box: tuple[int, int, int, int]) -> Image.Image:
        left, top, width, height = box
        try:
            shot = self.screen.grab({"left": left, "top": top, "width": width, "height": height})
        except self._screenshot_error as error:
            raise GameError(f"Couldn't take a screenshot of the game window: {error}") from None
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

    def focus(self, hwnd: int) -> bool:
        return self.win.focus(hwnd)

    def is_foreground(self, hwnd: int) -> bool:
        return self.win.is_foreground(hwnd)

    def cursor_pos(self) -> tuple[int, int]:
        return self.win.cursor_pos()

    def move(self, x: int, y: int) -> None:
        self.win.move_mouse(x, y)

    def button(self, name: str, down: bool) -> None:
        self.win.mouse_button(name, down)

    def key(self, name: str, down: bool) -> None:
        self.win.key(name, down)

    def suspend(self, pid: int) -> None:
        self._process_call(pid, "suspend")

    def resume(self, pid: int) -> None:
        self._process_call(pid, "resume")

    def _process_call(self, pid: int, method: str) -> None:
        try:
            getattr(self.psutil.Process(pid), method)()
        except self.psutil.NoSuchProcess:
            raise GameError("The game isn't running any more.") from None
        except self.psutil.AccessDenied:
            raise GameError(
                "Windows didn't allow pausing or unpausing the game. If Diablo II runs as "
                "administrator, run this terminal as administrator too."
            ) from None


class Game:
    """The running game: pauses and resumes it, sends actions, takes screenshots.

    What has to survive between commands (whether d2ai paused the game, the last
    screenshot) is kept in run/state.json.
    """

    def __init__(self, cfg: dict, backend=None, run_dir: Path = RUN_DIR):
        self.cfg = cfg
        self.io = backend if backend is not None else WindowsBackend()
        self.run_dir = Path(run_dir)
        self.shots_dir = self.run_dir / "shots"
        self.state_file = self.run_dir / "state.json"
        self.state = self._load_state()
        self.notes: list[str] = []
        self._held: list[tuple[str, str]] = []
        self._last_potion = 0.0
        self._potions_used = 0
        saved = self.state.get("window")
        if saved and self.io.window_alive(saved["hwnd"], saved["pid"]):
            self.window = Window(**saved)
        else:
            self.window = self._find_window()
            # A new or restarted game: forget what was known about the old one.
            self.state = {"turn": self.state.get("turn", 0), "window": asdict(self.window)}
            self._save_state()

    @property
    def paused(self) -> bool:
        return bool(self.state.get("paused_by"))

    def look(self) -> Shot:
        """Screenshot the game and pause it. If it's already paused, return the
        screenshot taken when it was paused."""
        if self.paused and self.state.get("last_shot") and Path(self.state["last_shot"]["path"]).exists():
            shot = self._previous_shot()
            shot.notes = ["the game was already paused; this is the screenshot from that moment"]
            return shot
        self.notes = []
        self._resume()
        if not self.io.focus(self.window.hwnd):
            raise GameError("Couldn't bring the Diablo II window to the front. Click on it once, then try again.")
        time.sleep(0.3)  # let it redraw after coming to the front
        shot = self._snapshot()
        self._pause()
        shot.notes = self.notes
        return shot

    def act(self, actions: list[Action]) -> Shot:
        """Unpause, run the actions, take a screenshot, pause again."""
        self.notes = []
        aborted = self._mouse_in_corner()
        if aborted:  # the person wants to stop: leave the game paused and untouched
            shot = self._previous_shot()
            shot.aborted = aborted
            return shot
        self._resume()
        try:
            try:
                if not self.io.focus(self.window.hwnd):
                    raise Abort("couldn't bring the Diablo II window to the front, so nothing was done")
                time.sleep(0.1)
                for action in actions:
                    self._do(action)
                self._wait(self.cfg["settle_seconds"])
            except Abort as stop:
                aborted = str(stop)
            finally:
                self._release_all()
            if self.io.is_foreground(self.window.hwnd):
                shot = self._snapshot()
            else:
                shot = self._previous_shot()
                self.notes.append("the game wasn't in front, so this is the previous screenshot")
        finally:
            self._pause()
        shot.notes = self.notes
        shot.aborted = aborted
        return shot

    def pause(self) -> None:
        self._pause()

    def resume(self, force: bool = False) -> None:
        """Unpause the game. With force, also unfreeze a game d2ai lost track of."""
        if self.paused:
            self._resume()
        elif force and self.cfg["pause_method"] == "suspend":
            self.io.resume(self.window.pid)

    # Pausing

    def _pause(self) -> None:
        method = self.cfg["pause_method"]
        if method == "none" or self.paused:
            return
        if method == "suspend":
            self.io.suspend(self.window.pid)
        else:
            if not self.io.focus(self.window.hwnd):
                self.notes.append("couldn't pause the game: its window isn't in front")
                return
            # Space closes open panels first; otherwise Esc would only close a
            # panel instead of opening the menu.
            self._tap("space")
            time.sleep(0.1)
            self._tap("esc")
            time.sleep(0.2)
        self.state["paused_by"] = method
        self._save_state()

    def _resume(self) -> None:
        method = self.state.get("paused_by")
        if not method:
            return
        if method == "suspend":
            self.io.resume(self.window.pid)
            time.sleep(0.25)  # let it catch up on window messages
        else:
            if not self.io.focus(self.window.hwnd):
                raise GameError("Couldn't unpause: the Diablo II window won't come to the front. Click on it once and try again.")
            self._tap("esc")
            time.sleep(0.2)
        self.state["paused_by"] = None
        self._save_state()

    # Input

    def _do(self, action: Action) -> None:
        self._check_safe()
        kind = action.kind
        if kind in POINT_ACTIONS or kind in HOLD_ACTIONS:
            self.io.move(*self._to_screen(action.x, action.y))
            time.sleep(0.05)
        if kind == "hover":
            self._wait(0.3)  # give tooltips time to show
        elif kind in ("click", "sclick", "rclick"):
            button = "right" if kind == "rclick" else "left"
            if kind == "sclick":
                self._press("key", "shift")
            self._press("button", button)
            time.sleep(0.05)
            self._release("button", button)
            if kind == "sclick":
                self._release("key", "shift")
            self._wait(0.15)
        elif kind in HOLD_ACTIONS:
            button = "right" if kind == "rhold" else "left"
            self._press("button", button)
            self._wait(action.seconds)
            self._release("button", button)
        elif kind == "key":
            self._tap(action.key)
            self._wait(0.15)
        elif kind == "keyhold":
            self._press("key", action.key)
            self._wait(action.seconds)
            self._release("key", action.key)
        elif kind == "wait":
            self._wait(action.seconds)

    def _tap(self, name: str) -> None:
        self._press("key", name)
        time.sleep(0.04)
        self._release("key", name)

    def _press(self, kind: str, name: str) -> None:
        if kind == "button":
            self.io.button(name, True)
        else:
            self.io.key(name, True)
        self._held.append((kind, name))

    def _release(self, kind: str, name: str) -> None:
        if (kind, name) in self._held:
            self._held.remove((kind, name))
        if kind == "button":
            self.io.button(name, False)
        else:
            self.io.key(name, False)

    def _release_all(self) -> None:
        """Never leave a mouse button or key held down."""
        while self._held:
            self._release(*self._held[-1])

    def _wait(self, seconds: float) -> None:
        """Let the game run, watching life and whether the person took over."""
        deadline = time.monotonic() + seconds
        while True:
            self._check_safe()
            self._watch_life()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            time.sleep(min(0.1, remaining))

    def _check_safe(self) -> None:
        if not self.io.is_foreground(self.window.hwnd):
            raise Abort("the game window lost focus (another window was clicked)")
        stop = self._mouse_in_corner()
        if stop:
            raise Abort(stop)

    def _mouse_in_corner(self) -> str | None:
        # The top-left corner of the main screen is (0, 0). Screens to the left
        # of it have negative coordinates, so only check this exact spot.
        x, y = self.io.cursor_pos()
        if 0 <= x <= 1 and 0 <= y <= 1:
            return "the mouse is in the top-left corner of the screen (emergency stop)"
        return None

    def _watch_life(self) -> None:
        globe = self.cfg["life_globe"]
        now = time.monotonic()
        if not globe or not self.cfg["potion_keys"] or now - self._last_potion < 1.5:
            return
        left, top, _, _ = self.io.client_box(self.window.hwnd)
        strip = self.io.capture((left + globe["x"] - 2, top + globe["top"], 5, globe["bottom"] - globe["top"] + 1))
        life = read_life(strip, {"x": 2, "top": 0, "bottom": globe["bottom"] - globe["top"]})
        # 0 means no globe on screen (loading, dead), not an empty one.
        if life and life < self.cfg["potion_below"]:
            keys = self.cfg["potion_keys"]
            key = keys[self._potions_used % len(keys)]
            self._potions_used += 1
            self._last_potion = now
            self._tap(key)
            self.notes.append(f"auto-potion: life was {life:.0%}, pressed {key}")

    def _to_screen(self, x: int, y: int) -> tuple[int, int]:
        left, top, width, height = self.io.client_box(self.window.hwnd)
        last = self.state.get("last_shot")
        image_size = tuple(last["size"]) if last else scale_size(width, height, self.cfg["image_width"])
        cx, cy = to_client(x, y, image_size, (width, height))
        return left + cx, top + cy

    # Screenshots and state

    def _snapshot(self) -> Shot:
        left, top, width, height = self.io.client_box(self.window.hwnd)
        if width < 200 or height < 150:
            raise GameError("The Diablo II window is minimized or too small to play in.")
        image = self.io.capture((left, top, width, height))
        life = read_life(image, self.cfg["life_globe"])
        view = image
        size = scale_size(width, height, self.cfg["image_width"])
        if size != (width, height):
            view = image.resize(size, Image.Resampling.LANCZOS)
        if self.cfg["grid"]:
            view = draw_grid(view, self.cfg["grid_step"])
        turn = self.state.get("turn", 0) + 1
        self.shots_dir.mkdir(parents=True, exist_ok=True)
        path = self.shots_dir / f"turn_{turn:06d}.jpg"
        view.convert("RGB").save(path, quality=self.cfg["jpeg_quality"])
        old_shots = sorted(self.shots_dir.glob("turn_*.jpg"))[: -self.cfg["keep_screenshots"]]
        for old in old_shots:
            old.unlink(missing_ok=True)
        self.state["turn"] = turn
        self.state["last_shot"] = {"turn": turn, "path": str(path), "size": list(view.size), "life": life}
        self._save_state()
        return Shot(turn, path, view.size, life)

    def _previous_shot(self) -> Shot:
        last = self.state.get("last_shot")
        if not last:
            raise GameError("There's no screenshot yet. Run `python d2ai.py look` first.")
        return Shot(last["turn"], Path(last["path"]), tuple(last["size"]), last.get("life"))

    def _find_window(self) -> Window:
        windows = self.io.find_windows(self.cfg["window_title"], self.cfg["process_names"])
        if not windows:
            raise GameError(
                f"Couldn't find the Diablo II window (title containing {self.cfg['window_title']!r}, "
                f"program {' or '.join(self.cfg['process_names'])}). Start the game in a window first; "
                "`python d2ai.py check` lists what it can see."
            )
        return windows[0]

    def _load_state(self) -> dict:
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_state(self) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(self.state, indent=2), encoding="utf-8")


# --- Autopilot (Claude API) ------------------------------------------------

AUTOPILOT_RULES = """

## Autopilot

Nobody gives you instructions turn by turn: you play on your own toward the goal in each message. Reply with one JSON object:

- plan: one short sentence for the person watching: what you see and what you're doing now.
- actions: this turn's action tokens, for example ["click:640,300", "wait:0.5"]. An empty list lets the game run for a moment.
- notes: your memory. Each turn you only get the newest screenshot, these notes and a short list of recent turns, so keep what you'll need: the goal, quest progress, where things are, what worked and what didn't. Rewrite them every turn and keep them under about 1500 characters.
"""

TURN_SCHEMA = {
    "type": "object",
    "properties": {
        "plan": {"type": "string"},
        "actions": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "string"},
    },
    "required": ["plan", "actions", "notes"],
    "additionalProperties": False,
}

# USD per million tokens: input, output, cache reads. For the running estimate
# only; check Anthropic's pricing page for current prices.
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


def request_params(cfg: dict, system: str, content: list) -> dict:
    output_config = {"format": {"type": "json_schema", "schema": TURN_SCHEMA}}
    if cfg["effort"]:
        output_config["effort"] = cfg["effort"]
    params = {
        "model": cfg["model"],
        "max_tokens": 16000,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "output_config": output_config,
        "messages": [{"role": "user", "content": content}],
    }
    if cfg["use_fallbacks"]:
        # If a safety check declines a turn, the API retries it on another model.
        params["betas"] = ["server-side-fallback-2026-07-01"]
        params["fallbacks"] = "default"
    return params


def turn_text(goal: str, notes: str, history: list[str], shot: Shot, cfg: dict) -> str:
    width, height = shot.size
    grid = f" with grid lines every {cfg['grid_step']} px" if cfg["grid"] else ""
    parts = [f"Goal: {goal}", f"Turn {shot.turn}. The screenshot is {width}x{height} pixels{grid}."]
    if shot.life is not None:
        parts.append(f"Life measured from the globe: {shot.life:.0%}.")
    if shot.notes:
        parts.append("During your last actions: " + "; ".join(shot.notes))
    parts.append("Your notes:\n" + (notes or "(none yet, this is the first turn)"))
    if history:
        parts.append("Recent turns, oldest first:\n" + "\n".join(f"- {line}" for line in history))
    return "\n\n".join(parts)


def parse_reply(response) -> dict | None:
    """The JSON answer from a response, or None if it's missing or cut off."""
    if response.stop_reason == "max_tokens":
        return None
    text = next((block.text for block in response.content if block.type == "text"), None)
    try:
        data = json.loads(text or "")
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("actions"), list):
        return None
    return {
        "plan": str(data.get("plan", "")),
        "actions": [str(token) for token in data["actions"]],
        "notes": str(data.get("notes", "")),
    }


def estimate_cost(model: str, usage) -> float | None:
    """Rough USD cost of one response, or None if the model's price isn't known."""
    if model not in PRICES or usage is None:
        return None
    input_price, output_price, cache_price = PRICES[model]

    def tokens(name):
        return getattr(usage, name, 0) or 0

    return (
        tokens("input_tokens") * input_price
        + tokens("cache_creation_input_tokens") * input_price * 1.25
        + tokens("cache_read_input_tokens") * cache_price
        + tokens("output_tokens") * output_price
    ) / 1_000_000


def autopilot(cfg: dict, goal: str, turns: int, game: Game | None = None, client=None, run_dir: Path = RUN_DIR) -> int:
    import anthropic

    if client is None:
        client = anthropic.Anthropic(max_retries=6)
        # Without credentials the SDK only fails at the first request; check
        # now, before the game gets paused.
        if client.api_key is None and client.auth_token is None and getattr(client, "_token_cache", None) is None:
            print("No Claude API key found. Set ANTHROPIC_API_KEY first (see README.md).")
            return 1
    game = game or Game(cfg, run_dir=run_dir)
    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    notes_file = run_dir / "notes.md"
    log_file = run_dir / "autopilot-log.jsonl"
    system = GUIDE_FILE.read_text(encoding="utf-8") + AUTOPILOT_RULES
    notes = notes_file.read_text(encoding="utf-8") if notes_file.exists() else ""
    history: list[str] = []
    spent = 0.0
    bad_answers = 0

    print(f"Autopilot with {cfg['model']}, up to {turns} turns. Goal: {goal}")
    print("To stop: move the mouse to the top-left corner of your main screen and leave it there, or press Ctrl+C here.")
    shot = game.look()
    try:
        played = 0
        while played < turns:
            image = base64.standard_b64encode(shot.path.read_bytes()).decode("ascii")
            content = [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image}},
                {"type": "text", "text": turn_text(goal, notes, history, shot, cfg)},
            ]
            try:
                response = client.beta.messages.create(**request_params(cfg, system, content))
            except anthropic.AuthenticationError:
                print("The Claude API didn't accept the API key. Check ANTHROPIC_API_KEY (see README.md).")
                return 1
            except anthropic.BadRequestError as error:
                print(f"The Claude API rejected the request: {error.message}")
                if cfg["use_fallbacks"]:
                    print('If your model doesn\'t support fallbacks, set "use_fallbacks": false in config.json.')
                return 1
            except (anthropic.APIStatusError, anthropic.APIConnectionError) as error:
                print(f"The Claude API isn't answering ({error}). Run the command again later to continue.")
                return 1
            if response.stop_reason == "refusal":
                details = getattr(response, "stop_details", None)
                print(f"Claude declined this turn ({getattr(details, 'category', None) or 'no reason given'}). Stopping.")
                return 1
            cost = estimate_cost(cfg["model"], response.usage)
            spent += cost or 0.0
            reply = parse_reply(response)
            if reply is None:
                bad_answers += 1
                print(f"turn {shot.turn}: no usable answer ({response.stop_reason}), asking again")
                if bad_answers >= 3:
                    print("Three unusable answers in a row. Stopping.")
                    return 1
                continue
            bad_answers = 0
            played += 1
            notes = reply["notes"].strip()[:3000]
            notes_file.write_text(notes, encoding="utf-8")
            life = "" if shot.life is None else f" | life {shot.life:.0%}"
            price = "" if cost is None else f" | ~${cost:.3f} (total ~${spent:.2f})"
            print(f"turn {shot.turn}{life}{price}\n  plan: {reply['plan']}\n  actions: {' '.join(reply['actions']) or '(none)'}")
            try:
                actions, warnings = parse_actions(reply["actions"], shot.size, cfg)
            except ActionError as error:
                shot.notes = [f"nothing was done: {error}"]
            else:
                shot = game.act(actions)
                shot.notes = warnings + shot.notes
            for note in shot.notes:
                print(f"  note: {note}")
            with log_file.open("a", encoding="utf-8") as log:
                log.write(json.dumps({"time": time.time(), "turn": shot.turn, **reply, "result": shot.notes, "cost": cost}) + "\n")
            if shot.aborted:
                print(f"Stopped: {shot.aborted}. Run the command again to continue.")
                return 0
            summary = f"{reply['plan']} -> {' '.join(reply['actions']) or '(nothing)'}"
            if shot.notes:
                summary += f" ({'; '.join(shot.notes)})"
            history = (history + [summary])[-cfg["history_turns"]:] if cfg["history_turns"] else []
        print(f"Done: {turns} turns, about ${spent:.2f}." if spent else f"Done: {turns} turns.")
        return 0
    except KeyboardInterrupt:
        print("Stopped (Ctrl+C).")
        return 0
    finally:
        try:
            game.resume()
        except GameError as error:
            print(f"Couldn't unpause the game: {error}")


# --- Command line ----------------------------------------------------------


def emit(data: dict) -> None:
    print(json.dumps(data, indent=2))


def cmd_check(cfg: dict, pause_seconds: float | None) -> int:
    io = WindowsBackend()
    if not io.find_windows(cfg["window_title"], cfg["process_names"]):
        print("No Diablo II window found.")
        lookalikes = io.windows_named("diablo")
        if lookalikes:
            print("Windows with 'Diablo' in the title:")
            for title, exe in lookalikes:
                print(f"  {title!r} from {exe or 'an unknown program'}")
            print('If one of these is the game, add its program name to "process_names" in config.json.')
        else:
            print("Start Diablo II in a window (not fullscreen) and load a character first.")
        return 1
    game = Game(cfg, io)
    window = game.window
    if game.paused:
        print("d2ai had the game paused; unpausing it for the check.")
        game.resume()
    left, top, width, height = io.client_box(window.hwnd)
    print(f"Game window: {window.title!r} ({window.exe}, process {window.pid}), {width}x{height} pixels at ({left}, {top}).")
    if not io.focus(window.hwnd):
        print("Couldn't bring the game to the front. Click on it once and run check again.")
        return 1
    time.sleep(0.3)
    image = io.capture((left, top, width, height))
    path = game.run_dir / "check.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, quality=90)
    print(f"Saved a screenshot to {path}. It should show the game and nothing else.")
    if width > 1920:
        print("Tip: a smaller window (like 1280x720) works just as well and is faster.")
    if cfg["life_globe"]:
        life = read_life(image, cfg["life_globe"])
        print("life_globe is outside the window." if life is None else f"Life reading: {life:.0%}.")
    else:
        print("Automatic potions are off. `python d2ai.py calibrate` helps set them up.")
    if pause_seconds:
        if cfg["pause_method"] == "none":
            print('pause_method is "none", so there is no pause to test.')
            return 0
        print(f"Pausing the game for {pause_seconds:g} seconds ({cfg['pause_method']})...")
        game.pause()
        time.sleep(pause_seconds)
        game.resume()
        print("Unpaused. Did everything freeze (monsters too) and then carry on normally, without jumping ahead?")
        print('If not, switch pause_method in config.json ("suspend" or "esc") and test again.')
    return 0


def cmd_calibrate(cfg: dict) -> int:
    game = Game(cfg)
    game.resume()
    if not game.io.focus(game.window.hwnd):
        raise GameError("Couldn't bring the Diablo II window to the front. Click on it once, then try again.")
    time.sleep(0.3)
    left, top, width, height = game.io.client_box(game.window.hwnd)
    image = game.io.capture((left, top, width, height))
    # The life globe is in the bottom-left corner: save that part at full size.
    crop_w, crop_h = width * 3 // 10, height * 4 // 10
    origin = (0, height - crop_h)
    corner = image.crop((0, origin[1], crop_w, height))
    globe = cfg["life_globe"]
    if globe:
        draw = ImageDraw.Draw(corner)
        draw.line([(globe["x"], globe["top"] - origin[1]), (globe["x"], globe["bottom"] - origin[1])], fill=(255, 0, 255), width=1)
    corner = draw_grid(corner, 10, label_step=50, origin=origin)
    path = game.run_dir / "calibrate.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    corner.save(path)
    print(f"Saved {path}: the bottom-left part of the game window at full size,")
    print("with grid lines every 10 pixels, labelled every 50, in game-window pixels.")
    if globe:
        life = read_life(image, globe)
        print("The magenta line is the current life_globe.", "It's outside the window." if life is None else f"Life reading: {life:.0%}.")
    print("Set life_globe in config.json to a vertical line through the middle of the red life globe:")
    print('  "life_globe": {"x": <middle of the globe>, "top": <top of the red at full life>, "bottom": <bottom of the red>}')
    print("At full life the reading should be close to 100%.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="d2ai", description="Let Claude play Diablo II (offline single player). See README.md.")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="find the game window and save a test screenshot")
    check.add_argument("--pause", type=float, metavar="SECONDS", help="also pause the game this long, to test pausing")
    commands.add_parser("look", help="screenshot the game and pause it")
    act = commands.add_parser("act", help="unpause, run actions, screenshot, pause again")
    act.add_argument("actions", nargs="*", help="for example click:640,300 wait:0.5 (see GAME_GUIDE.md)")
    resume = commands.add_parser("resume", help="unpause the game")
    resume.add_argument("--force", action="store_true", help="unfreeze the game even if d2ai doesn't think it paused it")
    commands.add_parser("calibrate", help="help set life_globe in config.json for automatic potions")
    autopilot_cmd = commands.add_parser("autopilot", help="let Claude play by itself through the Claude API (costs money)")
    autopilot_cmd.add_argument("--goal", default="Complete the Den of Evil quest in Act 1.", help="what Claude should try to do")
    autopilot_cmd.add_argument("--turns", type=int, default=50, help="stop after this many turns (default 50)")
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")  # odd characters in window titles can't crash it
    args = build_parser().parse_args(argv)
    try:
        cfg = load_config()
        if args.command == "check":
            return cmd_check(cfg, args.pause)
        if args.command == "calibrate":
            return cmd_calibrate(cfg)
        if args.command == "autopilot":
            return autopilot(cfg, args.goal, args.turns)
        game = Game(cfg)
        if args.command == "resume":
            was_paused = game.paused
            game.resume(force=args.force)
            print("The game is running again." if was_paused or args.force else "d2ai hadn't paused the game.")
            return 0
        if args.command == "look":
            shot = game.look()
        else:
            last = game.state.get("last_shot")
            if not last:
                raise GameError("There's no screenshot yet. Run `python d2ai.py look` first.")
            actions, warnings = parse_actions(args.actions, tuple(last["size"]), cfg)
            shot = game.act(actions)
            shot.notes = warnings + shot.notes
        emit(shot.report(game.paused))
        return 0
    except ActionError as error:
        emit({"error": str(error), "note": "nothing was sent to the game"})
        return 2
    except (GameError, OSError) as error:
        if args.command in ("look", "act"):
            emit({"error": str(error)})
        else:
            print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
