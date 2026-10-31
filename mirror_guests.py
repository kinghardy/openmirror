"""Guest phones: wallets and coins, requests, admin actions, the wall, and the little web server on port 8766. (split out of proxy.py)"""
import os
import re
import urllib.request, urllib.error, urllib.parse
import json
import threading
import time
import hashlib
import secrets
import socket
import xml.etree.ElementTree as ET
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler
import mirror_health as MH
from mirror_catalog import music_album, music_artist, music_discover, music_search2, resolve_track
from mirror_sports import SP, sports_act, sports_game, sports_list, sports_watch_brief
from mirror_party import music_play, party_on, party_queue, party_set, queue_act
from mirror_power import SLEEP, remote_push, sleep_set
from mirror_sonos import sonos_do, sonos_now
import mirror_pairing as PAIR
import mirror_push as PUSH
import mirror_settings as SETT
import mirror_tls as TLSM
from mirror_themes import theme_file, theme_list, theme_set
from mirror_util import CFG_DIR, GAMES_FILE, dz, itunes_busy, m_song, mget, secret

# ---- Guest requests (phones on the home Wi-Fi) ------------------------------------------------------------------------------------------------------------
# Guests scan a QR code, make a name + 4-digit PIN once, and earn coins slowly while their phone page is open. Coins buy song requests, bumps and skips; the
# controller (the house) is free. The coins are the same ones the King Hardy Slots game uses, so a guest can also play them at the mirror.
# This is a SEPARATE little web server on port 8766 with a short whitelist of routes: the dashboard's own server (Home Assistant token and all) stays on 127.0.0.1.
WALLETS_FILE = os.path.expanduser("~/.local/share/mirror/wallets.json")

WL = threading.Lock()

ECON = {"start": 300, "rate": 10, "cap": 2000, "request": 100, "bump": 250, "voteskip": 50, "skipnow": 500, "voters": 3, "max_queued": 3}      # rate = coins per minute while the page is open

VOTES = {"key": None, "voters": set()}

TRIES = {}

def wallets():
    try: w = json.load(open(WALLETS_FILE))
    except (OSError, ValueError): w = {}
    if "host" not in w:                                                    # the house wallet starts from whatever the slot machine already had
        try: c = json.load(open(GAMES_FILE)).get("kinghardy", {}).get("credits", 1000)
        except (OSError, ValueError): c = 1000
        w["host"] = {"id": "host", "name": SETT.get("house_name"), "coins": c, "host": True, "seen": 0}
    hn = SETT.get("house_name")
    if w["host"].get("name") != hn: w["host"]["name"] = hn                       # (the house name is a setting)
    return w

def wallets_save(w):
    os.makedirs(os.path.dirname(WALLETS_FILE), exist_ok=True)
    with open(WALLETS_FILE + ".tmp", "w") as f: json.dump(w, f)
    os.replace(WALLETS_FILE + ".tmp", WALLETS_FILE)

def guest_off(): return secret("guests", "auto") == "off"                  # the hard switch (Start menu): off stays off until it is turned back on

def guest_open(): return party_on() and not guest_off()                      # otherwise guests can join whenever Party mode is on

def pin_hash(pin, salt): return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 60000).hex()

def guest_present(w): return [x["name"] for x in w.values() if not x.get("host") and time.time() - x.get("seen", 0) < 60]

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(("10.255.255.255", 1)); return s.getsockname()[0]
    except OSError: return "127.0.0.1"
    finally: s.close()

def guest_join(name, pin, ip):
    name = re.sub(r"\s+", " ", str(name)).strip()[:16]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{1,15}", name) or name.lower() in ("host", "house", "our pick", SETT.get("house_name").lower()): raise ValueError("Pick a name: 2-16 letters or numbers")
    if not re.fullmatch(r"\d{4}", str(pin)): raise ValueError("The PIN is 4 digits")
    k = (ip, name.lower()); n, t = TRIES.get(k, (0, 0))
    if n >= 5 and time.time() - t < 60: raise ValueError("Too many tries: wait a minute")
    with WL:
        w = wallets(); me = w.get(name.lower())
        if me:
            if me.get("host") or pin_hash(str(pin), me["salt"]) != me["pin"]:
                TRIES[k] = (n + 1, time.time()); raise ValueError("That name is taken, or the PIN is wrong")
        else:
            salt = secrets.token_hex(8); me = w[name.lower()] = {"id": name.lower(), "name": name, "salt": salt, "pin": pin_hash(str(pin), salt), "coins": ECON["start"], "seen": 0, "tokens": []}
        tok = secrets.token_urlsafe(16); me["tokens"] = (me.get("tokens", []) + [tok])[-5:]; TRIES.pop(k, None)
        wallets_save(w); return tok

