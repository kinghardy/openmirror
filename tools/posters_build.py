#!/usr/bin/env python3
"""Builds ../posters-curated.json for the Poster Wall's hand-picked shelves: each title is looked up on TMDB (key in
~/.config/mirror/tmdb_key) so the dashboard needs no lookups at runtime, and each carries a one-line "why it matters".
Edit the lists below, run `python3 tools/posters_build.py`, reload the kiosk. Titles that can't be matched are reported."""

import json
import os
import pathlib
import time
import urllib.parse
import urllib.request

KEY = pathlib.Path(os.path.expanduser("~/.config/mirror/tmdb_key")).read_text().strip()
OUT = pathlib.Path(__file__).resolve().parent.parent / "posters-curated.json"


def tmdb(path, **q):
    q["api_key"] = KEY
    for attempt in range(3):
        try:
            with urllib.request.urlopen(
                f"https://api.themoviedb.org/3/{path}?{urllib.parse.urlencode(q)}", timeout=15
            ) as r:
                return json.load(r)
        except Exception:
            time.sleep(1 + attempt)
    return {}


# (title, year, why it matters). media 'movie' unless the list says 'tv'.
PD_SILENT = [
    ("A Trip to the Moon", 1902, "Méliès’ rocket lands in the Man in the Moon’s eye. Cinema’s first blockbuster."),
    ("The Great Train Robbery", 1903, "One of the first real stories on film, and a gunshot aimed straight at you."),
    ("The Kid", 1921, "Chaplin’s first feature: a tramp, a baby, and a lot of heart."),
    ("The Cabinet of Dr. Caligari", 1920, "Painted shadows and crooked sets that invented the horror film."),
    ("Nosferatu", 1922, "The unauthorized Dracula that wasn’t supposed to survive. It did."),
    ("Nanook of the North", 1922, "The film that gave the world the documentary."),
    ("Haxan", 1922, "A witchcraft ‘documentary’ so strange it was banned in places."),
    ("Safety Last!", 1923, "Harold Lloyd dangling from a clock. You know the image."),
    ("The Hunchback of Notre Dame", 1923, "Lon Chaney, and the make-up kit every movie monster inherited."),
    ("Sherlock Jr.", 1924, "Buster Keaton walks into a movie screen, decades before anyone else dared."),
    ("The Gold Rush", 1925, "Chaplin eats a boot, and somehow makes it elegant."),
    ("The Phantom of the Opera", 1925, "The unmasking scene still makes theaters gasp."),
    ("Battleship Potemkin", 1925, "The Odessa steps. Film schools have studied them ever since."),
    ("The Lost World", 1925, "Dinosaurs on screen, years before King Kong."),
    ("The General", 1926, "Keaton’s Civil War train chase, the grandest stunt in silent comedy."),
    ("Metropolis", 1927, "Every sci-fi skyline you’ve ever seen started here."),
    ("Steamboat Willie", 1928, "Mickey Mouse’s debut. Public domain since 2024."),
]
PD_CLASSIC = [
    ("His Girl Friday", 1940, "The fastest talkers in Hollywood history."),
    ("Detour", 1945, "A tiny budget and a perfect noir nightmare."),
    ("The Stranger", 1946, "Orson Welles hunts a hidden Nazi in a quiet Connecticut town."),
    ("D.O.A.", 1949, "“I want to report a murder. Mine.” Noir’s best opening line."),
    ("Plan 9 from Outer Space", 1959, "Called the worst film ever made. Watch it, it’s glorious."),
    ("House on Haunted Hill", 1959, "Vincent Price, a mansion, and a million dollars if you survive the night."),
    ("The Little Shop of Horrors", 1960, "Shot in two days. “Feed me, Seymour” lived on forever."),
    ("Carnival of Souls", 1962, "An eerie one-off that haunted a generation of directors."),
    ("Charade", 1963, "The best Hitchcock film Hitchcock never made. Cary Grant and Audrey Hepburn."),
    ("The Last Man on Earth", 1964, "Vincent Price is the last human, and the blueprint for I Am Legend."),
    ("Night of the Living Dead", 1968, "A copyright slip made George Romero’s zombies the people’s horror film."),
]
CANON = [
    ("Citizen Kane", 1941, "The film that rewrote how movies are made. Rosebud."),
    ("Casablanca", 1942, "Of all the gin joints… the most quotable film ever."),
    ("It's a Wonderful Life", 1946, "A Christmas classic that flopped first, then became tradition."),
    ("Singin' in the Rain", 1952, "The greatest musical, and the greatest puddle."),
    ("Seven Samurai", 1954, "Kurosawa’s blueprint for every ‘assemble the team’ movie."),
    ("Vertigo", 1958, "Hitchcock’s dizzy masterpiece, now the greatest film in many polls."),
    ("2001: A Space Odyssey", 1968, "Kubrick took the audience to the future and left it speechless."),
    ("The Godfather", 1972, "An offer you can’t refuse, and the high bar for American film."),
    ("Jaws", 1975, "The first summer blockbuster. You’ll need a bigger boat."),
    ("Star Wars", 1977, "A long time ago, the movies changed forever."),
    ("Alien", 1979, "In space, no one can hear you scream. The perfect haunted house."),
    ("Raiders of the Lost Ark", 1981, "Adventure filmmaking at its absolute peak."),
    ("Blade Runner", 1982, "Neon rain and big questions. The look of the future."),
    ("Ghostbusters", 1984, "Comedy, horror, and proton packs. Who you gonna call?"),
    ("Back to the Future", 1985, "A perfectly built time machine of a screenplay."),
    ("The Breakfast Club", 1985, "Five teenagers in detention, and the template for every teen film."),
    ("Ferris Bueller's Day Off", 1986, "The best day off in cinema. Life moves pretty fast."),
    ("The Princess Bride", 1987, "Inconceivably good. Quotable from first line to last."),
    ("Die Hard", 1988, "The greatest action movie, and a Christmas movie. Fight about it."),
    ("Do the Right Thing", 1989, "Spike Lee’s hottest day in Brooklyn."),
    ("Goodfellas", 1990, "“As far back as I can remember…” Scorsese’s mob masterpiece."),
    ("Jurassic Park", 1993, "The day computer-made dinosaurs became real."),
    ("Pulp Fiction", 1994, "Tarantino rearranged the timeline and the rules."),
    ("The Shawshank Redemption", 1994, "A box-office miss that became everyone’s favorite film."),
    ("Toy Story", 1995, "The first fully computer-animated feature. To infinity."),
    ("Fight Club", 1999, "The first rule is you don’t talk about it. We all did."),
    ("The Matrix", 1999, "Bullet time, green code, and a whole new vocabulary."),
    (
        "The Lord of the Rings: The Fellowship of the Ring",
        2001,
        "Middle-earth, finally on screen the way it looked in your head.",
    ),
    ("Spirited Away", 2001, "Miyazaki’s dream, and the only hand-drawn film to win Best Animated Feature."),
    ("The Dark Knight", 2008, "The superhero film that became a crime epic."),
    ("Inception", 2010, "A heist inside a dream inside a dream. That spinning top."),
    ("Mad Max: Fury Road", 2015, "Two hours of pure, practical, high-octane chase."),
    ("Get Out", 2017, "A horror film that changed the conversation."),
    ("Parasite", 2019, "The first non-English film to win Best Picture."),
    ("Everything Everywhere All at Once", 2022, "A multiverse, a laundromat, and a hot-dog-fingers world."),
    ("Oppenheimer", 2023, "Nolan’s thunderclap about the man who built the bomb."),
]
TV = [
    ("I Love Lucy", 1951, "The sitcom that taught TV how to be funny."),
    ("The Twilight Zone", 1959, "Five decades of twists, and the plot of half your favorite shows."),
    ("Doctor Who", 1963, "A madman with a box. Still going after 60 years."),
    ("Star Trek", 1966, "To boldly go: and the future TV imagined."),
    ("Monty Python's Flying Circus", 1969, "Gloriously silly sketches that rewired comedy."),
    ("M*A*S*H", 1972, "A war comedy whose finale was watched by 106 million people."),
    ("Fawlty Towers", 1975, "Twelve episodes, and perhaps the best sitcom ever written."),
    ("Cheers", 1982, "Where everybody knows your name."),
    ("The Golden Girls", 1985, "Four friends, one cheesecake, endless wit."),
    ("The Simpsons", 1989, "The longest-running American sitcom, and the fabric of pop culture."),
    ("Seinfeld", 1989, "The show about nothing that changed everything."),
    ("Twin Peaks", 1990, "Who killed Laura Palmer? Damn fine coffee, and TV’s first great mystery."),
    ("Friends", 1994, "Six pals, one couch, and the ultimate comfort watch."),
    ("The Sopranos", 1999, "The show that kicked off TV’s golden age."),
    ("The Wire", 2002, "Baltimore, in full. Many call it the best TV ever made."),
    ("Arrested Development", 2003, "There’s always money in the banana stand."),
    ("Lost", 2004, "Smoke monsters and hatches. Water-cooler TV at its biggest."),
    ("Avatar: The Last Airbender", 2005, "A cartoon that grown-ups quote as scripture."),
    ("The Office", 2005, "Dunder Mifflin: the show everyone binges on repeat."),
    ("Planet Earth", 2006, "Nature, like you’ve never seen it."),
    ("Mad Men", 2007, "Madison Avenue, cigarettes, and the best-dressed drama."),
    ("Breaking Bad", 2008, "A chemistry teacher becomes a kingpin. Say my name."),
    ("Parks and Recreation", 2009, "The warmest, funniest show about local government. Treat yo’ self."),
    ("Sherlock", 2010, "Holmes for the smartphone age."),
    ("Game of Thrones", 2011, "The biggest television event in history, for a while."),
    ("Black Mirror", 2011, "Technology’s darkest what-ifs, one episode at a time."),
    ("Fargo", 2014, "Coen-brothers cold and crime, reinvented every season."),
    ("Better Call Saul", 2015, "The prequel that many say outdid the original."),
    ("Stranger Things", 2016, "Eighties nostalgia meets the Upside Down."),
    ("Chernobyl", 2019, "Five episodes of dread, and some of the best TV ever."),
    ("Succession", 2018, "Billionaires behaving badly. Savage, hilarious, perfect."),
    ("Ted Lasso", 2020, "Believe. The kindest show on television."),
    ("The Bear", 2022, "Yes, Chef. Kitchen chaos in Chicago."),
]


