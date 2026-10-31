"""Music catalogue: search, discovery shelves, artist / album pages, Deezer-to-Apple matching, facts and lyrics. (split out of proxy.py)"""

import os
import re
import urllib.request
import urllib.error
import urllib.parse
import json
import threading
import time
import hashlib
import difflib
from concurrent.futures import ThreadPoolExecutor
from mirror_util import JUNK, VARIANT, _jload, _jsave, _plain, art600, dz, m_album, m_song, mget


def music_artist(aid, name):
    """an artist's page, from Deezer (no Apple calls): their most popular songs, then their albums (full albums before singles / EPs)"""
    try:
        cands = dz("/search/artist?q=" + urllib.parse.quote(name[:80]) + "&limit=5", 3600).get("data", [])
        a = next(
            (x for x in sorted(cands, key=lambda x: -x.get("nb_fan", 0)) if _plain(x["name"]) == _plain(name)),
            cands[0] if cands else None,
        )
        if not a:
            return {"name": name, "id": "", "songs": [], "albums": []}
        top = dz_to_apple(dz(f"/artist/{a['id']}/top?limit=25", 3600).get("data", []), 12)
        als = [
            x
            for x in dz(f"/artist/{a['id']}/albums?limit=60", 3600).get("data", [])
            if not JUNK.search(x.get("title", ""))
        ]
        als.sort(key=lambda x: (x.get("record_type") != "album", -(x.get("fans") or 0)))
        seen, albums = set(), []
        for x in als:
            k = _plain(x["title"])
            if k in seen:
                continue
            seen.add(k)
            albums.append(
                {
                    "kind": "album",
                    "id": f"dza:{x['id']}",
                    "title": x["title"],
                    "artist": a["name"],
                    "art": x.get("cover_xl") or x.get("cover_big", ""),
                    "count": 0,
                }
            )
        return {"name": a["name"], "id": str(a["id"]), "songs": top, "albums": albums[:20]}
    except (OSError, ValueError, KeyError, IndexError):
        return {"name": name, "id": "", "songs": [], "albums": []}


def music_search(q):
    q = urllib.parse.quote(q[:80])
    songs = mget(f"https://itunes.apple.com/search?term={q}&entity=song&limit=25&country=us", 600).get("results", [])
    albums = mget(f"https://itunes.apple.com/search?term={q}&entity=album&limit=20&country=us", 600).get("results", [])
    try:
        arts = mget(f"https://itunes.apple.com/search?term={q}&entity=musicArtist&limit=3&country=us", 600).get(
            "results", []
        )
    except (OSError, ValueError):
        arts = []
    return {
        "songs": [m_song(r) for r in songs if r.get("trackId")],
        "albums": [m_album(r) for r in albums if r.get("collectionId")],
        "artists": [
            {
                "kind": "artist",
                "id": str(r["artistId"]),
                "title": r.get("artistName", ""),
                "artist": r.get("primaryGenreName", ""),
            }
            for r in arts
            if r.get("artistId")
        ],
    }


def music_chart(kind, genre):
    if not (
        genre and str(genre).isdigit()
    ):  # overall charts: Apple's current feed (the old per-genre one is stale for these)
        try:
            out = []
            for r in mget(f"https://rss.applemarketingtools.com/api/v2/us/music/most-played/25/{kind}.json", 1800)[
                "feed"
            ]["results"]:
                alb = re.search(r"/(\d+)\?i=", r.get("url", ""))
                out.append(
                    {
                        "kind": kind[:-1],
                        "id": r["id"],
                        "title": r["name"],
                        "artist": r["artistName"],
                        "album": "",
                        "albumId": alb.group(1) if alb else "",
                        "art": art600(r.get("artworkUrl100")),
                        "dur": 0,
                        "count": 0,
                    }
                )
            if out:
                return out
        except (OSError, ValueError, KeyError):
            pass
    g = f"/genre={int(genre)}" if genre and str(genre).isdigit() else ""
    d = mget(f"https://itunes.apple.com/us/rss/top{kind}/limit=25{g}/json", 1800).get("feed", {}).get("entry", [])
    out = []
    for e in d:
        try:
            art = art600((e.get("im:image") or [{}])[-1].get("label"))
            if kind == "songs":
                href = e["im:collection"]["link"]["attributes"]["href"] if "im:collection" in e else ""
                alb = re.search(r"/id(\d+)", href)
                out.append(
                    {
                        "kind": "song",
                        "id": e["id"]["attributes"]["im:id"],
                        "title": e["im:name"]["label"],
                        "artist": e["im:artist"]["label"],
                        "album": (e.get("im:collection") or {}).get("im:name", {}).get("label", ""),
                        "albumId": alb.group(1) if alb else "",
                        "art": art,
                        "dur": 0,
                    }
                )
            else:
                out.append(
                    {
                        "kind": "album",
                        "id": e["id"]["attributes"]["im:id"],
                        "title": e["im:name"]["label"],
                        "artist": e["im:artist"]["label"],
                        "art": art,
                        "count": 0,
                    }
                )
        except (KeyError, IndexError, TypeError):
            continue
    return out


