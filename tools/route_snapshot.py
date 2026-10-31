#!/usr/bin/env python3
"""Records how the running mirror server answers a fixed list of requests, and compares two recordings. It is the safety net for changes to how
requests are routed: record before, change the code, restart, record after, compare. Only requests that cannot change anything are sent (reads,
and writes that are refused: bad JSON, missing header, unknown name), so it is safe to run on a live mirror.

    python3 tools/route_snapshot.py record FILE      # ask the server on this machine, write what it said
    python3 tools/route_snapshot.py compare A B      # exit code 1 if the two recordings differ

What is compared: status code, content type and the body. Bodies that change from second to second (health, the clock, the speaker) are compared by
SHAPE (keys and value types), the rest exactly."""

import hashlib
import json
import sys
import urllib.error
import urllib.request

M, G = "http://127.0.0.1:8765", "http://127.0.0.1:8766"
SH = {"X-OpenMirror": "settings", "Content-Type": "application/json"}
J = {"Content-Type": "application/json"}
DYNAMIC = (
    "/mirror/health",
    "/mirror/xbox",
    "/sonos/now",
    "/mirror/sleep",
    "/music/queue",
    "/music/discover",
    "/music/search",
    "/music/suggest",
    "/music/chart",
    "/sports/state",
    "/sports/info",
    "/sports/board",
    "/sports/standings",
    "/sports/schedule",
    "/guest/info",
    "/wallet/list",
    "/settings/",
    "/launch/status",
    "/music/picks",
    "/music/party",
    "/channels/list",
    "/theme/list",
    "/mirror/config",
    "/games/save",
    "/mirror/quiet",
    "/music/lyrics",
    "/music/facts",
    "/music/artist",
    "/music/album",
    "/posters/",
)

CASES = (
    [
        ("GET", p, None, None)
        for p in (
            "/",
            "/index.html",
            "/index.html?x=1",
            "/?x=1",
            "/ha-config.local.js",
            "/ha-config.local.js?v=1",
            "/mirror/config",
            "/mirror/config?x=1",
            "/channels/list",
            "/theme/list",
            "/launch/status",
            "/wallet/list",
            "/guest/info",
            "/mirror/sleep",
            "/mirror/health",
            "/mirror/xbox",
            "/sonos/now",
            "/mirror/quiet",
            "/games/save",
            "/music/party",
            "/music/picks",
            "/music/queue",
            "/music/zzz",
            "/music/search?q=queen",
            "/sports/state",
            "/sports/state?since=0",
            "/sports/info",
            "/sports/zzz",
            "/sports/",
            "/settings/state",
            "/settings/pair",
            "/settings/checklist",
            "/settings/wifi",
            "/settings/wifi?rescan=0",
            "/settings/nope",
            "/themes/loader.js",
            "/themes/halloween/theme.css",
            "/themes/nope/x.css",
            "/health.html",
            "/guest.html",
            "/nope",
            "/nope/deeper",
            "/ha/api/states",
            "/ha/api/nope",
            "/ha/",
            "/posters/nope",
            "/sonos/art?x=1",
            "/sonos/art",
            "/music.js",
            "/proxy.py.nope",
        )
    ]
    + [
        ("GET", "/settings/state", {"Host": "evil.example.com"}, None),
        ("GET", "/settings/pair", {"Host": "evil.example.com"}, None),
    ]
    + [
        ("POST", p, J, "{not json")
        for p in (
            "/music/party",
            "/music/queue",
            "/music/picks",
            "/music/play",
            "/games/save",
            "/wallet/set",
            "/guest/admin",
            "/guest/open",
            "/mirror/sleep",
            "/mirror/quiet",
            "/sports/act",
            "/sonos/zzz",
        )
    ]
    + [
        ("POST", "/games/save", J, "[1,2]"),
        ("POST", "/wallet/set", J, '{"id":"nobody-here","coins":5}'),
        ("POST", "/guest/admin", J, '{"id":"nobody-here","on":true}'),
        ("POST", "/theme/set", J, '{"mode":"no-such-theme"}'),
        ("POST", "/theme/set", J, "{bad"),
        ("POST", "/sonos/zzz", J, "{}"),
        ("POST", "/ha/api/nope", J, "{}"),
        ("POST", "/ha/", J, "{}"),
        ("POST", "/nothing", J, "{}"),
        ("POST", "/launch/nope", J, "{}"),
        ("POST", "/mirror/nope", J, "{}"),
    ]
    + [
        ("POST", p, SH, "{not json")
        for p in ("/settings/set", "/settings/pair", "/settings/nope", "/settings/channels")
    ]
    + [
        ("POST", "/settings/nope", SH, "{}"),
        ("POST", "/settings/set", SH, '{"key":"nope","value":"x"}'),
        ("POST", "/settings/set", SH, '{"key":"tz","value":"Not/AZone"}'),
        ("POST", "/settings/clear", SH, '{"key":"nope"}'),
        ("POST", "/settings/test", SH, '{"key":"nope"}'),
        ("POST", "/settings/channels", SH, '{"action":"hide","id":"system"}'),
        ("POST", "/settings/channels", SH, '{"action":"zzz","id":"pool"}'),
        ("POST", "/settings/geocode", SH, '{"q":"a"}'),
        ("POST", "/settings/location", SH, '{"name":"x","lat":999,"lon":0}'),
        ("POST", "/settings/set", J, '{"key":"nope","value":"x"}'),
        (
            "POST",
            "/settings/set",
            {"X-OpenMirror": "settings", "Content-Type": "application/json", "Host": "evil.example.com"},
            "{}",
        ),
        ("POST", "/settings/set?x=1", SH, '{"key":"nope","value":"x"}'),
    ]
    + [
        ("GET", "/setup", None, None),
        ("GET", "/setup/api/state", None, None),
        ("GET", "/theme/list", None, None),
        ("GET", "/ping", None, None),
        ("GET", "/api/events?t=x", None, None),
    ]
)


