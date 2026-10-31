#!/usr/bin/env python3
"""Build the ES-DE Game Boy Advance library for ~/ROMs/gba: clean names, metadata (libretro No-Intro DAT + metadat by
CRC, LaunchBox for descriptions/ratings), artwork from thumbnails.libretro.com, starred favorites and collections.

usage: gba_build.py <workdir> <lb-gba.json>
<workdir> holds no-intro.dat (libretro-database metadat/no-intro/Nintendo - Game Boy Advance.dat), {genre,developer,publisher,releaseyear,releasemonth,maxusers}.dat and the
thumbnail listings Named_{Boxarts,Titles,Snaps}.txt (same sources as the NES build)."""
import difflib, json, pathlib, re, shutil, sys, time, unicodedata, urllib.parse, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from xml.sax.saxutils import escape

WORK, LBJSON = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ROMS = pathlib.Path.home() / "ROMs/gba"
ES = pathlib.Path.home() / "ES-DE"
MEDIA = ES / "downloaded_media/gba"
BASE = "https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/"
KINDS = {"covers": "Named_Boxarts", "titlescreens": "Named_Titles", "screenshots": "Named_Snaps"}

def norm(s, sub=False):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    s = re.sub(r"^(.*), (the|a|an)$", r"\2 \1", s)
    if sub: s = re.split(r"\s+-\s+|:\s+", s)[0]
    s = s.replace("&", "and").replace("pokemon", "pokmon")
    s = re.sub(r"^(the|a|an) ", "", s)
    return "".join({"ii": "2", "iii": "3", "iv": "4"}.get(w, w) for w in re.split(r"[^a-z0-9]+", s) if w)

def parse_dat(path):
    out, cur = [], None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if s == "game (": cur = {}
        elif s == ")" and cur is not None: out.append(cur); cur = None
        elif cur is not None:
            if s.startswith("rom ("):
                for k, v in re.findall(r"(\w+) (\"[^\"]*\"|\S+)", s[5:]): cur.setdefault("rom_" + k, v.strip('"'))
            else:
                m = re.match(r'(\w+) "?(.*?)"?$', s)
                if m: cur.setdefault(m.group(1), m.group(2))
    return out

nointro = parse_dat(WORK / "no-intro.dat")
by_crc = {g["rom_crc"].upper(): g for g in nointro if "rom_crc" in g}
meta = {}
for key, field in [("genre", "genre"), ("developer", "developer"), ("publisher", "publisher"), ("releaseyear", "releaseyear"),
                   ("releasemonth", "releasemonth"), ("maxusers", "users")]:
    for g in parse_dat(WORK / f"{key}.dat"):
        if field in g and "rom_crc" in g: meta.setdefault(g["rom_crc"].upper(), {})[key] = g[field]

def base_name(n): return re.sub(r"\s*[\(\[].*$", "", n)
JUNK = re.compile(r"Proto|Beta|Demo|Sample|Kiosk|Promo|Unl|Pirate|Aftermarket|Rev ", re.I)
by_base = {}
for pat in (r"\((USA|World)", r"\((Europe|Australia)", r"\(Japan", r""):
    for g in nointro:
        if re.search(pat, g["name"]) and not JUNK.search(g["name"]):
            by_base.setdefault(norm(base_name(g["name"])), g)
            by_base.setdefault("S:" + norm(base_name(g["name"]), True), g)
def find_game(t):
    for k in (norm(t), "S:" + norm(t, True)):
        if k in by_base and (k[:2] != "S:" or len(k) > 8): return by_base[k]
    c = difflib.get_close_matches(norm(t), [k for k in by_base if k[:2] != "S:"], 1, 0.9)
    return by_base[c[0]] if c else None

def clean_title(stem):
    t = base_name(stem)
    m = re.match(r"^(.*), (The|A|An)( - .*)?$", t)                  # "Legend of Zelda, The - The Minish Cap"
    if m: t = f"{m.group(2)} {m.group(1)}{m.group(3) or ''}"
    t = re.sub(r"\s+-\s+", ": ", t)
    if re.search(r"\[T-En", stem): t += " (English Translation)"
    return t

