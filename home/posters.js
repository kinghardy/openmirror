(() => {
  const C = window.POSTERS_CFG || { collections: [] };
  const COLS = C.collections || [];
  const SS = Object.assign({ when: 'idle', mediaPlayers: [], idleMin: 5, slideSec: 12, trailerEvery: 4, trailerSec: 30, collections: [] }, C.screensaver || {});
  const panel = document.getElementById('app-posters'), root = document.getElementById('pw-root');
  const tileSub = document.querySelector('[data-app="posters"] .channel-subtitle');
  const GUARD = 600, IMG = 'https://image.tmdb.org/t/p/', FRESH = 30 * 60e3;
  const BACK = ['Escape', 'Backspace', 'b', 'B'];
  const MINE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'x', 'X', 'y', 'Y'];
  const LG = {   // ESPN leagues
    nfl:   { path: 'football/nfl', name: 'NFL', start: 'Kickoff' },
    ncaaf: { path: 'football/college-football', name: 'College Football', start: 'Kickoff' },
    nba:   { path: 'basketball/nba', name: 'NBA', start: 'Tip-off' },
    ncaam: { path: 'basketball/mens-college-basketball', name: 'College Basketball', start: 'Tip-off', teamGroups: 50 },
    nhl:   { path: 'hockey/nhl', name: 'NHL', start: 'Puck drop' },
    mlb:   { path: 'baseball/mlb', name: 'MLB', start: 'First pitch' }
  };
  const NATIONAL = /^(ESPN|ESPN2|ABC|FOX|Fox|CBS|NBC|TNT|TBS|truTV|Prime Video|NFL Network|NFL Net|Peacock|Netflix|FS1|Big Ten Network|BTN)$/;
  const FAV = new Set(COLS.filter(c => c.source === 'espn-teams').flatMap(c => (c.teams || []).map(([lg, id]) => `${lg}:${String(id).toLowerCase()}`)));
  const data = {};       // collection id -> { items, state: loading|ok|empty|nokey|error, at, ttl, p }
  const games = {};      // ESPN event id -> latest game object (for live patching)
  const V = { view: 'home', r: 0, c: 0, col: null, i: 0, info: false, curId: null };
  let openedAt = 0, sawOpen = false, backAt = 0, hintT = null, trailerT = null;
  const isOpen = () => panel.classList.contains('active');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KC = { A: 'a', B: 'b', X: 'x', Y: 'y' };
  const key = (k, l) => `<span>${k.split(' ').map(x => `<i class="pg-k ${KC[x] || ''}">${x}</i>`).join('')}${l}</span>`;
  const hover = () => playWiiSound(520, 'sine', .05), nope = () => playWiiSound(220, 'sawtooth', .1), open = () => playWiiSound(780, 'sine', .1);
  const idOf = it => it.kind === 'espn' ? 'g' + it.id : it.kind === 'art' ? 'a' + it.aid : it.kind === 'quiz' ? 'quiz' : 'm' + (it.media || 'movie') + it.tid;

  // ---- data: everything goes through proxy.py (/posters/...), which holds keys and caches ----
  async function getJSON(u) {
    const r = await fetch(u), j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.code = j.error; throw e; }
    return j;
  }
  const day = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const dayAt = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const movie = (m, o = {}) => {
    const tv = o.media === 'tv', date = (tv ? m.first_air_date : m.release_date) || '', yr = date.slice(0, 4);
    return {
      kind: 'movie', media: tv ? 'tv' : 'movie', tid: m.id, img: IMG + 'w780' + m.poster_path, mid: IMG + 'w500' + m.poster_path, thumb: IMG + 'w342' + m.poster_path,
      back: m.backdrop_path ? IMG + 'w1280' + m.backdrop_path : '', title: tv ? m.name : m.title,
      sub: o.upcoming && date ? 'In theaters ' + day(date) : o.recent && date ? 'Released ' + day(date) : [yr, m.vote_average ? '★ ' + m.vote_average.toFixed(1) : ''].filter(Boolean).join(' · '),
      info: m.overview || '', meta: m.vote_average ? `★ ${m.vote_average.toFixed(1)} / 10${m.vote_count ? ' · ' + m.vote_count.toLocaleString('en-US') + ' votes' : ''}` : ''
    };
  };
  // hand-picked shelves (posters-curated.json, built by tools/posters_build.py): each carries a one-line "why it matters"
  let curatedP = null;
  const getCurated = () => curatedP || (curatedP = getJSON('posters-curated.json').catch(e => { curatedP = null; throw e; }));
  const curatedItem = x => ({
    kind: 'movie', media: x.media, tid: x.tid, img: IMG + 'w780' + x.poster, mid: IMG + 'w500' + x.poster, thumb: IMG + 'w342' + x.poster, back: x.back ? IMG + 'w1280' + x.back : '', title: x.title,
    sub: [x.year, x.vote ? '★ ' + x.vote.toFixed(1) : ''].filter(Boolean).join(' · '), blurb: x.blurb,
    info: [x.blurb && '“' + x.blurb + '”', x.overview].filter(Boolean).join('\n\n'), meta: `${x.year}${x.vote ? ' · ★ ' + x.vote.toFixed(1) + ' / 10' : ''}`
  });
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const artPoster = a => ({
    kind: 'art', aid: a.id, img: a.img, thumb: a.thumb, title: a.title,
    sub: [a.date, a.artist].filter(Boolean).join(' · ').slice(0, 90),
    info: [a.desc, a.artist && 'Artist: ' + a.artist, a.date && 'Date: ' + a.date, a.license && 'License: ' + a.license, 'Source: Wikimedia Commons'].filter(Boolean).join('\n'),
    meta: 'Wikimedia Commons' + (a.license ? ' · ' + a.license : '')
  });
  function espnGame(e, lg) {
    const c = e.competitions[0], st = e.status.type;
    const side = h => {
      const x = c.competitors.find(t => t.homeAway === h) || c.competitors[h === 'home' ? 0 : 1], t = x.team || {};
      return {
        id: String(t.id), short: t.shortDisplayName || t.name || t.abbreviation, abbr: t.abbreviation || '', logo: t.logo || '',
        color: '#' + (t.color || '3a4a5c'), alt: '#' + (t.alternateColor || 'cfd8e2'), score: x.score ?? '', win: !!x.winner,
        record: ((x.records || [])[0] || {}).summary || '', rank: x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : 0
      };
    };
    const g = {
      kind: 'espn', id: String(e.id), lg, t: Date.parse(e.date), state: st.state, detail: st.shortDetail || '',
      away: side('away'), home: side('home'), tv: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))],
      venue: (c.venue || {}).fullName || '', note: ((c.notes || [])[0] || {}).headline || '', post: (e.season || {}).type === 3, neutral: !!c.neutralSite
    };
    g.title = `${g.away.short} ${g.neutral ? 'vs' : 'at'} ${g.home.short}`;
    g.meta = LG[lg].name;
    g.info = [g.note, g.venue, g.tv.length ? 'TV: ' + g.tv.join(', ') : '', g.away.record && `${g.away.short} ${g.away.record} · ${g.home.short} ${g.home.record}`].filter(Boolean).join('\n');
    return games[g.id] = g;
  }
  // one ESPN scoreboard per league per day, shared by every collection (today's refreshes each minute)
  const boards = {};
  function board(lg, date, groups) {
    const k = `${lg}|${date}|${groups || ''}`, b = boards[k], ttl = date <= dayAt(0) ? 50e3 : 25 * 60e3;
    if (b && Date.now() - b.at < ttl) return b.p;
    const p = getJSON(`/posters/espn/${LG[lg].path}/scoreboard?dates=${date}${groups ? '&groups=' + groups : ''}`)
      .then(j => (j.events || []).map(e => espnGame(e, lg)));
    boards[k] = { at: Date.now(), p };
    p.catch(() => { if (boards[k] && boards[k].p === p) delete boards[k]; });
    return p;
  }
  const order = (a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) || (a.state === 'post' ? b.t - a.t : a.t - b.t);
  function bigScore(g) {
    let s = 0;
    if (g.tv.some(n => NATIONAL.test(n))) s += 2;
    if (g.away.rank) s++;
    if (g.home.rank) s++;
    if (g.away.rank && g.home.rank) s++;
    if (g.post) s += 3;
    if (g.note) s += 2;   // "World Series - Game 3", bowl games, rivalry trophies
    if ([g.away, g.home].some(t => FAV.has(`${g.lg}:${t.id}`) || FAV.has(`${g.lg}:${t.abbr.toLowerCase()}`))) s += 3;
    return s;
  }
  async function espnToday(c, d, c2) {
    const out = [];
    await Promise.all((c.leagues || []).map(async lg => {
      const [y, t] = await Promise.all([board(lg, dayAt(-1)).catch(() => []), board(lg, dayAt(0))]);
      out.push(...y.filter(g => g.state === 'in'), ...t);   // games still running past midnight count as today
      d.items = out.slice().sort(order); d.state = 'ok'; changed(c2);
    }));
    return out.sort(order);
  }
  async function espnWeek(c, d, c2) {
    const days = c.days || 7, picked = [];
    await Promise.all((c.leagues || []).map(async lg => {
      for (let n = 0; n < days; n++) {
        const gs = await board(lg, dayAt(n)).catch(() => []);
        picked.push(...gs.filter(g => g.state !== 'post' && (c.all || (c.ranked ? g.away.rank || g.home.rank : bigScore(g) >= 2))));
      }
    }));
    const max = c.max || 40;
    return (picked.length > max ? picked.sort((a, b) => bigScore(b) - bigScore(a) || a.t - b.t).slice(0, max) : picked).sort(order);
  }
  async function espnTeams(c, d, c2) {
    const per = c.perTeam || 3, days = c.days || 14, out = [], seen = new Set(), byLg = {};
    (c.teams || []).forEach(([lg, id]) => (byLg[lg] = byLg[lg] || []).push(String(id).toLowerCase()));   // ESPN team id or abbreviation
    await Promise.all(Object.entries(byLg).map(async ([lg, ids]) => {
      const n0 = {};
      for (let n = -1; n < days; n++) {
        const gs = await board(lg, dayAt(n), LG[lg].teamGroups).catch(() => []);
        gs.forEach(g => {
          const mine = [g.away, g.home].filter(t => ids.includes(t.id) || ids.includes(t.abbr.toLowerCase())).map(t => ids.includes(t.id) ? t.id : t.abbr.toLowerCase());
          if (!mine.length || seen.has(g.id)) return;
          if (n === -1 ? g.state !== 'in' : g.state === 'post' && n > 0) return;   // live leftovers from yesterday; today's finals
          if (mine.every(id => (n0[id] || 0) >= per)) return;
          seen.add(g.id); out.push(g); mine.forEach(id => n0[id] = (n0[id] || 0) + 1);
        });
        if (ids.every(id => (n0[id] || 0) >= per)) break;
      }
      d.items = out.slice().sort(order); if (d.items.length) d.state = 'ok'; changed(c2);
    }));
    return out.sort(order);
  }

  function loadCol(c, force) {
    const d = data[c.id] || (data[c.id] = { items: [], state: 'loading', at: 0, ttl: FRESH });
    // good results are kept for their ttl (1 min while games are live); failures are retried after a minute
    if (d.p && (d.busy || (!force && Date.now() - d.at < (d.state === 'ok' || d.state === 'empty' ? d.ttl : 60e3)))) return d.p;
    d.busy = true;
    d.p = (async () => {
      try {
        if (c.source === 'tmdb') {
          const tv = /^tv\/|\/tv$/.test(c.path);
          const j = await getJSON(`/posters/tmdb/${c.path}?${c.query || ''}`);
          d.items = (j.results || []).filter(m => m.poster_path).map(m => movie(m, { media: tv ? 'tv' : 'movie', upcoming: c.path === 'movie/upcoming', recent: c.path === 'movie/now_playing' }));
          d.ttl = FRESH;
        } else if (c.source === 'curated') {
          d.items = ((await getCurated())[c.list] || []).map(curatedItem);
          d.ttl = 6 * 3600e3;
        } else if (c.source === 'mix') {
          const from = (c.from || []).map(id => COLS.find(x => x.id === id)).filter(Boolean);
          await Promise.all(from.map(x => loadCol(x).catch(() => {})));
          d.items = shuffle(from.flatMap(x => (data[x.id] || { items: [] }).items.filter(it => it.kind === 'movie'))).slice(0, 40);
          d.ttl = 5e3;
        } else if (c.source === 'quiz') {
          d.items = [{ kind: 'quiz', title: 'Guess the Movie', sub: 'Press A to play' }];
          d.ttl = 3600e3;
        } else if (c.source === 'commons') {
          // Wikimedia Commons category, already filtered by the proxy (portrait, >= 1920 px tall)
          const j = await getJSON(`/posters/commons?cat=${encodeURIComponent(c.category)}&depth=${c.subcategories ? 1 : 0}&max=${c.max || 80}`);
          d.items = (j.items || []).map(artPoster);
          d.ttl = 6 * 3600e3;
        } else {
          const fn = { 'espn-today': espnToday, 'espn-week': espnWeek, 'espn-teams': espnTeams }[c.source];
          if (!fn) throw new Error('unknown source ' + c.source);
          d.items = await fn(c, d, c);
          const soon = d.items.some(g => g.state === 'in' || (g.state === 'pre' && g.t - Date.now() < 20 * 60e3));
          d.ttl = soon ? 55e3 : 10 * 60e3;
        }
        d.state = d.items.length ? 'ok' : 'empty';
      } catch (e) {
        d.state = e.code === 'no_tmdb_key' ? 'nokey' : d.items.length ? 'ok' : e.code === 'building' ? 'building' : 'error';
        if (e.code === 'building') setTimeout(() => loadCol(c, true), 20000);   // the proxy is gathering it from Wikimedia
      }
      d.busy = false; d.at = Date.now(); changed(c);
    })();
    return d.p;
  }
  let chT = null;
  function changed(c) {
    patchGames();
    if (!isOpen()) return;
    if (V.view === 'home') { clearTimeout(chT); chT = setTimeout(render, 150); return; }   // many loads finish together: redraw once
    if (V.view === 'quiz' || !V.col || V.col.id !== c.id) return;
    const items = (data[c.id] || {}).items || [], at = items.findIndex(it => idOf(it) === V.curId);
    if (at >= 0) V.i = at;   // the list re-sorts as games go live; stay on the same poster
    const shown = root.querySelector('.pw-frame [data-gid], .pw-frame img');
    if (!shown || (items[V.i] && idOf(items[V.i]) !== V.curId) || root.querySelector('.gp[data-stale]')) render();
  }

  // ---- generated game posters ----
  const hash = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0;
  const rgb = hex => { const n = parseInt(hex.slice(1, 7), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  function teamColors(g) {   // keep the two halves distinguishable
    let a = g.away.color;
    const h = g.home.color;
    if (dist(a, h) < 90) a = g.away.alt;
    if (dist(a, h) < 90) a = '#1b2430';
    return [a, h];
  }
  function badge(g) {
    if (g.state === 'in') return ['Live', 'live'];
    if (g.state === 'post') return ['Final', ''];
    const d = new Date(g.t), dd = ymd(d);
    if (dd === dayAt(0)) return [d.getHours() >= 17 ? 'Tonight' : 'Today', 'soon'];
    if (dd === dayAt(1)) return ['Tomorrow', ''];
    return [d.toLocaleDateString('en-US', { weekday: 'long' }), ''];
  }
  function countdown(g) {
    const ms = g.t - Date.now();
    if (ms <= 0) return 'Starting now';
    const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
    return `${LG[g.lg].start} in ${d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`}`;
  }
  const timeText = t => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const finalText = g => 'Final' + (/OT|SO|\d+ inn/i.test(g.detail) ? ' · ' + g.detail.replace(/^Final\s*\/?\s*/i, '') : '');
  function gameSub(g) {
    const sc = `${g.away.abbr} ${g.away.score} – ${g.home.abbr} ${g.home.score}`;
    if (g.state === 'in') return `LIVE · ${g.detail} · ${sc}`;
    if (g.state === 'post') return `${finalText(g)} · ${sc}`;
    return [timeText(g.t), g.tv[0]].filter(Boolean).join(' · ');
  }
  function teamHTML(s, cls, g) {
    const lose = g.state === 'post' && !s.win && (g.away.win || g.home.win) ? ' lose' : '';
    return `<div class="gp-team ${cls}${lose}"><div class="gp-med">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : `<b>${esc(s.abbr)}</b>`}</div>`
      + `<div class="gp-name">${s.rank ? `<i>#${s.rank}</i> ` : ''}${esc(s.short)}</div><div class="gp-rec">${esc(s.record)}</div></div>`;
  }
  function gamePoster(g) {
    const [ca, ch] = teamColors(g), v = ['split', 'faceoff', 'spot'][hash(g.id) % 3], [bt, bc] = badge(g);
    const mid = g.state === 'pre' ? `<div class="gp-at">${g.neutral ? 'VS' : 'AT'}</div>`
      : `<div class="gp-score"><b class="gp-sa">${esc(g.away.score)}</b><span>–</span><b class="gp-sh">${esc(g.home.score)}</b></div>`;
    const foot = g.state === 'pre'
      ? `<div class="gp-when">${esc(timeText(g.t))}</div><div class="gp-count">${esc(countdown(g))}</div>`
      : `<div class="gp-detail">${esc(g.state === 'in' ? g.detail : finalText(g))}</div>`;
    return `<div class="gp gp-${v} st-${g.state}" data-gid="${esc(g.id)}" data-state="${g.state}" style="--a:${esc(ca)};--h:${esc(ch)}">`
      + `<div class="gp-bg"></div><div class="gp-beams"></div><div class="gp-in">`
      + `<div class="gp-top"><span class="gp-lg">${esc(g.note || LG[g.lg].name)}</span><span class="gp-badge ${bc}">${bt}</span></div>`
      + `<div class="gp-teams">${teamHTML(g.away, 'a', g)}${mid}${teamHTML(g.home, 'h', g)}</div>`
      + `<div class="gp-foot">${foot}${g.tv.length ? `<div class="gp-tv">${g.tv.slice(0, 3).map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''}</div>`
      + `</div><div class="gp-sheen"></div></div>`;
  }
  // update scores / clocks / countdowns in place, so a live poster ticks without being redrawn
  function patchGames() {
    document.querySelectorAll('.gp[data-gid]').forEach(el => {
      const g = games[el.dataset.gid]; if (!g) return;
      if (el.dataset.state !== g.state) { el.dataset.stale = '1'; return; }   // pre -> live -> final redraws
      const set = (sel, v) => { const x = el.querySelector(sel); if (x && x.textContent !== String(v)) x.textContent = v; };
      set('.gp-sa', g.away.score); set('.gp-sh', g.home.score);
      set('.gp-detail', g.state === 'in' ? g.detail : finalText(g));
      if (g.state === 'pre') set('.gp-count', countdown(g));
      const cap = el.closest('.pw-full')?.querySelector('.cap .s'); if (cap) cap.textContent = gameSub(g);
    });
  }
  setInterval(patchGames, 30000);

  // ---- drawing ----
  const card = it => `<div class="pw-card"><div class="t">${esc(it.title)}</div><div class="w">${esc(it.sub)}</div></div>`;
  const art = it => it.kind === 'espn' ? gamePoster(it)
    : it.kind === 'art' ? `<div class="pw-artbg" style="background-image:url('${esc(it.thumb || it.img)}')"></div><img class="mv art" src="${esc(it.img)}" alt=""><div class="pw-sheen"></div>`
    : it.img ? `<img class="mv" src="${esc(it.img)}" alt=""><div class="pw-sheen"></div>` : card(it);
  const subOf = it => it.kind === 'espn' ? gameSub(it) : it.sub;
  // full-screen layout shared by the viewer and the screensaver; `extra` goes inside the poster frame
  function full(it, extra) {
    let bg = '';
    if (it.kind === 'espn') { const [a, h] = teamColors(it); bg = `<div class="bg" style="background:linear-gradient(135deg, ${esc(a)}, ${esc(h)})"></div>`; }
    else if (it.back) bg = `<div class="bg back" style="--bg:url('${esc(it.back)}')"></div>`;
    else if (it.img) bg = `<div class="bg" style="background-image:url('${esc(it.img)}')"></div>`;
    return `<div class="pw-full">${bg || '<div class="bg"></div>'}<div class="pw-frame">${art(it)}${extra || ''}</div>`
      + `<div class="cap"><div class="t">${esc(it.title)}</div><div class="s">${esc(subOf(it))}</div>${it.blurb ? `<div class="w">${esc(it.blurb)}</div>` : ''}</div></div>`;
  }
  // a movie poster image that fails to load (offline, dead link) becomes a plain title card
  function fixBroken(scope, it) {
    scope.querySelectorAll('.pw-frame > img').forEach(img => img.addEventListener('error', () => { scope.querySelector('.pw-artbg')?.remove(); img.outerHTML = card(it); }, { once: true }));
  }

  // ---- muted trailers (TMDB -> YouTube, no-cookie player) ----
  const trailers = {};   // TMDB id -> YouTube key, or null when there is none / it won't embed
  const tkey = it => (it.media || 'movie') + '/' + it.tid;
  async function trailerKey(it) {
    if (!it.tid) return null;
    if (tkey(it) in trailers) return trailers[tkey(it)];
    try {
      const v = ((await getJSON(`/posters/tmdb/${tkey(it)}/videos`)).results || []).filter(x => x.site === 'YouTube' && /Trailer|Teaser/.test(x.type));
      v.sort((a, b) => (b.type === 'Trailer') - (a.type === 'Trailer') || (b.official === true) - (a.official === true));
      return trailers[tkey(it)] = v[0] ? v[0].key : null;
    } catch (e) { return null; }
  }
  let ytReady = null;
  const loadYT = () => ytReady || (ytReady = new Promise(res => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    setTimeout(res, 10000);
  }));
  async function playTrailer(frame, it, onPlaying) {
    const k = await trailerKey(it);
    if (!k || !frame.isConnected) return false;
    await loadYT();
    if (!window.YT || !YT.Player || !frame.isConnected || frame.querySelector('.pw-trailer')) return false;
    const box = document.createElement('div'); box.className = 'pw-trailer';
    box.innerHTML = '<div class="lbl">▶ Trailer</div><div class="vid"><div></div></div>';
    frame.appendChild(box);
    frame._yt = new YT.Player(box.querySelector('.vid > div'), {
      videoId: k, host: 'https://www.youtube-nocookie.com', width: 1080, height: 608,
      playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: k, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0 },
      events: {
        onReady: e => { e.target.mute(); e.target.playVideo(); },
        onStateChange: e => { if (e.data === 1 && !box.classList.contains('on')) { box.classList.add('on'); if (onPlaying) onPlaying(); } },
        onError: () => { trailers[tkey(it)] = null; stopTrailer(frame); }
      }
    });
    return true;
  }
  function stopTrailer(scope) {
    scope.querySelectorAll('.pw-trailer').forEach(b => {
      const f = b.parentNode;
      try { if (f._yt) f._yt.destroy(); } catch (e) {}
      f._yt = null; b.remove();
    });
  }

  // ---- channel screens: the lobby (poster carousel + shelves), the poster viewer, the quiz ----
  const shelfIdx = id => COLS.findIndex(c => c.id === id);
  const itemsOf = c => ((data[c.id] || {}).items) || [];
  V.s = Math.max(0, shelfIdx('now')); V.at = {};
  const H = { cards: new Map(), shelf: null, bgKey: '', front: 0 };
  function status(c) {
    if (c.source === 'quiz') return 'Play';
    const d = data[c.id];
    if (!d) return '';
    if (d.state === 'loading' && !d.items.length) return 'Loading…';
    const live = d.items.filter(g => g.state === 'in').length;
    const bad = { nokey: 'Needs a TMDB key', error: 'Can’t reach the source', building: 'Gathering posters…', empty: /^espn/.test(c.source) ? 'No games scheduled' : 'Nothing listed' }[d.state];
    return bad || `${d.items.length}${live ? ` · ${live} live` : ''}`;
  }
  function toast(msg) {
    panel.querySelector('.pg-toast')?.remove();
    const t = document.createElement('div'); t.className = 'pg-toast'; t.textContent = msg;
    panel.appendChild(t); setTimeout(() => t.remove(), 1800);
  }

  // -- lobby --
  const cardHTML = (it, near) => {
    if (it.kind === 'quiz') return '<div class="qcard"><div class="q">?</div><div class="t">Guess the<br>Movie</div><div class="s">Press A to play</div></div>';
    if (it.kind === 'espn') return `<div class="pw-mini" style="--s:${640 / 1080}">${gamePoster(it)}</div>`;
    const src = near ? (it.mid || it.img || it.thumb) : (it.thumb || it.mid || it.img);
    return src ? `<img src="${esc(src)}" alt="">` : card(it);
  };
  function place(el, d) {
    const ad = Math.abs(d), sg = Math.sign(d), sc = d === 0 ? 1 : .74 - .09 * (ad - 1), x = d === 0 ? 0 : sg * (410 + (ad - 1) * 170);
    el.style.transform = `translateX(${x}px) translateZ(${-130 * ad}px) rotateY(${d === 0 ? 0 : -sg * 36}deg) scale(${sc})`;
    el.classList.toggle('cur', d === 0);
    el.style.opacity = [1, .92, .62, .3][ad]; el.style.zIndex = 10 - ad;
    el.querySelector('.dim').style.opacity = [0, .42, .6, .72][ad];
  }
  function homeBuild() {
    root.innerHTML = `<div class="ph"><div class="ph-bg"></div><div class="ph-bg"></div><div class="ph-shade"></div>
      <div class="ph-top"><span class="brand">🎞️ POSTERS</span><span class="count"></span></div>
      <div class="ph-title"><div class="g"></div><div class="n"></div><div class="b"></div></div>
      <div class="ph-stage"></div>
      <div class="ph-cap"><div class="t"></div><div class="s"></div><div class="w"></div></div>
      <div class="ph-rail"></div>
      <div class="pg-legend">${[key('◀▶', 'Browse'), key('▲▼', 'Shelf'), key('A', 'Open'), key('X', 'Show'), key('Y', 'Surprise'), key('B', 'Back')].join('')}</div></div>`;
    H.cards.clear(); H.shelf = null; H.bgKey = ''; H.front = 0;
  }
  const bgImgs = new Map();
  function paintBg(layer, url) {                       // draw a 32x48 version of the poster; stretched over the screen it looks like a heavy blur
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 48; layer.appendChild(cv);
    const draw = im => { const x = cv.getContext('2d'); try { x.filter = 'saturate(1.6) brightness(.85)'; } catch (e) {} x.drawImage(im, 0, 0, 32, 48); };
    const hit = bgImgs.get(url); if (hit) return draw(hit);
    const im = new Image(); im.onload = () => { bgImgs.set(url, im); if (cv.isConnected) draw(im); }; im.src = url;
  }
  function homeBg(it) {
    let key = '', grad = '', url = '';
    if (it && it.kind === 'espn') { const [a, h] = teamColors(it); key = a + h; grad = `linear-gradient(135deg, ${a}, ${h})`; }
    else if (it) { url = it.thumb || it.mid || it.img || ''; key = url; }
    if (key === H.bgKey) return;
    H.bgKey = key; H.front = 1 - H.front;
    const L = root.querySelectorAll('.ph-bg'), nl = L[H.front];
    nl.textContent = ''; nl.style.background = grad || '#0b0f16';
    if (url) paintBg(nl, url);
    nl.classList.add('on'); L[1 - H.front].classList.remove('on');
  }
  function homeUpdate() {
    if (!root.querySelector('.ph')) homeBuild();
    const c = COLS[V.s], items = itemsOf(c), n = items.length, el = q => root.querySelector(q);
    const i = V.at[c.id] = Math.min(V.at[c.id] || 0, Math.max(0, n - 1)), it = items[i];
    V.curId = it ? idOf(it) : null;
    if (H.shelf !== c.id) {
      el('.ph-title .g').textContent = c.group || ''; el('.ph-title .n').textContent = `${c.icon || ''}  ${c.name}`; el('.ph-title .n').style.fontSize = c.name.length > 15 ? '64px' : ''; el('.ph-title .b').textContent = c.blurb || '';
      const t = el('.ph-title'); t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap');
      H.cards.forEach(x => x.remove()); H.cards.clear(); H.shelf = c.id;
    }
    el('.ph-top .count').textContent = n && c.source !== 'quiz' ? `${i + 1} / ${n}` : '';
    const stage = el('.ph-stage');
    if (!n) {
      H.cards.forEach(x => x.remove()); H.cards.clear();
      let m = stage.querySelector('.ph-msg'); if (!m) { m = document.createElement('div'); m.className = 'ph-msg'; stage.appendChild(m); }
      m.innerHTML = `<div class="e">${esc(c.icon || '🎞️')}</div><div>${esc(status(c))}</div>`;
    } else {
      stage.querySelector('.ph-msg')?.remove();
      const wrap = n >= 7, want = new Set();
      for (let d = -3; d <= 3; d++) {
        let idx = i + d; if (wrap) idx = ((idx % n) + n) % n; else if (idx < 0 || idx >= n) continue;
        const k = idOf(items[idx]); want.add(k);
        let cd = H.cards.get(k);
        if (!cd) {
          cd = document.createElement('div'); cd.className = 'pc'; cd.innerHTML = cardHTML(items[idx], Math.abs(d) <= 1) + '<div class="dim"></div>';
          cd.style.transition = 'none'; cd.style.opacity = 0; stage.appendChild(cd); H.cards.set(k, cd); place(cd, d); cd.style.opacity = 0; void cd.offsetWidth; cd.style.transition = '';
          cd.querySelector('img')?.addEventListener('error', () => { cd.innerHTML = card(items[idx]) + '<div class="dim"></div>'; }, { once: true });
        }
        place(cd, d);
        if (Math.abs(d) <= 1) { const im = cd.querySelector('img'), u = items[idx].mid || items[idx].img; if (im && u && im.getAttribute('src') !== u) im.src = u; }
      }
      H.cards.forEach((x, k) => { if (!want.has(k)) { H.cards.delete(k); x.style.opacity = 0; setTimeout(() => x.remove(), 500); } });
    }
    const cap = el('.ph-cap');
    cap.classList.toggle('empty', !it || it.kind === 'quiz');
    el('.ph-cap .t').textContent = it && it.kind !== 'quiz' ? it.title : ''; el('.ph-cap .s').textContent = it && it.kind !== 'quiz' ? subOf(it) : ''; el('.ph-cap .w').textContent = it && it.blurb ? it.blurb : '';
    homeBg(it && it.kind !== 'quiz' ? it : null);
    const lo = Math.max(0, Math.min(V.s - 2, COLS.length - 5));
    let h = '', lg = null;
    COLS.slice(lo, lo + 5).forEach((x, k) => {
      if (x.group !== lg) { h += `<div class="rg">${esc(x.group || '')}</div>`; lg = x.group; }
      h += `<div class="rr${lo + k === V.s ? ' on' : ''}"><span class="ri">${esc(x.icon || '')}</span><span class="rn">${esc(x.name)}</span><span class="rs">${esc(status(x))}</span></div>`;
    });
    el('.ph-rail').innerHTML = h;
  }
  let restT = null;                                    // the other shelves load one at a time, nearest first, so opening never stalls
  function loadRest() {
    clearTimeout(restT);
    const todo = COLS.filter(c => !data[c.id] && c.source !== 'mix' && c.source !== 'quiz').sort((a, b) => Math.abs(COLS.indexOf(a) - V.s) - Math.abs(COLS.indexOf(b) - V.s));
    (function next() { if (!isOpen() || !todo.length) return; loadCol(todo.shift()); restT = setTimeout(next, 800); })();
  }
  function enterShelf() {
    const c = COLS[V.s];
    loadCol(c, c.source === 'mix');                      // Surprise Me reshuffles on every visit
    [COLS[V.s - 1], COLS[V.s + 1]].forEach(x => x && loadCol(x));
    if (c.source === 'mix') V.at[c.id] = 0;
  }

  // -- the poster viewer (full screen) --
  function render() {
    clearTimeout(trailerT); stopTrailer(root);
    if (V.view === 'home') { document.body.classList.remove('pw-fs'); homeUpdate(); return; }
    if (V.view === 'quiz') { document.body.classList.add('pw-fs'); renderQuiz(); return; }
    const c = V.col, d = data[c.id], items = d ? d.items : [];
    V.i = Math.min(V.i, Math.max(0, items.length - 1));
    const it = items[V.i];
    V.curId = it ? idOf(it) : null;
    const lg = [key('◀▶', 'Browse'), key('A', V.info ? 'Hide details' : 'Details')];
    if (it && it.kind === 'movie') lg.push(key('Y', 'Trailer'));
    lg.push(key('X', 'Slideshow'), key('B', 'Back'));
    document.body.classList.toggle('pw-fs', !!it);
    if (!it) { root.innerHTML = `<div class="pw-msg">${esc(status(c))}</div><div class="pg-legend" style="margin-top:auto">${lg.join('')}</div>`; return; }
    const info = V.info ? `<div class="pw-info">${it.meta ? `<div class="meta">${esc(it.meta)}</div>` : ''}${esc(it.info || 'No details available.').replace(/\n/g, '<br>')}</div>` : '';
    root.innerHTML = full(it, `<div class="pw-count">${V.i + 1} / ${items.length}</div>${info}`) + `<div class="pw-hint">${lg.join('')}</div>`;
    fixBroken(root, it);
    clearTimeout(hintT); hintT = setTimeout(() => root.querySelector('.pw-hint')?.classList.add('idle'), 3000);   // legend fades; any press brings it back
    if (it.kind === 'movie' && !V.info) trailerT = setTimeout(() => playTrailer(root.querySelector('.pw-frame'), it), 6000);   // rest on a movie: its trailer fades in
    [items[V.i + 1], items[V.i - 1]].forEach(n => { if (n && n.img) new Image().src = n.img; });   // preload neighbours
  }

  // -- Guess the Movie --
  const Q = { on: false, n: 0, score: 0, right: 0, state: 'ask', order: [], pool: [], opts: [], cur: null, t0: 0, t: null, next: null };
  const QSRC = ['canon', 'top', '80s', '90s', 'scifi', 'horror', 'anim', 'now', 'pd2'];
  function startQuiz() {
    COLS.filter(c => QSRC.includes(c.id)).forEach(c => loadCol(c));
    const seen = new Set(), pool = [];
    QSRC.forEach(id => ((data[id] || {}).items || []).forEach(it => { if (it.kind === 'movie' && it.media !== 'tv' && it.img && !seen.has(it.title)) { seen.add(it.title); pool.push(it); } }));
    if (pool.length < 12) { toast('Gathering movies… try again in a moment'); return nope(); }
    Object.assign(Q, { on: true, pool, order: shuffle(pool.slice()).slice(0, 10), n: 0, score: 0, right: 0 });
    V.view = 'quiz'; quizRound(); open();
  }
  function quizRound() {
    clearInterval(Q.t); clearTimeout(Q.next);
    const it = Q.order[Q.n];
    Q.cur = it; Q.opts = shuffle([it, ...shuffle(Q.pool.filter(x => x.title !== it.title)).slice(0, 3)]); Q.state = 'ask'; Q.t0 = performance.now(); Q.pts = 100;
    render();
    Q.t = setInterval(() => {                                  // the blur clears and the points drop while you think
      if (Q.state !== 'ask') return;
      const k = Math.min(1, (performance.now() - Q.t0) / 12000); Q.pts = Math.round(100 - 70 * k);
      if (Math.round(k * 20) !== Q.lastStep) { Q.lastStep = Math.round(k * 20); root.querySelector('.qz-poster img')?.style.setProperty('--b', (34 - 22 * k).toFixed(1) + 'px'); }
      const p = root.querySelector('.qz-pts'); if (p) p.textContent = '+' + Q.pts;
    }, 120);
  }
  const DIRS = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'], GLYPH = ['▲', '◀', '▶', '▼'], POS = ['up', 'left', 'right', 'down'];
  function renderQuiz() {
    const it = Q.cur;
    if (Q.state === 'end') {
      const verdict = Q.right >= 9 ? 'Cinephile.' : Q.right >= 7 ? 'Movie buff.' : Q.right >= 4 ? 'Casual viewer.' : 'Popcorn only.';
      root.innerHTML = `<div class="qz"><div class="ph-bg on" style="background:radial-gradient(circle at 50% 35%, #3a2a6a, #07080d 70%)"></div><div class="qz-end"><div class="e">🏆</div><div class="v">${verdict}</div>
        <div class="sc">${Q.score}</div><div class="s">points · ${Q.right} of ${Q.order.length} right</div></div>
        <div class="pg-legend">${[key('A', 'Play again'), key('B', 'Back')].join('')}</div></div>`;
      return;
    }
    const revealed = Q.state === 'reveal';
    root.innerHTML = `<div class="qz"><div class="ph-bg on"></div><div class="ph-shade"></div>
      <div class="qz-top"><span>🎲 GUESS THE MOVIE</span><span>${Q.n + 1} / ${Q.order.length} · ${Q.score} pts</span></div>
      <div class="qz-poster${revealed ? ' rev' : ''}"><img src="${esc(it.img)}" alt="" style="--b:34px"><span class="qz-pts">${revealed ? '' : '+100'}</span></div>
      <div class="qz-reveal">${revealed ? `<div class="t">${esc(it.title)}</div><div class="s">${esc((it.sub || '').split(' · ')[0])}</div>` : '<div class="s">What movie is this?</div>'}</div>
      <div class="qz-opts">${Q.opts.map((o, k) => `<div class="o ${POS[k]}${revealed ? (o === it ? ' ok' : Q.picked === k ? ' bad' : '') : ''}"><i>${GLYPH[k]}</i><span>${esc(o.title)}</span></div>`).join('')}</div>
      <div class="pg-legend">${[key('✚', 'Answer'), key('B', 'Quit')].join('')}</div></div>`;
    paintBg(root.querySelector('.ph-bg'), it.thumb || it.mid || it.img);
    if (revealed && Q.picked !== null && Q.opts[Q.picked] === it) confetti();
  }
  function confetti() {
    const box = document.createElement('div'); box.className = 'cf';
    for (let i = 0; i < 48; i++) { const b = document.createElement('i'); b.style.cssText = `left:${Math.random() * 100}%;background:hsl(${Math.random() * 360} 90% 60%);animation-delay:${Math.random() * .5}s;animation-duration:${1.6 + Math.random()}s`; box.appendChild(b); }
    root.querySelector('.qz')?.appendChild(box); setTimeout(() => box.remove(), 3000);
  }
  function quizAnswer(k) {
    if (Q.state !== 'ask') return;
    const idx = DIRS.indexOf(k); if (idx < 0) return;
    Q.state = 'reveal'; Q.picked = idx; clearInterval(Q.t);
    if (Q.opts[idx] === Q.cur) { Q.score += Q.pts; Q.right++; open(); } else nope();
    render();
    Q.next = setTimeout(quizNext, 2600);
  }
  function quizNext() {
    clearTimeout(Q.next);
    if (++Q.n >= Q.order.length) { Q.state = 'end'; clearInterval(Q.t); render(); return; }
    quizRound();
  }
  function endQuiz() { clearInterval(Q.t); clearTimeout(Q.next); Q.on = false; V.view = 'home'; render(); }

  // -- keys --
  function onKey(k) {
    if (V.view === 'quiz') {
      if (Q.state === 'end') { if (k === 'Enter' || k === ' ') { Q.on = false; startQuiz(); } return; }
      if (Q.state === 'reveal') { if (k === 'Enter' || k === ' ') quizNext(); return; }
      return quizAnswer(k);
    }
    if (k === 'x') {
      // slideshow of what's selected: this shelf from the focused poster
      const c = V.view === 'view' ? V.col : COLS[V.s];
      if (!c || c.source === 'quiz') return nope();
      return saver.show([c.id], { start: V.view === 'view' ? V.i : (V.at[c.id] || 0) }) ? open() : (toast(`${c.name}: ${status(c)}`), nope());
    }
    if (V.view === 'home') {
      const c = COLS[V.s], items = itemsOf(c), n = items.length;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        const t = V.s + (k === 'ArrowDown' ? 1 : -1);
        if (t < 0 || t >= COLS.length) return nope();
        V.s = t; enterShelf(); homeUpdate(); return hover();
      }
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        if (n < 2) return nope();
        V.at[c.id] = ((V.at[c.id] || 0) + (k === 'ArrowRight' ? 1 : n - 1)) % n; homeUpdate(); return hover();
      }
      if (k === 'y') { V.s = shelfIdx('mix'); enterShelf(); homeUpdate(); return open(); }
      if (k === 'Enter' || k === ' ') {
        if (c.source === 'quiz') return startQuiz();
        if (n) { V.view = 'view'; V.col = c; V.i = V.at[c.id] || 0; V.info = false; render(); return open(); }
        loadCol(c, true);
        toast(data[c.id] && data[c.id].state === 'nokey' ? 'Add your TMDB key: see posters-config.js' : `${c.name}: ${status(c)}`);
        return nope();
      }
      return;
    }
    const items = (data[V.col.id] || { items: [] }).items, n = items.length, it = items[V.i];
    if (k === 'y') {
      if (!it || it.kind !== 'movie') return nope();
      const frame = root.querySelector('.pw-frame');
      if (frame.querySelector('.pw-trailer')) { stopTrailer(frame); return hover(); }
      clearTimeout(trailerT);
      trailerKey(it).then(key => key ? playTrailer(frame, it) : (toast('No trailer for this one'), nope()));
      return hover();
    }
    if (k === 'Enter' || k === ' ') { V.info = !V.info; render(); return hover(); }
    if (!n || (k !== 'ArrowLeft' && k !== 'ArrowRight')) return;
    V.i = (V.i + (k === 'ArrowRight' ? 1 : n - 1)) % n; V.info = false; render(); hover();
  }

  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    const k = e.key;
    // the press that opened the channel can arrive here after the page opened it: start the guard now
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    if (!BACK.includes(k) && !MINE.includes(k)) return;
    if (performance.now() - openedAt < GUARD) { e.stopImmediatePropagation(); return; }   // input guard after opening
    if (BACK.includes(k)) { if (e.repeat) e.stopImmediatePropagation(); return; }       // page handler calls postersBack()
    e.stopImmediatePropagation();
    onKey(k.length === 1 ? k.toLowerCase() : k);
  }, true);

  // B: quiz / trailer / details -> poster viewer -> lobby -> Wii menu, one level per press
  window.postersBack = () => {
    const n = performance.now();
    if (n - openedAt < GUARD || n - backAt < 250) return true;
    if (V.view === 'home') return false;
    backAt = n;
    if (V.view === 'quiz') endQuiz();
    else {
      const frame = root.querySelector('.pw-frame');
      if (frame && frame.querySelector('.pw-trailer.on')) { clearTimeout(trailerT); stopTrailer(frame); }
      else if (V.info) { V.info = false; render(); }
      else { V.at[V.col.id] = V.i; V.s = Math.max(0, shelfIdx(V.col.id)); V.view = 'home'; render(); }
    }
    playWiiSound(300, 'triangle', .12);
    return true;
  };

  let was = isOpen();
  new MutationObserver(() => {
    const now = isOpen(); if (now === was) return; was = now;
    if (!now) { sawOpen = false; clearTimeout(trailerT); stopTrailer(root); clearInterval(Q.t); clearTimeout(Q.next); Q.on = false; document.body.classList.remove('pw-fs'); return; }
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    Q.on = false; clearInterval(Q.t); clearTimeout(Q.next);
    V.view = 'home'; V.info = false; render(); enterShelf(); loadRest();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  // ---- screensaver ----
  const saver = (() => {
    const el = document.createElement('div'); el.id = 'pw-saver';
    el.innerHTML = '<div id="pw-clock"></div><div id="pw-party"></div><div class="slide"></div><div class="slide"></div>';
    document.body.appendChild(el);
    const slides = [...el.querySelectorAll('.slide')], clock = el.querySelector('#pw-clock'), partyBar = el.querySelector('#pw-party');
    let list = [], idx = 0, cur = 0, timer = null, clockT = null, active = false, movies = 0, shownAt = 0, turn = 0, sTurn = 0, manual = false, hist = [], pos = -1;
    const tick = () => {
      clock.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const b = window.MusicSaver && !manual ? MusicSaver.bar() : '';     // Party mode: a now-playing pill under the posters (the strip with the caption and clock)
      partyBar.innerHTML = b; partyBar.classList.toggle('on', !!b);
    };
    // step(1): the next slide, step(-1): back to the one before (the d-pad while the screensaver is up); a new slide is picked only at the end of the history
    function step(dir = 1, forceKey) {
      if (!active) return;
      let e, isNew = false;
      if (forceKey) { e = { sport: true, key: forceKey }; hist.push(e); if (hist.length > 60) hist.shift(); pos = hist.length - 1; }      // a watched game just scored: cut to it
      else if (dir < 0) { if (pos <= 0) return; e = hist[--pos]; }
      else if (pos < hist.length - 1) e = hist[++pos];
      else {
        const sport = !manual && !!window.Sports && Sports.active() && !!Sports.slide && sTurn++ % 2 === 0;       // watching a game: every other slide is its live scoreboard
        const music = !sport && !manual && !!window.MusicSaver && MusicSaver.on() && (!list.length || turn++ % 3 === 0);    // Party mode: one slide in three is the queue (posters in between)
        let it = null;
        if (!sport && !music) { if (!list.length) return; it = list[idx++ % list.length]; for (let n = 0; n < 12 && !manual && window.Sports && Sports.active() && it.kind === 'espn'; n++) it = list[idx++ % list.length]; }     // (other games' sports posters step aside while you watch yours)
        e = { sport, music, it }; isNew = true;
        hist.push(e); if (hist.length > 60) hist.shift(); pos = hist.length - 1;
      }
      const music = e.music, it = e.it, sport = e.sport, s = slides[cur = 1 - cur];
      stopTrailer(s);
      s.style.setProperty('--dur', (SS.slideSec + 2) + 's');
      el.classList.toggle('music', music); el.classList.toggle('espn', sport || !!(it && it.kind === 'espn')); document.body.classList.toggle('saver-sports', sport || music || !!(it && it.kind === 'espn'));    // (no now-playing pop-up over the sports posters' corners or the music pages, which show it themselves)
      tick();
      if (sport) { s.innerHTML = Sports.slide(e.key) || ''; if (!s.innerHTML) { sTurn = 1; } } else if (music) { s.innerHTML = MusicSaver.html(); if (MusicSaver.after) MusicSaver.after(s); } else { s.innerHTML = full(it, ''); fixBroken(s, it); }
      slides[1 - cur].classList.remove('show'); s.classList.add('show');
      setTimeout(() => { if (!slides[1 - cur].classList.contains('show')) stopTrailer(slides[1 - cur]); }, 1800);
      clearTimeout(timer);
      timer = setTimeout(step, (sport ? Math.max(30, SS.slideSec * 2.5) : SS.slideSec) * 1000);      // a live scoreboard stays up longer
      // every Nth movie plays its trailer for a while instead
      if (isNew && it && it.kind === 'movie' && SS.trailerEvery && ++movies % SS.trailerEvery === 0) {
        const frame = s.querySelector('.pw-frame');
        playTrailer(frame, it, () => { if (active && frame.isConnected) { clearTimeout(timer); timer = setTimeout(step, SS.trailerSec * 1000); } });
      }
    }
    // show(): the idle screensaver, a shuffled mix. show(ids, { start }): those collections in order, from `start`
    function show(ids, opts) {
      const pool = (ids || SS.collections).flatMap(id => (data[id] || { items: [] }).items);
      list = opts ? pool : pool.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      if (!list.length && ids) return false;   // a manual slideshow needs posters; the idle one can be clock-only
      active = true; manual = !!ids; shownAt = performance.now(); turn = 0; hist = []; pos = -1; idx = opts && opts.start ? opts.start % list.length : 0; el.classList.add('on'); if (window.MusicSaver) MusicSaver.refresh(); tick(); clearInterval(clockT); clockT = setInterval(tick, 5000);
      slides.forEach(s => { stopTrailer(s); s.classList.remove('show'); s.innerHTML = ''; });
      step(); return true;
    }
    function hide() {
      active = false; el.classList.remove('on', 'espn'); document.body.classList.remove('saver-sports'); clearTimeout(timer); clearInterval(clockT);
      slides.forEach(s => { stopTrailer(s); s.classList.remove('show'); s.innerHTML = ''; });
    }
    // X while it is up: back to the dashboard home, whatever channel was open underneath
    function home() { hide(); document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active')); activeApp = null; }
    return { show, hide, home, nav: d => step(d), sport: key => { if (active && !manual) step(1, key); }, get active() { return active; }, get shownAt() { return shownAt; } };
  })();
  if (window.MirrorIdle) window.MirrorIdle.saver = saver;

  // gamepad activity keeps the mirror awake; only a NEW press wakes the screensaver, so the X that
  // started a slideshow (still held down for a moment) doesn't immediately close it again
  let padWas = [];
  (function poll() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected);
    if (p && window.MirrorIdle) {
      const now = [...p.buttons.map(b => b.pressed), ...p.axes.map(a => Math.abs(a) > .5)];
      if (now.some(Boolean)) MirrorIdle.last = performance.now();
      const fresh = now.some((d, i) => d && !padWas[i] && !(i >= 12 && i <= 15) && i < p.buttons.length);   // the d-pad is sent as arrow keys (they steer the slides), sticks don't wake it
      if (saver.active && performance.now() - saver.shownAt > 700) {
        if (now[2] && !padWas[2]) { saver.home(); MirrorIdle.wokeAt = performance.now(); }                // X: dashboard home
        else if (now[3] && !padWas[3]) { saver.hide(); MirrorIdle.wokeAt = performance.now(); }           // Y: the jukebox (music.js opens it)
        else if (fresh) { saver.hide(); MirrorIdle.wokeAt = performance.now(); }
      }
      padWas = now;
    }
    requestAnimationFrame(poll);
  })();

  // X (slideshow) and Y (trailer) only act while this channel is open
  const btnWas = {};
  (function poll() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    [[2, 'x'], [3, 'y']].forEach(([b, key]) => {
      const d = !!(p && p.buttons[b] && p.buttons[b].pressed);
      if (d && !btnWas[b] && isOpen()) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      btnWas[b] = d;
    });
    requestAnimationFrame(poll);
  })();

  // 'media' mode: only while a configured Home Assistant media player is playing
  let mediaPlaying = false;
  async function checkMedia() {
    let any = false;
    for (const id of SS.mediaPlayers) {
      try { const r = await fetch('/ha/api/states/' + id); if (r.ok && (await r.json()).state === 'playing') any = true; } catch (e) {}
    }
    mediaPlaying = any;
  }
  if (SS.when === 'media' && SS.mediaPlayers.length) { checkMedia(); setInterval(checkMedia, 15000); }

  setInterval(() => {
    const I = window.MirrorIdle;
    if (!I || saver.active || window.MirrorExternal || performance.now() - I.last < SS.idleMin * 60e3) return;
    if (window.poolOwnsScreen && window.poolOwnsScreen()) return;   // scoreboard stays up during a game
    if (SS.when === 'media' && !mediaPlaying) return;
    saver.show();
  }, 5000);

  // keep data fresh: slideshow collections always; everything while the channel is open; live games every minute
  const warm = () => COLS.filter(c => SS.collections.includes(c.id) || (isOpen() && data[c.id])).forEach(c => loadCol(c));   // while open, refresh only what's been visited
  setTimeout(warm, 3000); setInterval(warm, 60e3);
  const paintTile = () => {
    const all = COLS.flatMap(c => (data[c.id] || {}).items || []), live = new Set(all.filter(g => g.state === 'in').map(g => g.id)).size;
    tileSub.textContent = live ? `${live} game${live === 1 ? '' : 's'} live` : all.length ? `${all.length} posters` : 'Movies · TV · Games · Art';
  };
  setInterval(paintTile, 10000);
})();
