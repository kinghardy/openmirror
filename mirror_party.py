"""Party mode and the queue: playing songs, the party queue, Our Picks, the autopilot. (split out of proxy.py)"""

import os
import re
import urllib.request
import urllib.error
import urllib.parse
import json
import threading
import time
import xml.etree.ElementTree as ET
import mirror_health as MH
from mirror_catalog import hist_bump, music_chart, music_fill_lengths, resolve_item
from mirror_sonos import AV, CD, MINE, MINE_FILE, SONOS, _text, sonos_addr, sonos_now, sonos_soap
from mirror_util import CFG_DIR, itunes_busy, secret


def music_play(tracks, start, mode, by="Guest"):
    """mode 'now': replace the queue with these and play from `start`; 'next': one song after the current one; 'add': to the end of the queue"""
    from xml.sax.saxutils import escape

    one = "<InstanceID>0</InstanceID>"
    try:
        tracks = [
            x for x in (resolve_item(t) for t in tracks[:60]) if x and str(x.get("id", "")).isdigit()
        ]  # (songs from shelves and search can still be Deezer ones: matched to Apple Music here)
    except OSError:
        raise ValueError(itunes_busy())
    if not tracks:
        raise ValueError("Couldn't find that one on Apple Music")
    music_fill_lengths(tracks)
    sn = SONOS.get("sn") or secret("sonos_apple_sn", "3")
    if not SONOS.get("udn"):
        with urllib.request.urlopen(f"http://{sonos_addr()}:1400/xml/device_description.xml", timeout=4) as r:
            m = re.search(r"<UDN>uuid:(RINCON_[0-9A-F]+)", r.read().decode())
            SONOS["udn"] = m.group(1) if m else ""
    party = party_on() and mode in ("now", "add")
    if party:
        mode = "party"
    if mode == "now":
        sonos_soap(AV, "RemoveAllTracksFromQueue", one)
    idle = False
    if party:
        st = sonos_now()
        idle = st.get("state") == "stopped" or bool(st.get("pc")) or not st.get("title")
    first = None
    for t in tracks[:1] if mode == "next" else tracks:
        uri = f"x-sonos-http:song%3a{t['id']}.mp4?sid=204&flags=0&sn={sn}"
        r = sonos_soap(
            AV,
            "AddURIToQueue",
            one
            + f"<EnqueuedURI>{escape(uri)}</EnqueuedURI><EnqueuedURIMetaData></EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>{1 if mode == 'next' else 0}</EnqueueAsNext>",
        )
        if first is None:
            first = int(_text(r, "FirstTrackNumberEnqueued") or 1)
        MINE[str(t["id"])] = {k: t.get(k, "") for k in ("title", "artist", "album", "art", "dur")}
        if party or mode in ("add", "next"):
            PARTY_LOG.append({"id": str(t["id"]), "by": str(by)[:30], "at": time.time()})
        hist_bump(t, by)
    if len(MINE) > 800:
        for k in list(MINE)[: len(MINE) - 800]:
            MINE.pop(k, None)
    try:
        os.makedirs(os.path.dirname(MINE_FILE), exist_ok=True)
        json.dump(MINE, open(MINE_FILE, "w"))
    except OSError:
        pass
    if mode == "now" or (mode == "party" and idle):
        SONOS["last"] = None
        sonos_soap(
            AV,
            "SetAVTransportURI",
            one + f"<CurrentURI>x-rincon-queue:{SONOS['udn']}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>",
        )
        sonos_soap(
            AV,
            "Seek",
            one
            + f"<Unit>TRACK_NR</Unit><Target>{(first or 1) + (max(0, min(int(start), len(tracks) - 1)) if mode == 'now' else 0)}</Target>",
        )
        sonos_soap(AV, "Play", one + "<Speed>1</Speed>")
    SONOS["now"] = (0.0, None)


# Party mode: songs picked in the Music app join one queue that keeps playing (the normal mode plays what you pick and stops). "by" is recorded per
# song so a later per-person account / currency system has something to hang on.
PARTY_LOG = []  # [{id, by, at}] newest last


def party_on():
    return secret("party", "off") == "on"


def party_set(on):
    with open(os.path.join(CFG_DIR, "party"), "w") as f:
        f.write("on" if on else "off")
    if on:  # a fresh queue: what is playing now stays, everything after it goes
        one = "<InstanceID>0</InstanceID>"
        try:
            cur = int(_text(sonos_soap(AV, "GetPositionInfo", one), "Track") or 0)
            uri = _text(sonos_soap(AV, "GetMediaInfo", one), "CurrentURI")
            n = int(
                _text(
                    sonos_soap(
                        CD,
                        "Browse",
                        "<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>dc:title</Filter><StartingIndex>0</StartingIndex><RequestedCount>1</RequestedCount><SortCriteria></SortCriteria>",
                    ),
                    "TotalMatches",
                )
                or 0
            )
            if uri.startswith("x-rincon-queue") and cur and n > cur:
                sonos_soap(
                    AV,
                    "RemoveTrackRange",
                    one
                    + f"<UpdateID>0</UpdateID><StartingIndex>{cur + 1}</StartingIndex><NumberOfTracks>{n - cur}</NumberOfTracks>",
                )
            sonos_soap(AV, "SetPlayMode", one + "<NewPlayMode>NORMAL</NewPlayMode>")
        except (OSError, ET.ParseError, urllib.error.HTTPError, ValueError):
            pass
        del PARTY_LOG[:]
        AUTO["last"] = 0.0
    SONOS["now"] = (0.0, None)


