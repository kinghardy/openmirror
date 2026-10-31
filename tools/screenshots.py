#!/usr/bin/env python3
"""Screenshots for the README, made from the real pages with made-up data: no personal data, no third-party artwork.

    python3 tools/screenshots.py                      all scenes into docs/assets/screens/
    python3 tools/screenshots.py --only home,player   just these

It serves this folder on a spare local port with a fake mirror behind it (one song with generated cover art, the weather, the theme list,
a channel layout as on a fresh install), opens each scene in headless Chrome or Chromium at 1080 x 1920 and saves a PNG.
The real mirror server and your settings are not touched: the fake one uses a temporary settings folder."""

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = tempfile.mkdtemp(prefix="openmirror-demo-")
os.environ["OPENMIRROR_CONFIG"] = CFG  # (before the mirror modules are imported: they read it once)
sys.path.insert(0, ROOT)
import mirror_channels as CH  # noqa: E402
import mirror_themes as TH  # noqa: E402

# the film is not part of the public project: picture the page as an install from GitHub shows it
CH.has_promo = lambda: False

# scene: (page, theme, what the demo script does once the page has loaded, window size, scale)
KIOSK, PHONE = ("1080,1920", 1), ("390,844", 3)
SCENES = {
    "home": ("index.html", "wii", "home", *KIOSK),
    "home-halloween": ("index.html", "halloween", "home", *KIOSK),
    "player": ("index.html", "wii", "player", *KIOSK),
    "xbox": ("index.html", "wii", "xbox", *KIOSK),
    "options": ("index.html", "wii", "options", *KIOSK),
    "settings": ("index.html", "wii", "settings", *KIOSK),
    "phone": ("guest.html", "wii", "phone", *PHONE),
}

# made-up songs and bands; the covers are drawn below
SONGS = [
    ("Afterglow Avenue", "Lumen Lane", "Night Drive Tapes", ""),
    ("Paper Satellites", "The Velvet Orbit", "Paper Satellites", "Maya"),
    ("Low Tide Lights", "Coral & Pine", "Harbor Songs", "Sam"),
    ("Static Summer", "Neon Harbor", "Static Summer", "Our Pick"),
    ("Golden Hour Radio", "Juniper Ray", "Golden Hour Radio", "Jordan"),
]
SONG = {"ok": True, "state": "playing", "title": SONGS[0][0], "artist": SONGS[0][1], "album": SONGS[0][2], "art": "/__demo/cover0.svg",
        "source": "Apple Music", "dur": 214, "pos": 83, "volume": 32}  # fmt: skip

PALETTES = [  # sky top, sky middle, sky bottom, motif light, motif dark
    ("#1b0b3a", "#6d1f6b", "#ff7a59", "#ffe27a", "#ff4f8b"),
    ("#06142e", "#123b6d", "#3fa7d6", "#b8f3ff", "#5ad1e6"),
    ("#04261f", "#0d5c4a", "#f2b880", "#fff1c9", "#ff9e6b"),
    ("#2a0838", "#8a1c7c", "#ffb347", "#fff07a", "#ff6f91"),
    ("#2b1600", "#a3541b", "#ffd27f", "#fff6d6", "#ffb03b"),
]


