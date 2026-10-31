"""The Sonos speaker: finding it, UPnP calls, what is playing, transport commands. (split out of proxy.py)"""

import os
import re
import urllib.request
import urllib.error
import urllib.parse
import json
import threading
import time
import socket
import xml.etree.ElementTree as ET
from mirror_util import CFG_DIR, secret

SONOS = {"ip": None, "tried": 0.0, "now": (0.0, None)}

LAST_FILE = os.path.expanduser(
    "~/.cache/mirror/sonos-last.json"
)  # the last real music (queue track + position): survives restarts

try:
    SONOS["last"] = json.load(open(LAST_FILE))
except (OSError, ValueError):
    pass

sonos_lock = threading.Lock()

SONOS_SERVICES = {
    "204": "Apple Music",
    "12": "Spotify",
    "9": "Spotify",
    "254": "TuneIn",
    "303": "Sonos Radio",
    "160": "Pandora",
    "201": "Amazon Music",
    "174": "TuneIn",
}

AV = ("AVTransport", "/MediaRenderer/AVTransport/Control")

RC = ("RenderingControl", "/MediaRenderer/RenderingControl/Control")


def sonos_find():
    ip = secret("sonos_ip")
    if ip:
        return ip
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(2)
    try:
        s.sendto(
            b'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n',
            ("239.255.255.250", 1900),
        )
        data, addr = s.recvfrom(2048)
        return addr[0]
    except OSError:
        return None
    finally:
        s.close()


def parse_speaker(ip, xml):
    """(room, model) from a Sonos device description"""
    g = lambda tag: (re.search(rf"<{tag}>([^<]{{1,80}})</{tag}>", xml) or [None, ""])[1].strip()
    return g("roomName") or g("friendlyName"), g("modelName") or g("modelDescription")


def discover_speakers(wait=2.5):
    """every Sonos that answers on the network: [{ip, room, model}]. Read-only: it only asks, it never changes anything on a speaker."""
    import ipaddress

    found, s = {}, socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(0.5)
    try:
        for _ in range(2):
            s.sendto(
                b'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n',
                ("239.255.255.250", 1900),
            )
        end = time.time() + wait
        while time.time() < end:
            try:
                data, addr = s.recvfrom(4096)
            except socket.timeout:
                continue
            try:
                if ipaddress.ip_address(addr[0]).is_private:
                    found[addr[0]] = None  # (only devices on the home network)
            except ValueError:
                pass
    except OSError:
        pass
    finally:
        s.close()
    out = []
    for ip in sorted(found):
        try:
            with urllib.request.urlopen(f"http://{ip}:1400/xml/device_description.xml", timeout=3) as r:
                room, model = parse_speaker(ip, r.read(60000).decode("utf-8", "replace"))
        except (OSError, ValueError):
            room, model = "", ""
        out.append({"ip": ip, "room": room or "Sonos", "model": model})
    return out


def sonos_addr():
    if not SONOS["ip"] and time.time() - SONOS["tried"] > 20:
        SONOS["tried"] = time.time()
        SONOS["ip"] = sonos_find()
    return SONOS["ip"]


