"""Poster Wall data: TMDB / ESPN / TheSportsDB proxying and Wikimedia Commons art. (split out of proxy.py)"""
import os
import re
import urllib.request, urllib.error, urllib.parse
import json
import threading
import time
import html
from urllib.parse import urlsplit, parse_qsl, urlencode
from mirror_util import secret

TMDB_BASE = os.environ.get("TMDB_BASE", "https://api.themoviedb.org/3/")

SDB_BASE = os.environ.get("SDB_BASE", "https://www.thesportsdb.com/api/v1/json/")

ALLOW_TMDB = re.compile(r"^(movie/(now_playing|upcoming|popular|top_rated|\d{1,9}/videos)|tv/(popular|top_rated|on_the_air|\d{1,9}/videos)|discover/(movie|tv)|trending/(movie|tv)/(day|week))$")

ESPN_BASE = os.environ.get("ESPN_BASE", "https://site.api.espn.com/apis/site/v2/sports/")

ALLOW_ESPN = re.compile(r"^(football/(nfl|college-football)|basketball/(nba|wnba|mens-college-basketball|womens-college-basketball)|hockey/nhl|baseball/mlb)/(scoreboard|teams/[a-z0-9]{1,6}/schedule)$")

ESPN_Q = {"dates": r"\d{8}", "groups": r"\d{1,3}", "season": r"\d{4}", "week": r"\d{1,2}", "seasontype": r"\d"}

ALLOW_SDB = re.compile(r"^(eventsnext|eventsnextleague|lookupteam)\.php$")

TMDB_Q, SDB_Q = {"page", "region", "language", "sort_by", "with_genres", "without_genres", "with_original_language", "vote_count.gte", "vote_average.gte",
                 "primary_release_date.gte", "primary_release_date.lte", "first_air_date.gte", "first_air_date.lte"}, {"id"}

TTL = {"tmdb": 6 * 3600, "eventsnext.php": 1800, "eventsnextleague.php": 1800, "lookupteam.php": 86400}

cache, cache_lock, sdb_lock, sdb_last, sdb_pause = {}, threading.Lock(), threading.Lock(), [0.0], [0.0]

CACHE_FILE = os.path.expanduser("~/.cache/mirror/posters-cache.json")   # survives restarts (outside the served folder)

try: cache.update({k: (t, d.encode()) for k, (t, d) in json.load(open(CACHE_FILE)).items()})
except (OSError, ValueError): pass

def save_cache():
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with cache_lock: snap = {k: [t, d.decode()] for k, (t, d) in cache.items() if not k.startswith("espn/")}
    with open(CACHE_FILE + ".tmp", "w") as f: json.dump(snap, f)
    os.replace(CACHE_FILE + ".tmp", CACHE_FILE)

def poster_fetch(src, path, query):
    """-> (status, json bytes). Serves a fresh cache hit, else upstream, else a stale copy."""
    if src == "tmdb":
        if not ALLOW_TMDB.match(path): return 403, b'{"error":"not_allowed"}'
        q = {k: v for k, v in query if k in TMDB_Q and re.fullmatch(r"[A-Za-z0-9_.,|-]{1,40}", v)}
        key = secret("tmdb_key")
        if not key: return 503, b'{"error":"no_tmdb_key"}'
        headers = {"Accept": "application/json"}
        if len(key) > 40: headers["Authorization"] = "Bearer " + key   # v4 read access token
        else: q["api_key"] = key                                       # v3 API key
        url, ckey, ttl = TMDB_BASE + path + "?" + urlencode(q), "tmdb/" + path + "?" + urlencode(sorted((k, v) for k, v in q.items() if k != "api_key")), TTL["tmdb"] * (4 if path.endswith("/videos") else 1)
    elif src == "espn":   # ESPN's public site API: no key; today's board is refreshed every minute for live scores
        if not ALLOW_ESPN.match(path): return 403, b'{"error":"not_allowed"}'
        q = {k: v for k, v in query if k in ESPN_Q and re.fullmatch(ESPN_Q[k], v)}
        live = path.endswith("scoreboard") and q.get("dates", time.strftime("%Y%m%d")) <= time.strftime("%Y%m%d")
        url = ESPN_BASE + path + ("?" + urlencode(q) if q else "")
        ckey, ttl, headers = "espn/" + path + "?" + urlencode(sorted(q.items())), (55 if live else 1800), {"User-Agent": "Mozilla/5.0 (mirror-dashboard)"}
    else:
        if not ALLOW_SDB.match(path): return 403, b'{"error":"not_allowed"}'
        q = {k: v for k, v in query if k in SDB_Q and v.isdigit()}
        url = SDB_BASE + secret("sportsdb_key", "123") + "/" + path + "?" + urlencode(q)
        ckey, ttl, headers = "sdb/" + path + "?" + urlencode(q), TTL[path], {}
    with cache_lock: hit = cache.get(ckey)
    if hit and time.time() - hit[0] < ttl: return 200, hit[1]
    try:
        if src == "sports":   # the free tier rate-limits hard: one request every 4 s, and a minute's rest after a 429
            with sdb_lock:
                if time.time() < sdb_pause[0]: raise urllib.error.HTTPError(url, 429, "backing off", None, None)
                wait = sdb_last[0] + 4 - time.time()
                if wait > 0: time.sleep(wait)
                sdb_last[0] = time.time()
                try:
                    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as r: data = r.read()
                except urllib.error.HTTPError as e:
                    if e.code == 429: sdb_pause[0] = time.time() + 60
                    raise
        else:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as r: data = r.read()
        json.loads(data)   # rate-limit pages come back as HTML
        with cache_lock:
            cache[ckey] = (time.time(), data)
            for k in [k for k, (t, _) in cache.items() if time.time() - t > 2 * 86400]: del cache[k]   # prune
        if src != "espn": save_cache()   # ESPN boards are big and short-lived: memory only
        return 200, data
    except urllib.error.HTTPError as e:
        if hit: return 200, hit[1]
        return (401 if e.code == 401 else 502), json.dumps({"error": "upstream_%d" % e.code}).encode()
    except Exception:
        if hit: return 200, hit[1]
        return 502, b'{"error":"upstream_unavailable"}'

