"""Phone pairing for the setup page. The mirror shows a one-time 6-digit code on its own screen; typing it on a phone proves you are in the room
and gives that phone a short setup session. Nothing is stored on disk.

- the code is made only by the mirror's own screen (the localhost-only /settings/pair), lasts 10 minutes and works once
- 5 wrong guesses lock pairing for 5 minutes (the code is dropped and a new one has to be made on the mirror); each address also gets a limit
- a session is a random token (kept only as a hash), 15 minutes after the last use, ends when the mirror cancels pairing
- comparisons are constant-time"""

import hashlib
import hmac
import secrets
import threading
import time

TTL, SESSION_TTL, LOCK_FOR, MAX_FAILS = 600, 900, 300, 5
LOCK = threading.Lock()
S = {"code": None, "exp": 0.0, "fails": 0, "locked": 0.0, "sessions": {}}
IPS = {}  # address -> times of recent wrong guesses


def _h(t):
    return hashlib.sha256(t.encode()).hexdigest()


def _live(now):
    if S["code"] and now > S["exp"]:
        S["code"] = None
    for k in [k for k, e in S["sessions"].items() if now > e]:
        S["sessions"].pop(k, None)


def new_code():
    with LOCK:
        S.update(code=f"{secrets.randbelow(10**6):06d}", exp=time.time() + TTL, fails=0, locked=0.0, sessions={})
        IPS.clear()
        return status_locked()


def cancel():
    with LOCK:
        S.update(code=None, exp=0.0, fails=0, locked=0.0, sessions={})
        IPS.clear()


def status_locked():
    now = time.time()
    _live(now)
    return {
        "code": S["code"],
        "expires_in": max(0, int(S["exp"] - now)) if S["code"] else 0,
        "paired": len(S["sessions"]),
        "locked_for": max(0, int(S["locked"] - now)),
        "fails": S["fails"],
    }


def status():
    with LOCK:
        return status_locked()


def verify(code, ip):
    """a session token for a right code; ValueError (with a message safe to show) otherwise"""
    now = time.time()
    with LOCK:
        _live(now)
        if now < S["locked"]:
            raise ValueError("too many wrong codes: make a new code on the mirror")
        recent = [t for t in IPS.get(ip, []) if now - t < 300]
        if len(recent) >= 8:
            raise ValueError("too many tries from this device: wait a few minutes")
        if not S["code"]:
            raise ValueError("no code is active: open 'Set up from your phone' on the mirror")
        if not hmac.compare_digest(str(code).strip().replace(" ", ""), S["code"]):
            IPS[ip] = recent + [now]
            S["fails"] += 1
            if S["fails"] >= MAX_FAILS:
                S.update(code=None, locked=now + LOCK_FOR)
            raise ValueError("that code is not right")
        S["code"] = None  # single use
        tok = secrets.token_urlsafe(32)
        S["sessions"][_h(tok)] = now + SESSION_TTL
        IPS.pop(ip, None)
        return tok


def check(tok):
    """is this a live setup session? (each use extends it)"""
    if not tok:
        return False
    now = time.time()
    with LOCK:
        _live(now)
        k = _h(tok)
        if k not in S["sessions"]:
            return False
        S["sessions"][k] = now + SESSION_TTL
        return True