def sonos_soap(svc, action, args=""):
    ip = sonos_addr()
    if not ip:
        raise OSError("no speaker")
    name, ctrl = svc
    body = (
        '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
        f'<u:{action} xmlns:u="urn:schemas-upnp-org:service:{name}:1">{args}</u:{action}></s:Body></s:Envelope>'
    )
    req = urllib.request.Request(
        f"http://{ip}:1400{ctrl}",
        body.encode(),
        {
            "Content-Type": 'text/xml; charset="utf-8"',
            "SOAPACTION": f'"urn:schemas-upnp-org:service:{name}:1#{action}"',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            return ET.fromstring(r.read())
    except urllib.error.HTTPError:
        raise
    except OSError:
        SONOS["ip"] = None
        raise  # address may have changed: look again next time


def _text(root, tag):
    for e in root.iter():
        if e.tag.split("}")[-1] == tag:
            return e.text or ""
    return ""


def _secs(t):
    try:
        h, m, s = (int(x) for x in t.split(":"))
        return h * 3600 + m * 60 + s
    except ValueError:
        return 0


def sonos_now():
    with sonos_lock:
        at, cached = SONOS["now"]
        if cached is not None and time.time() - at < 0.8:
            return cached
        try:
            st = _text(sonos_soap(AV, "GetTransportInfo", "<InstanceID>0</InstanceID>"), "CurrentTransportState")
            pos = sonos_soap(AV, "GetPositionInfo", "<InstanceID>0</InstanceID>")
            vol = sonos_soap(RC, "GetVolume", "<InstanceID>0</InstanceID><Channel>Master</Channel>")
            mute = sonos_soap(RC, "GetMute", "<InstanceID>0</InstanceID><Channel>Master</Channel>")
            uri = _text(pos, "TrackURI")
            msn = re.search(r"sid=204.*?sn=(\d+)", uri)
            if msn:
                SONOS["sn"] = msn.group(1)
            meta = {"title": "", "creator": "", "album": "", "albumArtURI": "", "streamContent": ""}
            raw = _text(pos, "TrackMetaData")
            if raw and raw != "NOT_IMPLEMENTED":
                for e in ET.fromstring(raw).iter():
                    meta[e.tag.split("}")[-1]] = (e.text or "").strip()
            sid = re.search(r"sid=(\d+)", uri)
            src = (
                SONOS_SERVICES.get(sid.group(1), "Sonos")
                if sid
                else "Bluetooth"
                if "bluetooth" in uri
                else "AirPlay"
                if "vli" in uri
                else "Line-in"
                if "rincon-stream" in uri
                else "TV"
                if "htastream" in uri
                else "Sonos"
            )
            art = meta["albumArtURI"]
            if art.startswith("/"):
                art = "/sonos/art?p=" + urllib.parse.quote(art, safe="")
            mine = MINE.get((re.search(r"song%3a(\d+)", uri) or [None, ""])[1]) if "sid=204" in uri else None
            if (
                mine and not meta["title"]
            ):  # started from the Music app: the speaker has no details for it, the catalog does
                meta.update(title=mine["title"], creator=mine["artist"], album=mine["album"])
                art = mine["art"] or art
            title = meta["title"] or meta["streamContent"]
            out = {
                "ok": True,
                "state": {"PLAYING": "playing", "PAUSED_PLAYBACK": "paused", "TRANSITIONING": "playing"}.get(
                    st, "stopped"
                ),
                "title": title,
                "artist": meta["creator"],
                "album": meta["album"],
                "art": art,
                "source": src,
                "pos": _secs(_text(pos, "RelTime")),
                "dur": _secs(_text(pos, "TrackDuration")) or (int(mine["dur"]) if mine else 0),
                "volume": int(_text(vol, "CurrentVolume") or 0),
                "mute": _text(mute, "CurrentMute") == "1",
                "at": time.time(),
                "track": int(_text(pos, "Track") or 0),
            }
            if (
                "bluetooth" in uri and SONOS.get("bt_uri") != uri
            ):  # the speaker's Bluetooth input: remember its address so we can select it later
                SONOS["bt_uri"] = uri
                try:
                    open(os.path.join(CFG_DIR, "sonos_bt_uri"), "w").write(uri + "\n")
                except OSError:
                    pass
            pc_stream = src == "Bluetooth" or (
                src == "AirPlay" and not title and os.path.exists("/tmp/mirror-airplay")
            )  # the PC's own stream to the speaker (flag set by tools/audio_policy.py)
            if not pc_stream and title:
                prev = SONOS.get("last") or {}
                if (
                    prev.get("title") != title or "curi" not in prev
                ):  # what it is playing from: needed to put exactly that back later
                    try:
                        mi = sonos_soap(AV, "GetMediaInfo", "<InstanceID>0</InstanceID>")
                        out["curi"], out["cmeta"] = _text(mi, "CurrentURI"), _text(mi, "CurrentURIMetaData")
                    except (OSError, ET.ParseError, urllib.error.HTTPError):
                        out["curi"], out["cmeta"] = "", ""
                else:
                    out["curi"], out["cmeta"] = prev.get("curi", ""), prev.get("cmeta", "")
                if (
                    (SONOS.get("last") or {}).get("title") != title
                    or "curi" not in (SONOS.get("last") or {})
                    or abs((SONOS.get("last") or {}).get("pos", 0) - out["pos"]) > 15
                ):
                    try:
                        os.makedirs(os.path.dirname(LAST_FILE), exist_ok=True)
                        json.dump(out, open(LAST_FILE, "w"))
                    except OSError:
                        pass
                SONOS["last"] = dict(out)  # real music: remember where it was
            elif pc_stream:  # the PC's own Bluetooth / AirPlay stream (its "title" is just Chrome's page title)
                if SONOS.get("last"):
                    out = dict(
                        SONOS["last"], state="paused", pc=True, volume=out["volume"], mute=out["mute"], at=out["at"]
                    )  # keep showing the music, paused
                else:
                    out.update(title="", artist="", album="", art="", pc=True, pos=0, dur=0)
        except (OSError, ET.ParseError, ValueError):
            out = {"ok": False}
        SONOS["now"] = (time.time(), out)
        return out


MINE_FILE = os.path.expanduser(
    "~/.cache/mirror/sonos-mine.json"
)  # songs started from the Music app: id -> title, artist, art, length

try:
    MINE = json.load(open(MINE_FILE))
except (OSError, ValueError):
    MINE = {}

CD = ("ContentDirectory", "/MediaServer/ContentDirectory/Control")


def queue_titles():
    """[(title, artist)] of the speaker's queue in order (track number = position + 1)"""
    x = sonos_soap(
        CD,
        "Browse",
        "<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>dc:title,dc:creator</Filter><StartingIndex>0</StartingIndex><RequestedCount>200</RequestedCount><SortCriteria></SortCriteria>",
    )
    out = []
    for it in ET.fromstring(_text(x, "Result")):
        t = next((c.text or "" for c in it if c.tag.endswith("}title")), "")
        a = next((c.text or "" for c in it if c.tag.endswith("}creator")), "")
        out.append((t, a))
    return out


def restore_music(play):
    """Put the speaker back on exactly what it was playing before the PC borrowed it, at the same place; start it only if play.
    A song played straight from an app (not through the queue) is restored from its own address; a queued song is found in the queue by
    title, so a queue that has changed since can't make it start the wrong one."""
    from xml.sax.saxutils import escape

    one = "<InstanceID>0</InstanceID>"
    last = SONOS.get("last") or {}
    curi = last.get("curi") or ""
    if curi and not curi.startswith(("x-rincon-queue", "x-sonos-vli", "x-rincon-stream")):
        sonos_soap(
            AV,
            "SetAVTransportURI",
            one
            + f"<CurrentURI>{escape(curi)}</CurrentURI><CurrentURIMetaData>{escape(last.get('cmeta', ''))}</CurrentURIMetaData>",
        )
    else:
        if not SONOS.get("udn"):
            with urllib.request.urlopen(f"http://{sonos_addr()}:1400/xml/device_description.xml", timeout=4) as r:
                m = re.search(r"<UDN>uuid:(RINCON_[0-9A-F]+)", r.read().decode())
                SONOS["udn"] = m.group(1) if m else ""
        if not SONOS.get("udn"):
            raise OSError("no speaker id")
        sonos_soap(
            AV,
            "SetAVTransportURI",
            one + f"<CurrentURI>x-rincon-queue:{SONOS['udn']}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>",
        )
        track = int(last.get("track") or 0)
        try:
            same = [
                n
                for n, (t, a) in enumerate(queue_titles(), 1)
                if t == last.get("title") and (not last.get("artist") or a == last.get("artist"))
            ]
            if same:
                track = min(same, key=lambda n: abs(n - track))
        except (OSError, ET.ParseError, urllib.error.HTTPError):
            pass
        if track:
            try:
                sonos_soap(AV, "Seek", one + f"<Unit>TRACK_NR</Unit><Target>{track}</Target>")
            except urllib.error.HTTPError:
                pass
    p = int(last.get("pos", 0))
    if p > 2:
        try:
            sonos_soap(
                AV, "Seek", one + f"<Unit>REL_TIME</Unit><Target>{p // 3600}:{p % 3600 // 60:02d}:{p % 60:02d}</Target>"
            )
        except urllib.error.HTTPError:
            pass
    if play:
        sonos_soap(AV, "Play", one + "<Speed>1</Speed>")


def sonos_do(cmd, body):
    SONOS["now"] = (0.0, None)
    one = "<InstanceID>0</InstanceID>"
    if cmd == "toggle":
        now = sonos_now()
        cmd = "pause" if now.get("state") == "playing" and now.get("source") != "Bluetooth" else "play"
    if cmd == "play":
        uri = _text(sonos_soap(AV, "GetMediaInfo", one), "CurrentURI")
        if not uri or uri.startswith(("x-sonos-vli", "x-rincon-stream")):
            restore_music(True)  # on the PC's stream / a line-in: back to the music
        else:
            sonos_soap(AV, "Play", one + "<Speed>1</Speed>")
    elif cmd == "pause":
        sonos_soap(AV, "Pause", one)
    elif cmd == "next":
        sonos_soap(AV, "Next", one)
    elif cmd == "prev":
        sonos_soap(AV, "Previous", one)
    elif cmd == "queue":
        restore_music(False)  # back to the music, paused (no sound starts)
    elif (
        cmd == "bluetooth"
    ):  # put the speaker on its Bluetooth input (the mirror's own sound), ready before the first click
        uri = SONOS.get("bt_uri") or secret("sonos_bt_uri", "")
        if not uri:
            raise ValueError(cmd)
        if "bluetooth" not in _text(sonos_soap(AV, "GetMediaInfo", one), "CurrentURI"):
            sonos_soap(
                AV,
                "SetAVTransportURI",
                one + f"<CurrentURI>{uri}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>",
            )
        sonos_soap(AV, "Play", one + "<Speed>1</Speed>")
    elif cmd == "volume":
        cur = sonos_now().get("volume", 0)
        v = int(body["volume"]) if "volume" in body else cur + max(-10, min(10, int(body.get("delta", 0))))
        sonos_soap(
            RC, "SetVolume", one + f"<Channel>Master</Channel><DesiredVolume>{max(0, min(100, v))}</DesiredVolume>"
        )
    elif cmd == "mute":
        sonos_soap(
            RC, "SetMute", one + f"<Channel>Master</Channel><DesiredMute>{1 if body.get('mute') else 0}</DesiredMute>"
        )
    else:
        raise ValueError(cmd)
    SONOS["now"] = (0.0, None)
