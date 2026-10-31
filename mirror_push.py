"""Web Push (notifications to phones that installed the app): subscription storage, VAPID keys, and the RFC 8291 / RFC 8292 message encryption + sending.
Needs the `cryptography` package only. Nothing here imports the rest of the project."""
import base64, json, os, struct, threading, time, urllib.error, urllib.parse, urllib.request
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

HOME = os.path.expanduser("~")
VAPID_FILE = os.path.join(HOME, ".config", "mirror", "vapid.pem")
SUBS_FILE = os.path.join(HOME, ".local", "share", "mirror", "push.json")
SUBJECT = "mailto:mirror@example.com"                              # (push services want a contact address in the VAPID token; this one is not a real mailbox)
LOCK = threading.Lock()
DEFAULT_PREFS = {"mine": True, "sports": False}


def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def unb64(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
def _pub_bytes(pub): return pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def vapid_key():
    if os.path.exists(VAPID_FILE): return serialization.load_pem_private_key(open(VAPID_FILE, "rb").read(), None)
    k = ec.generate_private_key(ec.SECP256R1()); os.makedirs(os.path.dirname(VAPID_FILE), exist_ok=True)
    open(VAPID_FILE, "wb").write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())); os.chmod(VAPID_FILE, 0o600)
    return k


def public_key(): return b64(_pub_bytes(vapid_key().public_key()))


def encrypt(payload, ua_public, auth_secret, as_private=None, salt=None):
    """RFC 8291 aes128gcm: the body to POST for `payload` (bytes) to a subscriber with these keys (base64url strings)"""
    as_private = as_private or ec.generate_private_key(ec.SECP256R1()); salt = salt or os.urandom(16)
    ua_pub = unb64(ua_public); as_pub = _pub_bytes(as_private.public_key())
    secret = as_private.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = HKDF(hashes.SHA256(), 32, unb64(auth_secret), b"WebPush: info\x00" + ua_pub + as_pub).derive(secret)
    cek = HKDF(hashes.SHA256(), 16, salt, b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt, b"Content-Encoding: nonce\x00").derive(ikm)
    ct = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)           # 0x02: the padding delimiter of the last (only) record
    return salt + struct.pack(">I", 4096) + bytes([len(as_pub)]) + as_pub + ct


def _vapid_header(endpoint):
    u = urllib.parse.urlsplit(endpoint); k = vapid_key()
    head = b64(json.dumps({"typ": "JWT", "alg": "ES256"}).encode()); body = b64(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": SUBJECT}).encode())
    r, s = decode_dss_signature(k.sign(f"{head}.{body}".encode(), ec.ECDSA(hashes.SHA256())))
    return f"vapid t={head}.{body}.{b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}, k={public_key()}"


def _load():
    try: return json.load(open(SUBS_FILE))
    except (OSError, ValueError): return {}


def _save(d):
    os.makedirs(os.path.dirname(SUBS_FILE), exist_ok=True)
    with open(SUBS_FILE + ".tmp", "w") as f: json.dump(d, f)
    os.replace(SUBS_FILE + ".tmp", SUBS_FILE); os.chmod(SUBS_FILE, 0o600)


def subscribe(wid, sub, prefs=None):
    ep = sub["endpoint"]
    if not ep.startswith("https://"): raise ValueError("bad endpoint")
    with LOCK:
        d = _load(); old = d.get(ep, {}); d[ep] = {"wid": wid, "keys": sub["keys"], "prefs": dict(DEFAULT_PREFS, **(old.get("prefs") or {}), **(prefs or {})), "at": time.time()}; _save(d)
        return d[ep]["prefs"]


def set_prefs(wid, endpoint, prefs):
    with LOCK:
        d = _load(); s = d.get(endpoint)
        if not s or s["wid"] != wid: raise ValueError("not subscribed")
        s["prefs"].update({k: bool(v) for k, v in prefs.items() if k in DEFAULT_PREFS}); _save(d); return s["prefs"]


def unsubscribe(wid, endpoint):
    with LOCK:
        d = _load()
        if d.get(endpoint, {}).get("wid") == wid: d.pop(endpoint); _save(d)


def prefs_of(wid, endpoint):
    s = _load().get(endpoint); return s["prefs"] if s and s["wid"] == wid else None


def _send_one(endpoint, s, msg):
    body = encrypt(json.dumps(msg).encode(), s["keys"]["p256dh"], s["keys"]["auth"])
    req = urllib.request.Request(endpoint, data=body, method="POST", headers={"Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "3600", "Urgency": msg.get("urgency", "normal"), "Authorization": _vapid_header(endpoint)})
    try:
        with urllib.request.urlopen(req, timeout=12) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
    except OSError: return 0


def notify(title, body="", kind=None, wid=None, url="/", tag=None, urgency="normal"):
    """send to every subscription (of one wallet, or all) whose preferences include `kind`; runs in the background; subscriptions the push service says are gone are removed"""
    msg = {"title": title, "body": body, "url": url, "tag": tag, "urgency": urgency}
    def run():
        d = _load(); dead = []
        for ep, s in d.items():
            if (wid and s["wid"] != wid) or (kind and not s["prefs"].get(kind)): continue
            code = _send_one(ep, s, msg)
            if code not in (200, 201, 202): print("push:", s["wid"], code, flush=True)
            if code in (404, 410): dead.append(ep)
        if dead:
            with LOCK:
                d = _load(); [d.pop(e, None) for e in dead]; _save(d)
    threading.Thread(target=run, daemon=True).start()