POP_ARTISTS = "The Beatles|Taylor Swift|Drake|The Weeknd|Beyoncé|Eminem|Kendrick Lamar|Ed Sheeran|Ariana Grande|Billie Eilish|Bad Bunny|Post Malone|Rihanna|Justin Bieber|Bruno Mars|Adele|Lady Gaga|Coldplay|Queen|Michael Jackson|Elvis Presley|Led Zeppelin|Pink Floyd|The Rolling Stones|Fleetwood Mac|Eagles|AC/DC|Metallica|Nirvana|Foo Fighters|Green Day|Linkin Park|Red Hot Chili Peppers|Imagine Dragons|Maroon 5|Twenty One Pilots|Fall Out Boy|My Chemical Romance|Panic! At The Disco|Paramore|Blink-182|Guns N' Roses|Aerosmith|Bon Jovi|Journey|Foreigner|Boston|Kiss|Van Halen|Def Leppard|Bruce Springsteen|Bob Dylan|Neil Young|The Beach Boys|The Doors|The Who|David Bowie|Elton John|Billy Joel|Phil Collins|Genesis|Bee Gees|ABBA|Madonna|Prince|Whitney Houston|Mariah Carey|Celine Dion|Stevie Wonder|Marvin Gaye|Aretha Franklin|Ray Charles|Frank Sinatra|Louis Armstrong|Johnny Cash|Willie Nelson|Dolly Parton|Garth Brooks|George Strait|Alan Jackson|Kenny Chesney|Luke Combs|Morgan Wallen|Zach Bryan|Chris Stapleton|Jason Aldean|Luke Bryan|Blake Shelton|Carrie Underwood|Miranda Lambert|Kacey Musgraves|Tim McGraw|Brad Paisley|Keith Urban|Eric Church|Thomas Rhett|Florida Georgia Line|Lainey Wilson|Tyler Childers|Sturgill Simpson|Charlie Daniels Band|Lynyrd Skynyrd|Creedence Clearwater Revival|Tom Petty|Dire Straits|Eric Clapton|Jimi Hendrix|Santana|Steely Dan|Chicago|Earth, Wind & Fire|Jay-Z|Kanye West|Travis Scott|Future|Lil Wayne|Nicki Minaj|Cardi B|Megan Thee Stallion|Doja Cat|SZA|Frank Ocean|Tyler, The Creator|J. Cole|21 Savage|Lil Baby|Gunna|Young Thug|Juice WRLD|XXXTentacion|Lil Uzi Vert|Migos|Snoop Dogg|Dr. Dre|50 Cent|Ice Cube|2Pac|The Notorious B.I.G.|Nas|Run-DMC|Beastie Boys|Outkast|Usher|Chris Brown|Akon|Ne-Yo|Alicia Keys|John Legend|Sam Smith|Shawn Mendes|Harry Styles|One Direction|Dua Lipa|Olivia Rodrigo|Sabrina Carpenter|Chappell Roan|Lana Del Rey|Lorde|Halsey|Katy Perry|Miley Cyrus|Selena Gomez|Demi Lovato|Britney Spears|Christina Aguilera|Justin Timberlake|NSYNC|Backstreet Boys|Spice Girls|Destiny's Child|TLC|Janet Jackson|Cher|Tina Turner|Stevie Nicks|Joni Mitchell|Carole King|Simon & Garfunkel|James Taylor|Jimmy Buffett|Bob Marley|Peter Tosh|Sublime|Dave Matthews Band|Pearl Jam|Soundgarden|Alice in Chains|Stone Temple Pilots|Radiohead|Oasis|Blur|The Cure|The Smiths|U2|R.E.M.|The Killers|Arctic Monkeys|The Strokes|The Black Keys|Kings of Leon|Mumford & Sons|The Lumineers|Hozier|Lewis Capaldi|Lizzo|Khalid|Daft Punk|Calvin Harris|Avicii|David Guetta|Marshmello|The Chainsmokers|Kygo|Zedd|Skrillex|Diplo|Metro Boomin|Tate McRae|Ella Langley|Karol G|Peso Pluma|Shakira|Daddy Yankee|J Balvin|Rosalía|Luis Miguel|Selena|Vicente Fernández|BTS|BLACKPINK|Stray Kids|NewJeans|Hans Zimmer|John Williams|Ludovico Einaudi|Beabadoobee|Bea Miller|Beach House|Beck|Beastie Boys|Bebe Rexha|Bee Gees|Belinda Carlisle|Ben E. King|Benson Boone|Billy Idol|Black Sabbath|Blondie|Bob Seger|Bonnie Raitt|Boyz II Men|Brooks & Dunn|Bryan Adams|Buddy Holly|Cage the Elephant|Carly Simon|Carpenters|Chuck Berry|Cyndi Lauper|Dean Martin|Depeche Mode|Dionne Warwick|Disturbed|Dixie Chicks|Donna Summer|Duran Duran|Fats Domino|Faith Hill|Gloria Estefan|Gordon Lightfoot|Heart|Hootie & the Blowfish|Huey Lewis and the News|Iron Maiden|Jackson 5|Jason Mraz|Jelly Roll|Jim Croce|Joe Cocker|John Denver|John Lennon|Judas Priest|Kenny Rogers|Lionel Richie|Little Richard|Lil Nas X|Loretta Lynn|Meat Loaf|Megadeth|Motley Crue|Neil Diamond|Nickelback|Olivia Newton-John|Otis Redding|Ozzy Osbourne|Patsy Cline|Paul McCartney|Paul Simon|Pitbull|Poison|Reba McEntire|REO Speedwagon|Rod Stewart|Roy Orbison|Rush|Sade|Sam Cooke|Scorpions|Shania Twain|Sheryl Crow|Slipknot|Sting|System of a Down|The Police|The Temptations|Toby Keith|Toto|Train|Vince Gill|Waylon Jennings|Weezer|Wham!|Wu-Tang Clan|Zac Brown Band|ZZ Top".split(
    "|"
)  # well-known artists, most famous first: the keyless autocomplete ranks by exact name, so "bea" finds a no-name "Bea" before The Beatles


