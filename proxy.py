#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, parse_qsl
import hashlib
import json
import mirror_health as MH
import mirror_sports as SPT
import os
import re
import subprocess
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from mirror_catalog import (
    RESOLVE,
    SHELF,
    lyrics_get,
    music_album,
    music_artist,
    music_chart,
    music_discover,
    music_facts,
    music_search2,
    music_suggest,
)
from mirror_guests import push_sports, setup_urls
import mirror_pairing as PAIR
from mirror_guests import (
    BOUND,
    ECON,
    WALL,
    WL,
    guest_off,
    guest_open,
    guest_present,
    guest_public_url,
    ts_name,
    CERT,
    wall_view,
    wallets,
    wallets_save,
)
from mirror_launch import ARCADE, YOUTUBE, arcade_proc, arcade_running, es_idle_watch, pinball_state, youtube_running
from mirror_sports import (
    SGAMES,
    SP,
    sp_watched,
    sports_act,
    sports_board,
    sports_game,
    sports_list,
    sports_schedule,
    sports_standings,
    sports_state,
)
from mirror_party import PARTY_LOG, music_play, party_on, party_queue, party_set, picks_act, picks_load, queue_act
from mirror_posters import commons_fetch, poster_fetch
from mirror_power import PAD, REMOTE, SLEEP, XBOX, sleep_set
from mirror_sonos import SONOS, sonos_addr, sonos_do, sonos_now
import mirror_channels as CH
import mirror_setup as SETUP
import mirror_network as NET
import mirror_settings as SET
from mirror_themes import theme_list, theme_set
from mirror_util import CFG_DIR, GAMES_FILE, ITUNES, local_request_ok, _jload, _jsave, mget, secret

DIR = os.environ.get("MIRROR_DIR", os.path.dirname(os.path.abspath(__file__)))


# Home Assistant: the address and token are settings (read on every request, so changing them on the settings screen needs no restart)
def ha_url():
    return SET.get("ha_url").rstrip("/")


def ha_token():
    return SET.get("ha_token", "")


ALLOW_GET = re.compile(r"^/api/states(/(light|switch|scene|media_player)\.[a-z0-9_]+)?$")

ALLOW_POST = re.compile(r"^/api/services/(light|switch|scene)/(turn_on|turn_off|toggle)$")


_WEB = {"at": 0.0, "sig": ""}


def web_build():
    """a fingerprint of the files the mirror page is made of: when it changes (a new version was deployed) the page reloads itself once the room is idle"""
    if time.time() - _WEB["at"] < 2:
        return _WEB["sig"]
    h = hashlib.sha1()
    try:
        for root, dirs, files in os.walk(DIR):
            dirs[:] = sorted(d for d in dirs if d not in (".git", "promo", "tools", "docs", "__pycache__"))
            for f in sorted(files):
                if (
                    root == DIR
                    and f in ("index.html", "posters-curated.json")
                    or root == DIR
                    and f.endswith(".js")
                    or root != DIR
                    and f.endswith((".js", ".css", ".json"))
                ):
                    p = os.path.join(root, f)
                    h.update(f"{os.path.relpath(p, DIR)}:{int(os.path.getmtime(p))}:".encode())
        for extra in (CH.CONFIG, os.path.join(CFG_DIR, "ha-config.js")):
            if os.path.exists(extra):
                h.update(f"{os.path.basename(extra)}:{int(os.path.getmtime(extra))}:".encode())
    except OSError:
        pass
    _WEB.update(at=time.time(), sig=h.hexdigest()[:12])
    return _WEB["sig"]


