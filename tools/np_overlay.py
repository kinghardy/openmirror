#!/usr/bin/env python3
"""Now-playing card and Xbox menu drawn over ES-DE, RetroArch and Visual Pinball (the dashboard in Chrome is hidden behind them).

A borderless GTK popup: the window manager ignores it (no focus, no title bar) and clicks pass straight through,
so the controller keeps belonging to the game. Track info comes from the mirror's own proxy (/sonos/now).
 - in the ES-DE menus: full card for a few seconds on each new track / when ES-DE opens, then a small cover badge
 - inside a game: full card for a few seconds on each new track, then it gets out of the way
 - nothing is drawn while the dashboard itself is showing (it has its own card) or when nothing is playing
 - the Xbox menu: pad_quit.py (which owns the controller while it is open) sends its state as UDP JSON to 127.0.0.1:8766;
   this script only draws it (centered panel: now playing, prev / play-pause / next, volume, dashboard, resume)
NP_FORCE=menu|game shows the card regardless of what is running (for testing)."""

import ctypes
import io
import json
import math
import os
import socket
import threading
import time
import urllib.request
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkPixbuf", "2.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gtk, GdkPixbuf, GLib, GdkX11  # noqa: F401  (GdkX11 provides get_xid)
from PIL import Image, ImageDraw, ImageFont

PROXY = os.environ.get("MIRROR_URL", "http://127.0.0.1:8765")
SCREEN_W, TOP, RIGHT = 1080, 16, 40
DIMS = {"full": (430, 104, 28), "badge": (104, 104, 28), "menu": (920, 1270, 52)}  # width, height, corner radius
MENU_TOP = 300
SS = 2  # render at 2x, shrink for smooth edges
EXPAND_SECS, PAUSED_SECS = 6, 45
FONT = "/usr/share/fonts/truetype/noto/NotoSans-%s.ttf"
_fonts = {}


def font(weight, size):
    k = (weight, size)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(FONT % weight, int(size * SS))
    return _fonts[k]


st = {
    "np": {"ok": False},
    "got": 0.0,
    "ctx": None,
    "key": "",
    "expand_until": 0.0,
    "paused_at": 0.0,
    "was_playing": False,
    "art": None,
    "accent": (255, 90, 107),
    "ctx_prev": None,
    "art_url": "",
    "menu": None,
    "menu_at": 0.0,
    "menu_seq": 0,
    "menu_art": (None, None),
}


def running_context():
    """'game' while RetroArch / Visual Pinball run, 'menu' while only ES-DE does, else None"""
    forced = os.environ.get("NP_FORCE")
    if forced:
        return forced
    me = os.getpid()
    es = game = False
    for d in os.listdir("/proc"):
        if not d.isdigit() or int(d) == me:
            continue
        try:
            cmd = open(f"/proc/{d}/cmdline", "rb").read().decode(errors="replace").replace("\0", " ")
        except OSError:
            continue
        if "np_overlay" in cmd or cmd.startswith(("python", "/usr/bin/python", "bash", "/bin/bash", "sh ")):
            continue
        if "RetroArch" in cmd or "retroarch" in cmd or "VPinballX_GL.real" in cmd:
            game = True
        elif "ES-DE" in cmd:
            es = True
    return "game" if game else "menu" if es else None


def load_image(url, px):
    """square-cropped RGB PIL image of the cover, px*SS wide"""
    im = Image.open(
        io.BytesIO(urllib.request.urlopen(url if url.startswith("http") else PROXY + url, timeout=5).read())
    ).convert("RGB")
    s = min(im.size)
    l, t = (im.width - s) // 2, (im.height - s) // 2
    return im.crop((l, t, l + s, t + s)).resize((px * SS, px * SS), Image.LANCZOS)


def accent_of(im):
    r = g = b = w = 0.0
    for R, G, B in im.resize((21, 21)).getdata():
        mx, mn = max(R, G, B), min(R, G, B)
        k = ((mx - mn) / mx if mx else 0) ** 2 * mx + 1
        r += R * k
        g += G * k
        b += B * k
        w += k
    r, g, b = r / w, g / w, b / w
    boost = 255 / max(r, g, b, 1)  # brighten to a usable accent
    return tuple(min(255, int(v * boost * 0.95)) for v in (r, g, b))


