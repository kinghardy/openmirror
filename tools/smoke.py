#!/usr/bin/env python3
"""Smoke test for the mirror: run it after changing proxy.py (python3 tools/smoke.py). It talks to the running servers on this machine, so restart the
mirror service first. Read-only apart from one throw-away guest account, which it removes again. Exit code 0 = everything passed."""
import glob, json, os, py_compile, sys, time, urllib.error, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAILS, N = [], [0]
def ok(name, cond, detail=""):
    N[0] += 1; print(("  ok   " if cond else "  FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))
    if not cond: FAILS.append(name)
def get(url, timeout=25):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
    except Exception as e: return 0, str(e).encode()
def jget(url):
    s, b = get(url)
    try: return s, json.loads(b)
    except ValueError: return s, None
def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except ValueError: return e.code, None
    except Exception as e: return 0, None

print("python files compile")
for f in [os.path.join(ROOT, "proxy.py")] + sorted(glob.glob(os.path.join(ROOT, "mirror_*.py"))) + glob.glob(os.path.join(ROOT, "tools", "*.py")):
    try: py_compile.compile(f, doraise=True); ok(os.path.relpath(f, ROOT), True)
    except py_compile.PyCompileError as e: ok(os.path.relpath(f, ROOT), False, str(e)[:80])

import subprocess
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "check_names.py")], capture_output=True, text=True)
ok("no undefined names in any module", r.returncode == 0, r.stdout.replace("\n", "; ")[:200])
M, G = "http://127.0.0.1:8765", "http://127.0.0.1:8766"
print("dashboard server (8765)")
s, _ = get(M + "/index.html"); ok("index.html", s == 200)
for p in ("music.js", "sports.js", "sportsapp.js", "health.html", "guest.html"): ok(p, get(f"{M}/{p}")[0] == 200)
s, h = jget(M + "/mirror/health"); ok("health report", s == 200 and h and len(h["checks"]) > 10); 
if h: [ok("health: " + c["label"], c["ok"], c["detail"]) for c in h["checks"] if c["id"] in ("sonos", "ha", "sports", "autopilot", "pad_watch", "guest")]
for p in ("/launch/status", "/sonos/now", "/ha/api/states", "/mirror/quiet", "/games/save", "/mirror/sleep", "/mirror/xbox", "/music/picks", "/music/suggest?q=bea", "/posters/espn/basketball/nba/scoreboard"): ok("GET " + p, get(M + p)[0] == 200)
s, d = jget(M + "/music/lyrics?artist=Queen&title=Bohemian%20Rhapsody&dur=354"); ok("lyrics", s == 200 and d is not None)
s, d = jget(M + "/music/party"); ok("party state", s == 200 and "on" in (d or {}))
s, d = jget(M + "/music/queue"); ok("queue", s == 200 and "items" in (d or {}))
s, d = jget(M + "/music/search?q=queen"); ok("search finds Queen", s == 200 and d and any("queen" in x["artist"].lower() for x in d["songs"][:5]), str(d)[:80])
s, d = jget(M + "/music/search?q=bohemian%20rapsody"); ok("search survives a typo", s == 200 and d and any(x["artist"] == "Queen" for x in d["songs"][:3]))
s, d = jget(M + "/music/discover"); ok("discover shelves", s == 200 and d and len(d["shelves"]) >= 6, f"{len((d or {}).get('shelves', []))} shelves")
s, d = jget(M + "/sports/state"); ok("sports state", s == 200 and d and "games" in d)
s, d = jget(M + "/sports/board?lg=nba"); ok("sports board", s == 200 and d and "games" in d)
s, d = jget(M + "/sports/standings?lg=nfl"); ok("standings", s == 200 and d and d["groups"])
s, d = jget(M + "/sports/schedule?lg=nfl"); ok("schedule", s == 200 and d and d["events"])
s, d = jget(M + "/guest/info"); ok("guest info", s == 200 and d and "url" in d)
s, d = jget(M + "/wallet/list"); ok("wallets", s == 200 and isinstance(d, list) and any(w.get("host") for w in d))

s, d = jget(M + "/theme/list"); ok("themes listed", s == 200 and d and {"wii", "halloween"} <= {t["id"] for t in d["themes"]}, str((d or {}).get("mode")))
if d:
    for t in d["themes"]:
        for k in ("css", "phone_css", "js"):
            if k in t: ok(f"theme {t['id']} {k}", get(M + t[k])[0] == 200)