def guest_by_token(w, tok):
    return next((x for x in w.values() if tok and tok in x.get("tokens", [])), None)

def guest_state(tok, visible=True):
    with WL:
        w = wallets(); me = guest_by_token(w, tok)
        if not me: raise PermissionError("signed out")
        now = time.time()
        if me.get("seen") and visible and me["coins"] < ECON["cap"]: me["coins"] = min(ECON["cap"], me["coins"] + min(now - me["seen"], 30) * ECON["rate"] / 60)
        me["seen"] = now; wallets_save(w)
    try:
        q = party_queue(); st = sonos_now()
    except (OSError, ET.ParseError, urllib.error.HTTPError): q, st = {"items": [], "current": 0}, {}
    cur = next((i for i in q["items"] if i["n"] == q["current"]), None)
    key = (cur or {}).get("id")                                   # (queue numbers shift when played songs are pruned: the song itself is the key)
    if VOTES["key"] != key: VOTES["key"], VOTES["voters"] = key, set()
    adm = bool(me.get("admin")); here = guest_present(w)
    out = {"name": me["name"], "coins": int(me["coins"]), "econ": ECON, "open": guest_open(), "party": party_on(), "here": here if adm else [], "here_n": len(here), "admin": adm, "volume": st.get("volume"),
            "now": {k: st.get(k) for k in ("title", "artist", "art", "state", "pos", "dur")} if st.get("ok") else None,
            "queue": [{k: i.get(k) for k in ("n", "id", "title", "artist", "art", "by")} for i in q["items"] if i["n"] >= q["current"]][:30], "current": q["current"],
            "votes": {"have": len(VOTES["voters"]), "need": ECON["voters"], "mine": me["id"] in VOTES["voters"]},
           "prompt": WALL["prompt"] if WALL["prompt"]["text"] else None, "wall": wall_view(), "watch": watch_brief()}
    if adm: out["guests"] = [{"id": x["id"], "name": x["name"], "coins": int(x["coins"]), "here": x["name"] in here, "admin": bool(x.get("admin"))} for x in sorted(w.values(), key=lambda x: x["name"].lower()) if not x.get("host")]
    return out

def guest_spend(me_id, cost):
    w = wallets(); me = w[me_id]
    if me.get("admin"): return                                            # admins (set with /guest/admin) spend nothing
    if me["coins"] < cost: raise ValueError(f"You need {cost} coins (you have {int(me['coins'])})")
    me["coins"] -= cost; wallets_save(w)

def guest_refund(me_id, cost):
    w = wallets()
    if w[me_id].get("admin"): return
    w[me_id]["coins"] += cost; wallets_save(w)

def guest_act(tok, act, body):
    if guest_off(): raise ValueError("Guest requests are turned off")
    with WL:
        w = wallets(); me = guest_by_token(w, tok)
        if not me: raise PermissionError("signed out")
        mid, name, adm = me["id"], me["name"], bool(me.get("admin"))
    if not party_on(): raise ValueError("Party mode is off")
    q = party_queue(); items = {i["n"]: i for i in q["items"]}; cur = q["current"]
    if act == "request":
        tid = str(body.get("id", "")); song = None
        if tid.startswith("dz:") and tid[3:].isdigit():                       # a song from Deezer-sourced shelves / search: match it to Apple Music now
            try: d = dz(f"/track/{int(tid[3:])}", 3600); song = resolve_track(d.get("title_short") or d["title"], d["artist"]["name"])
            except urllib.error.HTTPError as e:
                if e.code in (403, 429): raise ValueError(itunes_busy())
                song = None
            except OSError: raise ValueError(itunes_busy())
            except (ValueError, KeyError): song = None
            if not song: raise ValueError("Couldn't find that one on Apple Music")
            tid = song["id"]
        if not tid.isdigit(): raise ValueError("bad song")
        if not adm and sum(1 for i in q["items"] if i["n"] > cur and i["by"] == name) >= ECON["max_queued"]: raise ValueError(f"You already have {ECON['max_queued']} songs lined up")
        if any(str(i["id"]) == tid for i in q["items"] if i["n"] >= cur): raise ValueError("That song is already in the queue")
        if not song:
            rs = mget(f"https://itunes.apple.com/lookup?id={int(tid)}&country=us", 1800).get("results", [])
            if not rs or rs[0].get("kind") != "song": raise ValueError("Couldn't find that song")
            song = m_song(rs[0])
        with WL: guest_spend(mid, ECON["request"])
        try: music_play([song], 0, "add", name)
        except Exception: 
            with WL: guest_refund(mid, ECON["request"])
            raise ValueError("The speaker didn't take that one")
        return "Requested! It joins the queue."
    if act == "bump":
        n = int(body.get("n", 0)); it = items.get(n)
        if not it or n <= cur + 1: raise ValueError("That one is already next")
        with WL: guest_spend(mid, ECON["bump"])
        try:
            queue_act({"action": "remove", "n": n}); music_play([{"id": it["id"], "title": it["title"], "artist": it["artist"], "art": it["art"]}], 0, "next", it["by"] or name)
        except Exception:
            with WL: guest_refund(mid, ECON["bump"])
            raise ValueError("The speaker didn't take that")
        return "Bumped to play next."
    if act == "voteskip":
        if cur not in items: raise ValueError("Nothing to skip")
        if mid in VOTES["voters"]: raise ValueError("You already voted on this song")
        with WL: guest_spend(mid, ECON["voteskip"])
        VOTES["voters"].add(mid)
        if len(VOTES["voters"]) >= ECON["voters"]: sonos_do("next", {}); VOTES["voters"] = set(); return "That was the last vote: skipping!"
        return f"Vote counted ({len(VOTES['voters'])}/{ECON['voters']})."
    if act == "skipnow":
        if cur not in items: raise ValueError("Nothing to skip")
        with WL: guest_spend(mid, ECON["skipnow"])
        sonos_do("next", {}); VOTES["voters"] = set(); return "Skipped."
    raise ValueError("unknown action")

