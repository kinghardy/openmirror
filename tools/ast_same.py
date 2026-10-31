#!/usr/bin/env python3
"""Proves that a formatting change did not change what the code DOES: for every tracked .py file it compares the parsed structure (the AST) of the
last commit with the file on disk. Layout, line breaks and comments do not appear in the AST, so a pure reformat shows "identical"; any real change
(even one character of a string or a number) shows up.

    python3 tools/ast_same.py          # last commit vs the working folder; exit 1 if any file differs"""

import ast
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    files = [
        f
        for f in subprocess.run(["git", "-C", ROOT, "ls-files"], capture_output=True, text=True).stdout.split()
        if f.endswith(".py")
    ]
    changed, same, bad = [], 0, []
    for f in files:
        old = subprocess.run(["git", "-C", ROOT, "show", f"HEAD:{f}"], capture_output=True, text=True).stdout
        try:
            with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
                new = fh.read()
            if ast.dump(ast.parse(old)) == ast.dump(ast.parse(new)):
                same += 1
            else:
                changed.append(f)
        except (SyntaxError, OSError) as e:
            bad.append((f, str(e)[:60]))
    for f in changed:
        print("DIFFERENT  ", f)
    for f, e in bad:
        print("UNREADABLE ", f, e)
    print(f"{same} identical, {len(changed)} different, {len(bad)} unreadable of {len(files)} files")
    sys.exit(1 if changed or bad else 0)


if __name__ == "__main__":
    main()