def cover(i):
    """an abstract cover, drawn here so the screenshots carry no third-party artwork"""
    t, m, b, lt, dk = PALETTES[i % len(PALETTES)]
    name = SONGS[i % len(SONGS)][1].upper()
    sky = f'<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{t}"/><stop offset=".55" stop-color="{m}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
    sky += f'<linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{lt}"/><stop offset="1" stop-color="{dk}"/></linearGradient><clipPath id="c"><circle cx="300" cy="300" r="150"/></clipPath></defs><rect width="600" height="600" fill="url(#s)"/>'
    if i % 5 == 0:  # striped sun over a grid
        art = (
            '<g clip-path="url(#c)"><rect x="150" y="150" width="300" height="300" fill="url(#u)"/>'
            + "".join(
                f'<rect x="150" y="{318 + k * 26}" width="300" height="{4 + k * 3}" fill="{m}"/>' for k in range(6)
            )
            + "</g>"
        )
        art += (
            f'<g stroke="{lt}" stroke-opacity=".45" stroke-width="2">'
            + "".join(f'<line x1="0" y1="{470 + k * k * 6}" x2="600" y2="{470 + k * k * 6}"/>' for k in range(6))
            + "".join(f'<line x1="300" y1="470" x2="{-600 + k * 200}" y2="600"/>' for k in range(10))
            + "</g>"
        )
    elif i % 5 == 1:  # rings
        art = "".join(
            f'<circle cx="300" cy="320" r="{40 + k * 34}" fill="none" stroke="url(#u)" stroke-width="{14 - k}" opacity="{1 - k * 0.09}"/>'
            for k in range(8)
        )
    elif i % 5 == 2:  # waves
        art = "".join(
            f'<path d="M0 {330 + k * 44} Q150 {290 + k * 44} 300 {330 + k * 44} T600 {330 + k * 44} V600 H0Z" fill="url(#u)" opacity="{0.25 + k * 0.15}"/>'
            for k in range(5)
        )
    elif i % 5 == 3:  # mountains under a moon
        art = f'<circle cx="420" cy="200" r="70" fill="{lt}"/><path d="M0 600 L170 300 L300 460 L420 330 L600 600Z" fill="{dk}"/><path d="M0 600 L120 430 L260 560 L380 420 L600 600Z" fill="{m}" opacity=".8"/>'
    else:  # dot grid
        art = "".join(
            f'<circle cx="{120 + x * 60}" cy="{170 + y * 60}" r="{6 + ((x + y) % 4) * 5}" fill="url(#u)"/>'
            for x in range(7)
            for y in range(7)
        )
    label = f'<text x="300" y="92" text-anchor="middle" font-family="Georgia,serif" font-size="34" letter-spacing="8" fill="{lt}">{name.replace("&", "&amp;")}</text>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">{sky}{art}{label}</svg>'


def guest_state():
    """what /api/state answers a signed-in guest (same shape as mirror_guests.guest_state)"""
    q = [
        {"n": k + 1, "id": str(k), "title": t, "artist": a, "art": f"/__demo/cover{k}.svg", "by": by}
        for k, (t, a, _, by) in enumerate(SONGS)
    ]
    wall = [
        ("Priya", "Happy birthday Jordan!! 🎂"),
        ("Sam", "Who picked the synthwave? This is perfect 🙌"),
        ("Maya", "Requesting a slow one next 😄"),
    ]
    econ = {
        "start": 300,
        "rate": 10,
        "cap": 2000,
        "request": 100,
        "bump": 250,
        "voteskip": 50,
        "skipnow": 500,
        "voters": 3,
        "max_queued": 3,
    }
    return {"name": "Maya", "coins": 640, "econ": econ, "open": True, "party": True, "here": [], "here_n": 7, "admin": False, "volume": 32,
            "now": {k: SONG[k] for k in ("title", "artist", "art", "state", "pos", "dur")}, "queue": q, "current": 1,
            "votes": {"have": 1, "need": 3, "mine": False}, "prompt": None,
            "wall": [{"id": k + 1, "name": n, "text": t, "reply": False, "pid": 0} for k, (n, t) in enumerate(wall)], "watch": []}  # fmt: skip


# runs first in <head>: a fixed date and time, skip the boot intro, pretend a controller is connected (so the legend shows its buttons),
# answer the weather from here (the page asks open-meteo directly), then set up the scene
DEMO_JS = r"""
(() => {
  const RealDate = Date, off = new RealDate(2026, 5, 12, 20, 15) - RealDate.now();   // a Friday evening in June (the clock, and no seasonal theme)
  window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); } static now() { return RealDate.now() + off; } };
  try { localStorage.setItem('wm-intro-boot', '1'); sessionStorage.setItem('omWelcome', '1'); localStorage.setItem('pt', 'demo'); localStorage.setItem('pn', 'Maya'); } catch (e) {}
  const pad = { connected: true, mapping: 'standard', id: 'demo', index: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => [pad];
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => String(u).startsWith('https://api.open-meteo.com')
    ? Promise.resolve(new Response(JSON.stringify({ current: { temperature_2m: 71, weather_code: 1 } }), { headers: { 'Content-Type': 'application/json' } }))
    : real(u, o);
  const scene = location.hash.slice(1);
  addEventListener('DOMContentLoaded', () => setTimeout(() => {
    if (scene === 'player') document.querySelector('.channel-tile[data-app="music"]').click();
    if (scene === 'options') [...document.querySelectorAll('.channel-tile')].find(t => /options/i.test(t.textContent)).click();
    if (scene === 'settings' && window.OpenMirrorSettings) OpenMirrorSettings.open();
  }, 1200));
})();
"""


