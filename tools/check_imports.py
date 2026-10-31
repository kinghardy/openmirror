#!/usr/bin/env python3
"""Every `from mirror_x import name` in the project must name something mirror_x really defines or imports. Removing an "unused" import from a module
can break another module that imported the name from it; this catches that without importing anything (importing some modules starts threads
and touches the display).

    python3 tools/check_imports.py        # exit code 1 if a name does not resolve"""

import ast
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def top_level_names(path):
    with open(path, encoding="utf-8") as f:
        tree = ast.parse(f.read())
    names = set()
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(n.name)
        elif isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = n.targets if isinstance(n, ast.Assign) else [n.target]
            for t in targets:
                for x in ast.walk(t):
                    if isinstance(x, ast.Name):
                        names.add(x.id)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                names.add((a.asname or a.name).split(".")[0])
        elif isinstance(n, (ast.For, ast.With, ast.If, ast.Try)):  # names bound inside top-level blocks count too
            for x in ast.walk(n):
                if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store):
                    names.add(x.id)
                elif isinstance(x, (ast.FunctionDef, ast.ClassDef)):
                    names.add(x.name)
                elif isinstance(x, (ast.Import, ast.ImportFrom)):
                    for a in x.names:
                        names.add((a.asname or a.name).split(".")[0])
    return names


def main():
    mods = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(os.path.join(ROOT, "mirror_*.py"))}
    cache, bad, checked = {}, [], 0
    for p in glob.glob(os.path.join(ROOT, "**", "*.py"), recursive=True):
        with open(p, encoding="utf-8") as f:
            tree = ast.parse(f.read())
        for n in ast.walk(tree):
            if isinstance(n, ast.ImportFrom) and n.module in mods and n.level == 0:
                have = cache.setdefault(n.module, top_level_names(mods[n.module]))
                for a in n.names:
                    checked += 1
                    if a.name != "*" and a.name not in have:
                        bad.append(f"{os.path.relpath(p, ROOT)}:{n.lineno}  `{a.name}` is not defined in {n.module}")
    for b in bad:
        print("MISSING", b)
    print(f"{checked} imported names checked, {len(bad)} missing")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
