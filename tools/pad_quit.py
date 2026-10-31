#!/usr/bin/env python3
"""Controller escape hatch for the Retro Arcade and YouTube channels, independent of what each app maps.
Runs while ES-DE or the YouTube window is up (launch-arcade.sh / launch-youtube.sh start it) and exits when both are gone.
  hold Xbox button 1.5 s        -> close everything (game, RetroArch, ES-DE) and go back to the mirror home
  hold Back + Start 1 s         -> close a running pinball table only (back to the Pinball list)
  hold Back + Start 3 s         -> same as the Xbox hold (go home), for controllers whose Xbox button isn't visible
  tap the Xbox button           -> Xbox menu (drawn by np_overlay.py): Sonos now playing with prev / play-pause / next, volume,
                                   Back to Dashboard, Resume. While it is open this script has the controller to itself (exclusive
                                   evdev grab, so ES-DE / the game see none of it) and a running game or pinball table is paused
                                   (SIGSTOP) until the menu closes. B, Start or another Xbox tap closes it.
  while a pinball table runs, the controller is turned into the keyboard keys VPX listens to (VPX's own controller input
  never reached the tables here, but keystrokes do):
      LT / RT -> Left / Right Shift (flippers)      A (hold, release to fire) -> Return (plunger)
      X or Y  -> 5 (credit)                          B or Start -> 1 and s (start; some old tables, e.g. Wolfenstein 3D, only take s)
      LB / RB -> Left / Right Ctrl (magna-save)
  while the YouTube Shorts window runs, the controller drives it:
      D-pad / left stick up / down -> previous / next Short   A -> tap the video (play / pause)   B -> close it   LB / RB -> PC volume -/+
Reads the kernel joystick devices (/dev/input/js*), button numbers as reported by `jstest`: Back=6 Start=7. Over bluetooth the
Xbox button does not show up there: it is BTN_MODE (0x13c) on the controller's evdev device ("Xbox Wireless Controller", or the
separate "... Consumer Control" one, depending on how it paired)."""

import atexit
import fcntl
import glob
import json
import os
import signal
import socket
import struct
import subprocess
import sys
import time
import urllib.request

try:
    import evdev
    from evdev import ecodes as ec
except ImportError:
    evdev = None