class H(BaseHTTPRequestHandler):
    started = 0.0
    xbox = False  # (set per scene)
    wait = 4.0

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        body = (
            body
            if isinstance(body, bytes)
            else json.dumps(body).encode()
            if ctype == "application/json"
            else body.encode()
        )
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] == "/api/state":
            return self.send(200, guest_state())
        self.send(200, {})

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html", "/guest.html"):
            H.started = time.time()
            html = open(
                os.path.join(ROOT, "guest.html" if path == "/guest.html" else "index.html"), encoding="utf-8"
            ).read()
            html = html if path == "/guest.html" else CH.render_index(html)
            html = html.replace("<head>", '<head><script src="/__demo/demo.js"></script>', 1)
            # the load event waits for this picture, which the server sends after --wait seconds: headless Chrome shoots at load
            hold = '<img src="/__demo/hold.svg" alt="" style="position:fixed;width:1px;height:1px;opacity:0"></body>'
            return self.send(200, html.replace("</body>", hold, 1), "text/html")
        if path == "/__demo/demo.js":
            return self.send(200, DEMO_JS, "application/javascript")
        if path == "/__demo/hold.svg":
            time.sleep(H.wait)
            return self.send(200, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', "image/svg+xml")
        if path.startswith("/__demo/cover") and path.endswith(".svg") and path[13:-4].isdigit():
            return self.send(200, cover(int(path[13:-4])), "image/svg+xml")
        if path == "/sonos/now":
            return self.send(200, SONG)
        if path == "/mirror/config":
            return self.send(
                200,
                {"location": {"name": "Lisbon", "lat": 38.72, "lon": -9.14}, "units": "imperial", "first_run": False},
            )
        if path == "/theme/list":
            return self.send(200, TH.theme_list())
        if path == "/channels/list":
            return self.send(200, {"channels": CH.effective()})
        if path == "/mirror/xbox":  # the Xbox button, pressed once soon after the page loaded (xbox scene only)
            return self.send(200, {"n": int(H.xbox and time.time() - H.started > 2.5), "age": 0})
        if path.startswith("/themes/") and TH.theme_file(path):  # (themes/loader.js is an ordinary file below)
            return self.send(200, *TH.theme_file(path))
        if path == "/ha/api/states":  # the example lights in ha-config.js: two on, one off
            on = {"brightness": 200}
            return self.send(
                200,
                [
                    {"entity_id": "light.example_table", "state": "on", "attributes": on},
                    {"entity_id": "light.example_strip", "state": "on", "attributes": on},
                    {"entity_id": "light.example_stairs", "state": "off", "attributes": {}},
                ],
            )
        full = os.path.realpath(os.path.join(ROOT, path.lstrip("/")))
        if full.startswith(ROOT + os.sep) and os.path.isfile(full) and not full.endswith(".py"):
            ext = os.path.splitext(full)[1].lower()
            types = dict(
                TH.TYPES, **{".html": "text/html", ".mp3": "audio/mpeg", ".webmanifest": "application/manifest+json"}
            )
            with open(full, "rb") as fh:
                return self.send(200, fh.read(), types.get(ext, "application/octet-stream"))
        self.send(200, {})  # any other API: an empty answer, as from a mirror with nothing set up


def chrome():
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if shutil.which(name):
            return shutil.which(name)
    sys.exit("needs google-chrome or chromium on the PATH")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "assets", "screens"))
    ap.add_argument("--only", default="")
    ap.add_argument(
        "--wait", type=float, default=4.0, help="seconds each scene runs before the picture (animations settle)"
    )
    a = ap.parse_args()
    H.wait = a.wait
    os.makedirs(a.out, exist_ok=True)
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="openmirror-shots-")
    try:
        for name, (page, theme, scene, size, scale) in SCENES.items():
            if a.only and name not in a.only.split(","):
                continue
            TH.theme_set(theme)
            H.xbox = scene == "xbox"
            out = os.path.join(a.out, name + ".png")
            subprocess.run(
                [chrome(), "--headless=new", "--no-sandbox", "--hide-scrollbars", "--mute-audio", "--no-first-run",
                 f"--user-data-dir={profile}", f"--window-size={size}", f"--force-device-scale-factor={scale}", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
                 f"--screenshot={out}", f"http://127.0.0.1:{port}/{page}#{scene}"],
                check=False, capture_output=True, timeout=120,
            )  # fmt: skip
            print(("ok   " if os.path.exists(out) else "FAIL ") + out)
    finally:
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
        shutil.rmtree(CFG, ignore_errors=True)


if __name__ == "__main__":
    main()