lb = {}
for e in sorted(json.loads(LBJSON.read_text()), key=lambda e: -e["votes"]):
    lb.setdefault(norm(e["name"]), e); lb.setdefault("S:" + norm(e["name"], True), e)
def find_lb(t):
    t = t.replace(" (English Translation)", "")
    for k in (norm(t), "S:" + norm(t, True)):
        if k in lb and (k[:2] != "S:" or len(k) > 8): return lb[k]
    c = difflib.get_close_matches(norm(t), [k for k in lb if k[:2] != "S:"], 1, 0.88)
    return lb[c[0]] if c else None

# --- artwork index -------------------------------------------------------------------------------------------
def tier(n):
    if re.search(r"Proto|Beta|Demo|Sample|\[", n): return 9
    for i, p in enumerate((r"\((USA|World)", r"\(Europe", r"\(Japan")):
        if re.search(p, n): return i
    return 5
IDX = {}
for kind, d in KINDS.items():
    names = [l[:-4] for l in (WORK / f"{d}.txt").read_text().splitlines() if l.endswith(".png")]
    full = {}
    for n in sorted(names, key=lambda n: (tier(n), n)): full.setdefault(norm(base_name(n)), n)
    IDX[kind] = (set(names), full)
def safe(n): return re.sub(r'[&*/:`<>?\\|"]', "_", n)
def find_art(kind, r):
    exact, full = IDX[kind]
    if r["nointro"] and safe(r["nointro"]) in exact: return safe(r["nointro"])
    k = norm(r["title"].replace(" (English Translation)", ""))
    if k in full: return full[k]
    c = difflib.get_close_matches(k, list(full), 1, 0.9)
    return full[c[0]] if c else None

# --- catalog -------------------------------------------------------------------------------------------------
recs = []
for z in sorted(ROMS.glob("*.zip")):
    if z.stat().st_size < 100_000: continue                           # e.g. the stray gba_roms.zip
    info = zipfile.ZipFile(z).infolist()[0]
    crc = f"{info.CRC:08X}"
    g = by_crc.get(crc); how = "crc"
    title = clean_title(z.stem)
    if not g: g, how = find_game(base_name(z.stem)), "name"
    m = meta.get(g["rom_crc"].upper(), {}) if g and g.get("rom_crc") else {}
    r = dict(file=z.name, stem=z.stem, title=title, nointro=g["name"] if g else None, how=how if g else None, art={}, **m)
    r["lb"] = find_lb(title)
    if r["lb"]:
        for k, lk in (("developer", "dev"), ("publisher", "pub"), ("genre", "genres")):
            if not r.get(k) and r["lb"][lk]: r[k] = r["lb"][lk].split(";")[0]
        if not r.get("releaseyear") and r["lb"]["year"]: r["releaseyear"] = r["lb"]["year"]
        if not r.get("maxusers") and r["lb"]["players"].isdigit(): r["maxusers"] = r["lb"]["players"]
    recs.append(r)

jobs = []
for r in recs:
    for kind in KINDS:
        n = find_art(kind, r)
        if n:
            (MEDIA / kind).mkdir(parents=True, exist_ok=True)
            jobs.append((kind, n, MEDIA / kind / f"{r['stem']}.png")); r["art"][kind] = n
def fetch(job):
    kind, name, dest = job
    if dest.exists() and dest.stat().st_size: return True
    for a in range(3):
        try:
            dest.write_bytes(urllib.request.urlopen(BASE + KINDS[kind] + "/" + urllib.parse.quote(name + ".png"), timeout=30).read()); return True
        except Exception: time.sleep(1 + a)
    return False
with ThreadPoolExecutor(8) as ex: ok = list(ex.map(fetch, jobs))