def fetch_art(url):
    try:
        im = load_image(url, 84)
        return im, accent_of(im)
    except Exception:
        return None, st["accent"]


def poll_loop():
    while True:
        try:
            np = json.loads(urllib.request.urlopen(PROXY + "/sonos/now", timeout=4).read())
        except Exception:
            np = {"ok": False}
        ctx = running_context()
        art = accent = None
        url = np.get("art") or ""
        if np.get("ok") and url and url != st["art_url"]:
            art, accent = fetch_art(url)
        GLib.idle_add(update, np, ctx, url, art, accent)
        time.sleep(2)


def update(np, ctx, url, art, accent):
    now = time.time()
    key = f"{np.get('title')}|{np.get('artist')}" if np.get("ok") else ""
    if url != st["art_url"]:
        st["art"], st["art_url"] = art, url
        if accent:
            st["accent"] = accent
    if key and key != st["key"]:
        st["expand_until"] = now + EXPAND_SECS
    st["key"] = key
    if ctx == "menu" and st["ctx_prev"] != "menu":
        st["expand_until"] = now + EXPAND_SECS
    st["ctx_prev"] = ctx
    playing = np.get("state") == "playing"
    if playing:
        st["paused_at"] = 0.0
    elif st["was_playing"]:
        st["paused_at"] = now
    st["was_playing"] = playing
    st["np"], st["got"], st["ctx"] = np, now, ctx
    tick()
    return False


# ---- Xbox menu state (sent by pad_quit.py) --------------------------------------------------------------------------------------
def menu_listener():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", 8766))
    while True:
        data, _ = s.recvfrom(65535)
        try:
            m = json.loads(data)
        except ValueError:
            continue
        url = (m.get("np") or {}).get("art") or ""
        if m.get("open") and url and url != st["menu_art"][0]:

            def grab(u=url):
                try:
                    im = load_image(u, 360)
                except Exception:
                    im = None
                st["menu_art"] = (u, im)
                if im is not None and st["art_url"] != u:
                    st["accent"] = accent_of(im)

            st["menu_art"] = (url, None)
            threading.Thread(target=grab, daemon=True).start()
        GLib.idle_add(menu_update, m)


def menu_update(m):
    st["menu"], st["menu_at"] = m, time.time()
    st["menu_seq"] += 1
    tick()
    return False


def menu_active():
    m = st["menu"]
    return bool(
        m and m.get("open") and time.time() - st["menu_at"] < 1.5
    )  # a vanished sender hides the menu on its own


def visible_mode():
    """None (hidden), 'full', 'badge' or 'menu'"""
    if menu_active():
        return "menu"
    np, ctx, now = st["np"], st["ctx"], time.time()
    if not (ctx and np.get("ok") and np.get("title")):
        return None
    if not (
        os.environ.get("NP_FORCE")
        or np.get("state") == "playing"
        or (st["paused_at"] and now - st["paused_at"] < PAUSED_SECS)
    ):
        return None
    expanded = now < st["expand_until"]
    if ctx == "game":
        return "full" if expanded else None
    return "full" if expanded else "badge"


# ---- drawing ------------------------------------------------------------------------------------------------------------------
def fit(d, text, f, maxw):
    if d.textlength(text, font=f) <= maxw:
        return text
    while text and d.textlength(text + "…", font=f) > maxw:
        text = text[:-1]
    return text.rstrip() + "…"


def wrap(d, text, f, maxw, lines):
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= maxw:
            cur = t
        else:
            if cur:
                out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    if len(out) > lines:
        out = out[:lines]
        out[-1] = fit(d, out[-1] + "…", f, maxw)
    return out


