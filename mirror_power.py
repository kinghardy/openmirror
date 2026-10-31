"""Deep sleep (HDMI off / on), the Xbox button and phone-remote command queues. (split out of proxy.py)"""

import os
import threading
import time
import subprocess
import mirror_health as MH


# Tapping the Xbox button on the dashboard opens its Xbox menu (music controls, screensaver). Over bluetooth the browser never sees that button (it is
# BTN_MODE on the pad's evdev device), so this watches it (read only: pad_quit.py's exclusive grab during games / its own menu simply hides it from here)
# and the page polls /mirror/xbox for a new press.
XBOX = {"n": 0, "at": 0.0}
PAD = {
    "at": time.time()
}  # the last time anything was pressed or pushed on the controller (a game left alone at its menu is "idle")

REMOTE = {
    "n": 0,
    "cmds": [],
}  # the phone remote: commands from an admin's phone, in order; the page polls them along with the Xbox button


def remote_push(cmd, **kw):
    REMOTE["n"] += 1
    REMOTE["cmds"] = (REMOTE["cmds"] + [dict(kw, id=REMOTE["n"], cmd=cmd, at=time.time())])[-40:]


# Deep sleep: the page goes black and stops working, the HDMI output is switched off (DPMS) and ANY controller button wakes it again. DPMS stays disabled the
# rest of the time (the controller never touches X, so X would think nobody is there and blank the screen mid-use).
SLEEP = {"asleep": False, "at": 0.0}


def display(on):
    env = dict(os.environ, DISPLAY=":0", XAUTHORITY=os.path.expanduser("~/.Xauthority"))
    for c in (
        [["xset", "dpms", "force", "on"], ["xset", "-dpms"]]
        if on
        else [["xset", "+dpms"], ["xset", "dpms", "force", "off"]]
    ):
        try:
            subprocess.run(c, env=env, timeout=5, capture_output=True)
        except (OSError, subprocess.SubprocessError):
            pass


def sleep_set(on):
    SLEEP.update(asleep=bool(on), at=time.time())
    display(not on)


def xbox_watch():
    try:
        import evdev
        import select
        from evdev import ecodes as ec
    except ImportError:
        return
    devs = []
    while True:
        MH.beat("xbox")
        try:
            if not devs:
                devs = [
                    d
                    for d in map(evdev.InputDevice, evdev.list_devices())
                    if ec.BTN_MODE in d.capabilities().get(ec.EV_KEY, [])
                ]
                if not devs:
                    time.sleep(5)
                    continue
            r, _, _ = select.select(devs, [], [], 1)
            for d in r:
                for e in d.read():
                    if (e.type == ec.EV_KEY and e.value == 1) or (
                        e.type == ec.EV_ABS
                        and (
                            e.code in (ec.ABS_HAT0X, ec.ABS_HAT0Y)
                            and e.value != 0
                            or e.code in (ec.ABS_X, ec.ABS_Y, ec.ABS_RX, ec.ABS_RY)
                            and abs(e.value) > 16000
                            or e.code in (ec.ABS_Z, ec.ABS_RZ)
                            and e.value > 300
                        )
                    ):
                        PAD["at"] = time.time()
                    if e.type == ec.EV_KEY and e.code == ec.BTN_MODE and e.value == 1:
                        XBOX["n"] += 1
                        XBOX["at"] = time.time()
                    if (
                        SLEEP["asleep"]
                        and time.time() - SLEEP["at"] > 2
                        and (
                            (e.type == ec.EV_KEY and e.value == 1)
                            or (e.type == ec.EV_ABS and e.code in (ec.ABS_HAT0X, ec.ABS_HAT0Y) and e.value != 0)
                        )
                    ):
                        sleep_set(False)  # any button wakes it
        except (OSError, ValueError):
            devs = []
            time.sleep(2)  # the pad went away: look again


threading.Thread(target=xbox_watch, daemon=True).start()

display(True)  # (a restart while asleep must not leave the screen off)
