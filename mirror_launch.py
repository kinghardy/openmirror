"""Starting and detecting the arcade (ES-DE / RetroArch / pinball) and YouTube Shorts. (split out of proxy.py)"""

import os
import re
import subprocess
import time


HERE = os.path.dirname(os.path.abspath(__file__))

ARCADE = os.path.join(HERE, "launch-arcade.sh")

YOUTUBE = os.path.join(HERE, "launch-youtube.sh")

VPX = os.path.expanduser("~/Applications/VPinball/VPinballX_GL")

TABLES = os.path.expanduser("~/ROMs/vpinball")

arcade_proc = [None]


def arcade_running():
    # ES-DE or a game it started may outlive the Popen we made (or have been started by hand), so look at the processes
    if arcade_proc[0] is not None and arcade_proc[0].poll() is None:
        return True
    return (
        subprocess.run(
            [
                "pgrep",
                "-f",
                "squashfs-root/AppRun --resolution|RetroArch-Linux-x86_64/squashfs-root/AppRun -L|VPinballX_GL",
            ],
            stdout=subprocess.DEVNULL,
        ).returncode
        == 0
    )


def youtube_running():
    return subprocess.run(["pgrep", "-f", "class=MirrorYouTube"], stdout=subprocess.DEVNULL).returncode == 0


def pinball_state():
    """Pinball is ready when Visual Pinball X is installed and there is at least one table to play."""
    if not os.access(VPX, os.X_OK):
        return {"ready": False, "why": "Visual Pinball X isn't installed (~/Applications/VPinball)"}
    try:
        tables = sum(1 for f in os.listdir(TABLES) if f.lower().endswith((".vpx", ".vpt")))
    except OSError:
        tables = 0
    if not tables:
        return {"ready": False, "why": "No tables yet. Put .vpx table files in ~/ROMs/vpinball", "tables": 0}
    return {"ready": True, "tables": tables}


# ---- ES-DE left alone at its menu: go back to the dashboard so the screensaver can take over ----
ES_MARK = r"^\S*ES-DE/squashfs-root/"  # (matches the program path at the start of a command line, nothing that merely mentions it)
ES_IDLE_FILE = os.path.expanduser("~/.config/mirror/arcade_idle")  # minutes ("off" turns it off); 10 by default


def es_state():
    """None: ES-DE is not running; "menu": it is sitting in its menus; "game": a game (or a pinball table) is running under it"""
    try:
        out = subprocess.run(
            ["ps", "-eo", "pid,ppid,args", "--no-headers"], capture_output=True, text=True, timeout=5
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    rows = [l.split(None, 2) for l in out.splitlines()]
    rows = [(int(r[0]), int(r[1]), r[2]) for r in rows if len(r) > 2 and r[0].isdigit() and r[1].isdigit()]
    fe = {p for p, _pp, a in rows if re.match(ES_MARK, a)}
    if not fe:
        return None
    if any(pp in fe and p not in fe for p, pp, _a in rows) or any(
        re.search(r"RetroArch-Linux-x86_64/squashfs-root/AppRun -L|VPinballX_GL", a) for _p, _pp, a in rows
    ):
        return "game"
    return "menu"


def es_idle_limit():
    try:
        v = open(ES_IDLE_FILE).read().strip().lower()
    except OSError:
        return 600
    if v in ("off", "0", "no"):
        return 0
    try:
        return max(60, int(float(v) * 60))
    except ValueError:
        return 600


def es_idle_watch(pad_idle):
    """pad_idle() -> seconds since anything was pressed on the controller. Only ever closes ES-DE while it is at its menus: never a running game."""
    menu_since = None
    while True:
        time.sleep(15)
        try:
            if es_state() != "menu":
                menu_since = None
                continue
            menu_since = menu_since or time.time()
            lim = es_idle_limit()
            if lim and time.time() - menu_since >= lim and pad_idle() >= lim:
                print(
                    f"{time.strftime('%H:%M:%S')} ES-DE idle at its menu for {lim // 60} min: back to the dashboard",
                    flush=True,
                )
                subprocess.run(["pkill", "-TERM", "-f", ES_MARK], timeout=5)
                menu_since = None
        except Exception as e:
            print("es idle:", repr(e), flush=True)
