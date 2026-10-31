#!/usr/bin/env python3
"""Match ~/ROMs/nes/USA against the libretro No-Intro DAT + metadat files.

Produces a JSON catalog (one record per ROM file) used by nes_build.py:
clean title, variant class, primary/hidden, developer, publisher, year, genre, players, esrb, franchise,
and the No-Intro name that thumbnails.libretro.com files artwork under.
"""
import json, re, sys, zlib, pathlib, unicodedata

ROMDIR = pathlib.Path.home() / "ROMs/nes/USA"
DATDIR = pathlib.Path(sys.argv[1])          # folder holding no-intro.dat + metadat *.dat
OUT = pathlib.Path(sys.argv[2])

def parse_dat(path, keys):
    """libretro clrmamepro dat -> list of dicts (name + requested keys + crc)"""
    out, cur = [], None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if s == "game (":
            cur = {}
        elif s == ")" and cur is not None:
            out.append(cur); cur = None
        elif cur is not None:
            m = re.match(r'(\w+) "?(.*?)"?$', s)
            if s.startswith("rom ("):
                for k, v in re.findall(r'(\w+) ("[^"]*"|\S+)', s[5:]):
                    cur.setdefault("rom_" + k, v.strip('"'))
            elif m and (m.group(1) in keys or m.group(1) in ("name", "comment")):
                cur[m.group(1)] = m.group(2)
    return out

nointro = parse_dat(DATDIR / "no-intro.dat", ())
by_crc = {g["rom_crc"].upper(): g for g in nointro if "rom_crc" in g}

meta = {}
for key, field in [("genre", "genre"), ("developer", "developer"), ("publisher", "publisher"),
                   ("releaseyear", "releaseyear"), ("releasemonth", "releasemonth"),
                   ("maxusers", "users"), ("franchise", "franchise"), ("esrb", "esrb_rating")]:
    for g in parse_dat(DATDIR / f"{key}.dat", (field,)):
        if field in g and "rom_crc" in g:
            meta.setdefault(g["rom_crc"].upper(), {})[key] = g[field]

# --- name fallback ---------------------------------------------------------------------------------------
ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6"}

def norm(s, drop_subtitle=False):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()
    s = re.sub(r"^(.*), (the|a|an)$", r"\2 \1", s)
    if drop_subtitle: s = re.split(r"\s+-\s+|:\s+", s)[0]
    s = s.replace("&", "and").replace("vs.", "vs").replace("versus", "vs")
    s = re.sub(r"^(the|a|an) ", "", s)
    words = [ROMAN.get(w, w) for w in re.split(r"[^a-z0-9]+", s) if w]
    return "".join(words)

def no_intro_base(name):  # "Title (USA) (Rev 1)" -> "Title"
    return re.sub(r"\s*\(.*$", "", name)

JUNK = r"Proto|Beta|Demo|Sample|Aftermarket|Pirate|Kiosk|Promo|Rev |Alt"
by_base, by_base_sub = {}, {}
for tier, pat in enumerate((r"\((USA|World)[,)]", r"\((Europe|Japan|Australia)", r"")):   # best region first
    for g in nointro:
        n = g["name"]
        if re.search(pat, n) and not re.search(JUNK, n):
            by_base.setdefault(norm(no_intro_base(n)), g)
            by_base_sub.setdefault(norm(no_intro_base(n), True), g)

import difflib
def find_game(title):
    title = re.sub(r"\s*\(Prototype\)$", "", title)
    k = norm(title)
    if k in by_base: return by_base[k]
    k2 = norm(title, True)
    if k2 in by_base_sub and len(k2) > 5: return by_base_sub[k2]
    c = difflib.get_close_matches(k, list(by_base), 1, 0.9)
    return by_base[c[0]] if c else None

def title_from_rom(fn):
    """GoodNES-style name -> (clean title, flags[], region tags[])"""
    stem = fn.rsplit(".", 1)[0]
    flags = re.findall(r"\[([^\]]+)\]", stem)
    parens = re.findall(r"\(([^)]*)\)", stem)
    t = re.sub(r"\s*[\[(].*$", "", stem).strip()
    m = re.match(r"^(.*), (The|A|An)$", t)          # "Addams Family, The" -> "The Addams Family"
    if m: t = f"{m.group(2)} {m.group(1)}"
    t = re.sub(r"\s+-\s+", ": ", t)                  # "Addams Family - Pugsley's ..." -> subtitle colon
    if t.isupper() and len(t) > 3: t = t.title()
    return t, flags, parens

def classify(flags):
    """lower rank = better candidate for the primary entry of a title"""
    f = [x.lower() for x in flags]
    if any(re.match(r"[hpt]\d*|hm|t[+-]", x) or x.startswith(("t+", "t-")) for x in f): return 5, "hack/trainer/translation"
    if any(re.match(r"b\d*$", x) for x in f): return 6, "bad dump"
    if any(re.match(r"o\d*$", x) for x in f): return 4, "overdump"
    if any(re.match(r"f\d*$", x) for x in f): return 3, "fixed dump"
    if any(re.match(r"a\d*$", x) for x in f): return 2, "alternate"
    if "!" in f: return 0, "verified"
    return 1, "ok"

recs = []
for p in sorted(ROMDIR.iterdir()):
    if p.suffix.lower() not in (".nes", ".zip", ".fds", ".unf", ".unif"): continue
    title, flags, parens = title_from_rom(p.name)
    rank, cls = classify(flags)
    if any(re.search(r"hack|trainer", x, re.I) for x in parens): rank, cls = 5, "hack/trainer/translation"
    if any(x.lower() == "prototype" for x in parens): title += " (Prototype)"
    crc = f"{zlib.crc32(p.read_bytes()) & 0xffffffff:08X}"
    g, how = by_crc.get(crc), "crc"
    if not g:  # try the title
        g = find_game(title)
        if g: how = "name"
    if g and g.get("rom_crc"): mcrc = g["rom_crc"].upper()
    else: mcrc = crc
    m = meta.get(mcrc, {})
    recs.append(dict(file=p.name, title=title, flags=flags, parens=parens, rank=rank, cls=cls, crc=crc,
                     matched=how if g else None, nointro=g["name"] if g else None, **m))

# pick one primary file per title (best rank, then plain (U) over others, then file order)
groups = {}
for r in recs: groups.setdefault(norm(r["title"]), []).append(r)
for grp in groups.values():
    grp.sort(key=lambda r: (r["rank"], "(U)" not in r["file"], r["file"]))
    for i, r in enumerate(grp):
        r["primary"] = i == 0 and r["rank"] < 5
        r["variants"] = len(grp)

OUT.write_text(json.dumps(recs, indent=1))
n = len(recs)
print(f"{n} files, {len(groups)} titles, {sum(r['primary'] for r in recs)} primary")
print("matched by crc:", sum(r['matched'] == 'crc' for r in recs), " by name:", sum(r['matched'] == 'name' for r in recs),
      " unmatched:", sum(not r['matched'] for r in recs))
for k in ("genre", "developer", "publisher", "releaseyear", "maxusers"):
    print(f"  {k}: {sum(k in r for r in recs)}")