s, _ = get(M + "/themes/loader.js"); ok("theme loader", s == 200)

print("settings (local only, secrets never leave)")
def spost(path, body, headers=None, host=None):
    h = {"Content-Type": "application/json"}; h.update(headers or {})
    if host: h["Host"] = host
    req = urllib.request.Request(M + path, data=json.dumps(body).encode(), headers=h)
    try:
        with urllib.request.urlopen(req, timeout=25) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except ValueError: return e.code, None
SH = {"X-OpenMirror": "settings"}
s, st = jget(M + "/settings/state"); ok("settings state", s == 200 and st and any(x["key"] == "ha_token" for x in st["settings"]))
raw = json.dumps(st or {})
for name in ("ha_token", "tmdb_key"):                                   # a saved secret's real value must never appear in any response
    try: v = open(os.path.expanduser("~/.config/mirror/" + name)).read().strip()
    except OSError: v = ""
    ok(f"{name} is never sent back", not v or v not in raw)
s, d = spost("/settings/set", {"key": "sonos_ip", "value": "10.1.2.3"}); ok("writes need our header", s == 403)
s, d = spost("/settings/set", {"key": "sonos_ip", "value": "10.1.2.3"}, SH, host="evil.example"); ok("other host names are refused", s == 403)
s, d = spost("/settings/set", {"key": "ha_url", "value": "javascript:alert(1)"}, SH); ok("a bad address is rejected", s == 400)
s, d = spost("/settings/set", {"key": "nope", "value": "x"}, SH); ok("unknown settings are rejected", s == 400)
if st and not [x for x in st["settings"] if x["key"] == "sonos_ip"][0]["set"]:           # (only touches the speaker-address setting, and only when it is unset)
    s, d = spost("/settings/set", {"key": "sonos_ip", "value": "10.1.2.3"}, SH); ok("a setting can be saved", s == 200 and [x for x in d["settings"] if x["key"] == "sonos_ip"][0]["value"] == "10.1.2.3")
    ok("saved files are private (0600)", (os.stat(os.path.expanduser("~/.config/mirror/sonos_ip")).st_mode & 0o777) == 0o600)
    s, d = spost("/settings/clear", {"key": "sonos_ip"}, SH); ok("a setting can be removed", s == 200 and not [x for x in d["settings"] if x["key"] == "sonos_ip"][0]["set"])
s, d = spost("/settings/test", {"key": "ha_token"}, SH); ok("Home Assistant test", s == 200 and d and d["ok"], (d or {}).get("message", ""))
s, w = jget(M + "/settings/wifi"); ok("wifi list", s == 200 and w is not None and "networks" in w)

