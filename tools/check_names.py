"""Finds names a module uses but never defines or imports (the kind of mistake that only shows up as a NameError when that line finally runs).
Usage: python3 tools/check_names.py [folder]   (default: the project folder). Exit code 1 if anything is undefined."""
import ast, builtins, symtable, sys, os
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__))); bad = 0
for f in sorted(os.listdir(d)):
    if not f.endswith(".py"): continue
    src = open(os.path.join(d, f)).read(); tree = ast.parse(src)
    bound = set(dir(builtins)) | {"__file__", "__name__"}
    for n in ast.walk(tree):
        pass
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.ClassDef)): bound.add(n.name)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names: bound.add((a.asname or a.name).split(".")[0])
        else:
            for x in ast.walk(n):
                if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store): bound.add(x.id)
    st = symtable.symtable(src, f, "exec"); missing = set()
    def walk(t):
        for s in t.get_symbols():
            if (s.is_global() or (t.get_type() == "module" and s.is_referenced())) and s.is_referenced() and not s.is_assigned() or (s.is_global() and s.is_referenced()):
                if s.get_name() not in bound: missing.add((t.get_name(), s.get_name()))
        for c in t.get_children(): walk(c)
    walk(st)
    miss = sorted({n for _, n in missing})
    print(f.ljust(22), "OK" if not miss else "UNDEFINED: " + ", ".join(miss)); bad += bool(miss)
sys.exit(1 if bad else 0)
