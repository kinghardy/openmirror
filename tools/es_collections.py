#!/usr/bin/env python3
"""Before ES-DE starts (launch-arcade.sh runs this; ES-DE rewrites its settings when it exits, so editing them while it
runs does not stick): enable every custom collection that has a ~/ES-DE/collections/custom-*.cfg file, and pick where
ES-DE opens: `es_collections.py pinball` starts in the Pinball list, anything else on the normal system screen."""

import pathlib
import re
import sys

ES = pathlib.Path.home() / "ES-DE"
names = sorted(p.stem[len("custom-") :] for p in (ES / "collections").glob("custom-*.cfg"))
# NES first, then GBA, then the rest, so the collection list reads in a sensible order
order = lambda n: (0 if n.startswith("NES ") else 1 if n.startswith("SNES ") else 2 if n.startswith("GBA ") else 3, n)
value = ",".join(sorted(names, key=order)).replace("&", "&amp;")
f = ES / "settings/es_settings.xml"
s = f.read_text()
new = re.sub(r'(<string name="CollectionSystemsCustom" value=")[^"]*(")', lambda m: m.group(1) + value + m.group(2), s)
pinball = len(sys.argv) > 1 and sys.argv[1] == "pinball"
for name, val in (
    ("StartupSystem", "vpinball" if pinball else ""),
    ("StartupView", "gamelist" if pinball else "system"),
):
    new = re.sub(rf'(<string name="{name}" value=")[^"]*(")', lambda m, val=val: m.group(1) + val + m.group(2), new)
if new != s:
    f.write_text(new)