def render_card(mode):
    np = st["np"]
    w, h, rad = DIMS[mode]
    W, Hh = w * SS, h * SS
    acc = st["accent"]
    im = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, Hh - 1), rad * SS, fill=(14, 12, 26, 255), outline=(60, 58, 72, 255), width=SS)
    art = st["art"] or Image.new("RGB", (84 * SS, 84 * SS), (38, 36, 58))
    m = Image.new("L", art.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, art.width - 1, art.height - 1), 18 * SS, fill=255)
    im.paste(art, (12 * SS, 10 * SS), m)
    playing = np.get("state") == "playing"
    if mode == "full":
        tx, mw = 112 * SS, 252 * SS
        d.text(
            (tx, 48 * SS),
            fit(d, np.get("title", ""), font("Bold", 27), mw),
            font=font("Bold", 27),
            fill=(255, 255, 255),
            anchor="ls",
        )
        d.text(
            (tx, 78 * SS),
            fit(d, np.get("artist") or np.get("source", ""), font("Regular", 22), mw),
            font=font("Regular", 22),
            fill=(194, 189, 224),
            anchor="ls",
        )
        t = time.time()
        for i in range(4):  # equalizer
            hh = 6 + (24 * (0.5 + 0.5 * math.sin(t * 6.5 - i * 1.3)) if playing else 0)
            x = (w - 46 + i * 10) * SS
            d.rounded_rectangle((x, (74 - hh) * SS, x + 6 * SS, 74 * SS), 3 * SS, fill=acc + (255,))
    dur = np.get("dur") or 0
    if dur:
        p = min(dur, np.get("pos", 0) + ((time.time() - st["got"]) if playing else 0))
        bar = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar)
        bd.rectangle((0, Hh - 4 * SS, W, Hh), fill=(255, 255, 255, 30))
        bd.rectangle((0, Hh - 4 * SS, int(W * p / dur), Hh), fill=acc + (255,))
        corner = Image.new("L", (W, Hh), 0)
        ImageDraw.Draw(corner).rounded_rectangle((0, 0, W - 1, Hh - 1), rad * SS, fill=255)
        im.paste(bar, (0, 0), Image.composite(bar.getchannel("A"), Image.new("L", (W, Hh), 0), corner))
    return im.resize((w, h), Image.LANCZOS)


def glyph(d, kind, cx, cy, s, fill):
    """transport glyphs, s = half height"""
    cx, cy, s = cx * SS, cy * SS, s * SS
    if kind == "play":
        d.polygon([(cx - s * 0.7, cy - s), (cx - s * 0.7, cy + s), (cx + s * 0.95, cy)], fill=fill)
    elif kind == "pause":
        for dx in (-0.6, 0.6):
            d.rounded_rectangle((cx + (dx - 0.32) * s, cy - s, cx + (dx + 0.32) * s, cy + s), s * 0.1, fill=fill)
    elif kind == "next":
        d.polygon([(cx - s * 0.9, cy - s), (cx - s * 0.9, cy + s), (cx + s * 0.7, cy)], fill=fill)
        d.rectangle((cx + s * 0.7, cy - s, cx + s * 1.05, cy + s), fill=fill)
    elif kind == "prev":
        d.polygon([(cx + s * 0.9, cy - s), (cx + s * 0.9, cy + s), (cx - s * 0.7, cy)], fill=fill)
        d.rectangle((cx - s * 1.05, cy - s, cx - s * 0.7, cy + s), fill=fill)