NEXT = object()  # a GET method returns this to say "not mine": the static file server answers instead


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def proxy(self, method):
        path = self.path[3:]  # strip "/ha"
        if not (ALLOW_GET if method == "GET" else ALLOW_POST).match(path.split("?")[0]):
            return self.send_error(403)
        body = None
        if method == "POST":
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if method == "POST":  # LOGCALL
            import time

            print(time.strftime("%H:%M:%S"), path, body.decode()[:200], flush=True)
        req = urllib.request.Request(
            ha_url() + path,
            data=body,
            method=method,
            headers={"Authorization": "Bearer " + ha_token(), "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                code, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, data = e.code, e.read()
        except Exception:
            code, data = 502, b"{}"
        if method == "GET" and path.split("?")[0] == "/api/states" and code == 200:  # ha-filter
            import json

            data = json.dumps(
                [x for x in json.loads(data) if x["entity_id"].split(".")[0] in ("light", "scene")]
            ).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def posters(self):
        u = urlsplit(self.path)
        parts = u.path.split("/", 3)  # ['', 'posters', 'tmdb'|'sports', path]
        if len(parts) >= 3 and parts[2] == "commons":
            code, data = commons_fetch(parse_qsl(u.query))  # /posters/commons?cat=...
        elif len(parts) < 4 or parts[2] not in ("tmdb", "sports", "espn"):
            return self.send_error(404)
        else:
            code, data = poster_fetch(parts[2], parts[3], parse_qsl(u.query))
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def sonos_art(self):
        p = dict(parse_qsl(urlsplit(self.path).query)).get("p", "")
        ip = sonos_addr()
        if not ip or not p.startswith("/getaa"):
            return self.send_error(404)
        try:
            with urllib.request.urlopen(f"http://{ip}:1400{p}", timeout=5) as r:
                data, ctype = r.read(), r.headers.get("Content-Type", "image/jpeg")
        except OSError:
            return self.send_error(502)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def local_request(self, post=False):
        """see mirror_util.local_request_ok: only the mirror's own pages (and local programs) get an answer"""
        ok = local_request_ok(self.headers, post)
        if not ok:
            self.send_json(403, {"error": "this server only answers the mirror's own pages"})
        return ok

    def settings_guard(self, post=False):
        """the settings API is for the mirror's own screen: it only answers requests addressed to localhost, and writes need our own header (a web page on another site cannot send one)"""
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        if host not in ("127.0.0.1", "localhost"):
            self.send_json(403, {"error": "settings are only available on the mirror itself"})
            return False
        if post and (
            self.headers.get("X-OpenMirror") != "settings"
            or not (self.headers.get("Content-Type") or "").startswith("application/json")
        ):
            self.send_json(403, {"error": "bad request"})
            return False
        return True

    # ---- reading a request body ----
    def read_json(self, limit=1000, lenient=False):
        """the JSON body of a POST (at most `limit` bytes). A bad one sends 400 and returns None; with lenient=True it is just an empty dict"""
        try:
            return json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), limit)) or b"{}")
        except ValueError:
            if lenient:
                return {}
            self.send_json(400, {"error": "bad json"})
            return None

    def send_file_bytes(self, data, ctype, cache="no-store"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(data)

    # ================= GET: one small method per endpoint =================
    def get_home(self):  # the home page, with its tiles built from the channel manifests
        try:
            with open(os.path.join(DIR, "index.html"), encoding="utf-8") as f:
                raw = f.read()
        except OSError:
            return self.send_error(404)
        return self.send_file_bytes(CH.render_index(raw).encode(), "text/html; charset=utf-8")

    def get_page_config(self):  # (what the page needs from the settings; nothing secret)
        return self.send_json(
            200,
            {
                "location": SET.location(),
                "units": SET.get("units"),
                "house": SET.get("house_name"),
                "games_name": SET.get("games_name"),
                "slots_name": SET.get("slots_name"),
                "first_run": SET.first_run(),
            },
        )

    def get_local_lights(self):  # the owner's own lights file: it replaces the shipped example when it exists
        try:
            with open(os.path.join(CFG_DIR, "ha-config.js"), "rb") as f:
                b = f.read(200000)
        except OSError:
            b = b"// no local lights file\n"
        return self.send_file_bytes(b, "application/javascript")

    def get_channels(self):
        return self.send_json(200, {"channels": CH.effective()})

    def get_settings_speakers(self):
        if not self.settings_guard():
            return
        from mirror_sonos import discover_speakers

        return self.send_json(200, {"speakers": discover_speakers(), "current": SONOS["ip"] or ""})

    def get_settings_checklist(self):
        if not self.settings_guard():
            return
        pad = next((c for c in MH.health(MH.CTX)["checks"] if c["id"] == "pad"), {})
        return self.send_json(
            200,
            {
                "steps": SETUP.checklist(bool(sonos_now().get("ok")), bool(pad.get("ok")), guest_public_url()),
                "first_run": SET.first_run(),
            },
        )

    def get_settings_pair(self):
        if not self.settings_guard():
            return
        return self.send_json(200, dict(PAIR.status(), urls=setup_urls()))

    def get_settings_state(self):
        if not self.settings_guard():
            return
        return self.send_json(200, {"settings": SET.view()})

    def get_settings_wifi(self):
        if not self.settings_guard():
            return
        return self.send_json(200, NET.wifi_state("rescan=1" in self.path))

    def get_theme_list(self):
        return self.send_json(200, theme_list())

    def get_launch_status(self):
        return self.send_json(
            200, {"running": arcade_running(), "pinball": pinball_state(), "youtube": youtube_running()}
        )

    # sports and music: a table of path -> function of the query, so each is one line
    SPORTS_GET = {
        "/sports/board": lambda qs: sports_board(qs.get("lg", "nfl"), qs.get("date", "")),
        "/sports/game": lambda qs: sports_game(qs.get("key", "")),
        "/sports/standings": lambda qs: sports_standings(qs.get("lg", "nfl")),
        "/sports/schedule": lambda qs: sports_schedule(qs.get("lg", "nfl")),
        "/sports/info": lambda qs: {"games": sports_list(), "delay": SP["delay"], "auto": SP["auto"]},
    }
    MUSIC_GET = {
        "/music/search": lambda qs: music_search2(qs.get("q", "")),
        "/music/discover": lambda qs: music_discover(qs.get("seed", ""), qs.get("only", "")),
        "/music/chart": lambda qs: music_chart(
            "albums" if qs.get("kind") == "albums" else "songs", qs.get("genre", "")
        ),
        "/music/party": lambda qs: {"on": party_on()},
        "/music/picks": lambda qs: picks_load(),
        "/music/facts": lambda qs: music_facts(qs.get("artist", "")[:80], qs.get("title", "")[:100], qs.get("id", "")),
        "/music/queue": lambda qs: party_queue(),
        "/music/lyrics": lambda qs: lyrics_get(qs.get("artist", ""), qs.get("title", ""), qs.get("dur", "")),
        "/music/suggest": lambda qs: music_suggest(qs.get("q", "")),
        "/music/artist": lambda qs: music_artist(qs.get("id", ""), qs.get("name", "")),
        "/music/album": lambda qs: music_album(qs.get("id", "0"), qs.get("resolve") == "1"),
    }

    def get_sports(self):
        u = urlsplit(self.path)
        fn = self.SPORTS_GET.get(u.path)
        if fn is None:
            return NEXT  # not one of ours: the static file server gets it (and says 404)
        try:
            return self.send_json(200, fn(dict(parse_qsl(u.query))))
        except (OSError, ValueError, KeyError, IndexError, TypeError, urllib.error.HTTPError) as e:
            return self.send_json(502, {"error": str(e)[:100]})

    def get_sports_state(self):
        return self.send_json(200, sports_state(int(dict(parse_qsl(urlsplit(self.path).query)).get("since", 0) or 0)))

    def get_music(self):
        u = urlsplit(self.path)
        fn = self.MUSIC_GET.get(u.path)
        if fn is None:
            return self.send_error(404)
        try:
            return self.send_json(200, fn(dict(parse_qsl(u.query))))
        except (OSError, ValueError, KeyError, ET.ParseError):
            return self.send_json(502, {"error": "Apple Music catalog unreachable"})

    def get_wallets(self):
        with WL:
            w = wallets()
        return self.send_json(
            200,
            [
                {"id": x["id"], "name": x["name"], "coins": int(x["coins"]), "host": bool(x.get("host"))}
                for x in sorted(w.values(), key=lambda x: (not x.get("host"), x["name"].lower()))
            ],
        )

    def get_guest_info(self):
        with WL:
            w = wallets()
        here = guest_present(w)
        cnt = {}
        for e in PARTY_LOG:
            cnt[e["by"]] = cnt.get(e["by"], 0) + 1
        board = [
            {
                "name": x["name"],
                "coins": int(x["coins"]),
                "here": x["name"] in here,
                "admin": bool(x.get("admin")),
                "songs": cnt.get(x["name"], 0),
            }
            for x in w.values()
            if not x.get("host")
        ]
        return self.send_json(
            200,
            {
                "open": guest_open(),
                "off": guest_off(),
                "url": guest_public_url(),
                "alt": ["party.local"],
                "family": ("https://" + ts_name() + "/") if CERT["ok"] and ts_name() else "",
                "here": here,
                "board": board,
                "wall": wall_view(30),
                "prompt": WALL["prompt"] if WALL["prompt"]["text"] else None,
                "econ": ECON,
            },
        )

    def get_sleep(self):
        return self.send_json(200, dict(SLEEP))

    def get_health(self):
        return self.send_json(200, MH.health(MH.CTX))

    def get_xbox(self):
        MH.beat("page")
        return self.send_json(
            200,
            {
                "build": web_build(),
                "n": XBOX["n"],
                "age": round(time.time() - XBOX["at"], 1) if XBOX["at"] else 999,
                "r": {"n": REMOTE["n"], "cmds": [c for c in REMOTE["cmds"] if time.time() - c["at"] < 6]},
            },
        )

    def get_sonos_now(self):
        return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})

    def get_quiet(self):
        return self.send_json(200, {"enabled": secret("quiet", "on") != "off"})

    def get_games_save(self):
        try:
            with open(GAMES_FILE) as f:
                return self.send_json(200, json.load(f))
        except (OSError, ValueError):
            return self.send_json(200, {})

    def get_sonos_art(self):
        return self.sonos_art()

    def get_ha(self):
        return self.proxy("GET")

    def get_posters(self):
        return self.posters()

    # How a GET finds its method. Order of lookup: BASE (the path without its query string), then EXACT (the whole path, query included, must
    # match: "/mirror/config?x=1" is not "/mirror/config"), then PREFIX (first match wins). Anything else, or a method answering NEXT, goes to
    # the static file server.
    GET_BASE = {"/": get_home, "/index.html": get_home, "/ha-config.local.js": get_local_lights}
    GET_EXACT = {
        "/mirror/config": get_page_config,
        "/channels/list": get_channels,
        "/settings/speakers": get_settings_speakers,
        "/settings/checklist": get_settings_checklist,
        "/settings/pair": get_settings_pair,
        "/settings/state": get_settings_state,
        "/theme/list": get_theme_list,
        "/launch/status": get_launch_status,
        "/wallet/list": get_wallets,
        "/guest/info": get_guest_info,
        "/mirror/sleep": get_sleep,
        "/mirror/health": get_health,
        "/mirror/xbox": get_xbox,
        "/sonos/now": get_sonos_now,
        "/mirror/quiet": get_quiet,
        "/games/save": get_games_save,
    }
    GET_PREFIX = [
        ("/settings/wifi", get_settings_wifi),
        ("/sports/state", get_sports_state),
        ("/sports/", get_sports),
        ("/music/", get_music),
        ("/sonos/art?", get_sonos_art),
        ("/ha/", get_ha),
        ("/posters/", get_posters),
    ]

    def do_GET(self):
        if not self.local_request():
            return
        fn = self.GET_BASE.get(self.path.split("?")[0]) or self.GET_EXACT.get(self.path)
        if fn is None:
            fn = next((f for prefix, f in self.GET_PREFIX if self.path.startswith(prefix)), None)
        if fn is None or fn(self) is NEXT:
            super().do_GET()

    # ================= POST: one small method per endpoint =================
    def post_launch_youtube(self):
        if not youtube_running():
            try:
                subprocess.Popen(
                    [YOUTUBE],
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except OSError as e:
                return self.send_json(500, {"error": str(e)})
        return self.send_json(200, {"running": True})

    def post_launch_arcade(self):  # /launch/arcade and /launch/pinball
        kind = self.path.rsplit("/", 1)[1]
        if kind == "pinball":
            st = pinball_state()
            if not st["ready"]:
                return self.send_json(409, {"error": st["why"]})
        if not arcade_running():
            try:
                arcade_proc[0] = subprocess.Popen(
                    [ARCADE] + (["pinball"] if kind == "pinball" else []),
                    start_new_session=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except OSError as e:
                return self.send_json(500, {"error": str(e)})
        return self.send_json(200, {"running": True})

    def post_music_state(self):  # /music/party, /music/queue, /music/picks
        body = self.read_json(100000)
        if body is None:
            return
        try:
            if self.path == "/music/party":
                party_set(bool(body.get("on")))
            elif self.path == "/music/picks":
                return self.send_json(200, picks_act(body))
            else:
                queue_act(body)
        except ValueError:
            return self.send_json(400, {"error": "bad request"})
        except urllib.error.HTTPError:
            return self.send_json(409, {"error": "the speaker refused that"})
        except (OSError, KeyError, TypeError):
            return self.send_json(502, {"error": "speaker unreachable"})
        return self.send_json(200, {"on": party_on()})

    def post_music_play(self):
        body = self.read_json(100000)
        if body is None:
            return
        try:
            music_play(
                body.get("tracks", []),
                body.get("start", 0),
                body.get("mode", "now") if body.get("mode") in ("now", "next", "add") else "now",
                body.get("by") or "Guest",
            )
        except ValueError as e:
            return self.send_json(400, {"error": str(e) or "no songs"})
        except urllib.error.HTTPError:
            return self.send_json(409, {"error": "the speaker refused that"})
        except (OSError, KeyError, TypeError):
            return self.send_json(502, {"error": "speaker unreachable"})
        return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})

    def post_games_save(
        self,
    ):  # Hardy Party Games: credits, best wins... (the kiosk's browser profile is wiped at every boot, so they live here)
        data = self.read_json(200000)
        if data is None:
            return
        if not isinstance(data, dict):
            return self.send_json(400, {"error": "expected an object"})
        os.makedirs(os.path.dirname(GAMES_FILE), exist_ok=True)
        with open(GAMES_FILE + ".tmp", "w") as f:
            json.dump(data, f)
        os.replace(GAMES_FILE + ".tmp", GAMES_FILE)
        return self.send_json(200, {"ok": True})

    def post_mirror_admin(self):  # /mirror/restart and /mirror/backup
        body = self.read_json(500, lenient=True)
        try:
            return self.send_json(
                200,
                {
                    "msg": MH.restart(MH.CTX, bool(body.get("force")))
                    if self.path == "/mirror/restart"
                    else "Backed up: " + os.path.basename(MH.backup_now())
                },
            )
        except ValueError as e:
            return self.send_json(409, {"error": str(e)})
        except OSError as e:
            return self.send_json(500, {"error": str(e)[:100]})

    def post_sports_act(self):
        try:
            body = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 2000)) or b"{}")
            return self.send_json(
                200, {"msg": sports_act(str(body.get("act", "")), body), "delay": SP["delay"], "auto": SP["auto"]}
            )
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})

    def post_wallet_set(self):
        body = self.read_json(1000)
        if body is None:
            return
        with WL:
            w = wallets()
            if body.get("id") not in w:
                return self.send_json(404, {"error": "no such wallet"})
            w[body["id"]]["coins"] = max(0, int(body.get("coins", 0)))
            wallets_save(w)
        return self.send_json(200, {"ok": True})

    def post_guest_admin(self):
        body = self.read_json(1000)
        if body is None:
            return
        with WL:
            w = wallets()
            t = w.get(str(body.get("id", "")).lower())
            if not t or t.get("host"):
                return self.send_json(404, {"error": "no such guest"})
            t["admin"] = bool(body.get("on"))
            wallets_save(w)
        return self.send_json(200, {"ok": True, "id": t["id"], "admin": t["admin"]})

    def post_guest_open(self):
        body = self.read_json(1000)
        if body is None:
            return
        os.makedirs(CFG_DIR, exist_ok=True)
        with open(os.path.join(CFG_DIR, "guests"), "w") as f:
            f.write("auto" if body.get("on") else "off")
        return self.send_json(200, {"open": guest_open(), "off": guest_off()})

    def post_sleep(self):
        body = self.read_json(1000)
        if body is None:
            return
        sleep_set(body.get("on"))
        return self.send_json(200, dict(SLEEP))

    # /settings/*: each endpoint is a function of the request body that returns the answer; the guard, the body and the error answers are shared
    def _settings_pair(self, body):
        PAIR.new_code() if body.get("action") == "new" else PAIR.cancel()
        return dict(PAIR.status(), urls=setup_urls())

    def _settings_channels(self, body):
        return {
            "channels": CH.act(
                str(body.get("action", "")),
                str(body.get("id", "")),
                int(body.get("dir", 0) or 0),
                str(body.get("text", "")),
            )
        }

    def _settings_setup_done(self, body):
        SET.mark_setup_done()
        return {"first_run": SET.first_run()}

    def _settings_geocode(self, body):
        return {"places": SET.geocode(body.get("q", ""))}

    def _settings_location(self, body):
        SET.set_location(body.get("name", ""), body.get("lat"), body.get("lon"))
        return {"settings": SET.view()}

    def _settings_set(self, body):
        SET.set_value(str(body.get("key", "")), body.get("value", ""))
        if body.get("key") == "sonos_ip":
            SONOS.update(ip=None, tried=0.0)  # (look for the speaker again at the new address)
        return {"settings": SET.view()}

    def _settings_clear(self, body):
        SET.clear(str(body.get("key", "")))
        return {"settings": SET.view()}

    def _settings_test(self, body):
        ok, msg = SET.test(str(body.get("key", "")))
        return {"ok": ok, "message": msg}

    def _settings_wifi(self, body):
        ok, msg = NET.wifi_connect(str(body.get("ssid", "")), str(body.get("password", "")))
        return {"ok": ok, "message": msg}

    SETTINGS_POST = {
        "/settings/pair": _settings_pair,
        "/settings/channels": _settings_channels,
        "/settings/setup_done": _settings_setup_done,
        "/settings/geocode": _settings_geocode,
        "/settings/location": _settings_location,
        "/settings/set": _settings_set,
        "/settings/clear": _settings_clear,
        "/settings/test": _settings_test,
        "/settings/wifi": _settings_wifi,
    }

    def post_settings(self):
        if not self.settings_guard(True):
            return
        body = self.read_json(4000)
        if body is None:
            return
        fn = self.SETTINGS_POST.get(self.path)
        if fn is None:
            return self.send_json(404, {"error": "not found"})
        try:
            return self.send_json(200, fn(self, body))
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})

    def post_theme_set(self):
        try:
            return self.send_json(
                200,
                {
                    "mode": theme_set(
                        json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 500)) or b"{}").get(
                            "mode", "auto"
                        )
                    )
                },
            )
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})

    def post_quiet(
        self,
    ):  # "the mirror stays silent while the Sonos plays music" on/off (read by tools/audio_policy.py)
        body = self.read_json(100000)
        if body is None:
            return
        on = bool(body.get("enabled", True))
        with open(os.path.join(CFG_DIR, "quiet"), "w") as f:
            f.write("on" if on else "off")
        return self.send_json(200, {"enabled": on})

    def post_sonos(self):
        cmd = self.path[7:]
        body = self.read_json(100000)
        if body is None:
            return
        try:
            sonos_do(cmd, body)
        except ValueError:
            return self.send_json(404, {"error": "unknown command"})
        except urllib.error.HTTPError:
            return self.send_json(409, {"error": "speaker refused that"})
        except (OSError, KeyError, TypeError):
            return self.send_json(502, {"error": "speaker unreachable"})
        return self.send_json(200, {k: v for k, v in sonos_now().items() if k not in ("curi", "cmeta")})

    def post_ha(self):
        return self.proxy("POST")

    # How a POST finds its method: EXACT (the whole path, query included), then PREFIX (first match wins), otherwise 405.
    POST_EXACT = {
        "/launch/youtube": post_launch_youtube,
        "/launch/arcade": post_launch_arcade,
        "/launch/pinball": post_launch_arcade,
        "/music/party": post_music_state,
        "/music/queue": post_music_state,
        "/music/picks": post_music_state,
        "/music/play": post_music_play,
        "/games/save": post_games_save,
        "/mirror/restart": post_mirror_admin,
        "/mirror/backup": post_mirror_admin,
        "/sports/act": post_sports_act,
        "/wallet/set": post_wallet_set,
        "/guest/admin": post_guest_admin,
        "/guest/open": post_guest_open,
        "/mirror/sleep": post_sleep,
        "/theme/set": post_theme_set,
        "/mirror/quiet": post_quiet,
    }
    POST_PREFIX = [("/settings/", post_settings), ("/sonos/", post_sonos), ("/ha/", post_ha)]

    def do_HEAD(self):
        if self.local_request():
            super().do_HEAD()

    def do_POST(self):
        if not self.local_request(post=True):
            return
        fn = self.POST_EXACT.get(self.path)
        if fn is None:
            fn = next((f for prefix, f in self.POST_PREFIX if self.path.startswith(prefix)), None)
        if fn is None:
            return self.send_error(405)
        fn(self)


SPT.HOOKS.append(push_sports)
SPT.init(MH=MH, SLEEP=SLEEP, _jload=_jload, _jsave=_jsave, mget=mget, sleep_set=sleep_set)
SPT.start()


MH.CTX.update(
    {
        "sonos_now": lambda: sonos_now(),
        "ha_url": ha_url,
        "ha_token": ha_token,
        "itunes": ITUNES,
        "resolved": lambda: sum(1 for v in RESOLVE.values() if v),
        "sleep": lambda: SLEEP,
        "guests": lambda: {
            "open": guest_open(),
            "here": len(guest_present(wallets())),
            "low_ports": 80 in BOUND and 443 in BOUND,
        },
        "watching": lambda: sum(1 for g in SGAMES.values() if sp_watched(g)),
        "shelves": lambda: len(SHELF),
        "games_running": lambda: arcade_running() or youtube_running(),
        "cert": lambda: CERT,
    }
)

MH.start_backups()
CH.freeze_existing()
SET.freeze_existing_setup()  # (an install that already has settings keeps exactly the tiles it has now)
threading.Thread(target=es_idle_watch, args=(lambda: time.time() - PAD["at"],), daemon=True).start()

ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", 8765))), H).serve_forever()