print("channels (home screen tiles from manifests)")
import html as _html, re as _re, tempfile, shutil
sys.path.insert(0, ROOT)
import mirror_channels as CHN
TILE = _re.compile(r'<div class="channel-tile" data-app="(\w+)">\s*<div class="channel-icon">(.*?)</div>\s*<div class="channel-title">(.*?)</div>\s*<div class="channel-subtitle"(?: id="([\w-]+)")?>(.*?)</div>\s*</div>', _re.S)
tiles_of = lambda t: [(a, _html.unescape(b).strip(), _html.unescape(c), d, _html.unescape(e)) for a, b, c, d, e in TILE.findall(t)]
cfgfile = os.path.expanduser("~/.config/mirror/channels.json"); before = open(cfgfile, "rb").read() if os.path.exists(cfgfile) else None
try:
    s, d = jget(M + "/channels/list"); ok("channel list", s == 200 and d and len(d["channels"]) >= 11 and all("permissions" in c for c in d["channels"]))
    s, page = get(M + "/"); page = page.decode()
    raw = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    ok("the home page is built from the manifests", s == 200 and "data-app=\"system\"" in page and "om:tiles:start" in page)
    got = {t[0]: (t[2], t[4]) for t in tiles_of(page)}
    ok("every channel shows the name and subtitle it should", all(c["id"] in got and got[c["id"]][0] == c["name"] for c in d["channels"]), str(got)[:100])
    cfg_old, vars_old = CHN.CONFIG, CHN.subtitle_vars                  # with a clean config the page equals the generic markup that ships in index.html
    CHN.CONFIG = os.path.join(tempfile.gettempdir(), "no-such-channels.json"); CHN.subtitle_vars = lambda: {"location": "Set your location"}
    try: ok("a clean install gets the generic home screen", tiles_of(CHN.render_index(raw)) == tiles_of(raw), f"{len(tiles_of(CHN.render_index(raw)))} vs {len(tiles_of(raw))}")
    finally: CHN.CONFIG, CHN.subtitle_vars = cfg_old, vars_old
    s, d = spost("/settings/channels", {"action": "rename", "id": "pool", "text": "Pool <b>x</b>"}, SH); nm = [c for c in d["channels"] if c["id"] == "pool"][0]["name"] if s == 200 else ""
    ok("a rename strips markup", s == 200 and "<" not in nm and nm.startswith("Pool"), nm)
    ok("a renamed channel shows on the home page", "<b>" not in get(M + "/")[1].decode().split('data-app="pool"')[1][:300])
    s, d = spost("/settings/channels", {"action": "rename", "id": "pool", "text": ""}, SH); ok("an empty name restores the default", s == 200 and [c for c in d["channels"] if c["id"] == "pool"][0]["name"] == [c for c in d["channels"] if c["id"] == "pool"][0]["default_name"])
    s, d = spost("/settings/channels", {"action": "hide", "id": "system"}, SH); ok("the settings channel can't be hidden", s == 400)
    s, d = spost("/settings/channels", {"action": "hide", "id": "tv"}); ok("tile changes need our header", s == 403)
    s, d = spost("/settings/channels", {"action": "hide", "id": "tv"}, SH); ok("a channel can be hidden", s == 200 and [c for c in d["channels"] if c["id"] == "tv"][0]["hidden"])
    ok("a hidden channel leaves the home page", "data-app=\"tv\"" not in get(M + "/")[1].decode())
    s, d = spost("/settings/channels", {"action": "move", "id": "sports", "dir": -1}, SH); ok("a channel can move up", s == 200 and [c["id"] for c in d["channels"]].index("sports") == [c["id"] for c in d["channels"]].index("posters") - 1)
    s, d = spost("/settings/channels", {"action": "reset"}, SH); ok("reset restores the default layout", s == 200 and not any(c["hidden"] for c in d["channels"]) and [c["id"] for c in d["channels"]][:2] == ["pool", "lights"])
    s, d = spost("/settings/channels", {"action": "hide", "id": "nope"}, SH); ok("unknown channels are rejected", s == 400)
finally:
    if before is None:
        try: os.remove(cfgfile)
        except OSError: pass
    else: open(cfgfile, "wb").write(before)
tmp = tempfile.mkdtemp(); old = CHN.CHANNELS_DIR
try:                                                     # manifests with permissions that do not exist are not loaded
    for cid, perms in (("good", ["controller"]), ("bad", ["root_access"]), ("net", ["network:api.example.com"]), ("badnet", ["network:evil"])):
        os.makedirs(os.path.join(tmp, cid)); json.dump({"id": cid, "name": cid, "permissions": perms}, open(os.path.join(tmp, cid, "channel.json"), "w"))
    os.makedirs(os.path.join(tmp, "mismatch")); json.dump({"id": "other", "name": "x", "permissions": []}, open(os.path.join(tmp, "mismatch", "channel.json"), "w"))
    CHN.CHANNELS_DIR = tmp; got = set(CHN.load_manifests())
    ok("unknown permissions are refused", got == {"good", "net"}, str(sorted(got)))
finally: CHN.CHANNELS_DIR = old; shutil.rmtree(tmp, ignore_errors=True)

