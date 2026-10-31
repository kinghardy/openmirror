#!/usr/bin/env python3
"""King Hardy Slots: simulate the maths and print the reel strips for games/slots.js.
5 reels x 3 rows, 10 paylines, left to right, 3+ of a kind. King = wild (not for the chest). Chest = scatter: pays x total bet anywhere and
starts free spins (all wins x2, retriggerable). Edit WEIGHTS / PAY, run `python3 tools/slots_sim.py`, paste the printed STRIPS into slots.js.
Play money only: this is a party game, there is no real-money anything here."""

import random
import sys

SYMS = ["KING", "CREST", "GOBLET", "RING", "CASTLE", "A", "K", "Q", "J", "CHEST"]  # indices 0..9
WILD, SCAT = 0, 9
LINES = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0],
]
PAY = {  # x line bet for 3 / 4 / 5 in a row
    0: (70, 340, 1300),
    1: (45, 180, 650),
    2: (34, 130, 440),
    3: (22, 90, 330),
    4: (18, 66, 220),
    5: (13, 45, 170),
    6: (11, 34, 135),
    7: (9, 28, 110),
    8: (7, 22, 90),
}
SCAT_PAY = {3: 2, 4: 10, 5: 50}  # x total bet
FREE = {3: 8, 4: 12, 5: 20}
FS_MULT = 2
# symbols per reel strip (the wild lives on reels 2-4 only, like the classics)
STRIPS_W = [
    {1: 5, 2: 5, 3: 6, 4: 6, 5: 8, 6: 8, 7: 9, 8: 9, 9: 2},
    {0: 4, 1: 5, 2: 5, 3: 6, 4: 6, 5: 8, 6: 8, 7: 9, 8: 9, 9: 2},
    {0: 4, 1: 5, 2: 5, 3: 6, 4: 6, 5: 8, 6: 8, 7: 9, 8: 9, 9: 2},
    {0: 4, 1: 5, 2: 5, 3: 6, 4: 6, 5: 8, 6: 8, 7: 9, 8: 9, 9: 2},
    {1: 5, 2: 5, 3: 6, 4: 6, 5: 8, 6: 8, 7: 9, 8: 9, 9: 2},
]


def make_strip(w, seed):
    s = [k for k, n in w.items() for _ in range(n)]
    r = random.Random(seed)
    for _ in range(200):  # spread: no two identical symbols side by side
        r.shuffle(s)
        if all(s[i] != s[(i + 1) % len(s)] for i in range(len(s))):
            break
    return s


STRIPS = [make_strip(w, 11 + i) for i, w in enumerate(STRIPS_W)]


def grid_at(stops):
    return [[STRIPS[r][(stops[r] + k) % len(STRIPS[r])] for k in range(3)] for r in range(5)]  # grid[reel][row]


def line_pay(syms):
    n_w = 0
    while n_w < 5 and syms[n_w] == WILD:
        n_w += 1
    best = PAY[WILD][n_w - 3] if n_w >= 3 else 0
    if n_w < 5:
        base = syms[n_w]
        if base != SCAT:
            run = n_w
            while run < 5 and syms[run] in (base, WILD):
                run += 1
            if run >= 3:
                best = max(best, PAY[base][run - 3])
    return best


def evaluate(grid):
    pay = sum(line_pay([grid[r][ln[r]] for r in range(5)]) for ln in LINES)  # x line bet
    sc = sum(1 for r in range(5) for k in range(3) if grid[r][k] == SCAT)
    return pay, sc


def simulate(n, rng):
    stake = won = hits = trig = fs_spins = 0
    biggest = 0
    for _ in range(n):
        stake += 10  # 10 lines x 1
        pay, sc = evaluate(grid_at([rng.randrange(len(STRIPS[r])) for r in range(5)]))
        w = pay + (SCAT_PAY.get(min(sc, 5), 0) * 10 if sc >= 3 else 0)
        if pay or sc >= 3:
            hits += 1
        if sc >= 3:
            trig += 1
            left = FREE[min(sc, 5)]
            while left:
                left -= 1
                fs_spins += 1
                p2, s2 = evaluate(grid_at([rng.randrange(len(STRIPS[r])) for r in range(5)]))
                w += (p2 + (SCAT_PAY.get(min(s2, 5), 0) * 10 if s2 >= 3 else 0)) * FS_MULT
                if s2 >= 3:
                    left += FREE[min(s2, 5)]
        won += w
        biggest = max(biggest, w)
    return stake, won, hits, trig, fs_spins, biggest


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 400000
    stake, won, hits, trig, fs, big = simulate(n, random.Random(7))
    print(
        f"spins {n}: RTP {won / stake * 100:.1f}%  hit rate {hits / n * 100:.1f}%  free-spin trigger 1 in {n / max(trig, 1):.0f}  biggest win x{big / 10:.0f} of bet"
    )
    print("STRIPS =", [[SYMS[i] for i in s] for s in STRIPS])
    print("STRIP LENGTHS", [len(s) for s in STRIPS])
