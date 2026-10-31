#!/usr/bin/env python3
"""Mirror audio policy: the Sonos Era 300 is both the music player and the mirror's speaker.
  - Music playing on the Sonos (Apple Music etc.): the PC steps aside. Its audio goes to the laptop output and is muted (so the mirror stays
    silent) and nothing is streamed to the Sonos.
  - Nothing playing: the PC's audio goes to the Sonos over AirPlay (PipeWire's RAOP sink, see ~/.config/pipewire/pipewire.conf.d/50-raop.conf).
    A hidden hiss (about -50 dB: the Sonos treats a stream of pure digital silence as paused and ignores later sound) is held open meanwhile,
    so the AirPlay session is already up and playing when the mirror makes a sound (the dashboard's clicks, the
    intro, YouTube Shorts, games, AirPlay casts). When the PC stops streaming the Sonos returns to its music queue by itself.
  - The PC's own silent AirPlay stream is flagged in /tmp/mirror-airplay so the proxy and this script never mistake it for music.
Switches: ~/.config/mirror/quiet = "off" lets the mirror keep its sound (from the laptop) while music plays;
          ~/.config/mirror/sonos_audio = "off" keeps the mirror's sound on the laptop output at all times.
Only mutes this script set are ever undone. Runs as the user service audio-policy.service."""

import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request

PROXY = os.environ.get("MIRROR_URL", "http://127.0.0.1:8765")
CFG = os.path.expanduser("~/.config/mirror")
STATE = os.environ.get(
    "MIRROR_STATE", "/tmp/mirror-audio-muted"
)  # JSON list of sink names this script muted (survives a crash)
FLAG = "/tmp/mirror-airplay"  # exists while our silent AirPlay stream is up
RELEASE, POLL = 1.5, 0.7  # RELEASE: how long after the music stops before the PC takes the Sonos back


def log(*a):
    print(*a, flush=True)  # goes to the journal: journalctl --user -u audio-policy


def run(*cmd, t=8):
    try:
        return subprocess.run(list(cmd), capture_output=True, text=True, timeout=t).stdout
    except Exception:
        return ""


def setting(name, default):
    try:
        return open(os.path.join(CFG, name)).read().strip() != "off"
    except OSError:
        return default


def sonos_status():
    """(music playing, reachable, speaker volume, the speaker is on our own AirPlay stream). The PC's own stream is never music (the proxy marks it pc)."""
    try:
        d = json.load(urllib.request.urlopen(PROXY + "/sonos/now", timeout=4))
        ok = bool(d.get("ok"))
        return (
            ok and d.get("state") == "playing" and not d.get("pc") and d.get("source") != "Bluetooth",
            ok,
            int(d.get("volume") or 0),
            bool(d.get("pc")),
        )
    except Exception:
        return False, False, 0, False


_nodes = {}


def node_name(i):
    if i not in _nodes:
        _nodes[i] = next(
            (
                l.split("=", 1)[1].strip().strip('"')
                for l in run("wpctl", "inspect", str(i)).splitlines()
                if "node.name" in l and "=" in l
            ),
            "",
        )
    return _nodes[i]


def sinks():
    """[(id, description, is_default, node name)] from wpctl's Audio > Sinks block"""
    out, inside = [], False
    for line in run("wpctl", "status").splitlines():
        if line.startswith("Video"):
            break
        if "Sinks:" in line:
            inside = True
            continue
        if inside and ("Sources:" in line or "Filters:" in line):
            break
        m = re.search(r"(\*)?\s+(\d+)\.\s+(.+?)\s+\[vol", line) if inside else None
        if m:
            out.append((int(m.group(2)), m.group(3).strip(), bool(m.group(1)), node_name(int(m.group(2)))))
    return out


def is_muted(i):
    return "[MUTED]" in run("wpctl", "get-volume", str(i))


def held():
    try:
        return json.load(open(STATE))
    except Exception:
        return []


def save(names):
    if names:
        json.dump(names, open(STATE, "w"))
    elif os.path.exists(STATE):
        os.remove(STATE)


def mute(i, name, on):
    run("wpctl", "set-mute", str(i), "1" if on else "0")
    h = [n for n in held() if n != name]
    save(h + [name] if on else h)


ka = None
flag_off = [None]


