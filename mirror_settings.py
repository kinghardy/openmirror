"""Settings: the one place that knows every setting and API key the mirror has, what is valid, and where it comes from.

Precedence for a name: environment variable OPENMIRROR_<NAME> -> file ~/.config/mirror/<name> -> the default.
The files ARE the store (they are what an existing install already has, so nothing is migrated); this module adds validation, atomic 0600 writes,
masking and a connection test per service. Secret values are write-only: nothing here, and no API built on it, ever hands a full secret back."""

import json
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from mirror_util import CFG_DIR


def _s(
    key,
    label,
    group,
    kind="text",
    help="",
    default="",
    pattern=None,
    test=None,
    placeholder="",
    sensitive=False,
    ui=True,
):
    # sensitive: changing it could send secrets somewhere else (a Home Assistant address receives the token), so over the network it is only allowed on the encrypted address
    # ui=False: set through its own screen (the location comes from a city search), not as a plain text field
    return {
        "key": key,
        "label": label,
        "group": group,
        "kind": kind,
        "help": help,
        "default": default,
        "pattern": pattern,
        "test": test,
        "placeholder": placeholder,
        "sensitive": sensitive,
        "ui": ui,
    }


SCHEMA = [
    _s(
        "ha_url",
        "Home Assistant address",
        "services",
        "text",
        "Where Home Assistant runs, e.g. http://homeassistant.local:8123",
        os.environ.get("HA_URL", "http://127.0.0.1:8123").rstrip("/"),
        r"https?://[A-Za-z0-9.\-]+(:\d{1,5})?",
        "ha",
        "http://homeassistant.local:8123",
        sensitive=True,
    ),
    _s(
        "ha_token",
        "Home Assistant access token",
        "services",
        "secret",
        "Home Assistant > your profile > Security > Long-lived access tokens",
        "",
        r"[A-Za-z0-9._\-]{20,2000}",
        "ha",
        sensitive=True,
    ),
    _s(
        "tmdb_key",
        "TMDB API key (movie posters)",
        "services",
        "secret",
        "Free at themoviedb.org > Settings > API. Used for the Poster Wall.",
        "",
        r"[A-Za-z0-9._\-]{16,2000}",
        "tmdb",
        sensitive=True,
    ),
    _s(
        "sonos_ip",
        "Speaker address (optional)",
        "devices",
        "text",
        "Leave empty to find the Sonos by itself; set it if discovery does not work on your network.",
        "",
        r"(\d{1,3}\.){3}\d{1,3}",
        "sonos",
        "192.168.1.50",
        sensitive=True,
    ),
    _s(
        "house_name",
        "House name",
        "home",
        "text",
        "Shown for the house's own coins and requests. Changes apply to new activity.",
        "Host",
        r"[A-Za-z0-9][A-Za-z0-9 ._-]{1,15}",
    ),
    _s(
        "tz",
        "Time zone",
        "home",
        "text",
        "For example America/New_York. Used for the clock and game times; applies after the next restart. Empty = this computer's own.",
        "",
        r"[A-Za-z]+(/[A-Za-z0-9_+\-]+){1,2}",
        placeholder="America/New_York",
    ),
    _s(
        "units",
        "Units",
        "home",
        "text",
        "imperial (°F) or metric (°C), for the weather",
        "imperial",
        r"imperial|metric",
        placeholder="imperial",
    ),
    _s(
        "games_name",
        "Party games name",
        "home",
        "text",
        "The name of the games hub (default: Hardy Party Games)",
        "Hardy Party Games",
        r"[A-Za-z0-9][A-Za-z0-9 '&.!-]{1,30}",
    ),
    _s(
        "slots_name",
        "Slot machine name",
        "home",
        "text",
        "The name of the slot machine (default: King Hardy Slots)",
        "King Hardy Slots",
        r"[A-Za-z0-9][A-Za-z0-9 '&.!-]{1,30}",
    ),
    _s("location_name", "Home location", "home", "text", "Used for the weather", "", r".{1,60}", ui=False),
    _s("location_lat", "Latitude", "home", "text", "", "", r"-?\d{1,2}(\.\d{1,6})?", ui=False),
    _s("location_lon", "Longitude", "home", "text", "", "", r"-?\d{1,3}(\.\d{1,6})?", ui=False),
]
BY = {d["key"]: d for d in SCHEMA}


