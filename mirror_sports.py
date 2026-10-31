"""Sports engine: the watch list, ESPN polling, delayed scoreboards and scoring-play events, and the data behind the Sports channel (scores, game detail,
standings, schedule). Split out of proxy.py; proxy.py calls init(...) with the few things it needs from there, then start().
Endpoints that use it are in proxy.py (/sports/*, the phone admin card); the page side is sports.js (celebrations, screensaver) and sportsapp.js (the channel)."""
import os, time, threading

MH = SLEEP = _jload = _jsave = mget = sleep_set = None          # set by init()


def init(**deps):
    globals().update(deps)
    # (the saved settings are read here, after _jload is known)
    global SP
    SP.update(_jload(SPORTS_FILE, {})); [SP.setdefault(k, v) for k, v in (("delay", 40), ("auto", True), ("watch", []), ("unwatch", []), ("favs", []))]


def start(): threading.Thread(target=sports_loop, daemon=True).start()


# ---- Sports: the games you're watching ------------------------------------------------------------------------------------------------------------------
# Watches ESPN's public feed for the games on the watch list (Detroit teams are watched automatically while they play), keeps a short history of snapshots and
# scoring plays, and serves them back DELAYED by how far behind real time your TV is (IPTV is usually 30-60 s), so the mirror never spoils a play.
SPORTS_FILE = os.path.expanduser("~/.local/share/mirror/sports.json")
SP_LEAGUES = {"nfl": ("football", "nfl"), "nba": ("basketball", "nba"), "nhl": ("hockey", "nhl"), "mlb": ("baseball", "mlb")}
SP = {}                                                       # (filled in by init())
SGAMES, SEVENTS = {}, []
HOOKS = []                                                       # called with each scoring event at the moment it is due (the phone notifications use this)
def sp_save(): _jsave(SPORTS_FILE, SP)
def sp_get(path, ttl=6): return mget("https://site.api.espn.com/apis/site/v2/sports/" + path, ttl)
def sp_team(t):
    logos = {x.get("rel", [""])[-1]: x["href"] for x in t.get("logos", [])}
    return {"id": str(t.get("id")), "abbr": t.get("abbreviation", ""), "name": t.get("displayName", ""), "short": t.get("shortDisplayName") or t.get("name", ""), "logo": t.get("logo") or logos.get("default", ""),
            "color": "#" + (t.get("color") or "333333"), "alt": "#" + (t.get("alternateColor") or "888888")}
def sp_watched(g): return g["key"] in SP["watch"] or (SP["auto"] and g.get("auto") and g["key"] not in SP["unwatch"])
def sp_boards():
    for lg, (sport, lid) in SP_LEAGUES.items():
        try: d = sp_get(f"{sport}/{lid}/scoreboard", 6)
        except (OSError, ValueError): continue
        for ev in d.get("events", []):
            key = f"{lg}:{ev['id']}"; comp = ev["competitions"][0]; st = ev["status"]; cs = {c["homeAway"]: c for c in comp["competitors"]}
            g = SGAMES.setdefault(key, {"key": key, "lg": lg, "id": ev["id"], "seen": set(), "init": False, "snaps": [], "prev": None, "polled": 0.0, "events": 0})
            g.update(state=st["type"]["state"], start=ev["date"], name=ev.get("shortName", ""), home=sp_team(cs["home"]["team"]), away=sp_team(cs["away"]["team"]),
                     bscore={"home": cs["home"].get("score"), "away": cs["away"].get("score")}, bsit=comp.get("situation") or {}, bdetail=st["type"].get("shortDetail", ""))
            fav = {g["home"]["abbr"], g["away"]["abbr"]} & set(SP["favs"])
            g["auto"] = bool(fav) and (st["type"]["state"] == "in" or (st["type"]["state"] == "pre" and 0 < (time.mktime(time.strptime(ev["date"], "%Y-%m-%dT%H:%MZ")) - time.timezone - time.time()) < 36 * 3600) or (st["type"]["state"] == "post" and g.get("snaps") and time.time() - g["snaps"][-1][0] < 1500))
