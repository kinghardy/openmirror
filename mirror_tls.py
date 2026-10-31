"""HTTPS for the phone page. Two certificates are served, picked by the name the phone asked for (SNI):
  - a certificate for party.local / the machine's address, issued by this machine's own private certificate authority (made on first use, kept in
    ~/.config/mirror/ca). A phone that has installed + trusted that authority once (the /trust page) sees a normal padlock, and can then use notifications etc.
    The authority is locked (name constraints) so it can only ever vouch for .local names and home-network addresses.
  - the Tailscale certificate (~/.config/mirror/tls), for https://<machine>.<tailnet>.ts.net, when there is one.
Nothing here imports the rest of the project."""

import os
import socket
import ssl
import subprocess
import tempfile
import time

HOME = os.path.expanduser("~")
CA_DIR = os.path.join(HOME, ".config", "mirror", "ca")
TS_DIR = os.path.join(HOME, ".config", "mirror", "tls")
NAMES = ["party.local", socket.gethostname().split(".")[0] + ".local"]
_state = {"local": None, "local_ips": None, "local_at": 0.0, "ts": None, "ts_at": 0.0}

CA_CNF = """[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no
[dn]
CN = Mirror Local CA
O = OpenMirror
[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical,permitted;DNS:.local,permitted;DNS:localhost,permitted;IP:192.168.0.0/255.255.0.0,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:127.0.0.0/255.0.0.0
"""


def _run(*a, **k):
    return subprocess.run(a, check=True, capture_output=True, text=True, **k)


def lan_ips():
    ips = set()
    try:
        out = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", "scope", "global"], capture_output=True, text=True, timeout=5
        ).stdout
    except (OSError, subprocess.SubprocessError):
        out = ""
    for line in out.splitlines():
        p = line.split()
        if "inet" in p:
            ips.add(p[p.index("inet") + 1].split("/")[0])

    def private(ip):  # (only the ranges the authority is allowed to vouch for)
        a, b = (int(x) for x in ip.split(".")[:2])
        return a == 10 or (a == 192 and b == 168) or (a == 172 and 16 <= b <= 31)

    return sorted(i for i in ips if private(i))


def ca_cert_path():
    return os.path.join(CA_DIR, "ca.crt")


def ensure_ca():
    key, crt = os.path.join(CA_DIR, "ca.key"), ca_cert_path()
    if os.path.exists(key) and os.path.exists(crt):
        return crt
    os.makedirs(CA_DIR, mode=0o700, exist_ok=True)
    cnf = os.path.join(CA_DIR, "ca.cnf")
    open(cnf, "w").write(CA_CNF)
    _run("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key)
    os.chmod(key, 0o600)
    _run("openssl", "req", "-x509", "-new", "-key", key, "-sha256", "-days", "3650", "-config", cnf, "-out", crt)
    return crt


def _leaf(ips):
    """issues (or re-issues) the server certificate for the local names and the machine's current addresses"""
    ca = ensure_ca()
    key, crt, chain = (os.path.join(CA_DIR, n) for n in ("leaf.key", "leaf.crt", "leaf.chain.pem"))
    san = ",".join([f"DNS:{n}" for n in NAMES] + [f"IP:{i}" for i in ips])
    with tempfile.TemporaryDirectory() as t:
        ext = os.path.join(t, "ext")
        open(ext, "w").write(
            f"basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName={san}\n"
        )
        csr = os.path.join(t, "leaf.csr")
        _run("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key)
        os.chmod(key, 0o600)
        _run("openssl", "req", "-new", "-key", key, "-subj", f"/CN={NAMES[0]}", "-out", csr)
        _run(
            "openssl",
            "x509",
            "-req",
            "-in",
            csr,
            "-CA",
            ca,
            "-CAkey",
            os.path.join(CA_DIR, "ca.key"),
            "-CAcreateserial",
            "-days",
            "800",
            "-sha256",
            "-extfile",
            ext,
            "-out",
            crt,
        )
    open(chain, "w").write(open(crt).read() + open(ca).read())
    return chain, key


def _days_left(path):
    try:
        out = _run("openssl", "x509", "-in", path, "-noout", "-enddate").stdout.strip().split("=", 1)[1]
        return (time.mktime(time.strptime(out, "%b %d %H:%M:%S %Y %Z")) - time.time()) / 86400
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return 0


def local_context():
    now = time.time()
    if _state["local"] is None or now - _state["local_at"] > 600:
        ips = lan_ips()
        chain, key = os.path.join(CA_DIR, "leaf.chain.pem"), os.path.join(CA_DIR, "leaf.key")
        if (
            not (os.path.exists(chain) and os.path.exists(key))
            or ips != _state["local_ips"]
            and not _covers(chain, ips)
            or _days_left(os.path.join(CA_DIR, "leaf.crt")) < 60
        ):
            chain, key = _leaf(ips)
        c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        c.load_cert_chain(chain, key)
        _state.update(local=c, local_ips=ips, local_at=now)
    return _state["local"]


def _covers(chain, ips):
    try:
        txt = _run("openssl", "x509", "-in", chain, "-noout", "-ext", "subjectAltName").stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return all(f"IP Address:{i}" in txt for i in ips)


def ts_context():
    cert, key = os.path.join(TS_DIR, "fullchain.pem"), os.path.join(TS_DIR, "privkey.pem")
    if not (os.path.exists(cert) and os.path.exists(key)):
        return None
    now = time.time()
    if _state["ts"] is None or now - _state["ts_at"] > 6 * 3600:
        c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        c.load_cert_chain(cert, key)
        _state.update(ts=c, ts_at=now)
    return _state["ts"]


def reset_ts():
    _state["ts"] = None


def server_context():
    """the context for a new connection: starts as the local one and switches to the Tailscale certificate when the phone asks for a *.ts.net name"""
    base = local_context()

    def pick(sock, name, _ctx):
        if name and name.endswith(".ts.net"):
            c = ts_context()
            if c is not None:
                sock.context = c
        elif name is not None or True:
            sock.context = local_context()

    base.sni_callback = pick
    return base
