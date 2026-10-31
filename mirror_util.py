"""Shared helpers: secrets / paths, JSON files, the cached HTTP getter with Apple's rate budget, song / album shapes. (split out of proxy.py)"""
import os
import re
import urllib.request, urllib.error, urllib.parse
import json
import time


CFG_DIR = os.environ.get("OPENMIRROR_CONFIG") or os.path.expanduser("~/.config/mirror")      # settings and keys live here (override: OPENMIRROR_CONFIG)

def secret(name, default=None):  # read on every request so a key can be added without a restart
    try: return open(os.path.join(CFG_DIR, name)).read().strip() or default
    except OSError: return default

GAMES_FILE = os.path.expanduser("~/.local/share/mirror/games.json")

# Music app: Apple's free catalog search + charts (no account or key), and playing a song on the Sonos by its Apple Music id. The speaker's own
# Apple Music link does the streaming; it accepts a song addressed as x-sonos-http:song%3a<id>.mp4?sid=204&flags=0&sn=<account> (it rejects
# any metadata carrying the account token, and it does not fill in title / length for songs added this way: we supply them from the catalog).
MUSIC_CACHE = {}

ITUNES = {"calls": [], "cool": float((open("/tmp/mirror-itunes-cool").read() or 0) if os.path.exists("/tmp/mirror-itunes-cool") else 0)}          # Apple's search API throttles around 20 calls a minute per address (then answers 403 for a while): spend them carefully

def itunes_busy():
    wait = max(10, int(ITUNES["cool"] - time.time())) if ITUNES["cool"] > time.time() else 20
    return f"Apple Music is limiting lookups for a moment: try again in about {wait} seconds"

def itunes_budget():
    now = time.time()
    if now < ITUNES["cool"]: raise OSError("iTunes is cooling down")
    ITUNES["calls"] = [t for t in ITUNES["calls"] if now - t < 60]
    if len(ITUNES["calls"]) >= 15: raise OSError("iTunes budget used up")
    ITUNES["calls"].append(now)

def mget(url, ttl):
    hit = MUSIC_CACHE.get(url)
    if hit and time.time() - hit[0] < ttl: return hit[1]
    apple = "itunes.apple.com/" in url
    if apple: itunes_budget()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (mirror-dashboard)"}), timeout=10) as r: data = json.load(r)
    except urllib.error.HTTPError as e:
        if apple and e.code in (403, 429):
            ITUNES["cool"] = time.time() + 75
            try: open("/tmp/mirror-itunes-cool", "w").write(str(ITUNES["cool"]))        # (a restart must not forget it and hammer Apple again)
            except OSError: pass
        raise
    MUSIC_CACHE[url] = (time.time(), data); return data

def art600(u): return re.sub(r"/\d+x\d+(bb)?\.(jpg|png)", r"/600x600bb.\2", u or "")

def m_song(r): return {"kind": "song", "id": str(r.get("trackId", "")), "title": r.get("trackName", ""), "artist": r.get("artistName", ""), "album": r.get("collectionName", ""),
                       "albumId": str(r.get("collectionId", "")), "art": art600(r.get("artworkUrl100")), "dur": int((r.get("trackTimeMillis") or 0) / 1000)}

def m_album(r): return {"kind": "album", "id": str(r.get("collectionId", "")), "title": r.get("collectionName", ""), "artist": r.get("artistName", ""), "art": art600(r.get("artworkUrl100")), "count": r.get("trackCount", 0)}

def _plain(t): return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", t.lower().replace("&", "and")).replace("the ", "", 1) if t.lower().startswith("the ") else re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", t.lower().replace("&", "and"))).strip()

def _jload(f, d):
    try: return json.load(open(f))
    except (OSError, ValueError): return d

def _jsave(f, o):
    try: os.makedirs(os.path.dirname(f), exist_ok=True); json.dump(o, open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    except OSError: pass

JUNK = re.compile(r"karaoke|tribute|originally performed|made famous|in the style of|lullaby|music box|8[- ]bit|piano version|instrumental version|backing track|workout|ringtone|rendition|nursery|for kids|string quartet|vitamin string|\bcover(ed)?\b|sleep|meditation", re.I)

VARIANT = re.compile(r"\b(live|remix|acoustic|demo|radio edit|extended|sped up|slowed|instrumental|a cappella|version|mix|edit|reprise)\b", re.I)

def dz(path, ttl=3600): return mget("https://api.deezer.com" + path, ttl)
