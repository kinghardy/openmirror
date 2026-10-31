#!/usr/bin/env python3
"""Build the ES-DE NES library for the USA ROM set: gamelist.xml (clean names, metadata, hidden duplicates)
and artwork (box art, title screen, in-game snap) from thumbnails.libretro.com.

usage: nes_match.py <datdir> <catalog.json> ; nes_launchbox.py Metadata.xml <lb.json> ; nes_build.py <datdir> <catalog.json> <lb.json>
Descriptions, ratings and the Popular / Top Rated collections come from the LaunchBox dump (<lb.json>).
<datdir> must hold Named_Boxarts.txt / Named_Titles.txt / Named_Snaps.txt (listings of the libretro thumbnail folders).
"""
import difflib, json, pathlib, re, shutil, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from xml.sax.saxutils import escape

sys.path.insert(0, str(pathlib.Path(__file__).parent))
DATDIR, CATALOG, LBJSON = map(pathlib.Path, sys.argv[1:4])
ES = pathlib.Path.home() / "ES-DE"
MEDIA = ES / "downloaded_media/nes"
BASE = "https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/"
KINDS = {"covers": "Named_Boxarts", "titlescreens": "Named_Titles", "screenshots": "Named_Snaps"}

def norm(s, sub=False):
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    s = re.sub(r"^(.*), (the|a|an)$", r"\2 \1", s)
    if sub: s = re.split(r"\s+-\s+|:\s+", s)[0]
    s = s.replace("&", "and").replace("versus", "vs")
    s = re.sub(r"^(the|a|an) ", "", s)
    return "".join({"ii": "2", "iii": "3", "iv": "4"}.get(w, w) for w in re.split(r"[^a-z0-9]+", s) if w)

JUNK = re.compile(r"Proto|Beta|Demo|Sample|Aftermarket|Pirate|Kiosk|Promo|Virtual Console|Collection|\[|\)\(|Switch Online|Classic", re.I)
def tier(n):
    if JUNK.search(n): return 9
    for i, pat in enumerate((r"\((USA|World)[,)]", r"\(Europe", r"\(Japan")):
        if re.search(pat, n): return i
    return 5

def index(names):
    full, exact = {}, set(names)
    for n in sorted(names, key=lambda n: (tier(n), n)):
        b = re.sub(r"\s*\(.*$", "", n)
        full.setdefault(norm(b), n); full.setdefault("S:" + norm(b, True), n)
    return exact, full

IDX = {k: index([l.rstrip("\n")[:-4] for l in (DATDIR / f"{d}.txt").read_text().splitlines() if l.endswith(".png")])
       for k, d in KINDS.items()}

def safe(n): return re.sub(r'[&*/:`<>?\\|"]', "_", n)

def find_art(kind, r):
    exact, full = IDX[kind]
    if r.get("nointro"):
        n = safe(r["nointro"])
        if n in exact: return n
    t = re.sub(r"\s*\(Prototype\)$", "", r["title"])
    for k in (norm(t), "S:" + norm(t, True)):
        if k in full and (k[:2] != "S:" or len(k) > 8): return full[k]
    c = difflib.get_close_matches(norm(t), [k for k in full if k[:2] != "S:"], 1, 0.88)
    return full[c[0]] if c else None

def fetch(job):
    kind, name, dest = job
    if dest.exists() and dest.stat().st_size > 0: return True
    url = BASE + KINDS[kind] + "/" + urllib.parse.quote(name + ".png")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp: data = resp.read()
            dest.write_bytes(data); return True
        except Exception:
            time.sleep(1 + attempt)
    return False

recs = json.loads(CATALOG.read_text())
jobs, have = [], {k: 0 for k in KINDS}
for r in recs:
    stem = r["file"].rsplit(".", 1)[0]
    r["art"] = {}
    if not r["primary"]: continue
    for kind in KINDS:
        n = find_art(kind, r)
        if n:
            (MEDIA / kind).mkdir(parents=True, exist_ok=True)
            jobs.append((kind, n, MEDIA / kind / f"{stem}.png")); r["art"][kind] = n
with ThreadPoolExecutor(8) as ex: ok = list(ex.map(fetch, jobs))
for (kind, _, _), good in zip(jobs, ok): have[kind] += good
print("artwork downloaded:", have, f"({len(jobs) - sum(ok)} failed)")

# --- LaunchBox descriptions / ratings ---------------------------------------------------------------------
lb_full, lb_sub = {}, {}
for e in sorted(json.loads(LBJSON.read_text()), key=lambda e: -e["votes"]):
    lb_full.setdefault(norm(e["name"]), e); lb_sub.setdefault(norm(e["name"], True), e)
def find_lb(title):
    t = re.sub(r"\s*\(Prototype\)$", "", title)
    one_sub = len(re.split(r"\s+-\s+|:\s+", t)) == 2    # "Zelda 2: Link", not multicarts like "A - B - C"
    e = lb_full.get(norm(t)) or (lb_sub.get(norm(t, True)) if one_sub and len(norm(t, True)) > 5 else None)
    if e: return e
    c = difflib.get_close_matches(norm(t), list(lb_full), 1, 0.88)
    return lb_full[c[0]] if c else None
for r in recs:
    r["lb"] = find_lb(r["title"]) if r["primary"] else None
    if r["lb"]:
        for k, lk in (("developer", "dev"), ("publisher", "pub"), ("genre", "genres")):   # fill only what the DAT lacked
            if not r.get(k) and r["lb"][lk]: r[k] = r["lb"][lk].split(";")[0]
        if not r.get("releaseyear") and r["lb"]["year"]: r["releaseyear"] = r["lb"]["year"]
        if not r.get("maxusers") and r["lb"]["players"].isdigit(): r["maxusers"] = r["lb"]["players"]

