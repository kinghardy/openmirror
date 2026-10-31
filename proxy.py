#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qsl, urlencode
import hashlib
import json
import mirror_health as MH
import mirror_sports as SPT
import os
import re
import subprocess
import threading
import time
import urllib.request, urllib.error, urllib.parse
import xml.etree.ElementTree as ET
from mirror_catalog import RESOLVE, SHELF, lyrics_get, music_album, music_artist, music_chart, music_discover, music_facts, music_search2, music_suggest
from mirror_guests import setup_urls
import mirror_pairing as PAIR
from mirror_guests import BOUND, ECON, WALL, WL, guest_off, guest_open, guest_present, guest_public_url, lan_ip, ts_name, CERT, wall_view, wallets, wallets_save
from mirror_launch import ARCADE, YOUTUBE, arcade_proc, arcade_running, es_idle_watch, pinball_state, youtube_running
from mirror_sports import SGAMES, SP, sp_watched, sports_act, sports_board, sports_game, sports_list, sports_schedule, sports_standings, sports_state
from mirror_party import PARTY_LOG, music_play, party_on, party_queue, party_set, picks_act, picks_load, queue_act
from mirror_posters import commons_fetch, poster_fetch
from mirror_power import PAD, REMOTE, SLEEP, XBOX, sleep_set
from mirror_sonos import SONOS, sonos_addr, sonos_do, sonos_now
import mirror_channels as CH
import mirror_setup as SETUP
import mirror_network as NET
import mirror_settings as SET
from mirror_themes import theme_list, theme_set
from mirror_util import CFG_DIR, GAMES_FILE, ITUNES, _jload, _jsave, mget, secret

DIR = os.environ.get("MIRROR_DIR", os.path.dirname(os.path.abspath(__file__)))

# Home Assistant: the address and token are settings (read on every request, so changing them on the settings screen needs no restart)
def ha_url(): return SET.get("ha_url").rstrip("/")
def ha_token(): return SET.get("ha_token", "")

ALLOW_GET = re.compile(r"^/api/states(/(light|switch|scene|media_player)\.[a-z0-9_]+)?$")

ALLOW_POST = re.compile(r"^/api/services/(light|switch|scene)/(turn_on|turn_off|toggle)$")