def admin_act(tok, act, body):
    with WL:
        w = wallets(); me = guest_by_token(w, tok)
        if not me: raise PermissionError("signed out")
        if not me.get("admin"): raise ValueError("Not allowed")
    if act == "transport":
        c = body.get("cmd")
        if c not in ("toggle", "play", "pause", "next", "prev"): raise ValueError("bad command")
        sonos_do(c, {}); return {"toggle": "Play / pause", "play": "Playing", "pause": "Paused", "next": "Next song", "prev": "Previous song"}[c]
    if act == "volume": v = max(0, min(100, int(body.get("volume", 0)))); sonos_do("volume", {"volume": v}); return f"Volume {v}"
    if act == "saver":
        c = body.get("cmd")
        if c not in ("on", "off", "next", "prev", "home"): raise ValueError("bad command")
        if SLEEP["asleep"]: sleep_set(False)                                  # (a screensaver command wakes a sleeping mirror first)
        remote_push(c)
        return {"on": "Screensaver on", "off": "Screensaver off", "next": "Next slide", "prev": "Previous slide", "home": "Back to the home screen"}[c]
    if act == "key":                                                       # the phone remote: a virtual controller button
        k = body.get("key")
        if k not in ("up", "down", "left", "right", "a", "b", "x", "y", "start", "xbox", "back"): raise ValueError("bad key")
        if SLEEP["asleep"]: sleep_set(False); return "Waking up"            # the first press only wakes it, like the controller
        remote_push("key", key=k); return "ok"
    if act == "text":
        t = re.sub(r"[^A-Za-z0-9 '&.-]", "", str(body.get("text", "")))[:40]
        if t: remote_push("text", text=t)
        return "Typed"
    if act == "prompt":
        t = re.sub(r"\s+", " ", str(body.get("text", ""))).strip()[:120]
        WALL["prompt"] = {"id": WALL["n"] + 1000 * (int(time.time()) % 1000000), "text": BAD.sub("***", t)} if t else {"id": 0, "text": ""}; wall_save()
        return "Question sent to the room" if t else "Question cleared"
    if act == "msgdel":
        WALL["msgs"] = [m for m in WALL["msgs"] if m["id"] != int(body.get("id", 0))] if "id" in body else []; wall_save(); return "Removed" if "id" in body else "Wall cleared"
    if act == "restart": return MH.restart(MH.CTX, bool(body.get("force")))
    if act == "backup": return "Backed up: " + os.path.basename(MH.backup_now())
    if act.startswith("sports_"): return sports_act(act[7:], body)
    if act == "sleep":
        sleep_set(bool(body.get("on"))); return "Deep sleep" if body.get("on") else "Awake"
    if act == "party": party_set(bool(body.get("on"))); return "Party mode " + ("on" if body.get("on") else "off")
    if act == "queue":
        a, n = body.get("action"), int(body.get("n", 0)); q = party_queue(); items = {i["n"]: i for i in q["items"]}; it = items.get(n)
        if not it: raise ValueError("That song is gone")
        if a in ("remove", "jump"): queue_act({"action": a, "n": n}); return "Removed" if a == "remove" else "Jumping to it"
        if a == "bump":
            if n <= q["current"] + 1: raise ValueError("That one is already next")
            queue_act({"action": "remove", "n": n}); music_play([{"id": it["id"], "title": it["title"], "artist": it["artist"], "art": it["art"]}], 0, "next", it["by"] or me["name"]); return "Bumped to next"
        raise ValueError("bad action")
    if act == "coins":
        with WL:
            w = wallets(); t = w.get(str(body.get("id", "")))
            if not t or t.get("host"): raise ValueError("No such guest")
            t["coins"] = max(0, int(body["set"])) if "set" in body else max(0, t["coins"] + int(body.get("delta", 0))); wallets_save(w)
            return f"{t['name']} now has {int(t['coins'])} coins"
    if act == "kick":
        with WL:
            w = wallets(); t = w.get(str(body.get("id", "")))
            if not t or t.get("host") or t.get("admin"): raise ValueError("Can't do that")
            t["tokens"] = []; wallets_save(w); return f"{t['name']} signed out"
    raise ValueError("unknown action")