COMMONS_API = os.environ.get("COMMONS_API", "https://commons.wikimedia.org/w/api.php")

COMMONS_UA = "SmartMirrorApp/1.0 (personal home dashboard)"   # Wikimedia asks for contact details here too

COMMONS_MIN_H, COMMONS_TTL = 1920, 86400

COMMONS_CAT = re.compile(r"^Category:[^\x00-\x1f#<>\[\]{}|]{1,200}$")

commons_lock, commons_next, commons_building = threading.Lock(), [0.0], set()

def commons_get(params):
    """One API call: one at a time, >= 1.5 s apart, pausing as long as Wikimedia's Retry-After says."""
    with commons_lock:
        wait = commons_next[0] - time.time()
        if wait > 0: time.sleep(wait)
        url = COMMONS_API + "?" + urlencode(dict(params, format="json", formatversion=2, maxlag=5))
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": COMMONS_UA}), timeout=30) as r: d = json.loads(r.read())
        except urllib.error.HTTPError as e:
            ra = e.headers.get("Retry-After", "")
            commons_next[0] = time.time() + (int(ra) if ra.isdigit() else 60)
            raise
        if (d.get("error") or {}).get("code") == "maxlag":   # Wikimedia's servers are busy: back off
            commons_next[0] = time.time() + 15
            raise RuntimeError("maxlag")
        commons_next[0] = time.time() + 1.5
        return d

def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()

def commons_build(cat, depth, max_items):
    cats = [cat]
    if depth:   # most collections keep their posters in subcategories
        d = commons_get({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "subcat", "cmlimit": 50})
        cats += [m["title"] for m in d.get("query", {}).get("categorymembers", [])][:25]
    items, seen = [], set()
    for c in cats:
        cont = {}
        for _ in range(10):   # up to 500 files per category
            d = commons_get(dict({"action": "query", "generator": "categorymembers", "gcmtitle": c, "gcmtype": "file", "gcmlimit": 50,
                                  "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1280,
                                  "iiextmetadatafilter": "ObjectName|DateTimeOriginal|Artist|LicenseShortName|ImageDescription"}, **cont))
            for p in d.get("query", {}).get("pages", []):
                ii = (p.get("imageinfo") or [{}])[0]
                w, h = ii.get("width", 0), ii.get("height", 0)
                if h <= w or h < COMMONS_MIN_H or p["title"] in seen: continue   # portrait, >= 1920 px tall
                if ii.get("mime") not in ("image/jpeg", "image/png", "image/tiff", "image/webp"): continue
                img = ii.get("thumburl") or ("" if ii.get("mime") == "image/tiff" else ii.get("url", ""))   # TIFFs only as JPEG renditions
                if not img: continue
                seen.add(p["title"])
                em = ii.get("extmetadata") or {}
                v = lambda k: strip_html((em.get(k) or {}).get("value", ""))
                items.append({"id": p.get("pageid"), "title": (v("ObjectName") or re.sub(r"\.\w+$", "", p["title"].split(":", 1)[-1]))[:140],
                              "date": v("DateTimeOriginal")[:60], "artist": v("Artist")[:120], "license": v("LicenseShortName")[:60],
                              "desc": v("ImageDescription")[:600], "img": img, "w": w, "h": h, "page": ii.get("descriptionurl", ""),
                              "thumb": img.replace("/1280px-", "/400px-") if "/1280px-" in img else img})
            if "continue" not in d or len(items) >= max_items: break
            cont = d["continue"]
        if len(items) >= max_items: break
    return items[:max_items]

def commons_fetch(query):
    """-> (status, json bytes). Fresh cache, else start a background build and serve the stale copy (or 'building')."""
    q = dict(query)
    cat = q.get("cat", "").replace("_", " ").strip()
    if not COMMONS_CAT.match(cat): return 400, b'{"error":"bad_category"}'
    depth = 1 if q.get("depth") == "1" else 0
    mx = max(1, min(int(q["max"]) if q.get("max", "").isdigit() else 80, 200))
    ckey = "commons/%s|%d|%d" % (cat, depth, mx)
    with cache_lock: hit = cache.get(ckey)
    if hit and time.time() - hit[0] < COMMONS_TTL: return 200, hit[1]
    with cache_lock:
        start = ckey not in commons_building
        commons_building.add(ckey)
    if start:
        def build():
            try:
                data = json.dumps({"category": cat, "items": commons_build(cat, depth, mx)}).encode()
                with cache_lock: cache[ckey] = (time.time(), data)
                save_cache()
            except Exception as e:
                print(time.strftime("%H:%M:%S"), "commons build failed:", cat, e, flush=True)
            finally:
                with cache_lock: commons_building.discard(ckey)
        threading.Thread(target=build, daemon=True).start()
    if hit: return 200, hit[1]
    return 503, b'{"error":"building"}'