_WEB = {"at": 0.0, "sig": ""}
def web_build():
    """a fingerprint of the files the mirror page is made of: when it changes (a new version was deployed) the page reloads itself once the room is idle"""
    if time.time() - _WEB["at"] < 2: return _WEB["sig"]
    h = hashlib.sha1()
    try:
        for root, dirs, files in os.walk(DIR):
            dirs[:] = sorted(d for d in dirs if d not in (".git", "promo", "tools", "docs", "__pycache__"))
            for f in sorted(files):
                if (root == DIR and f in ("index.html", "posters-curated.json") or root == DIR and f.endswith(".js") or root != DIR and f.endswith((".js", ".css", ".json"))):
                    p = os.path.join(root, f); h.update(f"{os.path.relpath(p, DIR)}:{int(os.path.getmtime(p))}:".encode())
        if os.path.exists(CH.CONFIG): h.update(f"channels.json:{int(os.path.getmtime(CH.CONFIG))}:".encode())       # (the owner's tile choices)
    except OSError: pass
    _WEB.update(at=time.time(), sig=h.hexdigest()[:12]); return _WEB["sig"]

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIR, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def proxy(self, method):
        path = self.path[3:]  # strip "/ha"
        if not (ALLOW_GET if method == "GET" else ALLOW_POST).match(path.split("?")[0]):
            return self.send_error(403)
        body = None
        if method == "POST":
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if method == "POST":  # LOGCALL
            import time; print(time.strftime("%H:%M:%S"), path, body.decode()[:200], flush=True)
        req = urllib.request.Request(ha_url() + path, data=body, method=method,
              headers={"Authorization": "Bearer " + ha_token(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=8) as r: code, data = r.status, r.read()
        except urllib.error.HTTPError as e: code, data = e.code, e.read()
        except Exception: code, data = 502, b"{}"
        if method == "GET" and path.split("?")[0] == "/api/states" and code == 200:  # ha-filter
            import json
            data = json.dumps([x for x in json.loads(data) if x["entity_id"].split(".")[0] in ("light", "scene")]).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def posters(self):
        u = urlsplit(self.path)
        parts = u.path.split("/", 3)   # ['', 'posters', 'tmdb'|'sports', path]
        if len(parts) >= 3 and parts[2] == "commons": code, data = commons_fetch(parse_qsl(u.query))   # /posters/commons?cat=...
        elif len(parts) < 4 or parts[2] not in ("tmdb", "sports", "espn"): return self.send_error(404)
        else: code, data = poster_fetch(parts[2], parts[3], parse_qsl(u.query))
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def sonos_art(self):
        p = dict(parse_qsl(urlsplit(self.path).query)).get("p", "")
        ip = sonos_addr()
        if not ip or not p.startswith("/getaa"): return self.send_error(404)
        try:
            with urllib.request.urlopen(f"http://{ip}:1400{p}", timeout=5) as r: data, ctype = r.read(), r.headers.get("Content-Type", "image/jpeg")
        except OSError: return self.send_error(502)
        self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def settings_guard(self, post=False):
        """the settings API is for the mirror's own screen: it only answers requests addressed to localhost, and writes need our own header (a web page on another site cannot send one)"""
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        if host not in ("127.0.0.1", "localhost"): self.send_json(403, {"error": "settings are only available on the mirror itself"}); return False
        if post and (self.headers.get("X-OpenMirror") != "settings" or not (self.headers.get("Content-Type") or "").startswith("application/json")): self.send_json(403, {"error": "bad request"}); return False
        return True
    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):             # the home page, with its tiles built from the channel manifests
            try: raw = open(os.path.join(DIR, "index.html"), encoding="utf-8").read()
            except OSError: return self.send_error(404)
            b = CH.render_index(raw).encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.send_header("Cache-Control", "no-store"); self.end_headers(); return self.wfile.write(b)
        if self.path == "/mirror/config": return self.send_json(200, {"location": SET.location(), "units": SET.get("units"), "house": SET.get("house_name"), "games_name": SET.get("games_name"), "slots_name": SET.get("slots_name"), "first_run": SET.first_run()})       # (what the page needs from the settings; nothing secret)
        if self.path == "/channels/list": return self.send_json(200, {"channels": CH.effective()})
        if self.path == "/settings/speakers":
            if not self.settings_guard(): return
            from mirror_sonos import discover_speakers
            return self.send_json(200, {"speakers": discover_speakers(), "current": SONOS["ip"] or ""})
        if self.path == "/settings/checklist":
            if not self.settings_guard(): return
            pad = next((c for c in MH.health(MH.CTX)["checks"] if c["id"] == "pad"), {})
            return self.send_json(200, {"steps": SETUP.checklist(bool(sonos_now().get("ok")), bool(pad.get("ok")), guest_public_url()), "first_run": SET.first_run()})
        if self.path == "/settings/pair":
            if not self.settings_guard(): return
            return self.send_json(200, dict(PAIR.status(), urls=setup_urls()))
        if self.path == "/settings/state":
            if not self.settings_guard(): return
            return self.send_json(200, {"settings": SET.view()})
        if self.path.startswith("/settings/wifi"):
            if not self.settings_guard(): return
            return self.send_json(200, NET.wifi_state("rescan=1" in self.path))
        if self.path == "/theme/list": return self.send_json(200, theme_list())
        if self.path == "/launch/status": return self.send_json(200, {"running": arcade_running(), "pinball": pinball_state(), "youtube": youtube_running()})
        if self.path.startswith("/sports/") and not self.path.startswith("/sports/state"):
            u = urlsplit(self.path); qs = dict(parse_qsl(u.query))
            try:
                if u.path == "/sports/board": return self.send_json(200, sports_board(qs.get("lg", "nfl"), qs.get("date", "")))
                if u.path == "/sports/game": return self.send_json(200, sports_game(qs.get("key", "")))
                if u.path == "/sports/standings": return self.send_json(200, sports_standings(qs.get("lg", "nfl")))
                if u.path == "/sports/schedule": return self.send_json(200, sports_schedule(qs.get("lg", "nfl")))
                if u.path == "/sports/info": return self.send_json(200, {"games": sports_list(), "delay": SP["delay"], "auto": SP["auto"]})
            except (OSError, ValueError, KeyError, IndexError, TypeError, urllib.error.HTTPError) as e: return self.send_json(502, {"error": str(e)[:100]})
        if self.path.startswith("/sports/state"): return self.send_json(200, sports_state(int(dict(parse_qsl(urlsplit(self.path).query)).get("since", 0) or 0)))
        if self.path == "/wallet/list":
            with WL: w = wallets()
            return self.send_json(200, [{"id": x["id"], "name": x["name"], "coins": int(x["coins"]), "host": bool(x.get("host"))} for x in sorted(w.values(), key=lambda x: (not x.get("host"), x["name"].lower()))])
        if self.path == "/guest/info":
            with WL: w = wallets()
            here = guest_present(w); cnt = {}
            for e in PARTY_LOG: cnt[e["by"]] = cnt.get(e["by"], 0) + 1
            board = [{"name": x["name"], "coins": int(x["coins"]), "here": x["name"] in here, "admin": bool(x.get("admin")), "songs": cnt.get(x["name"], 0)} for x in w.values() if not x.get("host")]
            return self.send_json(200, {"open": guest_open(), "off": guest_off(), "url": guest_public_url(), "alt": ["party.local"], "family": ("https://" + ts_name() + "/") if CERT["ok"] and ts_name() else "", "here": here, "board": board, "wall": wall_view(30), "prompt": WALL["prompt"] if WALL["prompt"]["text"] else None, "econ": ECON})
        if self.path == "/mirror/sleep": return self.send_json(200, dict(SLEEP))
        if self.path == "/mirror/health": return self.send_json(200, MH.health(MH.CTX))
        if self.path == "/mirror/xbox": MH.beat("page"); return self.send_json(200, {"build": web_build(), "n": XBOX["n"], "age": round(time.time() - XBOX["at"], 1) if XBOX["at"] else 999, "r": {"n": REMOTE["n"], "cmds": [c for c in REMOTE["cmds"] if time.time() - c["at"] < 6]}})
        if self.path == "/sonos/now": return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})
        if self.path.startswith("/music/"):
            u = urlsplit(self.path); qs = dict(parse_qsl(u.query))
            try:
                if u.path == "/music/search": return self.send_json(200, music_search2(qs.get("q", "")))
                if u.path == "/music/discover": return self.send_json(200, music_discover(qs.get("seed", ""), qs.get("only", "")))
                if u.path == "/music/chart": return self.send_json(200, music_chart("albums" if qs.get("kind") == "albums" else "songs", qs.get("genre", "")))
                if u.path == "/music/party": return self.send_json(200, {"on": party_on()})
                if u.path == "/music/picks": return self.send_json(200, picks_load())
                if u.path == "/music/facts": return self.send_json(200, music_facts(qs.get("artist", "")[:80], qs.get("title", "")[:100], qs.get("id", "")))
                if u.path == "/music/queue": return self.send_json(200, party_queue())
                if u.path == "/music/lyrics": return self.send_json(200, lyrics_get(qs.get("artist", ""), qs.get("title", ""), qs.get("dur", "")))
                if u.path == "/music/suggest": return self.send_json(200, music_suggest(qs.get("q", "")))
                if u.path == "/music/artist": return self.send_json(200, music_artist(qs.get("id", ""), qs.get("name", "")))
                if u.path == "/music/album": return self.send_json(200, music_album(qs.get("id", "0"), qs.get("resolve") == "1"))
            except (OSError, ValueError, KeyError, ET.ParseError): return self.send_json(502, {"error": "Apple Music catalog unreachable"})
            return self.send_error(404)
        if self.path == "/mirror/quiet": return self.send_json(200, {"enabled": secret("quiet", "on") != "off"})
        if self.path == "/games/save":
            try: return self.send_json(200, json.load(open(GAMES_FILE)))
            except (OSError, ValueError): return self.send_json(200, {})
        if self.path.startswith("/sonos/art?"): return self.sonos_art()
        if self.path.startswith("/ha/"): return self.proxy("GET")
        if self.path.startswith("/posters/"): return self.posters()
        super().do_GET()
    def do_POST(self):
        if self.path == "/launch/youtube":
            if not youtube_running():
                try: subprocess.Popen([YOUTUBE], start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except OSError as e: return self.send_json(500, {"error": str(e)})
            return self.send_json(200, {"running": True})
        if self.path in ("/launch/arcade", "/launch/pinball"):
            kind = self.path.rsplit("/", 1)[1]
            if kind == "pinball":
                st = pinball_state()
                if not st["ready"]: return self.send_json(409, {"error": st["why"]})
            if not arcade_running():
                try: arcade_proc[0] = subprocess.Popen([ARCADE] + (["pinball"] if kind == "pinball" else []), start_new_session=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except OSError as e: return self.send_json(500, {"error": str(e)})
            return self.send_json(200, {"running": True})
        if self.path in ("/music/party", "/music/queue", "/music/picks"):
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 100000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            try:
                if self.path == "/music/party": party_set(bool(body.get("on")))
                elif self.path == "/music/picks": return self.send_json(200, picks_act(body))
                else: queue_act(body)
            except ValueError: return self.send_json(400, {"error": "bad request"})
            except urllib.error.HTTPError: return self.send_json(409, {"error": "the speaker refused that"})
            except (OSError, KeyError, TypeError): return self.send_json(502, {"error": "speaker unreachable"})
            return self.send_json(200, {"on": party_on()})
        if self.path == "/music/play":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 100000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            try: music_play(body.get("tracks", []), body.get("start", 0), body.get("mode", "now") if body.get("mode") in ("now", "next", "add") else "now", body.get("by") or "Guest")
            except ValueError as e: return self.send_json(400, {"error": str(e) or "no songs"})
            except urllib.error.HTTPError: return self.send_json(409, {"error": "the speaker refused that"})
            except (OSError, KeyError, TypeError): return self.send_json(502, {"error": "speaker unreachable"})
            return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})
        if self.path == "/games/save":       # Hardy Party Games: credits, best wins... (the kiosk's browser profile is wiped at every boot, so they live here)
            try: data = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 200000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            if not isinstance(data, dict): return self.send_json(400, {"error": "expected an object"})
            os.makedirs(os.path.dirname(GAMES_FILE), exist_ok=True)
            with open(GAMES_FILE + ".tmp", "w") as f: json.dump(data, f)
            os.replace(GAMES_FILE + ".tmp", GAMES_FILE)
            return self.send_json(200, {"ok": True})
        if self.path in ("/mirror/restart", "/mirror/backup"):
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 500)) or b"{}")
            except ValueError: body = {}
            try: return self.send_json(200, {"msg": MH.restart(MH.CTX, bool(body.get("force"))) if self.path == "/mirror/restart" else "Backed up: " + os.path.basename(MH.backup_now())})
            except ValueError as e: return self.send_json(409, {"error": str(e)})
            except OSError as e: return self.send_json(500, {"error": str(e)[:100]})
        if self.path == "/sports/act":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 2000)) or b"{}"); return self.send_json(200, {"msg": sports_act(str(body.get("act", "")), body), "delay": SP["delay"], "auto": SP["auto"]})
            except ValueError as e: return self.send_json(400, {"error": str(e)})
        if self.path == "/wallet/set":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 1000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            with WL:
                w = wallets()
                if body.get("id") not in w: return self.send_json(404, {"error": "no such wallet"})
                w[body["id"]]["coins"] = max(0, int(body.get("coins", 0))); wallets_save(w)
            return self.send_json(200, {"ok": True})
        if self.path == "/guest/admin":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 1000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            with WL:
                w = wallets(); t = w.get(str(body.get("id", "")).lower())
                if not t or t.get("host"): return self.send_json(404, {"error": "no such guest"})
                t["admin"] = bool(body.get("on")); wallets_save(w)
            return self.send_json(200, {"ok": True, "id": t["id"], "admin": t["admin"]})
        if self.path == "/guest/open":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 1000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            os.makedirs(CFG_DIR, exist_ok=True); open(os.path.join(CFG_DIR, "guests"), "w").write("auto" if body.get("on") else "off")
            return self.send_json(200, {"open": guest_open(), "off": guest_off()})
        if self.path == "/mirror/sleep":
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 1000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            sleep_set(body.get("on")); return self.send_json(200, dict(SLEEP))
        if self.path.startswith("/settings/"):
            if not self.settings_guard(True): return
            try: body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 4000)) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            try:
                if self.path == "/settings/pair": PAIR.new_code() if body.get("action") == "new" else PAIR.cancel(); return self.send_json(200, dict(PAIR.status(), urls=setup_urls()))
                if self.path == "/settings/channels": return self.send_json(200, {"channels": CH.act(str(body.get("action", "")), str(body.get("id", "")), int(body.get("dir", 0) or 0), str(body.get("text", "")))})
                if self.path == "/settings/setup_done": SET.mark_setup_done(); return self.send_json(200, {"first_run": SET.first_run()})
                if self.path == "/settings/geocode": return self.send_json(200, {"places": SET.geocode(body.get("q", ""))})
                if self.path == "/settings/location": SET.set_location(body.get("name", ""), body.get("lat"), body.get("lon")); return self.send_json(200, {"settings": SET.view()})
                if self.path == "/settings/set": SET.set_value(str(body.get("key", "")), body.get("value", "")); SONOS.update(ip=None, tried=0.0) if body.get("key") == "sonos_ip" else None; return self.send_json(200, {"settings": SET.view()})
                if self.path == "/settings/clear": SET.clear(str(body.get("key", ""))); return self.send_json(200, {"settings": SET.view()})
                if self.path == "/settings/test": ok, msg = SET.test(str(body.get("key", ""))); return self.send_json(200, {"ok": ok, "message": msg})
                if self.path == "/settings/wifi":
                    ok, msg = NET.wifi_connect(str(body.get("ssid", "")), str(body.get("password", ""))); return self.send_json(200, {"ok": ok, "message": msg})
            except ValueError as e: return self.send_json(400, {"error": str(e)})
            return self.send_json(404, {"error": "not found"})
        if self.path == "/theme/set":
            try: return self.send_json(200, {"mode": theme_set(json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 500)) or b"{}").get("mode", "auto"))})
            except ValueError as e: return self.send_json(400, {"error": str(e)})
        if self.path == "/mirror/quiet":     # "the mirror stays silent while the Sonos plays music" on/off (read by tools/audio_policy.py)
            try: on = bool(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}").get("enabled", True))
            except ValueError: return self.send_json(400, {"error": "bad json"})
            with open(os.path.join(CFG_DIR, "quiet"), "w") as f: f.write("on" if on else "off")
            return self.send_json(200, {"enabled": on})
        if self.path.startswith("/sonos/"):
            cmd = self.path[7:]
            try: body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            except ValueError: return self.send_json(400, {"error": "bad json"})
            try: sonos_do(cmd, body)
            except ValueError: return self.send_json(404, {"error": "unknown command"})
            except urllib.error.HTTPError: return self.send_json(409, {"error": "speaker refused that"})
            except (OSError, KeyError, TypeError): return self.send_json(502, {"error": "speaker unreachable"})
            return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})
        if self.path.startswith("/ha/"): return self.proxy("POST")
        self.send_error(405)

from mirror_guests import push_sports; SPT.HOOKS.append(push_sports)
SPT.init(MH=MH, SLEEP=SLEEP, _jload=_jload, _jsave=_jsave, mget=mget, sleep_set=sleep_set); SPT.start()



MH.CTX.update({"sonos_now": lambda: sonos_now(), "ha_url": ha_url, "ha_token": ha_token, "itunes": ITUNES, "resolved": lambda: sum(1 for v in RESOLVE.values() if v), "sleep": lambda: SLEEP,
        "guests": lambda: {"open": guest_open(), "here": len(guest_present(wallets())), "low_ports": 80 in BOUND and 443 in BOUND}, "watching": lambda: sum(1 for g in SGAMES.values() if sp_watched(g)), "shelves": lambda: len(SHELF),
        "games_running": lambda: arcade_running() or youtube_running(), "cert": lambda: CERT})

MH.start_backups()
CH.freeze_existing(); SET.freeze_existing_setup()                                              # (an install that already has settings keeps exactly the tiles it has now)
threading.Thread(target=es_idle_watch, args=(lambda: time.time() - PAD["at"],), daemon=True).start()

ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", 8765))), H).serve_forever()
