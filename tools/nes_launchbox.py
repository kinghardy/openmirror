#!/usr/bin/env python3
"""Pull the NES entries (description, community rating + vote count) out of LaunchBox's Metadata.xml
(https://gamesdb.launchbox-app.com/Metadata.zip) into a small JSON file for nes_build.py.
usage: nes_launchbox.py Metadata.xml out.json [platform]   (platform defaults to "Nintendo Entertainment System")"""
import json, sys
import xml.etree.ElementTree as ET

PLATFORM = sys.argv[3] if len(sys.argv) > 3 else "Nintendo Entertainment System"
out = []
for _, el in ET.iterparse(sys.argv[1], events=("end",)):
    if el.tag != "Game": continue
    if el.findtext("Platform") == PLATFORM:
        t = lambda k: (el.findtext(k) or "").strip()
        out.append(dict(name=t("Name"), desc=t("Overview"), rating=float(t("CommunityRating") or 0),
                        votes=int(t("CommunityRatingCount") or 0), year=t("ReleaseYear"), players=t("MaxPlayers"),
                        genres=t("Genres"), dev=t("Developer"), pub=t("Publisher")))
    el.clear()
json.dump(out, open(sys.argv[2], "w"))
print(len(out), "entries;", sum(bool(o["desc"]) for o in out), "with descriptions")