def sp_emit(g, kind, title, team, text, away, home, wc=None, at=None):
    t = g["home"] if team == g["home"]["abbr"] else g["away"] if team == g["away"]["abbr"] else (g["home"] if team == "" else g["away"])
    SEVENTS.append({"id": (SEVENTS[-1]["id"] + 1) if SEVENTS else 1, "key": g["key"], "lg": g["lg"], "kind": kind, "title": title, "team": t["abbr"], "tname": t["short"], "logo": t["logo"], "color": t["color"], "alt": t["alt"],
                    "text": text, "away": {"abbr": g["away"]["abbr"], "score": away}, "home": {"abbr": g["home"]["abbr"], "score": home}, "at": at or time.time(), "wc": wc, "fired": False})
    del SEVENTS[:-60]
def sp_wc(p):
    try: return time.mktime(time.strptime(p["wallclock"], "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
    except (KeyError, ValueError, TypeError): return None
def sp_classify(g, p):
    typ, text = (p.get("type") or {}).get("text", "").lower(), p.get("text", ""); tid = str((p.get("team") or {}).get("id", ""))
    team = g["home"] if tid == g["home"]["id"] else g["away"]; fav = team["abbr"] in SP["favs"]; low = text.lower(); lg = g["lg"]
    if lg == "nfl":
        if "extra point" in typ or "two-point" in typ or "2-pt" in low or "extra point" in low: return None
        if "touchdown" in typ or "touchdown" in low: return ("big" if fav else "small", "TOUCHDOWN!", team["abbr"])
        if "field goal" in typ or "field goal" in low: return ("med" if fav else "small", "FIELD GOAL", team["abbr"])
        if "safety" in typ: return ("med" if fav else "small", "SAFETY", team["abbr"])
    elif lg == "nhl":
        if "goal" in typ or p.get("scoreValue"): return ("big" if fav else "small", "GOAL!", team["abbr"])
    elif lg == "mlb":
        if "home run" in typ or "homers" in low or "home run" in low: return ("big" if fav else "small", "HOME RUN!", team["abbr"])
        if fav and p.get("scoreValue"): return ("small", "RUN SCORES", team["abbr"])
    elif lg == "nba":
        if p.get("scoreValue") == 3 and fav: return ("med", "THREE!", team["abbr"])
    return None
def sp_scoring(d):
    """a game's scoring plays: ESPN's own list when it has one (football), otherwise the flagged plays (hockey, basketball, baseball no longer fill the list in)"""
    return d.get("scoringPlays") or [p for p in d.get("plays", []) if p.get("scoringPlay")]
def sp_poll(g):
    d = sp_get(f"{SP_LEAGUES[g['lg']][0]}/{SP_LEAGUES[g['lg']][1]}/summary?event={g['id']}", 5); now = time.time()
    c = d["header"]["competitions"][0]; st = c["status"]; cs = {x["homeAway"]: x for x in c["competitors"]}; state = st["type"]["state"]
    plays = sp_scoring(d)
    for p in plays:
        if p["id"] in g["seen"]: continue
        g["seen"].add(p["id"])
        if g["init"]:
            ev = sp_classify(g, p)
            if ev: sp_emit(g, ev[0], ev[1], ev[2], p.get("text", ""), p.get("awayScore"), p.get("homeScore"), sp_wc(p), now)
    wp = (d.get("winprobability") or [{}])[-1].get("homeWinPercentage")
    lead = [{"team": (x.get("team") or {}).get("abbreviation", ""), "rows": [{"cat": k.get("displayName", ""), "who": (k["leaders"][0].get("athlete") or {}).get("shortName", ""), "val": k["leaders"][0].get("displayValue", "")} for k in x.get("leaders", [])[:3] if k.get("leaders")]} for x in d.get("leaders", [])]
    sit = g.get("bsit") or {}; last = (sit.get("lastPlay") or {}).get("text") or next((p.get("text") for p in reversed(d.get("plays", [])) if p.get("text")), "")
    snap = {"state": state, "detail": st["type"].get("detail", ""), "short": st["type"].get("shortDetail", ""), "clock": st.get("displayClock", ""), "period": st.get("period"),
            "home": {"score": cs["home"].get("score"), "lines": [l.get("displayValue") for l in cs["home"].get("linescores", [])]}, "away": {"score": cs["away"].get("score"), "lines": [l.get("displayValue") for l in cs["away"].get("linescores", [])]},
            "last": last, "sit": sit.get("shortDownDistanceText") or "", "poss": str(sit.get("possession", "")), "red": bool(sit.get("isRedZone")), "wp": wp, "leaders": lead, "wc": sp_wc((d.get("plays") or [{}])[-1])}
    g["snaps"].append((now, snap)); g["snaps"] = [x for x in g["snaps"] if now - x[0] < 900]
    if g["init"] and g["prev"] and g["prev"] != state:
        hs, as_ = int(snap["home"]["score"] or 0), int(snap["away"]["score"] or 0)
        if state == "in": sp_emit(g, "small", "GAME TIME", "", f"{g['away']['short']} at {g['home']['short']}", as_, hs, None, now)
        if state == "post":
            win = g["home"] if hs > as_ else g["away"]; sp_emit(g, "big" if win["abbr"] in SP["favs"] else "small", "FINAL", win["abbr"], f"{g['away']['short']} {as_}, {g['home']['short']} {hs}", as_, hs, None, now)
    g["prev"], g["init"], g["polled"] = state, True, now
def sp_view(g):
    """the game as the TV shows it now: the newest snapshot that is at least `delay` seconds old (by when it actually happened)"""
    now = time.time(); d = SP["delay"]; pick = None
    for t, sn in g["snaps"]:
        lag = (t - sn["wc"]) if sn.get("wc") and 0 < t - sn["wc"] < 90 else 8
        if t - lag <= now - d: pick = sn
    sync = pick is None
    pick = pick or (g["snaps"][0][1] if g["snaps"] else None)
    if not pick: return None
    h, a = pick["home"], pick["away"]
    return {"key": g["key"], "lg": g["lg"], "state": pick["state"], "detail": pick["short"] or pick["detail"], "clock": pick["clock"], "period": pick["period"], "syncing": sync and pick["state"] == "in",
            "home": dict(g["home"], score=h["score"], lines=h["lines"]), "away": dict(g["away"], score=a["score"], lines=a["lines"]), "last": pick["last"], "sit": pick["sit"], "poss": pick["poss"], "red": pick["red"],
            "wp": pick["wp"], "leaders": pick["leaders"], "start": g.get("start")}
def sp_due(ev):
    d = SP["delay"]; return max(ev["at"], ev["wc"] + d if ev.get("wc") else ev["at"] + max(0, d - 8))
def sports_state(since=0):
    now = time.time(); games = []
    for g in SGAMES.values():
        if not sp_watched(g): continue
        v = sp_view(g)
        if v and (v["state"] == "in" or (v["state"] == "pre" and g.get("start") and 0 < time.mktime(time.strptime(g["start"], "%Y-%m-%dT%H:%MZ")) - time.timezone - now < 1800) or (v["state"] == "post" and g["snaps"] and now - g["snaps"][-1][0] < 1200)): games.append(v)
    evs = [{k: e[k] for k in ("id", "key", "lg", "kind", "title", "team", "tname", "logo", "color", "alt", "text", "away", "home")} for e in SEVENTS if e["id"] > since and sp_due(e) <= now and now - sp_due(e) < 120]
    return {"delay": SP["delay"], "auto": SP["auto"], "games": games, "events": evs[:4], "last": max([e["id"] for e in SEVENTS if sp_due(e) <= now] or [0])}
def sports_watch_brief():
    """the games being watched, in short form, for the phone's Game tab (scores are the delayed ones the TV shows)"""
    now = time.time(); out = []
    for g in SGAMES.values():
        if not sp_watched(g): continue
        v = sp_view(g); st = (v or g)["state"]
        if st == "post" and not (g["snaps"] and now - g["snaps"][-1][0] < 3 * 3600): continue
        if st == "pre" and g.get("start") and time.mktime(time.strptime(g["start"], "%Y-%m-%dT%H:%MZ")) - time.timezone - now > 6 * 3600: continue
        def side(k): return {"abbr": g[k]["abbr"], "logo": g[k]["logo"], "score": v[k]["score"] if v else (g.get("bscore") or {}).get(k)}
        out.append({"key": g["key"], "lg": g["lg"], "state": st, "detail": (v["detail"] if v else g.get("bdetail")) or "", "start": g.get("start"), "home": side("home"), "away": side("away")})
    return sorted(out, key=lambda x: (x["state"] != "in", x["start"] or ""))
def sports_list():
    now = time.time(); out = []
    for g in SGAMES.values():
        if g.get("state") == "post" and not sp_watched(g): continue
        out.append({"key": g["key"], "lg": g["lg"], "name": g["name"], "state": g["state"], "start": g.get("start"), "detail": g.get("bdetail"), "watched": sp_watched(g), "fav": bool({g["home"]["abbr"], g["away"]["abbr"]} & set(SP["favs"])),
                    "home": g["home"]["abbr"], "away": g["away"]["abbr"], "hs": (g.get("bscore") or {}).get("home"), "as": (g.get("bscore") or {}).get("away")})
    return sorted(out, key=lambda x: (not x["watched"], not x["fav"], x["state"] != "in", x["start"] or ""))[:40]
def sports_act(act, body):
    if act == "watch":
        k = str(body.get("key", "")); on = bool(body.get("on"))
        SP["watch"] = [x for x in SP["watch"] if x != k] + ([k] if on else []); SP["unwatch"] = [x for x in SP["unwatch"] if x != k] + ([] if on else [k]); sp_save(); return "Watching" if on else "Not watching"
    if act == "delay": SP["delay"] = max(0, min(180, int(body.get("delay", 40)))); sp_save(); return f"TV delay {SP['delay']}s"
    if act == "auto": SP["auto"] = bool(body.get("on")); sp_save(); return "Detroit games are watched automatically" if SP["auto"] else "Auto-watch off"
    if act == "sync":
        ev = next((e for e in reversed(SEVENTS) if not e.get("test") and sp_due(e) <= time.time() and time.time() - e["at"] < 300), None)
        if not ev: raise ValueError("No scoring play in the last few minutes to sync with")
        SP["delay"] = max(3, min(180, int(time.time() - (ev["wc"] or ev["at"] - 8)))); sp_save(); return f"Synced: your TV is about {SP['delay']}s behind"
    if act == "test":
        g = next(iter(SGAMES.values()), None); k = body.get("kind", "big")
        if not g: raise ValueError("No games loaded yet")
        gg = next((x for x in SGAMES.values() if sp_watched(x)), g)
        sp_emit(gg, k, {"big": "TOUCHDOWN!", "med": "FIELD GOAL", "small": "THREE!"}.get(k, "GOAL!"), gg["home"]["abbr"], "Test celebration", 0, 0, None, time.time()); SEVENTS[-1]["test"] = True; return "Celebrating!"
    raise ValueError("unknown action")

# ---- Sports app data (the mirror's Sports channel): scores by day, one game's detail, standings, the Detroit team's schedule ------------------------------------
SP_DET = {"nfl": "8", "nba": "8", "nhl": "5", "mlb": "6"}
def sp_norm_game(lg, ev):
    comp = ev["competitions"][0]; st = ev["status"]["type"]; cs = {c["homeAway"]: c for c in comp["competitors"]}
    def side(c):
        t = sp_team(c["team"]); rec = next((x.get("summary") for x in c.get("records", []) if x.get("type") == "total"), "") or (c.get("records") or [{}])[0].get("summary", "")
        return dict(t, score=c.get("score"), record=rec, winner=bool(c.get("winner")))
    g = {"key": f"{lg}:{ev['id']}", "lg": lg, "state": st["state"], "detail": st.get("shortDetail", ""), "start": ev["date"], "home": side(cs["home"]), "away": side(cs["away"]),
         "tv": ", ".join(n for b in comp.get("broadcasts", [])[:1] for n in (b.get("names") or [])[:2]), "name": ev.get("shortName", "")}
    live = SGAMES.get(g["key"])
    g["watched"] = bool(live and sp_watched(live)); g["fav"] = bool({g["home"]["abbr"], g["away"]["abbr"]} & set(SP["favs"]))
    if g["watched"] and g["state"] == "in":                                   # a game you're watching shows what your TV shows
        v = sp_view(live)
        if v: g["home"]["score"], g["away"]["score"], g["detail"] = v["home"]["score"], v["away"]["score"], ("SYNCING…" if v["syncing"] else v["detail"])
    return g
def sports_board(lg, date=""):
    sport, lid = SP_LEAGUES[lg]; d = sp_get(f"{sport}/{lid}/scoreboard" + (f"?dates={int(date)}" if str(date).isdigit() else ""), 10)
    day = (d.get("day") or {}).get("date") or (d["events"][0]["date"][:10] if d.get("events") else "")
    games = [sp_norm_game(lg, e) for e in d.get("events", [])]
    games.sort(key=lambda g: (g["state"] != "in", not g["fav"], g["start"]))
    return {"lg": lg, "day": day, "games": games, "step": 7 if lg == "nfl" else 1, "delay": SP["delay"], "auto": SP["auto"]}
def sports_game(key):
    lg, eid = key.split(":"); sport, lid = SP_LEAGUES[lg]; d = sp_get(f"{sport}/{lid}/summary?event={int(eid)}", 6)
    c = d["header"]["competitions"][0]; cs = {x["homeAway"]: x for x in c["competitors"]}; st = c["status"]["type"]
    base = next((e for e in sp_get(f"{sport}/{lid}/scoreboard", 30).get("events", []) if e["id"] == eid), None)
    g = sp_norm_game(lg, base) if base else {"key": key, "lg": lg, "home": sp_team(cs["home"]["team"]), "away": sp_team(cs["away"]["team"]), "state": st["state"], "detail": st.get("shortDetail", ""), "watched": False, "fav": False, "tv": ""}
    for side in ("home", "away"):
        g[side]["lines"] = [l.get("displayValue") for l in cs[side].get("linescores", [])]
        if g[side].get("score") is None: g[side]["score"] = cs[side].get("score")
    live = SGAMES.get(key); hold = bool(live and sp_watched(live) and st["state"] == "in"); v = sp_view(live) if hold else None
    hs, as_ = (int(v["home"]["score"] or 0), int(v["away"]["score"] or 0)) if v else (10 ** 6, 10 ** 6)
    if v: g["home"]["lines"], g["away"]["lines"] = v["home"]["lines"], v["away"]["lines"]
    plays = sp_scoring(d)
    plays = [p for p in plays if int(p.get("homeScore") or 0) <= hs and int(p.get("awayScore") or 0) <= as_]
    tid = {g["home"]["id"]: g["home"]["abbr"], g["away"]["id"]: g["away"]["abbr"]}
    out_plays = [{"period": (p.get("period") or {}).get("displayValue") or str((p.get("period") or {}).get("number", "")), "clock": (p.get("clock") or {}).get("displayValue", ""), "team": tid.get(str((p.get("team") or {}).get("id")), ""),
                  "type": (p.get("type") or {}).get("text", ""), "text": p.get("text", ""), "away": p.get("awayScore"), "home": p.get("homeScore")} for p in plays][-40:]
    stats = []
    try:
        bt = {t["team"]["abbreviation"]: t for t in d["boxscore"]["teams"]}; a, h = bt.get(g["away"]["abbr"]), bt.get(g["home"]["abbr"])
        hm = {x["label"]: x["displayValue"] for x in (h or {}).get("statistics", [])}
        stats = [{"label": x["label"], "away": x["displayValue"], "home": hm.get(x["label"], "")} for x in (a or {}).get("statistics", [])][:16]
    except (KeyError, TypeError): pass
    players = []
    try:
        for t in d["boxscore"]["players"]:
            for grp in t.get("statistics", [])[:2]:
                rows = [{"name": x["athlete"].get("shortName") or x["athlete"].get("displayName", ""), "pos": (x["athlete"].get("position") or {}).get("abbreviation", ""), "line": " ".join(x.get("stats", [])[:6]) if lg == "nba" else " · ".join(x.get("stats", [])[:4])} for x in grp.get("athletes", [])[:8]]
                if rows: players.append({"team": t["team"]["abbreviation"], "cat": grp.get("name", "").title() if lg != "nba" else "Players", "labels": (grp.get("labels") or [])[:6 if lg == "nba" else 4], "rows": rows})
    except (KeyError, TypeError): pass
    leaders = [{"team": (x.get("team") or {}).get("abbreviation", ""), "rows": [{"cat": k.get("displayName", ""), "who": (k["leaders"][0].get("athlete") or {}).get("shortName", ""), "val": k["leaders"][0].get("displayValue", "")} for k in x.get("leaders", [])[:4] if k.get("leaders")]} for x in d.get("leaders", [])]
    wp = (d.get("winprobability") or [{}])[-1].get("homeWinPercentage") if not hold else (v or {}).get("wp")
    return {"game": g, "plays": out_plays, "stats": stats, "players": players, "leaders": leaders, "wp": wp, "held": hold, "venue": ((d.get("gameInfo") or {}).get("venue") or {}).get("fullName", "")}
def sports_standings(lg):
    sport, lid = SP_LEAGUES[lg]; d = mget(f"https://site.api.espn.com/apis/v2/sports/{sport}/{lid}/standings", 600); groups = []
    cols = {"nfl": ("W-L-T", "PCT", "DIFF", "STRK"), "nba": ("W-L", "PCT", "GB", "STRK"), "nhl": ("W-L-OT", "PTS", "DIFF", "STRK"), "mlb": ("W-L", "PCT", "GB", "STRK")}[lg]
    for ch in d.get("children", []):
        rows = []
        for e in ch.get("standings", {}).get("entries", []):
            sm = {x["name"]: x.get("displayValue", "") for x in e.get("stats", [])}; t = sp_team(e["team"]); w, l = sm.get("wins", ""), sm.get("losses", "")
            rec = {"nfl": f"{w}-{l}-{sm.get('ties', '0')}", "nhl": f"{w}-{l}-{sm.get('otLosses', '0')}"}.get(lg, f"{w}-{l}")
            cells = {"nfl": [rec, sm.get("winPercent", ""), sm.get("pointDifferential", sm.get("differential", "")), sm.get("streak", "")], "nba": [rec, sm.get("winPercent", ""), sm.get("gamesBehind", ""), sm.get("streak", "")],
                     "nhl": [rec, sm.get("points", ""), sm.get("pointDifferential", sm.get("differential", "")), sm.get("streak", "")], "mlb": [rec, sm.get("winPercent", ""), sm.get("gamesBehind", ""), sm.get("streak", "")]}[lg]
            rows.append({"team": t, "cells": cells, "seed": float(sm.get("playoffSeed") or 99), "w": float(sm.get("winPercent") or sm.get("points") or 0)})
        rows.sort(key=lambda r: (r["seed"], -r["w"]))
        groups.append({"name": ch.get("name", ""), "rows": rows[:16]})
    return {"lg": lg, "cols": cols, "groups": groups}
def sports_schedule(lg):
    sport, lid = SP_LEAGUES[lg]; d = sp_get(f"{sport}/{lid}/teams/{SP_DET[lg]}/schedule", 300); out = []
    for ev in d.get("events", []):
        comp = ev["competitions"][0]; me = next((c for c in comp["competitors"] if c["team"]["id"] == SP_DET[lg]), None); op = next((c for c in comp["competitors"] if c is not me), None)
        if not me or not op: continue
        st = comp["status"]["type"]
        sc = lambda c: (c.get("score") or {}).get("displayValue") if isinstance(c.get("score"), dict) else c.get("score")
        out.append({"key": f"{lg}:{ev['id']}", "date": ev["date"], "home": me["homeAway"] == "home", "opp": sp_team(op["team"]), "state": st["state"], "detail": st.get("shortDetail", ""), "us": sc(me), "them": sc(op), "win": bool(me.get("winner")), "tv": ", ".join((b.get("media") or {}).get("shortName", "") for b in comp.get("broadcasts", [])[:1])})
    return {"lg": lg, "team": (d.get("team") or {}).get("displayName", ""), "events": out}
def sports_loop():
    time.sleep(6); last_b = 0.0
    while True:
        MH.beat("sports")
        try:
            now = time.time(); live = any(sp_watched(g) and g.get("state") == "in" for g in SGAMES.values())
            if now - last_b > (12 if live else 120): sp_boards(); last_b = now
            for g in list(SGAMES.values()):
                if not sp_watched(g): continue
                st = g.get("state")
                gap = 5 if st == "in" else 30 if st == "pre" and 0 < time.mktime(time.strptime(g["start"], "%Y-%m-%dT%H:%MZ")) - time.timezone - now < 1800 else 120 if st == "post" and g["snaps"] and g["snaps"][-1][1]["state"] != "post" else 0
                if gap and now - g["polled"] > gap:
                    try: sp_poll(g)
                    except (OSError, ValueError, KeyError, IndexError, TypeError): g["polled"] = now
            for e in SEVENTS:                                                  # a big moment while the mirror is in deep sleep: light the screen up
                if not e["fired"] and sp_due(e) <= now:
                    e["fired"] = True
                    for h in HOOKS:
                        try: h(e)
                        except Exception: pass
                    if e["kind"] == "big" and SLEEP["asleep"]: sleep_set(False)
        except Exception as ex: print("sports:", repr(ex), flush=True)
        time.sleep(3)