def _norm(s):
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"^the ", "", s.lower().replace("&", "and")).strip())


def artist_hints(q, n=3):
    qn = _norm(q)
    if len(qn) < 2:
        return []
    pre, wrd = [], []
    for name in dict.fromkeys(POP_ARTISTS):
        nn = _norm(name)
        if nn.startswith(qn):
            pre.append(name)
        elif len(qn) >= 3 and any(w.startswith(qn) for w in nn.split()):
            wrd.append(name)
    return (pre + wrd)[:n]


def music_suggest(q):
    """search-as-you-type suggestions from Deezer's keyless autocomplete (a failed lookup just means no suggestions)"""
    q = q.strip()[:60]
    if len(q) < 2:
        return []
    try:
        d = mget("https://api.deezer.com/search/autocomplete?limit=5&q=" + urllib.parse.quote(q), 900)
    except (OSError, ValueError):
        d = {}
    out, seen = [], set()
    for n in artist_hints(q):
        if n.lower() not in seen:
            seen.add(n.lower())
            out.append({"kind": "artist", "q": n, "label": n})
    for a in (d.get("artists") or {}).get("data", [])[:3]:
        n = a.get("name", "")
        if n and n.lower() not in seen:
            seen.add(n.lower())
            out.append({"kind": "artist", "q": n, "label": n})
    for t in (d.get("tracks") or {}).get("data", [])[:5]:
        n, who = t.get("title_short") or t.get("title", ""), (t.get("artist") or {}).get("name", "")
        if n and f"{n} {who}".lower() not in seen:
            seen.add(f"{n} {who}".lower())
            out.append({"kind": "song", "q": f"{n} {who}".strip(), "label": n, "sub": who})
    return out[:7]


def dz_album_items(aid):
    a = dz(f"/album/{int(aid)}", 3600)
    tr = (a.get("tracks") or {}).get("data", [])
    art = a.get("cover_xl") or a.get("cover_big", "")
    out = []
    for t in tr:
        out.append(
            {
                "kind": "song",
                "id": f"dz:{t['id']}",
                "title": t.get("title_short") or t["title"],
                "artist": (t.get("artist") or a.get("artist") or {}).get("name", ""),
                "album": a.get("title", ""),
                "albumId": "",
                "art": art,
                "dur": int(t.get("duration") or 0),
            }
        )
    return out, a


def resolve_album(title, artist):
    """a Deezer album -> its Apple Music songs in two calls (a search for the album, one lookup), instead of one search per song"""
    key = "alb:" + _plain(artist) + "|" + _plain(title)
    if key in RESOLVE:
        return RESOLVE[key] or []
    rs = mget(
        "https://itunes.apple.com/search?term="
        + urllib.parse.quote(f"{artist} {title}"[:90])
        + "&entity=album&limit=6&country=us",
        86400,
    ).get("results", [])
    qa = set(_plain(artist).split())
    out = []
    for x in rs:
        if (
            x.get("collectionId")
            and _plain(x.get("collectionName", "")) == _plain(title)
            and qa & set(_plain(x.get("artistName", "")).split())
        ):
            out = music_album(x["collectionId"])
            break
    RESOLVE[key] = out
    return out


