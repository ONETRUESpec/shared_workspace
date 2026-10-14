"""Windows helpers for d2ai: find the game window, bring it to the front, move
and click the mouse, and press keys.

Input goes through SendInput with hardware scan codes, which games pick up more
reliably than virtual-key events. The process is made DPI aware first, so every
coordinate is in real screen pixels and display scaling can't shift the clicks.
"""
from __future__ import annotations

import ctypes
import sys
import time

# SendInput structures, built from fixed-size types so the layout matches what
# Windows expects (INPUT is 40 bytes on 64-bit Python, 28 bytes on 32-bit).
ULONG_PTR = ctypes.c_size_t


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_int32),
        ("dy", ctypes.c_int32),
        ("mouseData", ctypes.c_uint32),
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_uint16),
        ("wScan", ctypes.c_uint16),
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", ctypes.c_uint32),
        ("wParamL", ctypes.c_uint16),
        ("wParamH", ctypes.c_uint16),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", ctypes.c_uint32), ("u", _INPUTUNION)]


INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008
MOUSE_FLAGS = {
    ("left", True): 0x0002,
    ("left", False): 0x0004,
    ("right", True): 0x0008,
    ("right", False): 0x0010,
}
# Virtual-key codes for keys that aren't a single character.
NAMED_KEYS = {
    "tab": 0x09,
    "enter": 0x0D,
    "shift": 0x10,
    "ctrl": 0x11,
    "alt": 0x12,
    "esc": 0x1B,
    "space": 0x20,
    **{f"f{n}": 0x6F + n for n in range(1, 13)},
}

if sys.platform == "win32":
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    user32.EnumWindows.argtypes = [WNDENUMPROC, wintypes.LPARAM]
    user32.IsWindow.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
    user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
    user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
    user32.SendInput.restype = wintypes.UINT
    user32.VkKeyScanW.argtypes = [wintypes.WCHAR]
    user32.VkKeyScanW.restype = ctypes.c_short
    user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]
    user32.MapVirtualKeyW.restype = wintypes.UINT
    kernel32.GetCurrentThreadId.restype = wintypes.DWORD


def make_dpi_aware() -> None:
    """Use real pixels for window positions, the cursor and screenshots."""
    try:
        if user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):  # per-monitor v2
            return
    except AttributeError:  # Windows older than 10 (1703)
        pass
    try:
        ctypes.WinDLL("shcore").SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        user32.SetProcessDPIAware()


def list_windows() -> list[tuple[int, str, int, bool]]:
    """Every top-level window that has a title, as (handle, title, process id, visible).

    Hidden windows are included on purpose: while the game is frozen, Windows
    hides its window behind a "Not Responding" copy.
    """
    found = []

    def visit(hwnd, _lparam):
        length = user32.GetWindowTextLengthW(hwnd)
        if length:
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            found.append((hwnd, buffer.value, pid.value, bool(user32.IsWindowVisible(hwnd))))
        return True

    user32.EnumWindows(WNDENUMPROC(visit), 0)
    return found


def window_pid(hwnd) -> int:
    """Process id that owns the window, or 0 if the window is gone."""
    if not user32.IsWindow(hwnd):
        return 0
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value


def client_box(hwnd) -> tuple[int, int, int, int]:
    """Screen position and size of the inside of the window (no title bar or borders)."""
    rect = wintypes.RECT()
    if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
        raise ctypes.WinError(ctypes.get_last_error())
    origin = wintypes.POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(origin))
    return origin.x, origin.y, rect.right - rect.left, rect.bottom - rect.top


def is_foreground(hwnd) -> bool:
    return user32.GetForegroundWindow() == hwnd


def focus(hwnd) -> bool:
    """Bring the window to the front. Returns False if Windows refused."""
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    if is_foreground(hwnd):
        return True
    user32.SetForegroundWindow(hwnd)
    if _wait_for_foreground(hwnd, 0.3):
        return True
    # Windows only lets the app in front change the foreground window. Sharing
    # its input queue for a moment is the usual way around that.
    front = user32.GetForegroundWindow()
    front_thread = user32.GetWindowThreadProcessId(front, None) if front else 0
    own_thread = kernel32.GetCurrentThreadId()
    attached = bool(
        front_thread
        and front_thread != own_thread
        and user32.AttachThreadInput(own_thread, front_thread, True)
    )
    try:
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
    finally:
        if attached:
            user32.AttachThreadInput(own_thread, front_thread, False)
    return _wait_for_foreground(hwnd, 0.5)


def _wait_for_foreground(hwnd, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while not is_foreground(hwnd):
        if time.monotonic() > deadline:
            return False
        time.sleep(0.02)
    return True


def cursor_pos() -> tuple[int, int]:
    point = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(point))
    return point.x, point.y


def move_mouse(x: int, y: int) -> None:
    if not user32.SetCursorPos(int(x), int(y)):
        raise ctypes.WinError(ctypes.get_last_error())


def mouse_button(button: str, down: bool) -> None:
    event = INPUT(type=INPUT_MOUSE)
    event.mi.dwFlags = MOUSE_FLAGS[(button, down)]
    _send(event)


def key(name: str, down: bool) -> None:
    event = INPUT(type=INPUT_KEYBOARD)
    event.ki.wScan = scan_code(name)
    event.ki.dwFlags = KEYEVENTF_SCANCODE | (0 if down else KEYEVENTF_KEYUP)
    _send(event)


def scan_code(name: str) -> int:
    """Hardware scan code for a key name ('i', '1', 'f2', 'space', ...).

    Single characters are looked up in the current keyboard layout, so 'q'
    means the key labelled Q on AZERTY and QWERTZ keyboards too.
    """
    name = name.lower()
    if name in NAMED_KEYS:
        vk = NAMED_KEYS[name]
    elif len(name) == 1:
        result = user32.VkKeyScanW(name)
        if result == -1:
            raise ValueError(f"no key types {name!r} on this keyboard layout")
        vk = result & 0xFF
    else:
        raise ValueError(f"unknown key {name!r}")
    code = user32.MapVirtualKeyW(vk, 0)  # MAPVK_VK_TO_VSC
    if not code:
        raise ValueError(f"no scan code for key {name!r}")
    return code


def _send(event: INPUT) -> None:
    if user32.SendInput(1, ctypes.byref(event), ctypes.sizeof(INPUT)) != 1:
        raise ctypes.WinError(ctypes.get_last_error())
