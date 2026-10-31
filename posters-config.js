// Poster Wall channel + screensaver. Edit freely, then reload the kiosk.
// Movie / TV posters + trailers come from TMDB (key in ~/.config/mirror/tmdb_key).
// Sports posters are drawn by the dashboard from ESPN's public scoreboard data (no key): team colors, logos,
// live scores, countdowns. ESPN's feed is unofficial and could change without notice.
//
// The channel is a lobby of "shelves": LEFT/RIGHT browses the posters on a shelf, UP/DOWN changes shelf. `group` is the heading a shelf is
// listed under, `icon` + `name` its title, `blurb` the line shown under it.
//   source 'curated':    a hand-picked list from posters-curated.json (rebuild it with tools/posters_build.py): `list` is the list name
//   source 'tmdb':       path = movie/now_playing | movie/upcoming | movie/popular | movie/top_rated | tv/popular | tv/on_the_air |
//                        discover/movie | discover/tv (+ `query`: sort_by, with_genres, vote_count.gte, primary_release_date.gte/.lte, ...)
//   source 'mix':        a random poster from the shelves in `from` (reshuffled every visit)
//   source 'quiz':       the Guess the Movie game (A starts it)
//   source 'espn-today': every game today in `leagues` (live games first, then upcoming, then finals)
//   source 'espn-week':  next `days` days in `leagues`; only big games (national TV, ranked teams, postseason,
//                        named games, your teams) unless all: true; ranked: true keeps games with a ranked team
//   source 'espn-teams': next `perTeam` games for each [league, ESPN team id]
//   source 'commons':    a Wikimedia Commons category. Only portrait files at least 1920 px tall are kept. subcategories: true also
//                        searches one level of subcategories. The proxy gathers each category in the background and caches it for a day.
// Leagues: nfl, nba, nhl, mlb, ncaaf (college football), ncaam (men's college basketball)
const EN = 'with_original_language=en&sort_by=vote_average.desc';
window.POSTERS_CFG = {
  collections: [
    { id: 'mix',  group: 'Play', icon: '✨', name: 'Surprise Me', source: 'mix', blurb: 'One poster from everywhere. Different every time.',
      from: ['canon', 'tvcanon', 'pd1', 'pd2', 'top', 'now', '80s', '90s', 'scifi', 'horror', 'anim', 'tvtop'] },
    { id: 'quiz', group: 'Play', icon: '🎲', name: 'Guess the Movie', source: 'quiz', blurb: 'A blurred poster, four choices. The faster you answer, the more you score.' },

    { id: 'now',    group: 'Movies', icon: '🎬', name: 'In Theaters',      blurb: 'What’s on the big screen right now.', source: 'tmdb', path: 'movie/now_playing', query: 'region=US' },
    { id: 'soon',   group: 'Movies', icon: '🍿', name: 'Coming Soon',      blurb: 'Next up at the multiplex.', source: 'tmdb', path: 'movie/upcoming', query: 'region=US' },
    { id: 'canon',  group: 'Movies', icon: '🏆', name: 'Essential Films',  blurb: 'The ones everybody should see, and why.', source: 'curated', list: 'canon' },
    { id: 'top',    group: 'Movies', icon: '⭐', name: 'All-Time Greats',  blurb: 'Rated highest by millions of viewers.', source: 'tmdb', path: 'movie/top_rated' },
    { id: '80s',    group: 'Movies', icon: '📼', name: 'The ’80s',         blurb: 'Big hair, bigger movies.', source: 'tmdb', path: 'discover/movie',
      query: `${EN}&vote_count.gte=4000&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31` },
    { id: '90s',    group: 'Movies', icon: '💿', name: 'The ’90s',         blurb: 'The last decade of the video store.', source: 'tmdb', path: 'discover/movie',
      query: `${EN}&vote_count.gte=5000&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31` },
    { id: 'scifi',  group: 'Movies', icon: '🚀', name: 'Sci-Fi',           blurb: 'Other worlds, other times.', source: 'tmdb', path: 'discover/movie', query: `${EN}&vote_count.gte=6000&with_genres=878` },
    { id: 'horror', group: 'Movies', icon: '👻', name: 'Horror',           blurb: 'Lights off. Volume up.', source: 'tmdb', path: 'discover/movie', query: `${EN}&vote_count.gte=3500&with_genres=27` },
    { id: 'anim',   group: 'Movies', icon: '🎨', name: 'Animation',        blurb: 'Drawn, painted, pixelated, loved.', source: 'tmdb', path: 'discover/movie', query: `${EN}&vote_count.gte=5000&with_genres=16` },

    { id: 'tvcanon', group: 'TV', icon: '📺', name: 'TV Hall of Fame', blurb: 'The shows that defined the medium.', source: 'curated', list: 'tv-canon' },
    { id: 'tvtop',   group: 'TV', icon: '🏅', name: 'Best Ever',       blurb: 'Rated highest by viewers worldwide.', source: 'tmdb', path: 'discover/tv', query: `${EN}&vote_count.gte=2500` },
    { id: 'tvnow',   group: 'TV', icon: '🔥', name: 'Popular Now',     blurb: 'What everyone is watching this week.', source: 'tmdb', path: 'tv/popular' },
    { id: 'sitcom',  group: 'TV', icon: '😂', name: 'Sitcoms',         blurb: 'Laugh tracks optional.', source: 'tmdb', path: 'discover/tv', query: `${EN}&vote_count.gte=1200&with_genres=35` },

    { id: 'pd1', group: 'Public Domain', icon: '🎞️', name: 'The Silent Era',        blurb: 'Free to watch, share and remix: silent classics, 1902–1928.', source: 'curated', list: 'pd-silent' },
    { id: 'pd2', group: 'Public Domain', icon: '🕵️', name: 'Classic Public Domain', blurb: 'Noir, horror and screwball, 1940–1968. Free to watch.', source: 'curated', list: 'pd-classic' },

    { id: 'today',    group: 'Sports', icon: '📺', name: 'On Today',    blurb: 'Every game on right now.', source: 'espn-today', leagues: ['nfl', 'nba', 'nhl', 'mlb', 'ncaaf', 'ncaam'] },
    { id: 'big',      group: 'Sports', icon: '🔥', name: 'Big Games',   blurb: 'The ones worth clearing your night for.', source: 'espn-week', leagues: ['nfl', 'nba', 'nhl', 'mlb', 'ncaaf', 'ncaam'], days: 7, max: 40 },
    { id: 'detroit',  group: 'Sports', icon: '🦁', name: 'Detroit',     blurb: 'Lions, Pistons, Red Wings, Tigers.', source: 'espn-teams', perTeam: 3, teams: [['nfl', 'det'], ['nba', 'det'], ['nhl', 'det'], ['mlb', 'det']] },
    { id: 'michigan', group: 'Sports', icon: '〽️', name: 'Michigan',    blurb: 'Go Blue. Go Green.', source: 'espn-teams', perTeam: 3, teams: [['ncaaf', 130 /* Michigan */], ['ncaaf', 127 /* Michigan State */], ['ncaam', 130], ['ncaam', 127]] },
    { id: 'nfl',      group: 'Sports', icon: '🏈', name: 'NFL This Week',    blurb: 'Every game, every Sunday.', source: 'espn-week', leagues: ['nfl'], days: 7, all: true },
    { id: 'cfb',      group: 'Sports', icon: '🏟️', name: 'College Football', blurb: 'The ranked matchups.', source: 'espn-week', leagues: ['ncaaf'], days: 7, ranked: true },

    { id: 'jpl',     group: 'Art', icon: '🛰️', name: 'Visions of the Future', blurb: 'NASA’s retro space-travel posters.', source: 'commons', category: 'Category:Visions of the Future' },
    { id: 'travel',  group: 'Art', icon: '🧳', name: 'Vintage Travel',       blurb: 'Come for the view, stay for the typography.', source: 'commons', category: 'Category:Tourism advertising posters', subcategories: true },
    { id: 'wpa',     group: 'Art', icon: '🏛️', name: 'WPA Posters',          blurb: 'Bold, hopeful Depression-era design.', source: 'commons', category: 'Category:Work Projects Administration Poster Collection', subcategories: true },
    { id: 'nouveau', group: 'Art', icon: '🌸', name: 'Art Nouveau',          blurb: 'Curves, flowers, and Mucha.', source: 'commons', category: 'Category:Art Nouveau posters', subcategories: true }
  ],

  screensaver: {
    // 'idle':  start after idleMin minutes with no controller input, from any screen except the pool scoreboard
    //         (nobody touches the controller mid-game). Any button wakes it without doing anything else.
    // 'media': same, but only while one of mediaPlayers (Home Assistant media_player entities) is playing,
    //          e.g. mediaPlayers: ['media_player.basement_tv'] once the TV is in Home Assistant.
    when: 'idle',
    mediaPlayers: [],
    idleMin: 5,
    slideSec: 12,
    trailerEvery: 4,     // every 4th movie in the slideshow plays its muted trailer (0 = never)
    trailerSec: 30,      // ...for this long
    collections: ['now', 'soon', 'canon', 'tvcanon', 'pd1', 'pd2', 'today', 'big', 'detroit', 'michigan']
  }
};