def music_album(cid, resolve=False):
    if str(cid).startswith("dza:"):
        items, a = dz_album_items(str(cid)[4:])
        return resolve_album(a.get("title", ""), (a.get("artist") or {}).get("name", "")) or items if resolve else items
    rs = mget(f"https://itunes.apple.com/lookup?id={int(cid)}&entity=song&country=us", 1800).get("results", [])
    return [m_song(r) for r in rs if r.get("wrapperType") == "track" and r.get("kind") == "song"]


def music_fill_lengths(tracks):
    need = [t["id"] for t in tracks if not t.get("dur") and str(t["id"]).isdigit()]
    if need:
        try:
            for r in mget("https://itunes.apple.com/lookup?id=" + ",".join(need[:60]) + "&country=us", 3600).get(
                "results", []
            ):
                for t in tracks:
                    if str(t["id"]) == str(r.get("trackId")):
                        t["dur"] = int((r.get("trackTimeMillis") or 0) / 1000)
        except (OSError, ValueError):
            pass


# ---- Facts for the screensaver: Wikipedia (artist and song blurbs), iTunes (year, genre, album), Deezer (tempo). All keyless; answers are cached. ------------
FACTS = {}


def _trim(t, n=430):
    t = re.sub(r"\s+", " ", t or "").strip()
    out = ""
    for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", t):
        if len(out) + len(sent) > n and out:
            break
        out = (out + " " + sent).strip()
    return out[: n + 80]


def wiki_direct(titles, need):
    for t in titles:
        try:
            d = mget(
                "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_"), safe=""),
                86400,
            )
        except (OSError, ValueError):
            continue
        if d.get("type") == "standard" and re.search(need, d.get("extract", "")[:400], re.I):
            return {
                "title": d.get("title", t),
                "blurb": _trim(d.get("extract", "")),
                "img": (d.get("thumbnail") or {}).get("source", ""),
                "url": ((d.get("content_urls") or {}).get("desktop") or {}).get("page", ""),
            }
    return None


def wiki_pick(query, name, need):
    """first search hit whose title (without the bracketed part) is `name`; its summary must look like the right kind of page"""
    hits = (
        mget(
            "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch="
            + urllib.parse.quote(query),
            86400,
        )
        .get("query", {})
        .get("search", [])
    )
    for h in hits:
        if _plain(h["title"]) != _plain(name):
            continue
        try:
            d = mget(
                "https://en.wikipedia.org/api/rest_v1/page/summary/"
                + urllib.parse.quote(h["title"].replace(" ", "_"), safe=""),
                86400,
            )
        except (OSError, ValueError):
            continue
        if d.get("type") == "standard" and re.search(need, d.get("extract", "")[:400], re.I):
            return {
                "title": h["title"],
                "blurb": _trim(d.get("extract", "")),
                "img": (d.get("thumbnail") or {}).get("source", ""),
                "url": ((d.get("content_urls") or {}).get("desktop") or {}).get("page", ""),
            }
    return None