def needs_secure(key):
    return bool(BY.get(key, {}).get("sensitive"))


def _path(key):
    return os.path.join(CFG_DIR, key)


def _read(key):
    with open(_path(key)) as f:
        return f.read().strip()


def get(key, default=None):
    d = BY.get(key)
    env = os.environ.get("OPENMIRROR_" + key.upper())
    if env:
        return env.strip()
    try:
        v = _read(key)
        if v:
            return v
    except OSError:
        pass
    return default if default is not None else (d["default"] if d else None)


def source(key):
    if os.environ.get("OPENMIRROR_" + key.upper()):
        return "environment"
    try:
        if _read(key):
            return "saved"
    except OSError:
        pass
    return "default"


def mask(v):
    return "" if not v else ("•" * 8 + v[-4:] if len(v) > 8 else "•" * len(v))


def set_value(key, value):
    d = BY.get(key)
    if not d:
        raise ValueError("unknown setting")
    v = str(value).strip()
    if d["key"] == "ha_url":
        v = v.rstrip("/")
    if not v or not re.fullmatch(d["pattern"] or r".{1,500}", v):
        raise ValueError("that doesn't look right for " + d["label"].lower())
    if key == "tz":
        try:
            import zoneinfo

            zoneinfo.ZoneInfo(v)
        except Exception:
            raise ValueError("that time zone name is not known (try America/New_York)")
    if key == "location_lat" and not -90 <= float(v) <= 90 or key == "location_lon" and not -180 <= float(v) <= 180:
        raise ValueError("that is outside the map")
    os.makedirs(CFG_DIR, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=CFG_DIR, prefix="." + key + ".")  # atomic and private from the first byte
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, v.encode())
        os.close(fd)
        os.replace(tmp, _path(key))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def clear(key):
    if key not in BY:
        raise ValueError("unknown setting")
    try:
        os.remove(_path(key))
    except FileNotFoundError:
        pass


def view():
    """what the settings screen shows: never a full secret"""
    out = []
    for d in SCHEMA:
        v = get(d["key"]) or ""
        src = source(d["key"])
        out.append(
            {
                "key": d["key"],
                "label": d["label"],
                "group": d["group"],
                "kind": d["kind"],
                "help": d["help"],
                "placeholder": d["placeholder"],
                "source": src,
                "set": src != "default",
                "sensitive": bool(d.get("sensitive")),
                "ui": bool(d.get("ui", True)),
                "value": "" if d["kind"] == "secret" else v,
                "masked": mask(v) if d["kind"] == "secret" else "",
                "testable": bool(d["test"]),
            }
        )
    return out


def _fetch(url, headers=None, timeout=5):
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers=dict({"User-Agent": "OpenMirror"}, **(headers or {}))), timeout=timeout
        ) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (OSError, ValueError):
        return 0