print("personal settings (location, house name, time zone)")
s, d = jget(M + "/mirror/config"); ok("page config", s == 200 and d is not None and "location" in d and "house" in d and "ha_token" not in json.dumps(d))
ok("page config has the game names", bool(d) and bool(d.get("games_name")) and bool(d.get("slots_name")))
s, d = spost("/settings/location", {"name": "Nowhere", "lat": 999, "lon": 0}, SH); ok("a place outside the map is refused", s == 400)
s, d = spost("/settings/location", {"name": "", "lat": 10, "lon": 10}, SH); ok("a place needs a name", s == 400)
s, d = spost("/settings/set", {"key": "tz", "value": "Not/AZone"}, SH); ok("an unknown time zone is refused", s == 400)
s, d = spost("/settings/set", {"key": "house_name", "value": "x"}, SH); ok("a house name must be 2-16 characters", s == 400)
s, d = spost("/settings/set", {"key": "units", "value": "furlongs"}, SH); ok("units must be imperial or metric", s == 400)
s, d = spost("/settings/geocode", {"q": "a"}, SH); ok("a place search needs a few letters", s == 400)
s, d = spost("/settings/geocode", {"q": "Paris"}); ok("a place search needs our header", s == 403)

print("getting started (speaker picker, checklist, first run)")
import mirror_sonos as _MS
ok("a speaker description is read", _MS.parse_speaker("1.2.3.4", "<r><roomName>Kitchen</roomName><modelName>Sonos One</modelName></r>") == ("Kitchen", "Sonos One"))
s, d = jget(M + "/settings/speakers"); ok("speakers are found", s == 200 and d is not None and isinstance(d["speakers"], list))
s, d = jget(M + "/settings/checklist"); ok("the checklist has the basics", s == 200 and d and {"wifi", "speaker", "location"} <= {x["id"] for x in d["steps"]} and all("view" in x and "detail" in x for x in d["steps"]))
ok("this mirror is already set up (no welcome screen)", d is not None and d["first_run"] is False)
s, d = jget(M + "/mirror/config"); ok("the page learns it is not a first run", d is not None and d["first_run"] is False)
s, d = spost("/settings/setup_done", {}); ok("finishing setup needs our header", s == 403)
s, d = spost("/settings/set", {"key": "sonos_ip", "value": "not-an-ip"}, SH); ok("a speaker address must be an IP address", s == 400)

