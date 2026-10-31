"""Themes: one folder per theme under themes/ (theme.json + optional css / phone css / js). The server only lists them and remembers the chosen mode;
the page (themes/loader.js) picks the theme by the viewer's local date, so a seasonal theme switches on by itself.
theme.json: {"id", "name", "description", "author", "license", "window": ["MM-DD", "MM-DD"] (optional: when "auto" turns it on), "css", "phone_css", "js"}"""
import json, os, re
from mirror_util import CFG_DIR, secret

HERE = os.path.dirname(os.path.abspath(__file__))
THEMES_DIR = os.path.join(HERE, "themes")
DEFAULT = "wii"                                                    # shown whenever no seasonal theme applies
ID = re.compile(r"[a-z0-9][a-z0-9_-]{0,30}")
FILE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,60}")

def theme_dirs():
    try: return sorted(d for d in os.listdir(THEMES_DIR) if ID.fullmatch(d) and os.path.isfile(os.path.join(THEMES_DIR, d, "theme.json")))
    except OSError: return []

def load_theme(tid):
    try:
        with open(os.path.join(THEMES_DIR, tid, "theme.json")) as f: meta = json.load(f)
    except (OSError, ValueError): return None
    out = {"id": tid, "name": str(meta.get("name", tid))[:40], "description": str(meta.get("description", ""))[:200], "author": str(meta.get("author", ""))[:60], "license": str(meta.get("license", ""))[:40]}
    w = meta.get("window")
    if isinstance(w, list) and len(w) == 2 and all(isinstance(x, str) and re.fullmatch(r"\d\d-\d\d", x) for x in w): out["window"] = w
    for k in ("css", "phone_css", "js"):                           # only files that exist, only plain file names inside the theme's own folder
        f = meta.get(k)
        if isinstance(f, str) and FILE.fullmatch(f) and os.path.isfile(os.path.join(THEMES_DIR, tid, f)): out[k] = f"/themes/{tid}/{f}"
    return out

def theme_mode():
    m = (secret("theme", "auto") or "auto").strip().lower()
    return m if m == "auto" or m in theme_dirs() else "auto"

def theme_list():
    return {"mode": theme_mode(), "default": DEFAULT, "themes": [t for t in map(load_theme, theme_dirs()) if t]}

def theme_set(mode):
    mode = str(mode or "auto").strip().lower()
    if mode != "auto" and mode not in theme_dirs(): raise ValueError("no such theme")
    os.makedirs(CFG_DIR, exist_ok=True)
    with open(os.path.join(CFG_DIR, "theme"), "w") as f: f.write(mode)
    return mode

TYPES = {".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp"}
def theme_file(path):
    """(bytes, content type) for /themes/<id>/<file>, or None; nothing outside a theme folder can be reached"""
    m = re.fullmatch(r"/themes/([a-z0-9][a-z0-9_-]{0,30})/([A-Za-z0-9][A-Za-z0-9._-]{0,60})", path)
    if not m or m.group(1) not in theme_dirs(): return None
    ext = os.path.splitext(m.group(2))[1].lower()
    if ext not in TYPES: return None
    try:
        with open(os.path.join(THEMES_DIR, m.group(1), m.group(2)), "rb") as f: return f.read(), TYPES[ext]
    except OSError: return None
