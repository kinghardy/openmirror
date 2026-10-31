"""Channels: the tiles on the home screen. Each channel is a folder under channels/ with a channel.json manifest (name, subtitle, icon, order, the
permissions it needs). The home screen is built from the manifests plus the owner's own choices (~/.config/mirror/channels.json: order, hidden tiles).

Only first-party manifests (the ones in this repo) are loaded today, so their markup is trusted; the permission list is the contract a community channel
will have to meet later. A channel marked required (Wii Options) can never be hidden, so nobody can lock themselves out of settings."""
import html, json, os, re, tempfile
from mirror_util import CFG_DIR
import mirror_settings as SET

HERE = os.path.dirname(os.path.abspath(__file__))
CHANNELS_DIR = os.path.join(HERE, "channels")
CONFIG = os.path.join(CFG_DIR, "channels.json")

PERMISSIONS = {                                              # what a channel may ask for, in words a person can read
    "now_playing": "see what is playing on the speaker",
    "speaker_control": "play, pause and skip music",
    "controller": "read the game controller",
    "home_assistant": "control lights and devices in Home Assistant",
    "tmdb": "use your movie-poster (TMDB) key through the mirror",
    "launch_games": "start games and apps on the mirror",
    "sports_data": "read live sports scores",
    "location": "use your location for the weather",
    "camera": "show camera views",
    "calendar": "read your calendar",
    "settings": "change the mirror's settings",
}
DOMAIN = re.compile(r"network:([a-z0-9-]+(\.[a-z0-9-]+)+)")
ID = re.compile(r"[a-z][a-z0-9_]{0,30}")

def perm_text(p):
    m = DOMAIN.fullmatch(p)
    return f"contact {m.group(1)}" if m else PERMISSIONS.get(p, p)

def load_manifests():
    out = {}
    try: names = sorted(os.listdir(CHANNELS_DIR))
    except OSError: return out
    for d in names:
        try:
            with open(os.path.join(CHANNELS_DIR, d, "channel.json")) as f: m = json.load(f)
        except (OSError, ValueError): continue
        if not ID.fullmatch(d) or m.get("id") != d: continue
        perms = m.get("permissions", [])
        if not isinstance(perms, list) or any(not isinstance(p, str) or (p not in PERMISSIONS and not DOMAIN.fullmatch(p)) for p in perms): continue      # unknown permission: not loaded
        if not isinstance(m.get("name"), str) or not 1 <= len(m["name"]) <= 40: continue
        m["permissions"] = perms; m["order"] = m.get("order", 1000) if isinstance(m.get("order", 1000), (int, float)) else 1000
        out[d] = m
    return out

def subtitle_vars():
    """words a manifest subtitle may use: {location} is the home location (or a prompt to set it)"""
    loc = SET.location(); return {"location": loc["name"] if loc else "Set your location"}

def user_config():
    try:
        with open(CONFIG) as f: c = json.load(f)
    except (OSError, ValueError): return {"order": [], "hidden": [], "names": {}}
    ok = lambda v: [x for x in v if isinstance(x, str) and ID.fullmatch(x)] if isinstance(v, list) else []
    names = {k: {f: str(v[f])[:40] for f in ("name", "subtitle") if isinstance(v.get(f), str) and v[f].strip()} for k, v in (c.get("names") or {}).items() if isinstance(v, dict) and ID.fullmatch(k)} if isinstance(c.get("names"), dict) else {}
    return {"order": ok(c.get("order")), "hidden": ok(c.get("hidden")), "names": names}

def _text(m, cfg, field):
    own = (cfg["names"].get(m["id"]) or {}).get(field)
    return own if own else (m.get(field, "") if field == "name" else m.get(field, "").format_map(_SafeVars(subtitle_vars())))

class _SafeVars(dict):
    def __missing__(self, k): return "{" + k + "}"