def music_facts(artist, title, tid):
    key = f"{artist}|{title}".lower()
    if key in FACTS:
        return FACTS[key]
    from concurrent.futures import ThreadPoolExecutor

    first = artist.split(",")[0].split(" & ")[0].strip()
    clean = re.sub(r"\s*[\(\[].*", "", title).strip()

    def a():
        need = r"band|singer|musician|rapper|duo|group|songwriter|producer|DJ|vocalist|trio"
        try:
            return wiki_direct(
                [
                    first,
                    f"{first} (band)",
                    f"{first} (singer)",
                    f"{first} (musician)",
                    f"{first} (rapper)",
                    f"{first} (American band)",
                ],
                need,
            ) or wiki_pick(f"{first} musician OR band OR singer OR rapper", first, need)
        except (OSError, ValueError, KeyError):
            return None

    def sg():
        need = r"song|single|recorded|released"
        try:
            return (
                wiki_direct([f"{clean} ({first} song)", f"{clean} (song)", f"{clean} ({first} single)", clean], need)
                and (lambda d: d if first.split()[0].lower() in d["blurb"].lower() else None)(
                    wiki_direct(
                        [f"{clean} ({first} song)", f"{clean} (song)", f"{clean} ({first} single)", clean], need
                    )
                )
                or wiki_pick(f"{clean} {first} song", clean, need)
            )
        except (OSError, ValueError, KeyError):
            return None

    def it():
        return {}  # (the year / genre / album come from Deezer below: Apple's search budget is kept for playing songs)

    def dz():
        try:
            d = mget(
                "https://api.deezer.com/search?q="
                + urllib.parse.quote(f'artist:"{first}" track:"{clean}"')
                + "&limit=1",
                86400,
            ).get("data", [])
            if not d:
                return {}
            t = mget(f"https://api.deezer.com/track/{d[0]['id']}", 86400)
            try:
                t["_genre"] = (
                    mget(f"https://api.deezer.com/album/{t['album']['id']}", 86400).get("genres", {}).get("data")
                    or [{}]
                )[0].get("name", "")
            except (OSError, ValueError, KeyError):
                t["_genre"] = ""
            return t
        except (OSError, ValueError, KeyError, IndexError):
            return {}

    with ThreadPoolExecutor(4) as ex:
        fa, fs, fi, fd = [f.result() for f in (ex.submit(a), ex.submit(sg), ex.submit(it), ex.submit(dz))]
    yr = (fd.get("release_date") or "")[:4]
    out = {
        "artist": fa,
        "song": fs,
        "year": int(yr) if yr.isdigit() else None,
        "genre": fd.get("_genre") or "",
        "album": (fd.get("album") or {}).get("title", ""),
        "bpm": int(fd.get("bpm") or 0) or None,
        "len": int(fd.get("duration") or 0) or None,
    }
    if len(FACTS) > 300:
        FACTS.clear()
    FACTS[key] = out
    return out


RESOLVE_FILE = os.path.expanduser("~/.cache/mirror/resolve.json")
SHELF_FILE = os.path.expanduser("~/.cache/mirror/shelves.json")
HIST_FILE = os.path.expanduser("~/.local/share/mirror/history.json")

RESOLVE, SHELF, HIST = _jload(RESOLVE_FILE, {}), _jload(SHELF_FILE, {}), _jload(HIST_FILE, {})


def hist_bump(t, by):
    if by == "Our Pick" or not str(t.get("id", "")).isdigit():
        return
    h = HIST.get(str(t["id"])) or {
        k: t.get(k, "") for k in ("id", "title", "artist", "album", "albumId", "art", "dur")
    } | {"kind": "song", "count": 0}
    h["count"] = h.get("count", 0) + 1
    h["last"] = time.time()
    HIST[str(t["id"])] = h
    if len(HIST) > 600:
        for k in sorted(HIST, key=lambda x: HIST[x].get("last", 0))[:100]:
            HIST.pop(k, None)
    _jsave(HIST_FILE, HIST)


def resolve_track(title, artist):
    """a (title, artist) from anywhere -> the Apple Music song, or None"""
    key = f"{_plain(artist.split(',')[0].split(' & ')[0])}|{_plain(title)}"
    if key in RESOLVE:
        return RESOLVE[key]
    rs = mget(
        "https://itunes.apple.com/search?term="
        + urllib.parse.quote(f"{artist} {title}"[:90])
        + "&entity=song&limit=8&country=us",
        86400,
    ).get("results", [])  # (an OSError here means "can't ask Apple right now": the callers say so)
    qa = set(_plain(artist).split())
    best = None
    for r in rs:
        if (
            r.get("trackId")
            and _plain(r.get("trackName", "")) == _plain(title)
            and qa & set(_plain(r.get("artistName", "")).split())
        ):
            best = m_song(r)
            break
    RESOLVE[key] = best
    if len(RESOLVE) % 25 == 0:
        _jsave(RESOLVE_FILE, RESOLVE)
    return best


def dz_item(t):
    """a Deezer track as one of our songs. Its id is "dz:<id>" until it is played: only then is it matched to an Apple Music song (one iTunes call, cached)"""
    a = t.get("artist", {}).get("name", "")
    ti = t.get("title_short") or t.get("title", "")
    al = t.get("album", {}) or {}
    hit = RESOLVE.get(f"{_plain(a.split(',')[0].split(' & ')[0])}|{_plain(ti)}")
    if hit:
        return hit
    return {
        "kind": "song",
        "id": f"dz:{t['id']}",
        "title": ti,
        "artist": a,
        "album": al.get("title", ""),
        "albumId": "",
        "art": al.get("cover_xl") or al.get("cover_big") or al.get("cover_medium", ""),
        "dur": int(t.get("duration") or 0),
    }


def dz_to_apple(tracks, limit=24):
    out, seen = [], set()
    for t in tracks:
        if not t.get("readable", True) or not t.get("id"):
            continue
        x = dz_item(t)
        k = _plain(x["artist"]) + "|" + _plain(x["title"])
        if k in seen or JUNK.search(x["title"] + x["album"]):
            continue
        seen.add(k)
        out.append(x)
    return out[:limit]