# ---- the wall: what guests type on their phones, and the question an admin asks the room ------------------------------------------------------------------
WALL_FILE = os.path.expanduser("~/.local/share/mirror/wall.json")

try: WALL = json.load(open(WALL_FILE))
except (OSError, ValueError): WALL = {"msgs": [], "prompt": {"id": 0, "text": ""}, "n": 0}

WALL_LAST = {}

BAD = re.compile(r"\b(fuck|shit|bitch|asshole|cunt|nigg\w*|fag\w*|dick|pussy|slut|whore)\w*", re.I)

def wall_save():
    os.makedirs(os.path.dirname(WALL_FILE), exist_ok=True)
    with open(WALL_FILE + ".tmp", "w") as f: json.dump(WALL, f)
    os.replace(WALL_FILE + ".tmp", WALL_FILE)

def wall_say(me, text, reply):
    text = BAD.sub(lambda m: m.group(0)[0] + "*" * (len(m.group(0)) - 1), re.sub(r"\s+", " ", str(text)).strip()[:140])
    if not text: raise ValueError("Type something first")
    if not me.get("admin") and time.time() - WALL_LAST.get(me["id"], 0) < 12: raise ValueError("Slow down a few seconds")
    WALL_LAST[me["id"]] = time.time(); pr = WALL["prompt"]
    WALL["n"] += 1; WALL["msgs"] = (WALL["msgs"] + [{"id": WALL["n"], "name": me["name"], "text": text, "at": time.time(), "reply": bool(reply and pr["text"]), "pid": pr["id"] if reply and pr["text"] else 0}])[-120:]
    wall_save(); return "Posted!"

def wall_view(n=25): return [{k: m[k] for k in ("id", "name", "text", "reply", "pid")} for m in WALL["msgs"][-n:]][::-1]

def watch_brief():
    try: return sports_watch_brief()
    except Exception: return []
def push_watcher():
    """tells a guest when their requested song is next and when it is playing"""
    told = set(); last = None
    while True:
        time.sleep(4)
        try:
            if not party_on(): continue
            q = party_queue(); cur = next((i for i in q["items"] if i["n"] == q["current"]), None); nxt = next((i for i in q["items"] if i["n"] == q["current"] + 1), None)
            by_name = {w["name"]: w["id"] for w in wallets().values() if not w.get("host")}
            for it, what, kind in ((cur, "is playing now", "now"), (nxt, "is up next", "next")):
                if it and it.get("by") in by_name and (it["id"], kind) not in told:
                    told.add((it["id"], kind)); PUSH.notify("Your song " + what + " 🎶", f"{it['title']} · {it['artist']}", kind="mine", wid=by_name[it["by"]], tag="mine", url="/")
            if len(told) > 200: told.clear()
        except Exception: pass
threading.Thread(target=push_watcher, daemon=True).start()
EV = {"n": 0, "sig": None}; EVC = threading.Condition()
def events_loop():
    """watches the queue + current song and wakes every open phone page when something changes"""
    while True:
        time.sleep(2)
        try:
            q = party_queue(); sig = json.dumps([q["party"], q["current"], [i["id"] for i in q["items"]], sonos_now().get("title"), sonos_now().get("state"), len(WALL["msgs"]), WALL["prompt"]["id"], [(x["key"], x["state"], x["home"]["score"], x["away"]["score"]) for x in watch_brief()]])
            if sig != EV["sig"]:
                with EVC: EV["sig"] = sig; EV["n"] += 1; EVC.notify_all()
        except Exception: pass
threading.Thread(target=events_loop, daemon=True).start()
def push_sports(e):
    if e["kind"] in ("big", "med") or e["title"] == "FINAL": PUSH.notify(f"{e['title']} {e['tname']}".strip(), f"{e['text'][:110]}  ({e['away']['abbr']} {e['away']['score']}–{e['home']['score']} {e['home']['abbr']})".strip(), kind="sports", tag="sports", urgency="high")
