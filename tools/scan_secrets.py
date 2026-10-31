#!/usr/bin/env python3
"""Look for things that must never be published: keys, tokens, private keys, e-mail addresses, home-directory paths, and personal terms.

    python3 tools/scan_secrets.py [PATH ...]            scan files / folders (default: the tracked files of this repo)
    python3 tools/scan_secrets.py --staged              scan what is about to be committed (used by tools/hooks/pre-commit)
    python3 tools/scan_secrets.py --terms alice,acme    also flag these words (case-insensitive)
    python3 tools/scan_secrets.py --self                also flag this machine's user name, host name and git e-mail (found at run time, so no
                                                        personal text is ever stored in the repository)
Findings never print the secret itself, only where it is and what kind. Exit code 1 when anything "high" is found (2 with --strict for "low" too)."""
import argparse, getpass, os, re, socket, subprocess, sys

HIGH = [
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("JSON web token", re.compile(r"eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("cloud / service token", re.compile(r"(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{32,})")),
    ("assigned secret", re.compile(r"(?i)\b(api[_-]?key|secret|token|passwd|password|bearer)\b[\"']?\s*[:=]\s*[\"'][A-Za-z0-9_\-./+=]{20,}[\"']")),
]
LOW = [
    ("e-mail address", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")),
    ("home-directory path", re.compile(r"/home/[a-z_][a-z0-9_-]*/")),
    ("private network address", re.compile(r"\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b")),
]
OK_EMAIL = re.compile(r"(@example\.(com|org|net)|@users\.noreply\.github\.com|noreply@|@openmirror\.invalid|@2x|@media|@keyframes|@import|@font-face|@types/)")
OK_PATHS = ("/home/pi/", "/home/user/", "/home/you/", "/home/<")
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".wav", ".ogg", ".ico", ".woff", ".woff2", ".pdf", ".zip", ".gz", ".xwd"}
SKIP_FILES = set()

def self_terms():
    t = {getpass.getuser(), socket.gethostname().split(".")[0]}
    try:
        e = subprocess.run(["git", "config", "user.email"], capture_output=True, text=True).stdout.strip()
        if e: t |= {e, e.split("@")[0]}
    except OSError: pass
    return {x for x in t if len(x) >= 4}

def scan_text(name, text, terms=()):
    out = []
    term_re = re.compile("|".join(re.escape(t) for t in terms), re.I) if terms else None
    for n, line in enumerate(text.splitlines(), 1):
        if len(line) > 4000: line = line[:4000]
        for kind, rx in HIGH:
            if rx.search(line): out.append(("high", name, n, kind))
        for kind, rx in LOW:
            for m in rx.finditer(line):
                if kind == "e-mail address" and OK_EMAIL.search(m.group(0) + line[m.end():m.end() + 1] + line[max(0, m.start() - 12):m.start()]): continue
                if kind == "home-directory path" and any(p in m.group(0) for p in OK_PATHS): continue
                out.append(("low", name, n, kind)); break
        if term_re and term_re.search(line): out.append(("high", name, n, "personal term"))
    return out

def files_of(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, fs in os.walk(p):
                dirs[:] = [d for d in dirs if d not in (".git", "__pycache__", "node_modules")]
                for f in fs: yield os.path.join(root, f)
        elif os.path.isfile(p): yield p

def scan_paths(paths, terms=(), base=None):
    res = []
    for f in files_of(paths):
        if os.path.splitext(f)[1].lower() in SKIP_EXT or os.path.basename(f) in SKIP_FILES: continue
        try:
            with open(f, encoding="utf-8") as fh: text = fh.read()
        except (OSError, UnicodeDecodeError): continue
        res += scan_text(os.path.relpath(f, base) if base else f, text, terms)
    return res

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("paths", nargs="*"); ap.add_argument("--staged", action="store_true"); ap.add_argument("--terms", default=""); ap.add_argument("--self", action="store_true"); ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(); root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(root)
    terms = {t.strip() for t in a.terms.split(",") if t.strip()} | (self_terms() if a.self else set())
    if a.staged: paths = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"], capture_output=True, text=True).stdout.split()
    elif a.paths: paths = a.paths
    else: paths = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split()
    res = scan_paths(paths, terms)
    for sev, name, n, kind in sorted(res, key=lambda r: (r[0] != "high", r[1], r[2])): print(f"{sev.upper():4} {name}:{n}  {kind}")
    high, low = sum(r[0] == "high" for r in res), sum(r[0] == "low" for r in res)
    print(f"{high} high, {low} low" + (" (personal terms checked)" if terms else ""))
    sys.exit(1 if high else (2 if a.strict and low else 0))

if __name__ == "__main__": main()
