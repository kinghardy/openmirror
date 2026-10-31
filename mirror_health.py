"""Health checks, backups and a safe restart for the mirror's proxy (proxy.py imports this; it imports nothing from proxy.py).

health(ctx)   -> {"ok", "at", "uptime", "checks": [{"id", "label", "ok", "warn", "detail"}]}   (slow external checks are cached for a minute)
backup_now()  -> path of a tar.gz of the machine-specific state (config, wallets, picks, sports settings...) plus a git bundle of the project
restart(ctx)  -> schedules `systemctl --user restart mirror.service`, but refuses while a game / YouTube is running (a restart ends those) unless forced
beat(name)    -> called by proxy.py's loops so a stopped loop shows up as red
"""
import glob, json, os, shutil, socket, subprocess, tarfile, threading, time, urllib.request

START = time.time()
HB = {}
HOME = os.path.expanduser("~")
BACKUP_DIR = os.path.join(HOME, "backups", "mirror")
STATE_DIRS = [os.path.join(HOME, ".config", "mirror"), os.path.join(HOME, ".local", "share", "mirror")]
PROJECT = os.path.dirname(os.path.abspath(__file__))
_cache = {}
CTX = {}                                                       # filled in by proxy.py (what the checks need from it)


def beat(name): HB[name] = time.time()


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl: return hit[1]
    try: val = fn()
    except Exception as e: val = (False, False, str(e)[:80])
    _cache[key] = (time.time(), val); return val


def _get(url, timeout=4, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=dict({"User-Agent": "Mozilla/5.0 (mirror-dashboard)"}, **(headers or {}))), timeout=timeout) as r: return r.status


def _age(name):
    t = HB.get(name); return None if t is None else time.time() - t


def _loop(name, max_age, label):
    a = _age(name)
    if a is None: return (False, False, "not running")
    return (a < max_age, False, "running" if a < max_age else f"stopped {int(a)}s ago")


def last_backup():
    fs = sorted(glob.glob(os.path.join(BACKUP_DIR, "mirror-*.tar.gz")))
    return (fs[-1], time.time() - os.path.getmtime(fs[-1])) if fs else (None, None)