def test(key):
    """(ok, short message): does this setting actually work? Uses the saved value."""
    d = BY.get(key)
    if not d or not d["test"]:
        raise ValueError("nothing to test")
    t = d["test"]
    if t == "ha":
        tok = get("ha_token", "")
        if not tok:
            return False, "no access token saved yet"
        c = _fetch(get("ha_url").rstrip("/") + "/api/", {"Authorization": "Bearer " + tok})
        return (
            c == 200,
            "connected"
            if c == 200
            else "the token was refused"
            if c == 401
            else "can't reach Home Assistant"
            if c == 0
            else f"HTTP {c}",
        )
    if t == "tmdb":
        k = get("tmdb_key", "")
        if not k:
            return False, "no key saved yet"
        c = (
            _fetch("https://api.themoviedb.org/3/configuration?api_key=" + k)
            if len(k) < 60
            else _fetch("https://api.themoviedb.org/3/configuration", {"Authorization": "Bearer " + k})
        )
        return (
            c == 200,
            "the key works"
            if c == 200
            else "TMDB refused the key"
            if c in (401, 403)
            else "can't reach TMDB"
            if c == 0
            else f"HTTP {c}",
        )
    if t == "sonos":
        ip = get("sonos_ip", "")
        if not ip:
            return True, "no address set: the speaker is found automatically"
        c = _fetch(f"http://{ip}:1400/xml/device_description.xml", timeout=4)
        return (c == 200, "a Sonos answered" if c == 200 else "nothing answered there")
    raise ValueError("nothing to test")


def location():
    """the home location for the weather, or None until one is set"""
    try:
        lat, lon = float(get("location_lat", "") or ""), float(get("location_lon", "") or "")
    except ValueError:
        return None
    return {"name": get("location_name", "") or "", "lat": lat, "lon": lon} if get("location_name", "") else None


def set_location(name, lat, lon):
    """all three together (a half-set location would put the weather in the wrong place)"""
    lat, lon = float(lat), float(lon)
    name = str(name).strip()[:60]
    if not name or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("that place is not valid")
    set_value("location_name", name)
    set_value("location_lat", f"{lat:.4f}")
    set_value("location_lon", f"{lon:.4f}")


def geocode(q):
    """city name -> a few places (Open-Meteo's free search, no key): [{label, name, lat, lon, tz}]"""
    q = str(q).strip()
    if not 2 <= len(q) <= 60:
        raise ValueError("type at least two letters of a city name")
    city, _, rest = (
        re.split(r"\s*,\s*|\s+", q, maxsplit=1)[0],
        None,
        (re.split(r"\s*,\s*|\s+", q, maxsplit=1) + [""])[1].strip().lower(),
    )  # "Chicago Illinois": search the city, narrow by the rest
    try:
        with urllib.request.urlopen(
            urllib.request.Request(
                "https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name="
                + urllib.parse.quote(city),
                headers={"User-Agent": "OpenMirror"},
            ),
            timeout=8,
        ) as r:
            j = json.load(r)
    except (OSError, ValueError):
        raise ValueError("couldn't reach the place search: check the internet connection")
    out = []
    res = j.get("results") or []
    if rest:
        res = [
            p for p in res if rest in " ".join(str(p.get(k, "")) for k in ("admin1", "country", "country_code")).lower()
        ] or res
    for p in res[:6]:
        parts = [p.get("name", ""), p.get("admin1", ""), p.get("country_code", "")]
        label = ", ".join(x for x in parts if x)
        if label and "latitude" in p and "longitude" in p:
            out.append(
                {
                    "label": label,
                    "name": ", ".join(x for x in parts[:2] if x),
                    "lat": p["latitude"],
                    "lon": p["longitude"],
                    "tz": p.get("timezone", ""),
                }
            )
    return out


# ---- first run: a fresh install shows the welcome checklist once; an install that already has settings never does ----
DONE_FILE = "setup_done"


def first_run():
    return not os.path.exists(_path(DONE_FILE))


def mark_setup_done():
    os.makedirs(CFG_DIR, mode=0o700, exist_ok=True)
    with open(_path(DONE_FILE), "w") as f:
        f.write("1")


def freeze_existing_setup():
    """an install that already has settings has been set up: no welcome screen for it"""
    if (
        first_run()
        and os.path.isdir(CFG_DIR)
        and any(f in os.listdir(CFG_DIR) for f in ("ha_token", "tmdb_key", "party", "channels.json"))
    ):
        mark_setup_done()
        return True
    return False