def resolve(title, year, media):
    path = "search/tv" if media == "tv" else "search/movie"
    q = {"query": {"D.O.A.": "DOA"}.get(title, title), "include_adult": "false"}  # TMDB search chokes on the dots
    q["first_air_date_year" if media == "tv" else "year"] = year
    res = [r for r in tmdb(path, **q).get("results", []) if r.get("poster_path")]
    if not res and media == "movie":  # TMDB dates some old films a year off
        res = [
            r
            for r in tmdb(path, query=title).get("results", [])
            if r.get("poster_path") and abs(int((r.get("release_date") or "0000")[:4] or 0) - year) <= 1
        ]
    if not res:
        return None
    import re

    norm = lambda t: re.sub(r"[^a-z0-9]", "", (t or "").lower())
    exact = [
        r
        for r in res
        if norm(r.get("title") or r.get("name")) == norm(title)
        or norm(r.get("original_title") or r.get("original_name")) == norm(title)
    ]
    res = exact or res
    res.sort(key=lambda r: -r.get("vote_count", 0))  # the famous one, not an obscure namesake
    return res[0]


def build(lst, media):
    out, missing = [], []
    for title, year, blurb in lst:
        r = resolve(title, year, media)
        if not r:
            missing.append(f"{title} ({year})")
            continue
        out.append(
            dict(
                tid=r["id"],
                media=media,
                title=r.get("name") or r.get("title"),
                year=year,
                poster=r["poster_path"],
                back=r.get("backdrop_path") or "",
                vote=round(r.get("vote_average", 0), 1),
                overview=r.get("overview", ""),
                blurb=blurb,
            )
        )
    return out, missing


lists = {
    "pd-silent": (PD_SILENT, "movie"),
    "pd-classic": (PD_CLASSIC, "movie"),
    "canon": (CANON, "movie"),
    "tv-canon": (TV, "tv"),
}
result, report = {}, []
for name, (lst, media) in lists.items():
    result[name], missing = build(lst, media)
    report.append(
        f"{name}: {len(result[name])}/{len(lst)}" + (f"  (no match: {', '.join(missing)})" if missing else "")
    )
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1))
print("\n".join(report), "\nwrote", OUT)