# --- ranking: drives the starred favorites (shown first in the list) and the collections --------------------
prim = [r for r in recs if r["primary"]]
rated = [r for r in prim if r.get("lb") and r["cls"] in ("verified", "ok")]
seen, ranked = set(), []
for r in sorted(rated, key=lambda r: -r["lb"]["votes"]):     # one ROM per LaunchBox entry
    if id(r["lb"]) not in seen: seen.add(id(r["lb"])); ranked.append(r)
STARRED = {r["file"] for r in ranked[:40]}

# --- gamelist ---------------------------------------------------------------------------------------------
gl = ES / "gamelists/nes/gamelist.xml"
played = {}
if gl.exists():
    old = gl.read_text()
    shutil.copy(gl, gl.with_suffix(f".xml.bak.{time.strftime('%Y%m%d-%H%M%S')}"))
    for m in re.finditer(r"<game>.*?</game>", old, re.S):
        g = m.group(0); p = re.search(r"<path>(?:\./(?:USA/)?)?(.*?)</path>", g)
        if p: played[p.group(1)] = {t: v for t, v in re.findall(r"<(playcount|playtime|lastplayed|favorite)>(.*?)</", g)}

def tag(k, v): return f"\t\t<{k}>{escape(str(v))}</{k}>\n" if v not in (None, "") else ""
out = ['<?xml version="1.0"?>\n<gameList>\n']
for r in sorted(recs, key=lambda r: (norm(r["title"]), r["file"])):
    g = ["\t<game>\n", tag("path", "./" + r["file"]), tag("name", r["title"])]
    year = r.get("releaseyear")
    if year and year.isdigit():
        mon = r.get("releasemonth", "1"); mon = int(mon) if mon.isdigit() and 1 <= int(mon) <= 12 else 1
        g.append(tag("releasedate", f"{year}{mon:02d}01T000000"))
    lb = r.get("lb")
    if lb and lb["desc"]: g.append(tag("desc", lb["desc"]))
    if lb and lb["votes"] >= 3: g.append(tag("rating", round(lb["rating"] / 5, 2)))
    g += [tag("developer", r.get("developer")), tag("publisher", r.get("publisher")), tag("genre", r.get("genre")),
          tag("players", r.get("maxusers"))]
    for k, v in played.get(r["file"], {}).items(): g.append(tag(k, v))
    if r["file"] in STARRED and "favorite" not in played.get(r["file"], {}): g.append(tag("favorite", "true"))
    if not r["primary"]: g.append(tag("hidden", "true"))
    out.append("".join(g) + "\t</game>\n")
out.append("</gameList>\n")
gl.parent.mkdir(parents=True, exist_ok=True)
gl.write_text("".join(out))
print(f"gamelist: {len(prim)} visible titles, {len(recs) - len(prim)} variants hidden")
print("visible with cover:", sum("covers" in r["art"] for r in prim), " title:", sum("titlescreens" in r["art"] for r in prim),
      " snap:", sum("screenshots" in r["art"] for r in prim), " genre:", sum("genre" in r for r in prim),
      " year:", sum("releaseyear" in r for r in prim))

# --- collections ------------------------------------------------------------------------------------------
def votes(r): return r["lb"]["votes"]
def pick(rows, n, min_votes=0): return [r for r in rows if votes(r) >= min_votes][:n]       # ranked is by votes desc
by_genre = lambda *gs: [r for r in ranked if r.get("genre") in gs]
COLLECTIONS = {
    "Popular": ranked[:100],
    "Top Rated": sorted(pick(ranked, 100, 40), key=lambda r: -r["lb"]["rating"])[:50],
    "Two-Player": pick([r for r in ranked if str(r.get("maxusers", "1")) .isdigit() and int(r.get("maxusers", 1)) >= 2], 60, 30),
    "Platformers": pick(by_genre("Platform"), 40, 15),
    "Sports": pick(by_genre("Sports"), 40, 15),
    "Racing": pick(by_genre("Racing"), 25, 10),
    "Shooters": pick(by_genre("Shoot'em Up", "Shooter"), 40, 15),
    "Fighters and Beat-em-ups": pick(by_genre("Beat'em Up", "Fighting"), 25, 10),
    "RPG and Adventure": pick(by_genre("Role-playing (RPG)", "Adventure"), 30, 15),
    "Puzzle": pick(by_genre("Puzzle"), 20, 10),
    "Light Gun (Zapper)": by_genre("Lightgun Shooter") + [r for r in prim if re.search(r"Duck Hunt|Hogan", r["title"])],
}
(ES / "collections").mkdir(exist_ok=True)
for name, rows in COLLECTIONS.items():
    (ES / "collections" / f"custom-NES {name}.cfg").write_text("".join(f"%ROMPATH%/nes/USA/{r['file']}\n" for r in rows))
print("starred:", len(STARRED), "| collections:", {k: len(v) for k, v in COLLECTIONS.items()},
      "\n  CollectionSystemsCustom =", ",".join("NES " + k for k in COLLECTIONS))
print("descriptions:", sum(bool(r.get("lb") and r["lb"]["desc"]) for r in prim), "of", len(prim))
print("no cover art:", [r["title"] for r in prim if "covers" not in r["art"]])
