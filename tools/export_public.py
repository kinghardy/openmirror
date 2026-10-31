#!/usr/bin/env python3
"""Make a clean, single-commit copy of the project that is safe to publish. It never pushes anywhere.

    python3 tools/export_public.py [--out DIR] [--author "Name <email>"] [--brand "words,that,are,intentional"] [--include PATH ...]
    python3 tools/export_public.py --update --out DIR --message "What changed"      add the next commit on top of an export you already published

1. takes the files of the last commit (not your working folder), so nothing uncommitted or ignored (keys, wallets, logs) can come along
2. leaves out what should not be public by default: the private working plan, the promo film (it shows third-party artwork and real names)
3. scans the result for keys, tokens, e-mail addresses, home paths and this machine's user / host / git-e-mail names, and STOPS if anything high is found
   (--brand lists words you have decided are intentional, such as a game's name, so they are not reported)
4. creates a new git repository with one commit, so none of the private history, author e-mails or old messages are published
Then publish by hand:  cd DIR && git remote add origin <url> && git push -u origin main"""
import argparse, os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import scan_secrets as SS

EXCLUDE = [                                              # (path prefixes, relative to the project)
    "docs/OPENMIRROR_PLAN.md",                           # the private working plan: the public one is docs/ROADMAP.md
    "promo/", "promo.html",                              # the film: screenshots of third-party album art, real guest names
]

def sh(*a, **k): return subprocess.run(a, check=True, capture_output=True, text=True, **k).stdout

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=os.path.expanduser("~/openmirror-export")); ap.add_argument("--author", default="OpenMirror <noreply@openmirror.invalid>")
    ap.add_argument("--brand", default=""); ap.add_argument("--include", nargs="*", default=[]); ap.add_argument("--update", action="store_true", help="add a commit to the existing export folder instead of making a new repository"); ap.add_argument("--message", default="Update"); ap.add_argument("--force", action="store_true", help="write the folder even if the scan found something (it is NOT safe to publish then)")
    a = ap.parse_args()
    if sh("git", "-C", ROOT, "status", "--porcelain", "--untracked-files=no").strip(): print("note: you have uncommitted changes; only the last commit is exported\n")
    tmp = tempfile.mkdtemp(prefix="openmirror-export-")
    try:
        tar = subprocess.run(["git", "-C", ROOT, "archive", "HEAD"], check=True, capture_output=True).stdout
        subprocess.run(["tar", "-x", "-C", tmp], input=tar, check=True)
        gone = [p for p in EXCLUDE if p not in a.include]
        for p in gone:
            t = os.path.join(tmp, p)
            if os.path.isdir(t): shutil.rmtree(t)
            elif os.path.exists(t): os.remove(t)
        version = open(os.path.join(tmp, "VERSION")).read().strip() if os.path.exists(os.path.join(tmp, "VERSION")) else "0.0.0"
        terms = SS.self_terms(); brand = [b.strip() for b in a.brand.split(",") if b.strip()]
        res = []
        for f in SS.files_of([tmp]):
            if os.path.splitext(f)[1].lower() in SS.SKIP_EXT or os.path.basename(f) in SS.SKIP_FILES: continue
            try:
                with open(f, encoding="utf-8") as fh: text = fh.read()
            except (OSError, UnicodeDecodeError): continue
            for b in sorted(brand, key=len, reverse=True): text = text.replace(b, "")           # (intentional names are not reported)
            res += SS.scan_text(os.path.relpath(f, tmp), text, terms)
        high = [r for r in res if r[0] == "high"]; low = [r for r in res if r[0] == "low"]
        for sev, name, n, kind in sorted(high, key=lambda r: (r[1], r[2])): print(f"HIGH {name}:{n}  {kind}")
        print(f"\nscan: {len(high)} high, {len(low)} low (private addresses, placeholders)  | left out: {', '.join(gone) or 'nothing'}")
        if high and not a.force: print("\nNOT exported: fix the lines above (or name intentional words with --brand), then run again."); sys.exit(1)
        out = os.path.abspath(a.out)
        name, _, email = a.author.partition("<"); email = email.rstrip(">").strip(); name = name.strip()
        env = dict(os.environ, GIT_AUTHOR_NAME=name, GIT_AUTHOR_EMAIL=email, GIT_COMMITTER_NAME=name, GIT_COMMITTER_EMAIL=email)
        if a.update:                                                 # next commit on top of what is already published
            if not os.path.isdir(os.path.join(out, ".git")): print(f"\n{out} is not an export folder (no .git): run without --update first"); sys.exit(1)
            for entry in os.listdir(out):
                if entry != ".git": (shutil.rmtree if os.path.isdir(os.path.join(out, entry)) and not os.path.islink(os.path.join(out, entry)) else os.remove)(os.path.join(out, entry))
            for entry in os.listdir(tmp): shutil.move(os.path.join(tmp, entry), os.path.join(out, entry))
            subprocess.run(["git", "add", "-A"], cwd=out, check=True)
            if not sh("git", "-C", out, "status", "--porcelain").strip(): print("\nnothing changed since the last export"); return
            subprocess.run(["git", "commit", "-q", "-m", a.message], cwd=out, check=True, env=env)
            print("\nchanged files:\n" + sh("git", "-C", out, "show", "--stat", "--format=%h %s", "HEAD")); print(f"Review it, then:  cd {out} && git push"); return
        if os.path.exists(out): print(f"\n{out} already exists: move it away first"); sys.exit(1)
        shutil.move(tmp, out); tmp = None
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=out, check=True); subprocess.run(["git", "add", "-A"], cwd=out, check=True)
        subprocess.run(["git", "commit", "-q", "-m", f"OpenMirror {version}"], cwd=out, check=True, env=env)
        n = len(sh("git", "-C", out, "ls-files").split())
        print(f"\nexported {n} files to {out} as one commit by {a.author}.\nCheck it, then:  cd {out} && git remote add origin <url> && git push -u origin main")
    finally:
        if tmp: shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__": main()