def shape(v):
    if isinstance(v, dict):
        return {k: shape(x) for k, x in sorted(v.items())}
    if isinstance(v, list):
        return [shape(v[0])] if v else []
    return type(v).__name__


def one(method, path, headers, body):
    base = G if path.startswith(("/setup", "/ping", "/api/events")) else M
    req = urllib.request.Request(
        base + path, data=body.encode() if body is not None else None, method=method, headers=dict(headers or {})
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, ctype, data = r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        status, ctype, data = e.code, e.headers.get("Content-Type", ""), e.read()
    except Exception as e:
        return {"status": 0, "type": "", "body": type(e).__name__}
    dynamic = any(path.split("?")[0].startswith(p) for p in DYNAMIC)
    if "json" in ctype:
        try:
            j = json.loads(data)
            out = shape(j) if dynamic else j
        except ValueError:
            out = hashlib.sha1(data).hexdigest()
    else:
        out = hashlib.sha1(data).hexdigest() if not dynamic else len(data) > 0
    return {"status": status, "type": ctype.split(";")[0], "body": out}


def record(path):
    res = {}
    for method, p, h, b in CASES:
        res[f"{method} {p} {sorted((h or {}).items())} {b or ''}"] = one(method, p, h, b)
    json.dump(res, open(path, "w"), indent=1, sort_keys=True)
    print(f"recorded {len(res)} requests to {path}")


OPTIONAL_KEYS = {
    "pc"
}  # present only while the PC's own AirPlay stream is on the speaker: live audio state, not routing


STATUS_ONLY = ("GET /ha/api/states",)  # Home Assistant's live device states: only "it answered" is comparable


def without_optional(v):
    if v in (
        "int",
        "float",
    ):  # a number is a number: whether it is a whole one depends on the moment (the controller's "age")
        return "num"
    if isinstance(v, dict):
        return {k: without_optional(x) for k, x in v.items() if k not in OPTIONAL_KEYS}
    if isinstance(v, list):
        return [without_optional(x) for x in v]
    return v


def compare(a, b):
    A, B = without_optional(json.load(open(a))), without_optional(json.load(open(b)))
    bad = 0
    for k in sorted(set(A) | set(B)):
        a_, b_ = A.get(k), B.get(k)
        if k.startswith(STATUS_ONLY) and a_ and b_:
            a_, b_ = {"status": a_["status"]}, {"status": b_["status"]}
        if a_ != b_:
            bad += 1
            print(
                "DIFFERENT", k, "\n   before:", json.dumps(A.get(k))[:200], "\n   after: ", json.dumps(B.get(k))[:200]
            )
    print(f"{len(set(A) | set(B)) - bad} identical, {bad} different")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "record":
        record(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == "compare":
        compare(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(2)
