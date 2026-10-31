#!/usr/bin/env python3
"""Build the ES-DE gamelist for the Pinball system (~/ROMs/vpinball, Visual Pinball X tables).
Table files are usually named like  "Medieval Madness (Williams 1997) v1.2.vpx" ; the name, maker and year come from that.
Anything without the "(Maker Year)" part still shows up under its file name. Keeps play counts/favorites already in the list.
Artwork: drop images in ~/ES-DE/downloaded_media/vpinball/{covers,screenshots,titlescreens}/<table file name>.png (or run ES-DE's scraper)."""

import pathlib
import re
import shutil
import time
from xml.sax.saxutils import escape

ROMS = pathlib.Path.home() / "ROMs/vpinball"
gl = pathlib.Path.home() / "ES-DE/gamelists/vpinball/gamelist.xml"
old = gl.read_text() if gl.exists() else ""
if old:
    shutil.copy(gl, gl.with_suffix(f".xml.bak.{time.strftime('%Y%m%d-%H%M%S')}"))
tag = lambda k, v: f"\t\t<{k}>{escape(str(v))}</{k}>\n" if v else ""

rows = []
for f in sorted(ROMS.iterdir(), key=lambda p: p.name.lower()):
    if f.suffix.lower() not in (".vpx", ".vpt"):
        continue
    stem = f.stem
    m = re.match(r"^(.*?)\s*\(([^()]*?)\s+((?:19|20)\d\d)\)", stem)
    if m:
        name, maker, year = m.group(1).strip(), m.group(2).strip(), m.group(3)
    else:
        name, maker, year = re.sub(r"\s+v?\d+(\.\d+)*\s*$", "", stem).strip(), "", ""
    row = ["\t<game>\n", tag("path", "./" + f.name), tag("name", name)]
    if year:
        row.append(tag("releasedate", f"{year}0101T000000"))
    row += [
        tag("developer", maker),
        tag("publisher", maker),
        tag("genre", "Pinball"),
        tag("players", "4" if maker else "1"),
    ]
    m2 = re.search(r"<game>(?:(?!</game>).)*?<path>\./%s</path>.*?</game>" % re.escape(escape(f.name)), old, re.S)
    if m2:
        for k, v in re.findall(r"<(playcount|playtime|lastplayed|favorite)>(.*?)</", m2.group(0)):
            row.append(tag(k, v))
    rows.append("".join(row) + "\t</game>\n")
gl.parent.mkdir(parents=True, exist_ok=True)
gl.write_text('<?xml version="1.0"?>\n<gameList>\n' + "".join(rows) + "</gameList>\n")
print(len(rows), "tables")