def render_menu():
    m = st["menu"]
    np = m.get("np") or {}
    row, col = m.get("row", 0), m.get("col", 1)
    w, h, rad = DIMS["menu"]
    W, Hh = w * SS, h * SS
    acc = st["accent"]
    S = lambda v: int(v * SS)
    soft = tuple(int(c + (255 - c) * 0.55) for c in acc)
    im = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, Hh - 1), S(rad), fill=(14, 12, 26, 255), outline=(70, 68, 90, 255), width=S(2))
    d.text((S(60), S(72)), "MENU", font=font("Bold", 26), fill=acc, anchor="ls")
    d.text((S(860), S(72)), "SONOS ERA 300", font=font("Bold", 22), fill=(120, 116, 150), anchor="rs")
    live = bool(np.get("ok") and np.get("title"))
    # cover + text
    art_url, art = st["menu_art"]
    box = Image.new("RGB", (S(360), S(360)), (34, 32, 54))
    if art is not None and art_url == np.get("art"):
        box = art
    mk = Image.new("L", box.size, 0)
    ImageDraw.Draw(mk).rounded_rectangle((0, 0, box.width - 1, box.height - 1), S(34), fill=255)
    im.paste(box, (S(60), S(110)), mk)
    if not (art is not None and art_url == np.get("art")):
        d.text((S(240), S(300)), "♪", font=font("Bold", 150), fill=(90, 86, 120), anchor="mm")
    tx, tw = S(450), S(410)
    if live:
        kick = ("NOW PLAYING" if np.get("state") == "playing" else "PAUSED") + " · " + (np.get("source") or "")
        d.text((tx, S(150)), fit(d, kick.upper(), font("Bold", 21), tw), font=font("Bold", 21), fill=soft, anchor="ls")
        y = 215
        for line in wrap(d, np.get("title", ""), font("Bold", 44), tw, 3):
            d.text((tx, S(y)), line, font=font("Bold", 44), fill=(255, 255, 255), anchor="ls")
            y += 52
        d.text(
            (tx, S(y + 14)),
            fit(d, np.get("artist", ""), font("Bold", 30), tw),
            font=font("Bold", 30),
            fill=soft,
            anchor="ls",
        )
        d.text(
            (tx, S(y + 56)),
            fit(d, np.get("album", ""), font("Regular", 24), tw),
            font=font("Regular", 24),
            fill=(150, 146, 176),
            anchor="ls",
        )
    else:
        d.text((tx, S(230)), "Nothing playing", font=font("Bold", 44), fill=(255, 255, 255), anchor="ls")
        for i, line in enumerate(
            wrap(
                d,
                "Start something in Apple Music and pick Era 300, or press play to resume.",
                font("Regular", 26),
                tw,
                4,
            )
        ):
            d.text((tx, S(285 + i * 36)), line, font=font("Regular", 26), fill=(150, 146, 176), anchor="ls")
    # progress
    dur = np.get("dur") or 0
    playing = np.get("state") == "playing"
    p = min(dur, np.get("pos", 0) + ((time.time() - np.get("at", time.time())) if playing else 0)) if dur else 0
    d.rounded_rectangle((S(60), S(505), S(860), S(515)), S(5), fill=(50, 48, 72))
    if dur:
        d.rounded_rectangle((S(60), S(505), S(60 + 800 * p / dur), S(515)), S(5), fill=acc)
    fm = lambda s: f"{int(s) // 60}:{int(s) % 60:02d}"
    if dur:
        d.text((S(60), S(555)), fm(p), font=font("Regular", 24), fill=(170, 166, 196), anchor="ls")
        d.text((S(860), S(555)), "-" + fm(max(0, dur - p)), font=font("Regular", 24), fill=(170, 166, 196), anchor="rs")
    # transport
    for i, (kind, cx, r) in enumerate(
        (("prev", 250, 78), ("pause" if playing else "play", 460, 100), ("next", 670, 78))
    ):
        on = row == 0 and col == i
        cy = 700
        if on:
            d.ellipse((S(cx - r - 10), S(cy - r - 10), S(cx + r + 10), S(cy + r + 10)), fill=acc)
        d.ellipse((S(cx - r), S(cy - r), S(cx + r), S(cy + r)), fill=(255, 255, 255) if on else (44, 42, 66))
        glyph(d, kind, cx, cy, r * 0.36, (18, 16, 28) if on else (255, 255, 255))
    # volume
    on = row == 1
    d.rounded_rectangle(
        (S(60), S(850), S(860), S(950)), S(50), fill=(34, 32, 54), outline=acc if on else None, width=S(5)
    )
    d.polygon(
        [(S(110), S(890)), (S(130), S(890)), (S(152), S(872)), (S(152), S(928)), (S(130), S(910)), (S(110), S(910))],
        fill=(255, 255, 255),
    )
    for k, rr in enumerate((16, 28)):
        d.arc((S(150 - rr + 8), S(900 - rr), S(150 + rr + 8), S(900 + rr)), -45, 45, fill=(255, 255, 255), width=S(4))
    vol = int(np.get("volume", 0))
    d.rounded_rectangle((S(215), S(893), S(755), S(907)), S(7), fill=(70, 68, 96))
    d.rounded_rectangle((S(215), S(893), S(215 + 540 * vol / 100), S(907)), S(7), fill=(255, 255, 255))
    d.text((S(830), S(912)), str(vol), font=font("Bold", 36), fill=(255, 255, 255), anchor="rs")
    # buttons
    for r, (label, y) in ((2, ("Back to Dashboard", 990)), (3, ("Resume", 1110))):
        on = row == r
        d.rounded_rectangle(
            (S(60), S(y), S(860), S(y + 100)),
            S(50),
            fill=(255, 255, 255) if on else (34, 32, 54),
            outline=acc if on else None,
            width=S(5),
        )
        d.text(
            (S(460), S(y + 50)), label, font=font("Bold", 36), fill=(18, 16, 28) if on else (255, 255, 255), anchor="mm"
        )
    d.text(
        (S(460), S(1245)),
        "D-Pad: Move / Adjust        A: Select        B: Back",
        font=font("Regular", 22),
        fill=(110, 106, 140),
        anchor="ms",
    )
    return im.resize((w, h), Image.LANCZOS)


