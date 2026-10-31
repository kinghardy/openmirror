"""The getting-started checklist: what a new mirror still needs, in the order a person would do it. Every step says whether it is done and which
screen fixes it; optional steps never block finishing."""

import socket
import mirror_network as NET
import mirror_settings as SET


def online():
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=2).close()
        return True
    except OSError:
        return False


def checklist(speaker_ok, pad_ok, guest_url):
    w = NET.wifi_state() if NET.available() else {"connected": ""}
    net = online()
    loc = SET.location()
    ha_tok = bool(SET.get("ha_token", ""))
    tm = bool(SET.get("tmdb_key", ""))
    return [
        {
            "id": "wifi",
            "label": "Internet",
            "ok": net,
            "detail": ("Connected" + (f" to {w['connected']}" if w.get("connected") else ""))
            if net
            else "Not online: choose a Wi-Fi network",
            "view": "wifi",
            "optional": False,
        },
        {
            "id": "speaker",
            "label": "Speaker",
            "ok": speaker_ok,
            "detail": "A Sonos speaker is connected" if speaker_ok else "No speaker found yet: pick one",
            "view": "speaker",
            "optional": False,
        },
        {
            "id": "location",
            "label": "Home location",
            "ok": bool(loc),
            "detail": loc["name"] if loc else "Used for the weather",
            "view": "place",
            "optional": False,
        },
        {
            "id": "controller",
            "label": "Game controller",
            "ok": pad_ok,
            "detail": "Connected" if pad_ok else "Press the Xbox button to connect it (optional: a keyboard works)",
            "view": "status",
            "optional": True,
        },
        {
            "id": "phone",
            "label": "Phone app for guests",
            "ok": bool(guest_url),
            "detail": guest_url or "Starts once the guest server is up",
            "view": "phone",
            "optional": True,
        },
        {
            "id": "ha",
            "label": "Home Assistant (lights and devices)",
            "ok": ha_tok,
            "detail": "Saved" if ha_tok else "Optional: paste an access token from your phone",
            "view": "phone",
            "optional": True,
        },
        {
            "id": "tmdb",
            "label": "Movie posters (TMDB key)",
            "ok": tm,
            "detail": "Saved" if tm else "Optional: a free key from themoviedb.org",
            "view": "phone",
            "optional": True,
        },
    ]
