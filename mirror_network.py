"""Wi-Fi from the mirror's own screen, through NetworkManager (nmcli). Lists networks, joins one, and puts the old connection back if joining fails,
so a typo in a password can't leave the mirror offline. Passwords are passed straight to nmcli (never through a shell, never logged, never stored here)."""
import re, shutil, subprocess

def _run(args, timeout=20):
    try: r = subprocess.run(args, capture_output=True, text=True, timeout=timeout); return r.returncode, (r.stdout or ""), (r.stderr or "")
    except (OSError, subprocess.SubprocessError) as e: return 1, "", str(e)

def available(): return bool(shutil.which("nmcli"))

def _split(line):
    parts, cur, i = [], "", 0                                           # nmcli -t escapes ':' and '\' with a backslash
    while i < len(line):
        c = line[i]
        if c == "\\" and i + 1 < len(line): cur += line[i + 1]; i += 2; continue
        if c == ":": parts.append(cur); cur = ""
        else: cur += c
        i += 1
    parts.append(cur); return parts

def current():
    """(device, connection name, ssid) of the active Wi-Fi, or None"""
    rc, out, _ = _run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev"])
    for l in out.splitlines():
        p = _split(l)
        if len(p) >= 4 and p[1] == "wifi" and p[2].startswith("connected"): return p[0], p[3]
    return None

def wifi_state(rescan=False):
    if not available(): return {"available": False, "networks": [], "connected": ""}
    if rescan: _run(["nmcli", "dev", "wifi", "rescan"], 10)
    rc, out, _ = _run(["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list"])
    best = {}
    for l in out.splitlines():
        p = _split(l)
        if len(p) < 4 or not p[1]: continue
        n = {"ssid": p[1], "signal": int(p[2] or 0), "secure": p[3] not in ("", "--"), "active": p[0] == "*"}
        if p[1] not in best or n["signal"] > best[p[1]]["signal"] or n["active"]: best[p[1]] = n
    cur = current()
    return {"available": True, "connected": next((n["ssid"] for n in best.values() if n["active"]), cur[1] if cur else ""), "networks": sorted(best.values(), key=lambda n: (not n["active"], -n["signal"]))[:20]}

def wifi_connect(ssid, password=""):
    """join a network; on failure bring the previous connection back. Returns (ok, message)"""
    if not available(): return False, "NetworkManager is not available on this machine"
    if not ssid or len(ssid.encode()) > 32 or re.search(r"[\x00-\x1f]", ssid): return False, "that network name isn't valid"
    if password and not 8 <= len(password) <= 63: return False, "a Wi-Fi password is 8 to 63 characters"
    before = current()
    args = ["nmcli", "--wait", "25", "dev", "wifi", "connect", ssid] + (["password", password] if password else [])
    rc, out, err = _run(args, 40)
    if rc == 0: return True, f"connected to {ssid}"
    if before and before[1]: _run(["nmcli", "--wait", "20", "connection", "up", before[1]], 30)       # roll back: stay online
    msg = (err or out).strip().splitlines()[-1] if (err or out).strip() else "couldn't connect"
    if password: msg = msg.replace(password, "•" * 8)
    return False, ("wrong password, or the network refused us" if re.search(r"secrets|password|802-1x|auth", msg, re.I) else msg[:120]) + (f" (stayed on {before[1]})" if before else "")