def resolve_item(t):
    """a song from a shelf / search (maybe "dz:...") -> the same song with its Apple Music id, or None"""
    if str(t.get("id", "")).isdigit():
        return t
    x = resolve_track(t.get("title", ""), t.get("artist", ""))
    return dict(t, **{k: x[k] for k in ("id", "album", "albumId", "art", "dur") if x.get(k)}) if x else None


def dz_radio(rid):
    return dz_to_apple(dz(f"/radio/{rid}/tracks?limit=40").get("data", []))


def dz_playlist(q):
    pl = sorted(
        dz("/search/playlist?q=" + urllib.parse.quote(q) + "&limit=8").get("data", []),
        key=lambda p: -p.get("nb_tracks", 0) * (1 if p.get("nb_tracks", 0) >= 20 else 0.1),
    )
    for p in pl[:3]:
        out = dz_to_apple(dz(f"/playlist/{p['id']}/tracks?limit=40").get("data", []))
        if len(out) >= 8:
            return out
    return []


def more_like(artist):
    a = (dz("/search/artist?q=" + urllib.parse.quote(artist) + "&limit=1").get("data") or [None])[0]
    if not a:
        return []
    tr = []
    for rel in dz(f"/artist/{a['id']}/related?limit=8").get("data", [])[:6]:
        tr += dz(f"/artist/{rel['id']}/top?limit=3").get("data", [])
    return [x for x in dz_to_apple(tr, 18) if _plain(x["artist"]) != _plain(artist)]


SHELF_DEFS = [
    ("trending", "🔥 Trending now", "songs", lambda: music_chart("songs", "")),
    ("topalbums", "💿 Top albums", "albums", lambda: music_chart("albums", "")),
    ("dance", "🪩 Dance floor", "songs", lambda: dz_radio(30951)),
    ("sing", "🎤 Sing-alongs", "songs", lambda: dz_playlist("best sing along songs")),
    ("road", "🚗 Road trip", "songs", lambda: dz_playlist("road trip songs")),
    ("80s", "📼 The ’80s", "songs", lambda: dz_radio(38305)),
    ("90s", "💽 The ’90s", "songs", lambda: dz_playlist("90s hits")),
    ("00s", "📀 The 2000s", "songs", lambda: dz_playlist("2000s hits")),
    ("70s", "🕺 The ’70s", "songs", lambda: dz_radio(38295)),
    ("rock", "🎸 Rock classics", "songs", lambda: dz_radio(37765)),
    ("hiphop", "🎧 Hip-hop", "songs", lambda: dz_radio(30991)),
    ("country", "🤠 Country", "songs", lambda: dz_radio(36801)),
    ("latin", "💃 Latin heat", "songs", lambda: dz_radio(36791)),
    ("motown", "🎺 Motown & soul", "songs", lambda: dz_radio(38445)),
    ("chill", "😌 Chill", "songs", lambda: dz_radio(39031)),
    ("sad", "😢 Sad songs", "songs", lambda: dz_radio(39051)),
]


def shelf_build(sid):
    d = next((x for x in SHELF_DEFS if x[0] == sid), None)
    if not d:
        return
    try:
        items = d[3]()
    except (OSError, ValueError, KeyError, IndexError, urllib.error.HTTPError):
        return
    if items:
        SHELF[sid] = {"at": time.time(), "items": items}
        _jsave(SHELF_FILE, SHELF)


def shelf_warm():
    time.sleep(8)
    while True:
        for d in SHELF_DEFS:
            if (
                time.time() - SHELF.get(d[0], {}).get("at", 0) > 8 * 3600
                or len(SHELF.get(d[0], {}).get("items", [])) < 8
            ):
                shelf_build(d[0])
                time.sleep(1.5)
        _jsave(RESOLVE_FILE, RESOLVE)
        time.sleep(1800)


threading.Thread(target=shelf_warm, daemon=True).start()

SEEDS = {}


