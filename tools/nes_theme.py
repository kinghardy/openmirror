#!/usr/bin/env python3
"""Build the 'arcade-nes' ES-DE theme: Slate (kept for the system screen and its assets) with the portrait
gamelist replaced by tools/arcade_gamelist.xml. Re-run after changing that file."""

import pathlib
import re
import shutil

SRC = pathlib.Path.home() / "Applications/ES-DE/AppDir/usr/bin/themes/slate-es-de"
DST = pathlib.Path.home() / "ES-DE/themes/arcade-nes"
shutil.rmtree(DST, ignore_errors=True)
shutil.copytree(SRC, DST)

arcade = (pathlib.Path(__file__).parent / "arcade_gamelist.xml").read_text()

t = (DST / "theme.xml").read_text()
head = t[: t.index('        <view name="gamelist">')]  # includes the system view and bands
t = head + arcade + "    </variant>\n</theme>\n"  # drops Slate's gamelist + its media variants
t = t.replace(
    "<theme>\n", "<theme>\n    <variables><marqueeText>NES ARCADE</marqueeText></variables>\n", 1
)  # default; systems override it in <system>/colors.xml
(DST / "theme.xml").write_text(
    t.replace("Slate for ES-DE Frontend (slate-es-de)", "NES Arcade (arcade-nes), based on Slate")
)

a = DST / "aspect-ratio-16-9-vertical.xml"
a.write_text(re.sub(r'\s*<view name="gamelist">.*?</view>', "", a.read_text(), flags=re.S))

c = DST / "capabilities.xml"
c.write_text(c.read_text().replace("<themeName>Slate</themeName>", "<themeName>NES Arcade</themeName>"))
# system screen: same dark neon palette (dark colour scheme variables + the NES stripes)
col = DST / "colors.xml"
x = col.read_text()
dark = x[x.index('<colorScheme name="dark">') : x.index('</colorScheme>', x.index('<colorScheme name="dark">'))]
new = dark
for var, val in (
    ("backgroundColor", "07060F"),
    ("systemCarouselColor", "E9E5FFE6"),
    ("systemGameCounterColor", "FFC400"),
    ("systemGameCounterBackgroundColor", "000000B0"),
    ("systemInfoTextColor", "B9B4DA"),
    ("systemHelpColor", "B9B4DA"),
    ("systemHelpColorDimmed", "77739A"),
):
    new = re.sub(rf"(<{var}>)[^<]*(</{var}>)", rf"\g<1>{val}\g<2>", new)
col.write_text(x.replace(dark, new))
NEON = ["FF2D95", "29F0FF", "FFC400", "8A4DFF"]  # the four vertical stripes
MARQUEE = {
    "mame": "ARCADE CLASSICS",
    "gba": "GAME BOY ADVANCE",
    "snes": "SUPER NINTENDO",
    "vpinball": "PINBALL",
}  # everything else says NES ARCADE
for cf in DST.glob("*/colors.xml"):
    n = cf.read_text()
    colors = iter(NEON)
    n = re.sub(
        r"(<image name=\"band\d\">\s*<color>)[^<]*(</color>)",
        lambda m, colors=colors: m.group(1) + next(colors, "FFFFFF") + m.group(2),
        n,
    )
    text = MARQUEE.get(cf.parent.name, "NES ARCADE")
    n = n.replace("</theme>", f"    <variables>\n        <marqueeText>{text}</marqueeText>\n    </variables>\n</theme>")
    cf.write_text(n)
print("theme written to", DST)
