#!/usr/bin/env python3
"""Reapply the mirror's Visual Pinball X display settings before every launch. VPX rewrites VPinballX.ini when it exits and
drops the camera overrides, so ~/Applications/VPinball/VPinballX_GL (the launcher) runs this first.
Edit SETTINGS to tune the portrait look; anything not listed (controller layout, etc.) is left alone."""

import pathlib
import re
import sys

INI = pathlib.Path.home() / ".local/share/VPinballX/10.8/VPinballX.ini"
SETTINGS = [
    # window: borderless fullscreen on the portrait panel (1080x1920, a 575x323 mm TV turned on its side)
    ("Player", "PlayfieldFullScreen", "1"),
    ("Player", "PlayfieldWidth", "1080"),
    ("Player", "PlayfieldHeight", "1920"),
    ("Player", "ScreenWidth", "32.3"),
    ("Player", "ScreenHeight", "57.5"),
    ("Player", "ScreenInclination", "0"),
    # flat top-down 'window' camera instead of each table's own tilted desktop view
    ("TableOverride", "ViewDTMode", "2"),
    ("TableOverride", "ViewDTWindowTop", "0"),
    ("TableOverride", "ViewDTWindowBot", "0"),
    ("TableOverride", "ViewDTScaleX", "0.94"),
    ("TableOverride", "ViewDTScaleY", "0.94"),  # a little smaller so the top arch isn't cropped
    # old GPU / CPU: small textures, no texture cache (the cache hung on the second load of every table)
    ("Player", "MaxTexDimension", "2048"),
    ("Player", "CacheMode", "0"),
    ("Plugin.PinMAME", "PinMAMEPath", str(pathlib.Path.home() / ".pinmame") + "/"),
    # controller: VPX's own gamepad input never reached the tables on this machine, so the buttons are keyboard-only here and
    # tools/pad_quit.py (running alongside ES-DE) turns the Xbox controller into these keys while a table is open
    ("Input", "Mapping.LeftFlipper", "Key;225"),
    ("Input", "Mapping.RightFlipper", "Key;229"),
    ("Input", "Mapping.LeftStagedFlipper", "Key;225"),
    ("Input", "Mapping.RightStagedFlipper", "Key;229"),
    ("Input", "Mapping.LeftMagna", "Key;224"),
    ("Input", "Mapping.RightMagna", "Key;228"),
    ("Input", "Mapping.LaunchBall", "Key;40"),
    ("Input", "Mapping.Credit1", "Key;34"),
    ("Input", "Mapping.Start", "Key;30"),
]
extra = [tuple(a.split("=", 1)) for a in sys.argv[1:]]  # optional ad-hoc  Section.Key=value  for experiments
SETTINGS += [
    (
        k.split(".", 1)[0] if k.count(".") == 1 and k.split(".")[0] in ("Player", "TableOverride") else "TableOverride",
        k.split(".", 1)[1] if k.count(".") == 1 and k.split(".")[0] in ("Player", "TableOverride") else k,
        v,
    )
    for k, v in extra
]

s = INI.read_text()
for sec, key, val in SETTINGS:
    m = re.search(rf"(?ms)^\[{re.escape(sec)}\]\n(.*?)(?=^\[)", s)
    if not m:
        print("no section", sec, file=sys.stderr)
        continue
    body, n = re.subn(rf"(?m)^{re.escape(key)} = .*$", f"{key} = {val}", m.group(0), count=1)
    if n:
        s = s[: m.start()] + body + s[m.end() :]
    else:
        print("no key", sec, key, file=sys.stderr)
INI.write_text(s)


# PinMAME tables need their ROM zip (e.g. tomjerry.zip) in PinMAME's roms folder. Link any real .zip dropped next to the tables
# (or in ~/.local/share/vpinball/roms) into it, skip files that aren't zip archives (failed downloads saved as .zip are
# really web pages), and clear links whose file was removed.
import zipfile

roms = pathlib.Path.home() / ".pinmame/roms"
roms.mkdir(parents=True, exist_ok=True)
(roms.parent / "nvram").mkdir(exist_ok=True)
for link in roms.iterdir():
    if link.is_symlink() and not (link.exists() and zipfile.is_zipfile(link)):
        link.unlink()
for folder in (pathlib.Path.home() / "ROMs/vpinball", pathlib.Path.home() / ".local/share/vpinball/roms"):
    for z in folder.glob("*.zip"):
        link = roms / z.name
        if zipfile.is_zipfile(z):
            if not link.exists() and not link.is_symlink():
                link.symlink_to(z)
        else:
            print(f"{z} is not a zip archive (failed download?)", file=sys.stderr)