def music_discover(seed="", only=""):
    out = []
    seed = seed.strip()[:60]
    if seed:
        hit = SEEDS.get(seed.lower())
        if not hit or time.time() - hit[0] > 6 * 3600:
            try:
                SEEDS[seed.lower()] = hit = (time.time(), more_like(seed))
            except (OSError, ValueError, KeyError, IndexError, urllib.error.HTTPError):
                hit = hit or (0, [])
        if hit[1]:
            out.append({"id": "more", "title": f"✨ More like {seed}", "kind": "songs", "items": hit[1]})
    if only == "more":
        return {"shelves": out, "building": False}
    top = sorted([h for h in HIST.values() if h.get("count", 0) >= 1], key=lambda h: (-h["count"], -h.get("last", 0)))[
        :20
    ]
    if len(top) >= 3:
        out.append(
            {
                "id": "crowd",
                "title": "⭐ Crowd favorites",
                "kind": "songs",
                "items": [{k: v for k, v in h.items() if k not in ("count", "last")} for h in top],
            }
        )
    rec = sorted(HIST.values(), key=lambda h: -h.get("last", 0))[:15]
    if len(rec) >= 4:
        out.append(
            {
                "id": "recent",
                "title": "🕘 Played in this room",
                "kind": "songs",
                "items": [{k: v for k, v in h.items() if k not in ("count", "last")} for h in rec],
            }
        )
    for d in SHELF_DEFS:
        if SHELF.get(d[0], {}).get("items"):
            out.append({"id": d[0], "title": d[1], "kind": d[2], "items": SHELF[d[0]]["items"]})
    return {"shelves": out, "building": len(SHELF) < len(SHELF_DEFS)}