def effective(include_hidden=True):
    """the channel list in screen order (the Now Playing hero is not part of it)"""
    man = load_manifests(); cfg = user_config(); base = sorted((m for m in man.values() if not m.get("hero")), key=lambda m: (m["order"], m["id"]))
    pos = {c: i for i, c in enumerate(cfg["order"])}
    base.sort(key=lambda m: (pos.get(m["id"], 10 ** 6), m["order"], m["id"]))
    out = []
    for m in base:
        hidden = m["id"] in cfg["hidden"] and not m.get("required")
        if hidden and not include_hidden: continue
        out.append({"id": m["id"], "name": _text(m, cfg, "name"), "subtitle": _text(m, cfg, "subtitle"), "default_name": m["name"], "hidden": hidden, "required": bool(m.get("required")), "placeholder": bool(m.get("placeholder")),
                    "permissions": [{"key": p, "text": perm_text(p)} for p in m["permissions"]]})
    return out

def tile_html(m, cfg=None):
    cfg = cfg or user_config()
    icon = m["icon_html"] if m.get("icon_html") else html.escape(m.get("icon", "🔲"))          # (icon_html is raw markup: only first-party manifests are loaded, so it is trusted)
    sid = f' id="{html.escape(m["subtitle_id"], quote=True)}"' if re.fullmatch(r"[\w-]+", m.get("subtitle_id", "")) else ""
    return (f'      <div class="channel-tile" data-app="{m["id"]}">\n        <div class="channel-icon">{icon}</div>\n        <div class="channel-title">{html.escape(_text(m, cfg, "name"))}</div>\n'
            f'        <div class="channel-subtitle"{sid}>{html.escape(_text(m, cfg, "subtitle"))}</div>\n      </div>\n')

START, END = "<!--om:tiles:start-->", "<!--om:tiles:end-->"
def has_promo(): return os.path.exists(os.path.join(HERE, "promo.html"))             # (the film is not part of every copy of the project)

def render_index(raw):
    """index.html with the tiles between the markers rebuilt from the manifests (the markup in the file is only the fallback); any problem: the file as it is"""
    try:
        a, b = raw.index(START) + len(START), raw.index(END)
        man = load_manifests(); vis = [c["id"] for c in effective(False)]; cfg = user_config()
        if not man or not vis: return raw
        if not has_promo(): raw = re.sub(r"/\*om:promo:start\*/.*?/\*om:promo:end\*/", "", raw, flags=re.S); a, b = raw.index(START) + len(START), raw.index(END)
        return raw[:a] + "\n" + "\n".join(tile_html(man[i], cfg) for i in vis) + "      " + raw[b:]
    except (ValueError, KeyError): return raw

def _save(cfg):
    os.makedirs(CFG_DIR, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=CFG_DIR, prefix=".channels.")
    try: os.write(fd, json.dumps(cfg, indent=1).encode()); os.close(fd); os.replace(tmp, CONFIG)
    except BaseException:
        try: os.unlink(tmp)
        except OSError: pass
        raise

def act(action, cid="", direction=0, text=""):
    ids = [c["id"] for c in effective()]; cfg = user_config()
    order = ids[:]; hidden = [h for h in cfg["hidden"] if h in ids]; names = cfg["names"]
    if action == "reset": return _save({"order": [], "hidden": [], "names": {}}) or effective()
    if cid not in ids: raise ValueError("no such channel")
    if action in ("hide", "show"):
        if action == "hide" and next(c for c in effective() if c["id"] == cid)["required"]: raise ValueError("this one has to stay (it opens the settings)")
        hidden = [h for h in hidden if h != cid] + ([cid] if action == "hide" else [])
    elif action == "move":
        i = order.index(cid); j = max(0, min(len(order) - 1, i + (1 if direction > 0 else -1))); order.insert(j, order.pop(i))
    elif action == "rename":
        t = re.sub(r"[\x00-\x1f<>]", "", str(text)).strip()[:24]                     # (a name: no markup, no control characters)
        if t: names[cid] = dict(names.get(cid, {}), name=t)
        else: names.pop(cid, None)                                                    # empty = back to the default name
    else: raise ValueError("unknown action")
    _save({"order": order, "hidden": hidden, "names": names}); return effective()

def freeze_existing():
    """an install that already has settings keeps exactly the tiles it has now: if there is no channels.json yet, write one that shows everything in the current order"""
    if os.path.exists(CONFIG) or not os.path.isdir(CFG_DIR) or not any(f in os.listdir(CFG_DIR) for f in ("ha_token", "tmdb_key", "party")): return False
    _save({"order": [c["id"] for c in effective()], "hidden": [], "names": {}}); return True