print("phone setup (pairing code, sessions, secure-only secrets)")
import ssl
CTX = ssl._create_unverified_context()
def gp(base, method, path, body=None, cookie=None, headers=None):
    h = {"Content-Type": "application/json", "X-OpenMirror": "setup"}; h.update(headers or {})
    if cookie: h["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r: return r.status, json.loads(r.read() or b"{}"), r.headers.get("Set-Cookie", "")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read()), ""
        except ValueError: return e.code, None, ""
    except Exception as e: return 0, {"error": str(e)}, ""
def newcode():
    spost("/settings/pair", {"action": "new"}, SH); s_, d_ = jget(M + "/settings/pair"); return (d_ or {}).get("code")
GH, GS_ = "http://127.0.0.1:8766", "https://127.0.0.1:8443"
s, d = jget(M + "/settings/pair"); ok("pairing status (mirror only)", s == 200 and d and "urls" in d)
s, d = spost("/settings/pair", {"action": "new"}); ok("making a code needs our header", s == 403)
s, d, _ = gp(GH, "GET", "/setup/api/state"); ok("no session: refused", s == 401)
code = newcode(); ok("the mirror makes a 6-digit code", bool(code) and len(code) == 6 and code.isdigit())
s, d, _ = gp(GH, "POST", "/setup/api/pair", {"code": "000000" if code != "000000" else "111111"}); ok("a wrong code is refused", s == 403)
s, d, _ = gp(GH, "POST", "/setup/api/pair", {"code": code}, headers={"X-OpenMirror": ""}); ok("pairing needs our header", s == 403)
s, d, _ = gp(GH, "POST", "/setup/api/pair", {"code": code}, headers={"Host": "evil.example.com"}); ok("a public host name is refused", s == 403)
s, d, ck = gp(GH, "POST", "/setup/api/pair", {"code": code}); ok("the right code pairs", s == 200 and "om_setup=" in ck and "HttpOnly" in ck and "SameSite=Strict" in ck)
cookie = ck.split(";")[0]
s, d, _ = gp(GH, "POST", "/setup/api/pair", {"code": code}); ok("a code works only once", s == 403)
s, st, _ = gp(GH, "GET", "/setup/api/state", cookie=cookie); ok("a session sees the settings", s == 200 and st and st["secure"] is False and any(x["key"] == "ha_token" for x in st["settings"]))
ok("no saved secret is in the session response", not any(v and v in json.dumps(st) for v in [open(os.path.expanduser("~/.config/mirror/" + n)).read().strip() for n in ("ha_token", "tmdb_key") if os.path.exists(os.path.expanduser("~/.config/mirror/" + n))]))
s, d, _ = gp(GH, "POST", "/setup/api/set", {"key": "ha_url", "value": "http://127.0.0.1:8123"}, cookie=cookie); ok("sensitive settings are refused on the unencrypted address", s == 403)
s, d, _ = gp(GH, "POST", "/setup/api/set", {"key": "tmdb_key", "value": "x" * 30}, cookie=cookie); ok("keys are refused on the unencrypted address", s == 403)
s, d, _ = gp(GH, "POST", "/setup/api/set", {"key": "ha_url", "value": "http://127.0.0.1:8123"}); ok("changes need a session", s == 401)
if st: s, d, _ = gp(GH, "POST", "/setup/api/theme", {"mode": st["themes"]["mode"]}, cookie=cookie); ok("theme can be set from the phone", s == 200)
spost("/settings/pair", {"action": "cancel"}, SH); s, d, _ = gp(GH, "GET", "/setup/api/state", cookie=cookie); ok("cancelling on the mirror ends the session", s == 401)
if get(GS_ + "/ping")[0] == 0 and False: pass
code = newcode(); s, d, ck = gp(GS_, "POST", "/setup/api/pair", {"code": code})
if s == 200:
    ok("the secure address marks the cookie Secure", "Secure" in ck); cookie = ck.split(";")[0]
    s, d, _ = gp(GS_, "GET", "/setup/api/state", cookie=cookie); ok("secure session reports secure", s == 200 and d["secure"] is True)
    s, d, _ = gp(GS_, "POST", "/setup/api/set", {"key": "ha_url", "value": "javascript:alert(1)"}, cookie=cookie); ok("secure address still validates input", s == 400)
else: print("  skip: the encrypted port is not up")
spost("/settings/pair", {"action": "cancel"}, SH)
for i in range(5): gp(GH, "POST", "/setup/api/pair", {"code": "999999"})
code = newcode(); ok("wrong guesses are limited per address", gp(GH, "POST", "/setup/api/pair", {"code": "000000"})[0] in (403, 429))
spost("/settings/pair", {"action": "cancel"}, SH)

print("guest server (8766)")
s, b = get(G + "/"); ok("guest page", s == 200 and b"Party" in b)
s, d = jget(G + "/theme/list"); ok("guest server lists themes", s == 200 and d and d["themes"])
s, b = get(G + "/themes/loader.js"); ok("guest server serves the loader", s == 200)
s, b = get(G + "/themes/halloween/phone.css"); ok("phone theme css", s == 200 and b"--ac" in b)
s, b = get(G + "/themes/..%2Fproxy.py"); ok("guest themes path is contained", s == 404)
s, d = post(G + "/api/state", {"token": "nope"}); ok("a bad token is refused", s == 401)
s, d = post(G + "/api/admin/transport", {"token": "nope", "cmd": "next"}); ok("admin actions need an admin", s == 401)
s, info = jget(M + "/guest/info")
if info and info["open"]:
    name = "zz smoke " + str(int(time.time()) % 1000); s, d = post(G + "/api/join", {"name": name, "pin": "0000"}); ok("join", s == 200 and d and "token" in d)
    if s == 200:
        tok = d["token"]; s, st = post(G + "/api/state", {"token": tok}); ok("guest state", s == 200 and st and st["coins"] > 0 and not st["admin"])
        s, d = post(G + "/api/admin/transport", {"token": tok, "cmd": "next"}); ok("a plain guest can't run the speaker", s == 400)
        s, d = post(G + "/api/search", {"token": tok, "q": "queen"}); ok("guest search", s == 200 and d and d["songs"])
    f = os.path.expanduser("~/.local/share/mirror/wallets.json")
    try: w = json.load(open(f)); w.pop(name.lower(), None); json.dump(w, open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    except OSError: pass
else: print("  skip guest join (guest requests are off or Party mode is off)")

print(f"\n{N[0] - len(FAILS)}/{N[0]} passed" + ("" if not FAILS else "  FAILED: " + ", ".join(FAILS)))
sys.exit(1 if FAILS else 0)