def render(mode):
    return render_menu() if mode == "menu" else render_card(mode)


win = Gtk.Window(type=Gtk.WindowType.POPUP)  # override-redirect: no WM, no focus
win.set_accept_focus(False)
win.set_decorated(False)
view = Gtk.Image()
win.add(view)
shown = {"mode": None, "raised": 0.0, "paint": None, "seq": -1, "pt": 0.0}

# X11 Shape extension: round the corners and let every click fall through to the game
xlib, xext = ctypes.CDLL("libX11.so.6"), ctypes.CDLL("libXext.so.6")
xlib.XOpenDisplay.restype = ctypes.c_void_p
for fn in (xlib.XCreateBitmapFromData, xlib.XDefaultRootWindow):
    fn.restype = ctypes.c_ulong
dpy = xlib.XOpenDisplay(None)


def shape(xid, mode):
    w, h, rad = DIMS[mode]
    mask = Image.new("1", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), rad, fill=1)
    data = mask.tobytes("raw", "1;R")  # X bitmaps are LSB-first
    pm = xlib.XCreateBitmapFromData(
        ctypes.c_void_p(dpy), ctypes.c_ulong(xlib.XDefaultRootWindow(ctypes.c_void_p(dpy))), data, w, h
    )
    xext.XShapeCombineMask(
        ctypes.c_void_p(dpy), ctypes.c_ulong(xid), 0, 0, 0, ctypes.c_ulong(pm), 0
    )  # ShapeBounding, ShapeSet
    xext.XShapeCombineRectangles(ctypes.c_void_p(dpy), ctypes.c_ulong(xid), 2, 0, 0, None, 0, 0, 0)  # ShapeInput: empty
    xlib.XFreePixmap(ctypes.c_void_p(dpy), ctypes.c_ulong(pm))
    xlib.XFlush(ctypes.c_void_p(dpy))


def show_pixbuf(mode):
    im = render(mode)
    w, h = im.size
    view.set_from_pixbuf(
        GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(im.tobytes()), GdkPixbuf.Colorspace.RGB, True, 8, w, h, w * 4)
    )


def tick():
    mode = visible_mode()
    if mode != shown["mode"]:
        shown["mode"] = mode
        shown["paint"] = None
        if mode is None:
            win.hide()
        else:
            w, h, _ = DIMS[mode]
            x, y = ((SCREEN_W - w) // 2, MENU_TOP) if mode == "menu" else (SCREEN_W - RIGHT - w, TOP)
            win.hide()  # a mapped window keeps its old position when only resized (the menu ended up off-screen): re-place it from scratch
            show_pixbuf(mode)
            win.resize(w, h)
            win.move(x, y)
            win.show_all()
            gw = win.get_window()
            gw.move_resize(x, y, w, h)
            shape(gw.get_xid(), mode)
    if mode:
        now = time.time()
        gw = win.get_window()
        if mode != "menu":
            show_pixbuf(mode)
        elif now - shown["pt"] > 0.5 or (
            st["menu_seq"] != shown["seq"] and now - shown["pt"] > 0.1
        ):  # the menu is big: redraw on change, at most ~10x a second
            shown["seq"], shown["pt"] = st["menu_seq"], now
            show_pixbuf(mode)
        if now - shown["raised"] > 1.0 and gw:
            gw.raise_()
            shown["raised"] = now  # stay above fullscreen windows
    return True


GLib.timeout_add(125, tick)
threading.Thread(target=poll_loop, daemon=True).start()
threading.Thread(target=menu_listener, daemon=True).start()
Gtk.main()