def keepalive(on, node=None):
    """A silent stream into the Sonos while the mirror is idle: the AirPlay session stays up, so the first sound after a pause isn't delayed
    by session set-up."""
    global ka
    alive = ka is not None and ka.poll() is None
    if on and not alive:
        ka = subprocess.Popen(
            [
                "gst-launch-1.0",
                "-q",
                "audiotestsrc",
                "wave=white-noise",
                "volume=0.003",
                "is-live=true",
                "!",
                "audio/x-raw,rate=44100,channels=2",
                "!",
                "pulsesink",
            ]
            + ([f"device={node}"] if node else []),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        open(FLAG, "w").close()
        flag_off[0] = None
    elif not on:
        if alive:
            ka.terminate()
        if os.path.exists(FLAG) and flag_off[0] is None:
            flag_off[0] = (
                time.time() + 10
            )  # the Sonos lingers on our stream for a few seconds after it stops: stay marked


def restart_keepalive(node):
    """tear the stream down and bring it up again: a fresh AirPlay session"""
    global ka
    if ka is not None and ka.poll() is None:
        ka.terminate()
        try:
            ka.wait(timeout=3)
        except Exception:
            ka.kill()
    ka = None
    time.sleep(0.6)
    keepalive(True, node)


def release_all(*_):
    keepalive(False)  # (the flag file stays for a few seconds on purpose; the next start expires it)
    for i, name, _d, _n in sinks():
        if name in held():
            mute(i, name, False)
    sys.exit(0)


signal.signal(signal.SIGTERM, release_all)
signal.signal(signal.SIGINT, release_all)

if os.path.exists(STATE) and not held():  # a mute left by an old version of this script (it kept no names): undo it
    for i, name, _d, _n in sinks():
        run("wpctl", "set-mute", str(i), "0")
    save([])
last_music, music_vol = 0.0, 25
lost_since, mode = None, None
if os.path.exists(FLAG):
    flag_off[0] = time.time() + 10
while True:
    now = time.time()
    sk = sinks()
    air = next((s for s in sk if s[3].startswith("raop_sink")), None)  # the Sonos, over AirPlay
    local = next((s for s in sk if not s[3].startswith(("raop_sink", "bluez_output"))), None)
    quiet = setting("quiet", True)
    music, reachable, vol, on_pc = sonos_status()
    if reachable and not on_pc and vol:
        music_vol = vol  # the volume the speaker is set to for music: the mirror's sound uses the same level
    if music:
        last_music = now
    if flag_off[0] and time.time() > flag_off[0]:
        flag_off[0] = None
        if os.path.exists(FLAG) and not (ka is not None and ka.poll() is None):
            os.remove(FLAG)
    new_mode = "music" if music else "idle"
    if new_mode != mode:
        log(
            f"{time.strftime('%H:%M:%S')} {mode or 'start'} -> {new_mode}  (sonos {'reachable' if reachable else 'UNREACHABLE'}, volume {vol})"
        )
        mode = new_mode
    use_air = air is not None and local is not None and setting("sonos_audio", True) and reachable
    if not local:
        keepalive(False)
    elif not use_air or music:
        # laptop output: while the Sonos plays music the PC is muted (unless quiet is off); with no Sonos route it is simply the speaker
        keepalive(False)
        if not local[2]:
            run("wpctl", "set-default", str(local[0]))
        if quiet and music and not is_muted(local[0]):
            mute(local[0], local[1], True)
        elif local[1] in held() and (not music or not quiet) and now - last_music > (RELEASE if quiet else 0):
            mute(local[0], local[1], False)
        elif not music and not use_air and local[1] in held():
            mute(local[0], local[1], False)
    elif now - last_music > RELEASE:  # idle: the mirror's sound comes out of the Sonos
        if local[1] in held():
            mute(local[0], local[1], False)
        if air[1] in held():
            mute(air[0], air[1], False)
        if not air[2]:
            run("wpctl", "set-default", str(air[0]))
        if (
            ka is None or ka.poll() is not None
        ):  # the Sonos takes its volume from the PC's AirPlay volume when a session starts
            run("wpctl", "set-volume", str(air[0]), f"{max(5, min(100, music_vol)) / 100:.2f}")
        keepalive(True, air[3])
        # watchdog: the Sonos can leave our AirPlay stream (a tap on its own controls, a network hiccup): then sound goes nowhere. Bring the stream back.
        if reachable and not on_pc:
            lost_since = lost_since or now
            if now - lost_since > 8:
                log(f"{time.strftime('%H:%M:%S')} the Sonos is not on our AirPlay stream: restarting it")
                restart_keepalive(air[3])
                lost_since = None
        else:
            lost_since = None
    else:
        lost_since = None
    time.sleep(POLL)
