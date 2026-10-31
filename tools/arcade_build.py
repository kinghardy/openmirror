#!/usr/bin/env python3
"""Build the ES-DE arcade library for ~/ROMs/mame (played with the FBNeo core): gamelist.xml with clean names,
year/manufacturer from the FBNeo DAT, descriptions/genre/players/rating from LaunchBox, and artwork from
thumbnails.libretro.com ("FBNeo - Arcade Games", then "MAME").

usage: arcade_build.py <workdir> <lb-arcade.json>
<workdir> holds arcade.dat + neogeo.dat (FBNeo ClrMamePro XML dats) and the thumbnail listings
{FBNeo,MAME}_Named_{Boxarts,Titles,Snaps}.txt (see how they were fetched in the nes_* scripts)."""

import json
import pathlib
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

WORK, LBJSON = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ROMS = pathlib.Path.home() / "ROMs/mame"
ES = pathlib.Path.home() / "ES-DE"
MEDIA = ES / "downloaded_media/mame"
KINDS = {"covers": "Named_Boxarts", "titlescreens": "Named_Titles", "screenshots": "Named_Snaps"}
SOURCES = {"FBNeo": "FBNeo%20-%20Arcade%20Games", "MAME": "MAME"}

# display name, LaunchBox name  (the FBNeo descriptions carry set/region noise, e.g. "Puck Man (Japan, set 1)")
NAMES = {
    "puckman": ("Pac-Man", "Pac-Man"),
    "mspacman": ("Ms. Pac-Man", "Ms. Pac-Man"),
    "galaga": ("Galaga", "Galaga"),
    "dkong": ("Donkey Kong", "Donkey Kong"),
    "frogger": ("Frogger", "Frogger"),
    "sf2hf": ("Street Fighter II: Hyper Fighting", "Street Fighter II': Hyper Fighting"),
    "mvsc": ("Marvel vs. Capcom", "Marvel vs. Capcom: Clash of Super Heroes"),
    "mslugx": ("Metal Slug X", "Metal Slug X"),
    "mk2": ("Mortal Kombat II", "Mortal Kombat II"),
    "nbajamte": ("NBA Jam Tournament Edition", "NBA Jam Tournament Edition"),
    "tmnt": ("Teenage Mutant Ninja Turtles", "Teenage Mutant Ninja Turtles"),
    "simpsons": ("The Simpsons", "The Simpsons"),
    "xmen": ("X-Men", "X-Men"),
}

dat = {}
for f in ("arcade.dat", "neogeo.dat"):
    for g in ET.parse(WORK / f).getroot().iter("game"):
        dat.setdefault(g.get("name"), g)

lb = {}
for e in sorted(json.loads(LBJSON.read_text()), key=lambda e: -e["votes"]):
    lb.setdefault(e["name"].lower(), e)


def listing(src, kind):
    p = WORK / f"{src}_{KINDS[kind]}.txt"
    return {l[:-4] for l in p.read_text().splitlines() if l.endswith(".png")}


LISTS = {(s, k): listing(s, k) for s in SOURCES for k in KINDS}


def safe(n):
    return re.sub(r'[&*/:`<>?\\|"]', "_", n)


jobs, games = [], []
for z in sorted(ROMS.glob("*.zip")):
    rom = z.stem
    g = dat.get(rom)
    if g is None:
        print("not in the FBNeo dat:", rom)
        continue
    desc = g.findtext("description")
    name, lbname = NAMES.get(rom, (re.sub(r"\s*\(.*", "", desc), re.sub(r"\s*\(.*", "", desc)))
    e = lb.get(lbname.lower())
    art = {}
    for kind in KINDS:
        for src in SOURCES:
            if safe(desc) in LISTS[src, kind]:
                art[kind] = (src, safe(desc))
                break
    for kind, (src, n) in art.items():
        (MEDIA / kind).mkdir(parents=True, exist_ok=True)
        jobs.append(
            (
                f"https://thumbnails.libretro.com/{SOURCES[src]}/{KINDS[kind]}/{urllib.parse.quote(n + '.png')}",
                MEDIA / kind / f"{rom}.png",
            )
        )
    games.append(
        dict(rom=rom, name=name, desc=desc, year=g.findtext("year"), maker=g.findtext("manufacturer"), lb=e, art=art)
    )

for url, dest in jobs:
    if dest.exists() and dest.stat().st_size:
        continue
    for attempt in range(3):
        try:
            dest.write_bytes(urllib.request.urlopen(url, timeout=30).read())
            break
        except Exception:
            time.sleep(1 + attempt)
    else:
        print("failed:", url)

gl = ES / "gamelists/mame/gamelist.xml"
old = gl.read_text() if gl.exists() else ""
if old:
    shutil.copy(gl, gl.with_suffix(f".xml.bak.{time.strftime('%Y%m%d-%H%M%S')}"))


def tag(k, v):
    return f"\t\t<{k}>{escape(str(v))}</{k}>\n" if v not in (None, "") else ""


out = ['<?xml version="1.0"?>\n<gameList>\n']
for g in games:
    e = g["lb"]
    row = ["\t<game>\n", tag("path", f"./{g['rom']}.zip"), tag("name", g["name"])]
    if g["year"] and g["year"].isdigit():
        row.append(tag("releasedate", f"{g['year']}0101T000000"))
    if e and e["desc"]:
        row.append(tag("desc", e["desc"]))
    if e and e["votes"] >= 3:
        row.append(tag("rating", round(e["rating"] / 5, 2)))
    row += [
        tag("developer", g["maker"]),
        tag("publisher", g["maker"]),
        tag("genre", (e["genres"].split(";")[0].strip() if e else "")),
        tag("players", e["players"] if e and e["players"].isdigit() else ""),
    ]
    m = re.search(r"<game>(?:(?!</game>).)*?<path>\./%s\.zip</path>.*?</game>" % g["rom"], old, re.S)
    if m:
        for k, v in re.findall(r"<(playcount|playtime|lastplayed|favorite)>(.*?)</", m.group(0)):
            row.append(tag(k, v))
    out.append("".join(row) + "\t</game>\n")
out.append("</gameList>\n")
gl.parent.mkdir(parents=True, exist_ok=True)
gl.write_text("".join(out))
print(
    len(games),
    "games;",
    "covers:",
    sum("covers" in g["art"] for g in games),
    "titles:",
    sum("titlescreens" in g["art"] for g in games),
    "snaps:",
    sum("screenshots" in g["art"] for g in games),
    "descriptions:",
    sum(bool(g["lb"] and g["lb"]["desc"]) for g in games),
)
for g in games:
    miss = [k for k in KINDS if k not in g["art"]]
    if miss or not g["lb"]:
        print("  ", g["rom"], "missing art:", miss, "no LB match" if not g["lb"] else "")