# --- ranking, favorites, collections ---------------------------------------------------------------------------
rated = sorted((r for r in recs if r["lb"] and "Translation" not in r["title"]), key=lambda r: -r["lb"]["votes"])
STARRED = {r["file"] for r in rated[:25]}
def gen(*gs): return [r for r in rated if (r.get("genre") or "").lower() in {g.lower() for g in gs}]
COLLECTIONS = {
    "GBA Popular": rated[:50],
    "GBA Top Rated": sorted([r for r in rated[:60] if r["lb"]["votes"] >= 15], key=lambda r: -r["lb"]["rating"])[:30],
    "GBA RPG and Strategy": gen("Role-playing (RPG)", "Role-Playing", "Strategy"),
    "GBA Platformers": gen("Platform"),
    "GBA Racing and Sports": gen("Racing", "Sports"),
    "GBA Action": gen("Action", "Beat'em Up", "Fighting", "Shooter", "Shoot'em Up"),
    "GBA Puzzle": gen("Puzzle", "Board", "Casual Game"),
    "GBA Translations": [r for r in recs if "Translation" in r["title"]],
}
COLLECTIONS = {k: v for k, v in COLLECTIONS.items() if len(v) >= 5}
(ES / "collections").mkdir(exist_ok=True)
for name, rows in COLLECTIONS.items():
    (ES / "collections" / f"custom-{name}.cfg").write_text("".join(f"%ROMPATH%/gba/{r['file']}\n" for r in rows))

# --- gamelist ------------------------------------------------------------------------------------------------
gl = ES / "gamelists/gba/gamelist.xml"
old = gl.read_text() if gl.exists() else ""
if old: shutil.copy(gl, gl.with_suffix(f".xml.bak.{time.strftime('%Y%m%d-%H%M%S')}"))
def tag(k, v): return f"\t\t<{k}>{escape(str(v))}</{k}>\n" if v not in (None, "") else ""
out = ['<?xml version="1.0"?>\n<gameList>\n']
for r in sorted(recs, key=lambda r: norm(r["title"])):
    e = r["lb"]
    row = ["\t<game>\n", tag("path", "./" + r["file"]), tag("name", r["title"])]
    y = r.get("releaseyear")
    if y and y.isdigit():
        mo = r.get("releasemonth", "1"); mo = int(mo) if mo.isdigit() and 1 <= int(mo) <= 12 else 1
        row.append(tag("releasedate", f"{y}{mo:02d}01T000000"))
    if e and e["desc"]: row.append(tag("desc", e["desc"]))
    if e and e["votes"] >= 3: row.append(tag("rating", round(e["rating"] / 5, 2)))
    row += [tag("developer", r.get("developer")), tag("publisher", r.get("publisher")), tag("genre", r.get("genre")), tag("players", r.get("maxusers"))]
    played = {}
    m = re.search(r"<game>(?:(?!</game>).)*?<path>\./%s</path>.*?</game>" % re.escape(escape(r["file"])), old, re.S)
    if m: played = dict(re.findall(r"<(playcount|playtime|lastplayed|favorite)>(.*?)</", m.group(0)))
    for k, v in played.items(): row.append(tag(k, v))
    if r["file"] in STARRED and "favorite" not in played: row.append(tag("favorite", "true"))
    out.append("".join(row) + "\t</game>\n")
out.append("</gameList>\n")
gl.parent.mkdir(parents=True, exist_ok=True)
gl.write_text("".join(out))

n = len(recs)
print(f"{n} games | matched crc {sum(r['how']=='crc' for r in recs)}, name {sum(r['how']=='name' for r in recs)}, none {sum(not r['how'] for r in recs)}")
print("art:", {k: sum(k in r["art"] for r in recs) for k in KINDS}, f"({len(jobs) - sum(ok)} download failures)")
print("descriptions:", sum(bool(r['lb'] and r['lb']['desc']) for r in recs), "| genre:", sum('genre' in r for r in recs), "| year:", sum('releaseyear' in r for r in recs))
print("starred:", len(STARRED), "| collections:", {k: len(v) for k, v in COLLECTIONS.items()})
print("CollectionSystemsCustom additions:", ",".join(COLLECTIONS))
print("no cover:", [r["title"] for r in recs if "covers" not in r["art"]])
print("no description:", [r["title"] for r in recs if not (r["lb"] and r["lb"]["desc"])])