def _sim(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def music_search2(q):
    q = re.sub(r"\s+", " ", q).strip()[:80]
    if len(q) < 2:
        return {"songs": [], "albums": [], "artists": []}
    qn = _plain(q) or q.lower()
    qt = set(qn.split())
    want_junk, want_var = bool(JUNK.search(q)), bool(VARIANT.search(q))
    m = re.match(r"(.+?)\s+by\s+(.+)", q, re.I)
    q2 = f"{m.group(2)} {m.group(1)}" if m else q

    def it(term, ent, lim):
        try:
            return mget(
                "https://itunes.apple.com/search?term="
                + urllib.parse.quote(term)
                + f"&entity={ent}&limit={lim}&country=us",
                900,
            ).get("results", [])
        except (OSError, ValueError):
            return []

    def dzs(path):
        try:
            return dz(path, 900).get("data", [])
        except (OSError, ValueError):
            return []

    with ThreadPoolExecutor(5) as ex:
        f = {
            "main": ex.submit(lambda: []),
            "alb": ex.submit(dzs, "/search/album?q=" + urllib.parse.quote(q) + "&limit=14"),
            "dzt": ex.submit(dzs, "/search?q=" + urllib.parse.quote(q2) + "&limit=15"),
            "dzr": ex.submit(dzs, "/search?q=" + urllib.parse.quote(q2) + "&order=RANKING&limit=15"),
            "dza": ex.submit(dzs, "/search/artist?q=" + urllib.parse.quote(q) + "&limit=10"),
        }
        w = qn.split()
        subs = {" ".join(w[:k]) for k in (1, 2)} | {" ".join(w[-k:]) for k in (1, 2)}
        for sq in [x for x in subs if x != qn and len(x) >= 3][:4]:
            f["sub:" + sq] = ex.submit(dzs, "/search/artist?q=" + urllib.parse.quote(sq) + "&limit=10")
        R = {k: v.result() for k, v in f.items()}
    arts = []
    for a in R["dza"]:
        an = _plain(a["name"])
        if (an == qn or an.startswith(qn) or (len(qn) > 3 and _sim(qn, an) > 0.8)) and a.get("nb_fan", 0) >= (
            2000 if an == qn else 5000
        ):
            arts.append(a)
    arts.sort(key=lambda a: -a.get("nb_fan", 0))
    named = [
        a
        for k_, v in R.items()
        if k_.startswith("sub:")
        for a in v
        if _plain(a["name"]) == k_[4:] and a.get("nb_fan", 0) >= 20000
    ]  # "hello adele": Adele is in there too
    groups = (
        [R["dzt"], R["dzr"]]
        + ([dzs(f"/artist/{arts[0]['id']}/top?limit=10")] if arts else [])
        + [dzs(f"/artist/{a['id']}/top?limit=12") for a in sorted(named, key=lambda a: -a["nb_fan"])[:2]]
    )  # the artist was named: their biggest songs
    cand = {}

    def add(song, base, bonus=0.0):
        k = _plain(song["artist"]) + "|" + _plain(song["title"])
        t, a = _plain(song["title"]), _plain(song["artist"])
        cov = len(qt & set((t + " " + a).split())) / max(1, len(qt))
        sc = (
            max(_sim(qn, t), _sim(qn, a + " " + t), _sim(qn, t + " " + a)) * 0.6
            + cov * 0.6
            + (0.5 if t == qn else 0)
            + bonus
            - base * 0.012
        )
        blob = song["title"] + " " + song["album"]
        if JUNK.search(blob) and not want_junk:
            sc -= 1.6
        if VARIANT.search(blob) and not want_var:
            sc -= 0.3
        if k not in cand or cand[k][0] < sc:
            cand[k] = (sc, song)

    for i, r in enumerate(R["main"]):
        if r.get("trackId") and r.get("kind") == "song":
            add(m_song(r), i)
    for i, t in [(i, t) for g in groups for i, t in enumerate(g)]:
        if t.get("id") and t.get("readable", True):
            x = dz_item(t)
            k = _plain(x["artist"]) + "|" + _plain(x["title"])
            pop = 0.8 * min(1, t.get("rank", 0) / 1e6)
            if k in cand:
                cand[k] = (
                    cand[k][0] + pop,
                    cand[k][1],
                )  # both sources know it: the Apple version, and a push for being popular
            else:
                add(x, i, pop)
    songs = [s_ for _, s_ in sorted(cand.values(), key=lambda x: -x[0])][:20]
    albs = {}
    for i, x in enumerate(R["alb"]):
        al = {
            "kind": "album",
            "id": f"dza:{x['id']}",
            "title": x.get("title", ""),
            "artist": (x.get("artist") or {}).get("name", ""),
            "art": x.get("cover_xl") or x.get("cover_big", ""),
            "count": x.get("nb_tracks", 0),
        }
        if JUNK.search(al["title"] + al["artist"]) and not want_junk:
            continue
        sc = (
            max(_sim(qn, _plain(al["title"])), _sim(qn, _plain(al["artist"] + " " + al["title"])))
            + min(0.2, x.get("fans", 0) / 5e6)
            - i * 0.01
        )
        if al["id"] not in albs:
            albs[al["id"]] = (sc, al)
    albums = [a for _, a in sorted(albs.values(), key=lambda x: -x[0])][:8]
    return {
        "songs": songs,
        "albums": albums,
        "artists": [
            {
                "kind": "artist",
                "id": str(a["id"]),
                "title": a["name"],
                "artist": "",
                "art": a.get("picture_xl") or a.get("picture_medium", ""),
            }
            for a in arts[:2]
        ],
    }


LYRICS = {}  # key -> (time, result)

LRC_DIR = os.path.expanduser("~/.cache/mirror/lyrics")


def lyrics_clean(t):
    return re.sub(
        r"\s*[\(\[](feat|ft|with|live|remaster|radio|single|deluxe|bonus|from)[^\)\]]*[\)\]]|\s+-\s+(remaster|live|single|radio|mono|stereo).*$",
        "",
        t,
        flags=re.I,
    ).strip()


def lyrics_get(artist, title, dur):
    """timed lyrics from LRCLIB (free, no key): {"synced": [[seconds, line]...], "plain": "..."} (both empty when it has none)"""

    key = hashlib.sha1(f"{artist}|{title}|{dur}".lower().encode()).hexdigest()[:20]
    f = os.path.join(LRC_DIR, key + ".json")
    try:
        return json.load(open(f))
    except (OSError, ValueError):
        pass
    hit = LYRICS.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    a, t = artist.split(",")[0].split(" & ")[0].strip(), lyrics_clean(title)

    def fetch(url):
        for i in range(3):
            try:
                with urllib.request.urlopen(
                    urllib.request.Request(url, headers={"User-Agent": "mirror-dashboard (smart mirror)"}), timeout=8
                ) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                time.sleep(0.8)
            except (OSError, ValueError):
                time.sleep(0.8)
        raise OSError("lrclib unreachable")

    q = urllib.parse.urlencode({"artist_name": a, "track_name": t, **({"duration": dur} if dur else {})})
    d = fetch("https://lrclib.net/api/get?" + q)
    if not d or not d.get("syncedLyrics"):
        res = (
            fetch("https://lrclib.net/api/search?" + urllib.parse.urlencode({"artist_name": a, "track_name": t})) or []
        )
        pick = (
            next(
                (
                    r
                    for r in res
                    if r.get("syncedLyrics") and (not dur or abs(float(r.get("duration") or 0) - float(dur)) < 8)
                ),
                None,
            )
            or next((r for r in res if r.get("syncedLyrics")), None)
            or d
            or (res[0] if res else None)
        )
        d = pick
    out = {"synced": [], "plain": ""}
    if d:
        for line in (d.get("syncedLyrics") or "").splitlines():
            m = re.match(r"\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)", line)
            if m:
                out["synced"].append([round(int(m.group(1)) * 60 + float(m.group(2)), 2), m.group(3).strip()])
        out["plain"] = (d.get("plainLyrics") or "") if not out["synced"] else ""
    LYRICS[key] = (time.time(), out)
    if out["synced"] or out["plain"]:
        try:
            os.makedirs(LRC_DIR, exist_ok=True)
            json.dump(out, open(f, "w"))
        except OSError:
            pass
    return out