def party_queue():
    one = "<InstanceID>0</InstanceID>"
    x = sonos_soap(
        CD,
        "Browse",
        "<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>dc:title,dc:creator,res,upnp:albumArtURI</Filter><StartingIndex>0</StartingIndex><RequestedCount>200</RequestedCount><SortCriteria></SortCriteria>",
    )
    cur = int(_text(sonos_soap(AV, "GetPositionInfo", one), "Track") or 0)
    items = []
    for i, it in enumerate(ET.fromstring(_text(x, "Result")), 1):
        f = {c.tag.split("}")[-1]: (c.text or "") for c in it}
        sid = (re.search(r"song%3a(\d+)", f.get("res", "")) or [None, ""])[1]
        mine = MINE.get(sid, {})
        by = next((e.get("by", "") for e in reversed(PARTY_LOG) if e["id"] == sid), "")
        items.append(
            {
                "n": i,
                "id": sid,
                "title": mine.get("title") or f.get("title", ""),
                "artist": mine.get("artist") or f.get("creator", ""),
                "art": mine.get("art", ""),
                "by": by,
            }
        )
    return {"party": party_on(), "current": cur, "items": items}


def queue_act(body):
    one = "<InstanceID>0</InstanceID>"
    n = int(body.get("n", 0))
    if n < 1:
        raise ValueError("bad n")
    if body.get("action") == "remove":
        sonos_soap(AV, "RemoveTrackFromQueue", one + f"<ObjectID>Q:0/{n}</ObjectID><UpdateID>0</UpdateID>")
    elif body.get("action") == "jump":
        sonos_soap(AV, "Seek", one + f"<Unit>TRACK_NR</Unit><Target>{n}</Target>")
        sonos_soap(AV, "Play", one + "<Speed>1</Speed>")
    else:
        raise ValueError("bad action")
    SONOS["now"] = (0.0, None)


# "Our Picks": the house list. In Party mode the mirror keeps a song playing by itself: when nothing is lined up after the current song (or the
# queue ran out) it adds one from Our Picks, or, when the list is empty, curates one from the charts. Those songs are tagged by="Our Pick" so the
# screens can highlight them.
PICKS_FILE = os.path.join(CFG_DIR, "our_picks.json")

AUTO = {"recent": [], "last": 0.0}


def picks_load():
    try:
        return json.load(open(PICKS_FILE))
    except (OSError, ValueError):
        return []


def picks_act(body):
    cur = picks_load()
    act = body.get("action")
    if act == "add":
        for t in (body.get("tracks") or [])[:60]:
            if str(t.get("id", "")).isdigit() and not any(str(c["id"]) == str(t["id"]) for c in cur):
                cur.append(
                    {k: t.get(k, "") for k in ("id", "title", "artist", "album", "albumId", "art", "dur")}
                    | {"kind": "song"}
                )
    elif act == "remove":
        cur = [c for c in cur if str(c["id"]) != str(body.get("id"))]
    else:
        raise ValueError("bad action")
    os.makedirs(CFG_DIR, exist_ok=True)
    json.dump(cur[:500], open(PICKS_FILE, "w"))
    return cur


def auto_choice(queued):
    import random

    recent = AUTO["recent"]
    picks = [p for p in picks_load() if str(p["id"]) not in queued]
    fresh = [p for p in picks if str(p["id"]) not in recent[-max(1, min(10, len(picks) - 1)) :]]
    if fresh:
        return random.choice(fresh)
    if picks:
        return random.choice(picks)
    for _ in range(3):  # nothing saved yet: curate from a random genre's chart (or the overall one)
        try:
            songs = [
                t
                for t in music_chart("songs", random.choice([0, 14, 18, 21, 6, 15, 20, 17, 7, 12]))
                if t.get("kind") == "song" and str(t["id"]) not in queued and str(t["id"]) not in recent[-20:]
            ]
            if songs:
                return random.choice(songs[:15])
        except (OSError, ValueError, KeyError):
            pass
    return None


def party_autopilot():
    one = "<InstanceID>0</InstanceID>"
    while True:
        time.sleep(6)
        MH.beat("autopilot")
        try:
            if not party_on():
                continue
            st = sonos_now()
            if not st.get("ok"):
                continue
            q = party_queue()
            upcoming = [i for i in q["items"] if i["n"] > q["current"]]
            from_queue = _text(sonos_soap(AV, "GetMediaInfo", one), "CurrentURI").startswith("x-rincon-queue")
            if (
                from_queue and q["current"] > 1
            ):  # songs that have played leave the queue (the speaker itself keeps them)
                for _ in range(min(q["current"] - 1, 10)):
                    sonos_soap(
                        AV, "RemoveTrackFromQueue", one + "<ObjectID>Q:0/1</ObjectID><UpdateID>0</UpdateID>"
                    )  # (the same call the queue editor uses: RemoveTrackRange wants an exact UpdateID)
                SONOS["now"] = (0.0, None)
            if upcoming or time.time() - AUTO["last"] < 20:
                continue
            if st["state"] == "playing" and from_queue:
                need = not st.get("dur") or st["dur"] - st.get("pos", 0) < 45  # the last song is nearly over
            elif st["state"] == "paused":
                need = (
                    not q["items"] or not from_queue or st.get("pos", 0) < 3
                )  # paused mid-song is the listener's choice; paused on nothing is not
            else:
                need = st["state"] == "stopped"  # (another source such as AirPlay: leave it alone)
            if not need:
                continue
            t = auto_choice({str(i["id"]) for i in q["items"]})
            if not t:
                continue
            AUTO["last"] = time.time()
            AUTO["recent"] = (AUTO["recent"] + [str(t["id"])])[-40:]
            music_play([dict(t)], 0, "add", "Our Pick")
        except (OSError, ValueError, KeyError, TypeError, ET.ParseError, urllib.error.HTTPError) as e:
            print('party_autopilot:', repr(e), flush=True)


threading.Thread(target=party_autopilot, daemon=True).start()