def health(ctx):
    checks = []
    def add(id_, label, res):
        ok, warn, detail = res; checks.append({"id": id_, "label": label, "ok": bool(ok), "warn": bool(warn) and bool(ok), "detail": detail})
    up = time.time() - START
    add("proxy", "Mirror server", (True, False, f"up {int(up // 3600)}h {int(up % 3600 // 60)}m"))
    pa = _age("page")
    add("page", "Kiosk screen", (pa is not None and pa < 10, False, "showing" if pa is not None and pa < 10 else "no page has checked in for " + (f"{int(pa)}s" if pa is not None else "ever")))
    def sonos():
        n = ctx["sonos_now"]()
        return (bool(n.get("ok")), False, (f"{n.get('state')} · {n.get('title') or 'nothing'}" if n.get("ok") else "can't reach the speaker"))
    add("sonos", "Sonos speaker", _cached("sonos", 8, sonos))
    def ha():
        s = _get(ctx["ha_url"]() + "/api/", 3, {"Authorization": "Bearer " + ctx["ha_token"]()}); return (s == 200, False, "connected" if s == 200 else f"HTTP {s}")
    add("ha", "Home Assistant", _cached("ha", 30, ha))
    def pad():
        try: txt = open("/proc/bus/input/devices").read()
        except OSError: txt = ""
        on = "Xbox Wireless Controller" in txt
        bat = [open(p).read().strip() for p in glob.glob("/sys/class/power_supply/*xpad*/capacity") + glob.glob("/sys/class/power_supply/*gamepad*/capacity")]
        return (on, on and bool(bat) and int(bat[0] or 100) < 20, ("connected" + (f" · battery {bat[0]}%" if bat else "")) if on else "not connected (press the Xbox button to wake it)")
    add("pad", "Controller", pad())
    add("pad_watch", "Controller listener (Xbox tap, wake)", _loop("xbox", 12, ""))
    def apple():
        it = ctx["itunes"]; now = time.time(); cool = it["cool"] - now
        calls = len([t for t in it["calls"] if now - t < 60])
        if cool > 0: return (True, True, f"Apple is limiting lookups: waiting {int(cool)}s (songs found through Deezer can't be matched until then)")
        return (True, calls >= 10, f"{calls} lookups in the last minute · {ctx['resolved']()} songs matched so far")
    add("apple", "Apple Music lookups", apple())
    add("deezer", "Deezer (search, shelves)", _cached("deezer", 60, lambda: (_get("https://api.deezer.com/infos") == 200, False, "reachable")))
    add("espn", "ESPN (sports)", _cached("espn", 60, lambda: (_get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard") == 200, False, "reachable")))
    def guest():
        s = socket.create_connection(("127.0.0.1", 8766), 2); s.close(); g = ctx["guests"](); return (True, not g.get("low_ports", True), ("open" if g["open"] else "closed") + (f" · {g['here']} here" if g["here"] else "") + ("" if g.get("low_ports", True) else " · the phone app's short address (ports 80/443) is down: run the sysctl command"))
    add("guest", "Guest phone server", _cached("guest", 10, guest))
    if ctx.get("cert"):
        c = ctx["cert"](); add("tls", "HTTPS certificate (Tailscale)", (True, not c["ok"], c["msg"]))
    sp = _loop("sports", 20, ""); add("sports", "Sports engine", (sp[0], False, sp[2] + (f" · watching {ctx['watching']()} game(s)" if sp[0] else "")))
    add("autopilot", "Party autopilot", _loop("autopilot", 30, ""))
    add("shelves", "Discovery shelves", (ctx["shelves"]() >= 10, ctx["shelves"]() < 14, f"{ctx['shelves']()} shelves ready"))
    du = shutil.disk_usage(HOME); free = du.free / du.total * 100
    add("disk", "Disk space", (free > 5, free < 15, f"{free:.0f}% free"))
    try: bat = open("/sys/class/power_supply/AC/online").read().strip() == "1"
    except OSError: bat = True
    add("power", "Laptop power", (bat, False, "on AC" if bat else "ON BATTERY"))
    f, age = last_backup()
    add("backup", "Backups", (age is not None and age < 36 * 3600, age is not None and age > 20 * 3600, (f"last {int(age // 3600)}h ago" if age is not None else "none yet")))
    if ctx["sleep"]()["asleep"]: add("sleep", "Deep sleep", (True, True, "the screen is off (any controller button wakes it)"))
    return {"ok": all(c["ok"] for c in checks), "at": time.time(), "uptime": up, "checks": checks, "games": bool(ctx["games_running"]())}


def backup_now(keep=14):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    name = os.path.join(BACKUP_DIR, "mirror-" + time.strftime("%Y%m%d-%H%M") + ".tar.gz")
    with tarfile.open(name + ".part", "w:gz") as tf:
        for d in STATE_DIRS:
            if os.path.isdir(d): tf.add(d, arcname=os.path.relpath(d, HOME), filter=lambda ti: None if "yt-profile" in ti.name else ti)       # (the YouTube browser profile is 90 MB of cache: not worth keeping)
        bundle = os.path.join("/tmp", "mirror-project.bundle")
        try:
            subprocess.run(["git", "-C", PROJECT, "bundle", "create", bundle, "--all"], check=True, capture_output=True, timeout=30)
            tf.add(bundle, arcname="project.bundle"); os.remove(bundle)
        except (OSError, subprocess.SubprocessError): pass
    os.replace(name + ".part", name); os.chmod(name, 0o600)
    for old in sorted(glob.glob(os.path.join(BACKUP_DIR, "mirror-*.tar.gz")))[:-keep]: os.remove(old)
    try:                                                                       # a second copy somewhere else: put a folder path (USB drive, NAS mount) in ~/.config/mirror/backup_dir
        extra = open(os.path.join(HOME, ".config", "mirror", "backup_dir")).read().strip()
        if extra and os.path.isdir(extra): shutil.copy2(name, extra)
    except OSError: pass
    return name


def backup_loop():
    time.sleep(120)
    while True:
        beat("backup_loop")
        _, age = last_backup()
        if age is None or age > 23 * 3600:
            try: backup_now()
            except Exception as e: print("backup:", repr(e), flush=True)
        time.sleep(1800)


def restart(ctx, force=False):
    if ctx["games_running"]() and not force: raise ValueError("A game or YouTube is running: restarting would close it")
    subprocess.Popen("sleep 1.5; systemctl --user restart mirror.service", shell=True, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "Restarting: back in about 10 seconds"


def start_backups(): threading.Thread(target=backup_loop, daemon=True).start()