BACK, START, GUIDE = 6, 7, 8
LOCK = open("/tmp/mirror-padquit.lock", "w")
try:
    fcntl.flock(LOCK, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    sys.exit(0)  # already running

EVENT = struct.Struct("IhBB")  # joystick: time, value, type, number
EVDEV = struct.Struct("llHHi")  # evdev: sec, usec, type, code, value
BTN_MODE = 0x13C


def procs(*needles):
    out = []
    for p in filter(str.isdigit, os.listdir("/proc")):
        try:
            cmd = open(f"/proc/{p}/cmdline", "rb").read().replace(b"\0", b" ").decode(errors="ignore")
        except OSError:
            continue
        if int(p) != os.getpid() and any(n in cmd for n in needles):
            out.append(int(p))
    return out


def kill(pids, sig=signal.SIGTERM):
    for p in pids:
        try:
            os.kill(p, sig)
        except OSError:
            pass


def stop(*needles):
    pids = procs(*needles)
    if not pids:
        return
    kill(pids)
    time.sleep(2.5)
    kill([p for p in pids if os.path.exists(f"/proc/{p}")], signal.SIGKILL)


def es_de_running():
    return bool(procs("squashfs-root/AppRun --resolution"))


_vpx = [0.0, False]


def vpx_running():
    if time.time() - _vpx[0] > 1.0:
        _vpx[0], _vpx[1] = time.time(), bool(procs("VPinballX_GL.real"))
    return _vpx[1]


import queue
import threading

_q = queue.Queue()


def _worker():  # one thing at a time, in order: a key-up must never overtake its key-down
    while True:
        args = _q.get()
        try:
            subprocess.run(
                ["xdotool", *args],
                env={**os.environ, "DISPLAY": ":0"},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
        except Exception:
            pass


threading.Thread(target=_worker, daemon=True).start()


def xdo(*args):
    _q.put(args)


def tap(*keys):
    xdo(*[a for k in keys for a in ("keydown", k, "sleep", "0.15", "keyup", k)])


pressed = set()  # keys we are holding down right now


def key(name, down):
    (pressed.add if down else pressed.discard)(name)
    xdo("keydown" if down else "keyup", name)


def release_all():
    for name in list(pressed):
        key(name, False)


# ---- Xbox menu --------------------------------------------------------------------------------------------------------------
PROXY, OVERLAY = "http://127.0.0.1:8765", ("127.0.0.1", 8766)
usock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
menu = {
    "open": False,
    "row": 0,
    "col": 1,
    "dev": None,
    "np": {},
    "stopped": [],
    "last": 0.0,
    "dirs": {},
    "rep": {},
    "vol_at": 0.0,
    "vol": None,
    "refresh": 0.0,
}
MENU_IDLE = 120  # seconds without input before the menu closes itself (and the game resumes)


def log(*a):
    print(time.strftime('%F %T'), 'pad_quit:', *a, flush=True)


def games():
    return procs("RetroArch-Linux-x86_64/squashfs-root/AppRun -L", "libretro.so", "VPinballX_GL.real")


def send_menu():
    try:
        usock.sendto(
            json.dumps({"open": menu["open"], "row": menu["row"], "col": menu["col"], "np": menu["np"]}).encode(),
            OVERLAY,
        )
    except OSError:
        pass


def api(cmd, body=None):
    def run():
        try:
            req = (
                urllib.request.Request(PROXY + "/sonos/now")
                if cmd == "now"
                else urllib.request.Request(
                    PROXY + "/sonos/" + cmd, json.dumps(body or {}).encode(), {"Content-Type": "application/json"}
                )
            )
            data = json.loads(urllib.request.urlopen(req, timeout=4).read())
            if menu["vol"] is None:
                menu["np"] = data  # a volume change is still on its way: keep what the screen shows
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()


def pad_event_path():
    for ev in glob.glob("/sys/class/input/event*"):
        try:
            if open(ev + "/device/name").read().strip() == "Xbox Wireless Controller":
                return "/dev/input/" + os.path.basename(ev)
        except OSError:
            pass


def menu_open():
    log('menu_open requested, evdev', evdev is not None)
    if menu["open"] or evdev is None:
        return
    path = pad_event_path()
    log('pad device', path)
    if not path:
        return
    release_all()
    held.clear()
    trig_down.clear()
    try:
        dev = evdev.InputDevice(path)
        dev.grab()
        os.set_blocking(dev.fd, False)
    except OSError as e:
        log('grab failed', e)
        return
    menu.update(
        open=True,
        dev=dev,
        row=0,
        col=1,
        last=time.time(),
        dirs={},
        rep={},
        axes={},
        vol=None,
        refresh=time.time(),
        stopped=games(),
    )
    for p in menu["stopped"]:
        kill([p], signal.SIGSTOP)  # pause the game; ES-DE itself keeps running behind the menu
    api("now")
    send_menu()


def menu_close():
    if not menu["open"]:
        return
    menu["open"] = False
    for p in set(menu["stopped"]) | set(games()):
        kill([p], signal.SIGCONT)
    menu["stopped"] = []
    try:
        menu["dev"].ungrab()
        menu["dev"].close()
    except Exception:
        pass
    menu["dev"] = None
    send_menu()


atexit.register(menu_close)
for _sig in (signal.SIGTERM, signal.SIGHUP):
    signal.signal(_sig, lambda *a: sys.exit(0))


def bump_volume(d):
    np = menu["np"]
    v = max(0, min(100, (menu["vol"] if menu["vol"] is not None else np.get("volume", 0)) + d))
    menu["vol"] = v
    np["volume"] = v
    menu["vol_at"] = time.time()


def activate():
    r, c = menu["row"], menu["col"]
    if r == 0:
        if c == 1:
            menu["np"]["state"] = "paused" if menu["np"].get("state") == "playing" else "playing"
        api(("prev", "toggle", "next")[c])
    elif r == 2:
        menu_close()
        home()
    elif r == 3:
        menu_close()


def fire(name):
    menu["last"] = time.time()
    if name == "up":
        menu["row"] = max(0, menu["row"] - 1)
    elif name == "down":
        menu["row"] = min(3, menu["row"] + 1)
    elif name in ("left", "right"):
        d = -1 if name == "left" else 1
        if menu["row"] == 0:
            menu["col"] = max(0, min(2, menu["col"] + d))
        elif menu["row"] == 1:
            bump_volume(3 * d)
    elif name == "a":
        activate()
    elif name == "b":
        menu_close()


def menu_pump():
    dev, now = menu["dev"], time.time()
    state = menu.setdefault("axes", {})
    try:
        for e in dev.read():
            if e.type == ec.EV_KEY and e.value == 1:
                if e.code == ec.BTN_SOUTH:
                    fire("a")
                elif e.code in (ec.BTN_EAST, ec.BTN_START, ec.BTN_MODE):
                    fire("b")  # Xbox button again closes it
                elif e.code in (ec.BTN_TL, ec.BTN_TR):
                    bump_volume(-3 if e.code == ec.BTN_TL else 3)
                    menu["last"] = now  # LB / RB = volume, on any row
            elif e.type == ec.EV_ABS and e.code in (ec.ABS_HAT0X, ec.ABS_HAT0Y, ec.ABS_X, ec.ABS_Y):
                if e.code in (ec.ABS_HAT0X, ec.ABS_HAT0Y):
                    v = float(e.value)
                else:
                    i = dev.absinfo(e.code)
                    v = (e.value - (i.min + i.max) / 2) / ((i.max - i.min) / 2 or 1)
                state[e.code] = v
    except BlockingIOError:
        pass
    except OSError:
        return menu_close()
    if not menu["open"]:
        return
    x = state.get(ec.ABS_HAT0X, 0) or (state.get(ec.ABS_X, 0) if abs(state.get(ec.ABS_X, 0)) > 0.6 else 0)
    y = state.get(ec.ABS_HAT0Y, 0) or (state.get(ec.ABS_Y, 0) if abs(state.get(ec.ABS_Y, 0)) > 0.6 else 0)
    for name, on in (("left", x < -0.5), ("right", x > 0.5), ("up", y < -0.5), ("down", y > 0.5)):
        was = menu["dirs"].get(name, False)
        menu["dirs"][name] = on
        if on and not was:
            fire(name)
            menu["rep"][name] = now + 0.4
        elif on and name in ("left", "right") and now >= menu["rep"].get(name, 1e18):
            fire(name)
            menu["rep"][name] = now + 0.12
    if menu["vol"] is not None and now - menu["vol_at"] > 0.15:
        api("volume", {"volume": menu["vol"]})
        menu["vol"] = None
    if now - menu["refresh"] > 3 and menu["vol"] is None:
        menu["refresh"] = now
        api("now")
    if now - menu["last"] > MENU_IDLE:
        menu_close()
    elif menu["open"]:  # tell the overlay when something changed, and every 0.3 s so it knows we are alive
        np = menu["np"]
        sig = (menu["row"], menu["col"], np.get("state"), np.get("volume"), np.get("title"))
        if sig != menu.get("sig") or now - menu.get("sent", 0) > 0.3:
            menu["sig"], menu["sent"] = sig, now
            send_menu()


HOLD = {0: "Return", 4: "Control_L", 5: "Control_R"}  # buttons that act while held
TAP = {2: ("5",), 3: ("5",), 1: ("1", "s"), START: ("1", "s")}  # buttons that act once per press
TRIGGER = {2: "Shift_L", 5: "Shift_R"}  # joystick axes 2 (LT) and 5 (RT)
trig_down = {}
_yt = [0.0, False]


def yt_running():
    if time.time() - _yt[0] > 1.0:
        _yt[0], _yt[1] = time.time(), bool(procs("class=MirrorYouTube"))
    return _yt[1]


yt_axes, yt_dir = {0: 0, 1: 0, 6: 0, 7: 0}, {}  # left stick x/y, d-pad x/y ; direction -> time of its next repeat


def pc_volume(step):
    subprocess.Popen(
        ["wpctl", "set-volume", "-l", "1.0", "@DEFAULT_AUDIO_SINK@", f"{abs(step)}%{'+' if step > 0 else '-'}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def yt_button(number, value):
    if not value or menu["open"] or not yt_running():
        return
    if number == 0:
        xdo(
            "mousemove", "540", "900", "click", "1", "mousemove", "1079", "1919"
        )  # a tap on the video pauses / resumes it (keys don't on the mobile site)
    elif number == 1:
        threading.Thread(target=stop, args=("class=MirrorYouTube",), daemon=True).start()
    elif number in (4, 5):
        pc_volume(-5 if number == 4 else 5)


def yt_axis(number, value):
    if number in yt_axes:
        yt_axes[number] = value


def yt_tick(now):
    if menu["open"] or not yt_running():
        yt_dir.clear()
        return
    y = yt_axes[7] or (yt_axes[1] if abs(yt_axes[1]) > 16000 else 0)
    for name, on, key in (("u", y < 0, "Up"), ("d", y > 0, "Down")):  # one Short per push, no auto-repeat
        if not on:
            yt_dir.pop(name, None)
            continue
        if name not in yt_dir:
            xdo("key", "--clearmodifiers", key)
            yt_dir[name] = 1


def pinball_button(number, value):
    if menu["open"]:
        return
    if not vpx_running():
        if pressed:
            release_all()
        return
    if number in HOLD:
        key(HOLD[number], bool(value))
    elif number in TAP and value:
        tap(*TAP[number])


def pinball_axis(number, value):
    if number not in TRIGGER or menu["open"]:
        return
    if not vpx_running():
        if pressed:
            release_all()
        trig_down.clear()
        return
    was = trig_down.get(number, False)
    down = value > 0 if not was else value > -10000  # rest -32767, full press +32767; a dead band stops flutter
    if down != was:
        trig_down[number] = down
        key(TRIGGER[number], down)


for _ in range(60):  # started just before ES-DE: give it time to appear
    if es_de_running() or yt_running():
        break
    time.sleep(0.5)
fds, held, since = {}, set(), {}
evfds = {}
last_scan = 0


def home():
    held.clear()
    stop("class=MirrorYouTube")
    stop("VPinballX_GL.real")
    stop("RetroArch-Linux-x86_64/squashfs-root/AppRun -L", "libretro.so")
    stop("squashfs-root/AppRun --resolution")


while es_de_running() or yt_running():
    if time.time() - last_scan > 3:  # (re)open controllers, they come and go over bluetooth
        last_scan = time.time()
        for path in glob.glob("/dev/input/js*"):
            if path not in fds:
                try:
                    fds[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                except OSError:
                    pass
        for ev in glob.glob("/sys/class/input/event*"):
            try:
                name = open(ev + "/device/name").read()
            except OSError:
                continue
            path = "/dev/" + "input/" + os.path.basename(ev)
            if (
                "Xbox" in name
                and ("Consumer Control" in name or name.strip() == "Xbox Wireless Controller")
                and path not in evfds
            ):  # the Xbox button shows up on one or the other
                try:
                    evfds[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                except OSError:
                    pass
    for path, fd in list(fds.items()):
        try:
            while True:
                data = os.read(fd, EVENT.size)
                if len(data) < EVENT.size:
                    break
                _, value, kind, number = EVENT.unpack(data)
                if kind & 0x01:  # button
                    (held.add if value else held.discard)(number)
                    if value:
                        since[number] = time.time()
                    if not kind & 0x80:
                        pinball_button(number, value)
                        yt_button(number, value)  # 0x80 = the replay of the current state at open
                elif kind & 0x02 and not kind & 0x80:  # axis
                    pinball_axis(number, value)
                    yt_axis(number, value)
        except BlockingIOError:
            pass
        except OSError:
            os.close(fd)
            del fds[path]
            held.clear()
    for path, fd in list(evfds.items()):
        try:
            while True:
                data = os.read(fd, EVDEV.size)
                if len(data) < EVDEV.size:
                    break
                _, _, kind, code, value = EVDEV.unpack(data)
                if kind == 1 and code == BTN_MODE and value in (0, 1):
                    (held.add if value else held.discard)(GUIDE)
                    log('xbox button', value)
                    if value:
                        since[GUIDE] = time.time()
                    elif time.time() - since.get(GUIDE, 0) < 1.0:  # a tap, not the hold that goes home
                        menu_close() if menu["open"] else menu_open()
        except BlockingIOError:
            pass
        except OSError:
            os.close(fd)
            del evfds[path]
            held.discard(GUIDE)
    now = time.time()
    both = now - max(since.get(BACK, now), since.get(START, now)) if {BACK, START} <= held else 0
    if GUIDE in held and now - since.get(GUIDE, now) > 1.5 or both > 3.0:
        home()
    elif both > 1.0:
        stop("VPinballX_GL.real")
    yt_tick(now)
    if menu["open"]:
        menu_pump()
    if pressed and not vpx_running():
        release_all()
    time.sleep(0.02 if menu["open"] else 0.05)
menu_close()