SETUP_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "setup.html")
HOST_OK = re.compile(r"(localhost|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+(\.[a-z0-9-]+)*\.(local|ts\.net|lan|home|internal))", re.I)     # names that are this machine on a home network (a public name here would be a DNS-rebinding attempt)
def setup_urls():
    """where the phone setup page lives, for the mirror's screen: the encrypted address first"""
    ip = lan_ip()
    return {"secure": "https://party.local/setup" if 443 in BOUND else ("https://party.local:8443/setup" if 8443 in BOUND else ""), "plain": "http://party.local/setup" if 80 in BOUND else f"http://{ip}:8766/setup"}
GUEST_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guest.html")
PWA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pwa")
TRUST_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure app</title>
<style>body{margin:0;padding:calc(24px + env(safe-area-inset-top)) 18px 40px;background:#0b0a14;color:#f4f2ff;font:17px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto}h1{font-size:28px;margin:0 0 6px}p.s{color:#9a97b8;margin:0 0 18px}
.c{background:#171526;border-radius:18px;padding:16px 18px;margin-bottom:14px}.c b{color:#ff5a8a}a.b{display:block;text-align:center;background:#ff5a8a;color:#fff;font-weight:800;border-radius:16px;padding:16px;text-decoration:none;margin:12px 0}ol{padding-left:22px;margin:8px 0 0}li{margin:6px 0}small{color:#9a97b8}</style></head><body>
<h1>🔒 Secure app</h1><p class="s">For notifications, instant updates and a proper app. Only needed once per phone. Guests don't need this.</p>
<div class="c"><b>Step 1</b><a class="b" href="/mirror-ca.crt">Download the certificate</a><small>iPhone: tap Allow. Android: save the file.</small></div>
<div class="c"><b>Step 2 · iPhone</b><ol><li>Open <b>Settings</b>: tap <b>Profile Downloaded</b> at the top, then <b>Install</b> (twice).</li><li>Go to <b>Settings → General → About → Certificate Trust Settings</b> and switch <b>Mirror Local CA</b> on.</li></ol></div>
<div class="c"><b>Step 2 · Android</b><ol><li><b>Settings → Security → Encryption &amp; credentials → Install a certificate → CA certificate</b>, pick the file.</li></ol></div>
<div class="c"><b>Step 3</b><a class="b" href="https://party.local/">Open the secure version</a><small>You should see a padlock. Then use Share → Add to Home Screen. This certificate can only vouch for .local names and home-network addresses.</small></div>
</body></html>"""

class GuestH(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_j(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(b)
    # ---- the phone setup page (pairing code from the mirror's screen -> a short session -> keys and settings) ----
    def setup_checks(self, post=False):
        host = (self.headers.get("Host") or "").lower(); name = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
        if not HOST_OK.fullmatch(name): self.send_j(403, {"error": "unexpected address"}); return False
        o = self.headers.get("Origin")
        if post and o and urllib.parse.urlsplit(o).netloc.lower() != host: self.send_j(403, {"error": "bad origin"}); return False
        if post and (self.headers.get("X-OpenMirror") != "setup" or not (self.headers.get("Content-Type") or "").startswith("application/json")): self.send_j(403, {"error": "bad request"}); return False
        return True
    def setup_session(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "om_setup": return PAIR.check(v)
        return False
    def setup_post(self):
        if not self.setup_checks(True): return
        try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 6000)) or b"{}")
        except ValueError: return self.send_j(400, {"error": "bad json"})
        p = self.path.split("?")[0]
        if p == "/setup/api/pair":
            try: tok = PAIR.verify(str(body.get("code", "")), self.client_address[0])
            except ValueError as e: return self.send_j(403, {"error": str(e)})
            b = json.dumps({"ok": True}).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store")
            self.send_header("Set-Cookie", f"om_setup={tok}; Path=/setup; HttpOnly; SameSite=Strict; Max-Age={PAIR.SESSION_TTL}" + ("; Secure" if self.server.secure else "")); self.end_headers(); return self.wfile.write(b)
        if not self.setup_session(): return self.send_j(401, {"error": "enter the code from the mirror first"})
        key = str(body.get("key", ""))
        try:
            if p in ("/setup/api/set", "/setup/api/clear") and SETT.needs_secure(key) and not self.server.secure:
                return self.send_j(403, {"error": "keys and addresses can only be changed over the encrypted address (https://party.local/setup). Open /trust on this phone once to install the certificate."})
            if p == "/setup/api/set": SETT.set_value(key, body.get("value", "")); return self.send_j(200, {"settings": SETT.view()})
            if p == "/setup/api/clear": SETT.clear(key); return self.send_j(200, {"settings": SETT.view()})
            if p == "/setup/api/test": ok, msg = SETT.test(key); return self.send_j(200, {"ok": ok, "message": msg})
            if p == "/setup/api/geocode": return self.send_j(200, {"places": SETT.geocode(body.get("q", ""))})
            if p == "/setup/api/location": SETT.set_location(body.get("name", ""), body.get("lat"), body.get("lon")); return self.send_j(200, {"settings": SETT.view()})
            if p == "/setup/api/theme": theme_set(body.get("mode", "auto")); return self.send_j(200, theme_list())
            if p == "/setup/api/end": PAIR.cancel(); return self.send_j(200, {"ok": True})
        except ValueError as e: return self.send_j(400, {"error": str(e)})
        return self.send_j(404, {"error": "not found"})
    def do_GET(self):
        sp = self.path.split("?")[0]
        if sp == "/setup":
            if not self.setup_checks(): return
            try: b = open(SETUP_PAGE, "rb").read()
            except OSError: return self.send_error(404)
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.send_header("X-Frame-Options", "DENY"); self.end_headers(); return self.wfile.write(b)
        if sp == "/setup/api/state":
            if not self.setup_checks(): return
            if not self.setup_session(): return self.send_j(401, {"error": "enter the code from the mirror first"})
            return self.send_j(200, {"settings": SETT.view(), "themes": theme_list(), "checks": [{"label": c["label"], "ok": c["ok"], "warn": c.get("warn"), "detail": c["detail"]} for c in MH.health(MH.CTX)["checks"]], "secure": bool(self.server.secure)})
        if self.path.split("?")[0] in ("/", "/index.html"):
            try: b = open(GUEST_PAGE, "rb").read()
            except OSError: return self.send_error(404)
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.end_headers(); return self.wfile.write(b)
        p = self.path.split("?")[0]
        if p == "/theme/list": return self.send_j(200, theme_list())
        if p.startswith("/themes/"):                                 # theme files (the phone app's palette, the loader)
            f = theme_file(p) if p != "/themes/loader.js" else (open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "themes", "loader.js"), "rb").read(), "application/javascript")
            if not f: return self.send_error(404)
            self.send_response(200); self.send_header("Content-Type", f[1]); self.send_header("Content-Length", str(len(f[0]))); self.send_header("Cache-Control", "no-cache"); self.end_headers(); return self.wfile.write(f[0])
        if p == "/ping":                                  # (lets the page on plain http find out whether this phone already trusts the secure address)
            b = b'{"ok":1}'; self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.end_headers(); return self.wfile.write(b)
        if p == "/api/events":
            from urllib.parse import parse_qs, urlparse
            t = (parse_qs(urlparse(self.path).query).get("t") or [""])[0]
            with WL:
                if not guest_by_token(wallets(), t): return self.send_error(401)
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.send_header("Cache-Control", "no-store"); self.send_header("X-Accel-Buffering", "no"); self.end_headers()
            seen = -1
            try:
                while True:
                    with EVC:
                        if EV["n"] == seen: EVC.wait(20)
                        cur = EV["n"]
                    self.wfile.write(b"data: 1\n\n" if cur != seen else b": keep\n\n"); self.wfile.flush(); seen = cur
            except (OSError, ValueError): return
        if p == "/sw.js":
            b = open(os.path.join(PWA_DIR, "sw.js"), "rb").read(); self.send_response(200); self.send_header("Content-Type", "application/javascript"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-cache"); self.send_header("Service-Worker-Allowed", "/"); self.end_headers(); return self.wfile.write(b)
        if p == "/mirror-ca.crt":
            try: b = open(TLSM.ensure_ca(), "rb").read()
            except Exception: return self.send_error(404)
            self.send_response(200); self.send_header("Content-Type", "application/x-x509-ca-cert"); self.send_header("Content-Disposition", 'attachment; filename="mirror-ca.crt"'); self.send_header("Content-Length", str(len(b))); self.end_headers(); return self.wfile.write(b)
        if p == "/trust":
            b = TRUST_PAGE.encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.end_headers(); return self.wfile.write(b)
        # the install files (manifest + icons) for "Add to Home Screen"
        alias = {"/manifest.webmanifest": "manifest.webmanifest", "/apple-touch-icon.png": "icon-180.png", "/apple-touch-icon-precomposed.png": "icon-180.png", "/favicon.ico": "icon-192.png"}
        name = alias.get(p) or (p[5:] if p.startswith("/pwa/") else None)
        if name and re.fullmatch(r"[a-z0-9.-]+", name):
            try: b = open(os.path.join(PWA_DIR, name), "rb").read()
            except OSError: return self.send_error(404)
            ct = "application/manifest+json" if name.endswith(".webmanifest") else "image/png"
            self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "max-age=3600"); self.end_headers(); return self.wfile.write(b)
        self.send_error(404)
    def do_POST(self):
        if self.path.split("?")[0].startswith("/setup/api/"): return self.setup_post()
        try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 5000)) or b"{}")
        except ValueError: return self.send_j(400, {"error": "bad json"})
        path, tok = self.path.split("?")[0], body.get("token", "")
        try:
            if path == "/api/join":
                if guest_off(): return self.send_j(403, {"error": "Guest requests are turned off right now"})
                return self.send_j(200, {"token": guest_join(body.get("name", ""), body.get("pin", ""), self.client_address[0])})
            if path == "/api/state": return self.send_j(200, guest_state(tok, bool(body.get("visible", True))))
            if path == "/api/search":
                with WL:
                    if not guest_by_token(wallets(), tok): raise PermissionError("signed out")
                r = music_search2(str(body.get("q", ""))[:60]); return self.send_j(200, {"songs": r["songs"][:16], "albums": r["albums"][:6], "artists": r["artists"]})
            if path in ("/api/discover", "/api/artist", "/api/album"):
                with WL:
                    if not guest_by_token(wallets(), tok): raise PermissionError("signed out")
                if path == "/api/discover": return self.send_j(200, music_discover(str(body.get("seed", ""))[:60], str(body.get("only", ""))))
                if path == "/api/artist": return self.send_j(200, music_artist("", str(body.get("name", ""))[:80]))
                return self.send_j(200, {"songs": music_album(str(body.get("id", "0"))[:30])})
            if path == "/api/health":
                with WL:
                    me = guest_by_token(wallets(), tok)
                    if not me: raise PermissionError("signed out")
                    if not me.get("admin"): raise ValueError("Not allowed")
                return self.send_j(200, MH.health(MH.CTX))
            if path == "/api/game":
                with WL:
                    if not guest_by_token(wallets(), tok): raise PermissionError("signed out")
                key = str(body.get("key", ""))
                if not re.fullmatch(r"(nfl|nba|nhl|mlb):\d{1,12}", key): raise ValueError("No such game")
                return self.send_j(200, sports_game(key))
            if path == "/api/sports":
                with WL:
                    me = guest_by_token(wallets(), tok)
                    if not me: raise PermissionError("signed out")
                    if not me.get("admin"): raise ValueError("Not allowed")
                return self.send_j(200, {"games": sports_list(), "delay": SP["delay"], "auto": SP["auto"]})
            if path.startswith("/api/push/"):
                with WL:
                    me = guest_by_token(wallets(), tok)
                    if not me: raise PermissionError("signed out")
                ep = body.get("endpoint") or (body.get("sub") or {}).get("endpoint", "")
                if path == "/api/push/key": return self.send_j(200, {"key": PUSH.public_key()})
                if path == "/api/push/subscribe": return self.send_j(200, {"prefs": PUSH.subscribe(me["id"], body["sub"], body.get("prefs"))})
                if path == "/api/push/prefs": return self.send_j(200, {"prefs": PUSH.set_prefs(me["id"], ep, body.get("prefs") or {})})
                if path == "/api/push/state": return self.send_j(200, {"prefs": PUSH.prefs_of(me["id"], ep)})
                if path == "/api/push/unsubscribe": PUSH.unsubscribe(me["id"], ep); return self.send_j(200, {"ok": True})
                if path == "/api/push/test": PUSH.notify("Party app 🎉", "Notifications are working on this phone.", wid=me["id"], tag="test"); return self.send_j(200, {"ok": True})
                return self.send_j(404, {"error": "not found"})
            if path == "/api/say":
                with WL: w = wallets(); me = guest_by_token(w, tok)
                if not me: raise PermissionError("signed out")
                if guest_off(): raise ValueError("Guest requests are turned off")
                return self.send_j(200, {"ok": True, "msg": wall_say(me, body.get("text", ""), body.get("reply"))})
            if path.startswith("/api/admin/"): return self.send_j(200, {"ok": True, "msg": admin_act(tok, path[11:], body)})
            if path in ("/api/request", "/api/bump", "/api/voteskip", "/api/skipnow"): return self.send_j(200, {"ok": True, "msg": guest_act(tok, path[5:], body)})
        except PermissionError as e: return self.send_j(401, {"error": str(e)})
        except ValueError as e: return self.send_j(400, {"error": str(e)})
        except (OSError, KeyError, TypeError, ET.ParseError, urllib.error.HTTPError): return self.send_j(502, {"error": "The speaker didn't answer"})
        self.send_j(404, {"error": "not found"})

TLS_DIR = TLSM.TS_DIR                           # fullchain.pem + privkey.pem (Let's Encrypt or Tailscale): when they are here the phone page is also served over HTTPS
TLS = {"ctx": None, "at": 0.0}
BOUND = set()                                                    # the ports the guest server actually got
def tls_ctx():
    """the current TLS context; the certificate files are re-read every few hours, so a renewed certificate is picked up without a restart"""
    import ssl
    cert, key = os.path.join(TLS_DIR, "fullchain.pem"), os.path.join(TLS_DIR, "privkey.pem")
    if not (os.path.exists(cert) and os.path.exists(key)): return None
    if TLS["ctx"] is None or time.time() - TLS["at"] > 6 * 3600:
        c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain(cert, key); TLS["ctx"], TLS["at"] = c, time.time()
    return TLS["ctx"]
class GuestServer(ThreadingHTTPServer):
    secure = False
    def get_request(self):
        conn, addr = self.socket.accept()
        if self.secure:
            try: ctx = TLSM.server_context()
            except Exception as e: conn.close(); raise OSError("no certificate: " + str(e)[:60])
            conn = ctx.wrap_socket(conn, server_side=True, do_handshake_on_connect=False)     # (the handshake happens in the request's own thread)
        return conn, addr
    def finish_request(self, request, client_address):
        if self.secure:
            try: request.settimeout(10); request.do_handshake(); request.settimeout(None)
            except OSError: return
        super().finish_request(request, client_address)
def guest_serve():
    def run(port, secure=False):
        told = False
        while True:
            try:
                srv = GuestServer(("0.0.0.0", port), GuestH); srv.secure = secure; BOUND.add(port); srv.serve_forever(); return
            except PermissionError as e:                                   # ports 80/443 need the machine setting (it can be lost on a reboot): keep trying, it starts the moment the setting is back
                if port >= 1024: print(f"guest server on :{port}:", e, flush=True); return
                if not told: print(f"guest server on :{port}: {e} (will keep trying)", flush=True); told = True
                time.sleep(20)
            except OSError as e: print(f"guest server on :{port}:", e, flush=True); return
    base = int(os.environ.get("GUEST_PORT", 8766))
    ports = [(base, False), (80, False), (8443, True), (443, True)]       # (80 and 443 only work once the machine allows low ports for ordinary programs; the TLS ports answer once a certificate exists)
    for port, sec in ports[1:]: threading.Thread(target=run, args=(port, sec), daemon=True).start()
    run(*ports[0])

def ts_name():
    """this machine's Tailscale address (https://<machine>.<tailnet>.ts.net), if Tailscale is installed and signed in"""
    import shutil, subprocess
    if not shutil.which("tailscale"): return ""
    try: return (json.loads(subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=8).stdout).get("Self") or {}).get("DNSName", "").rstrip(".")
    except (OSError, ValueError, subprocess.SubprocessError): return ""
CERT = {"ok": None, "msg": "not tried yet", "at": 0.0}
def ts_cert_once():
    """asks Tailscale for this machine's HTTPS certificate (needs `sudo tailscale set --operator=$USER` once, and "HTTPS Certificates" switched on in the Tailscale admin console)"""
    import subprocess
    name = ts_name()
    if not name: CERT.update(ok=False, msg="Tailscale is not signed in", at=time.time()); return False
    os.makedirs(TLS_DIR, exist_ok=True)
    c, k = os.path.join(TLS_DIR, "fullchain.pem"), os.path.join(TLS_DIR, "privkey.pem")
    r = subprocess.run(["tailscale", "cert", "--cert-file", c + ".new", "--key-file", k + ".new", name], capture_output=True, text=True, timeout=90)
    if r.returncode != 0 or not os.path.exists(c + ".new"):
        CERT.update(ok=False, msg=(r.stdout + r.stderr).strip().split("\n")[0][:140] or "failed", at=time.time()); return False
    os.chmod(k + ".new", 0o600); os.replace(k + ".new", k); os.replace(c + ".new", c); TLSM.reset_ts()
    CERT.update(ok=True, msg=f"certificate for {name}", at=time.time()); return True
def ts_cert_loop():
    time.sleep(20)
    while True:
        try: ts_cert_once()
        except Exception as e: CERT.update(ok=False, msg=repr(e)[:100], at=time.time())
        time.sleep(86400 if CERT["ok"] else 1800)                       # (renewed daily: Tailscale only issues a new one when it's close to expiring)

def guest_public_url():
    """what the QR code and the "scan to join" screens should point guests at: ~/.config/mirror/guest_url when set (a domain), otherwise this machine's address"""
    try:
        u = open(os.path.join(CFG_DIR, "guest_url")).read().strip()
        if u.startswith(("http://", "https://")): return u if u.endswith("/") else u + "/"
    except OSError: pass
    return f"http://{lan_ip()}/" if 80 in BOUND else f"http://{lan_ip()}:8766/"

threading.Thread(target=guest_serve, daemon=True).start()
threading.Thread(target=ts_cert_loop, daemon=True).start()
