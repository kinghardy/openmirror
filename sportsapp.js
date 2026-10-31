// Sports channel: scores for the four leagues, a game's detail (summary / plays / stats / players), standings, the Detroit team's schedule, and the watch list
// (proxy.py /sports/*). Pick what you're watching here: it drives the live scoreboard in the screensaver and the touchdown / goal celebrations (sports.js).
// A opens / selects, X watches or un-watches a game, LB / RB change the day (or the tab inside a game), B goes back.
(() => {
  const overlay = document.getElementById('app-sports');
  if (!overlay) return;
  const css = document.createElement('style');
  css.textContent = `
#app-sports { background:#06080f; padding:0; overflow:hidden; color:#fff; }
body:has(#app-sports.active) #np-mini, body:has(#app-sports.active) #np-toast { display:none !important; }
#sa { position:absolute; inset:0; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; display:flex; flex-direction:column; padding:52px 40px 26px; gap:16px; background:radial-gradient(1100px 700px at 50% -10%, color-mix(in srgb, var(--tc,#2f7bff) 38%, transparent), transparent 70%), #06080f; }
#sa .hd { display:flex; align-items:center; gap:18px; flex:none; } #sa .hd h1 { margin:0; font-size:64px; font-weight:800; letter-spacing:-1px; flex:1; } #sa .live { font-size:26px; font-weight:800; letter-spacing:.12em; padding:8px 20px; border-radius:30px; background:#ff3b3b; }
#sa .tabs { display:flex; gap:10px; flex:none; } #sa .tab { flex:1; text-align:center; padding:16px 0; border-radius:34px; font-size:27px; font-weight:800; background:rgba(255,255,255,.08); border:2px solid rgba(255,255,255,.12); color:rgba(255,255,255,.7); white-space:nowrap; }
#sa .tab.cur { background:rgba(255,255,255,.2); color:#fff; } #sa .tab.on { background:#fff; color:#10131c; border-color:#fff; box-shadow:0 0 0 7px rgba(255,255,255,.22); }
#sa .subs { display:flex; gap:10px; flex:none; } #sa .subs .tab { padding:12px 0; font-size:25px; }
#sa .day { flex:none; text-align:center; font-size:30px; font-weight:700; color:rgba(255,255,255,.75); margin:-4px 0; }
#sa .body { flex:1; min-height:0; overflow:hidden; position:relative; scroll-behavior:smooth; }
#sa .card { display:flex; align-items:center; gap:22px; padding:18px 26px; border-radius:28px; margin-bottom:14px; background:rgba(255,255,255,.07); border:3px solid transparent; }
#sa .card.on { background:rgba(255,255,255,.17); border-color:#fff; box-shadow:0 0 0 7px rgba(255,255,255,.16); }
#sa .card.fav { background:linear-gradient(90deg, rgba(255,208,74,.14), rgba(255,255,255,.07)); }
#sa .st { width:190px; flex:none; font-size:26px; font-weight:800; line-height:1.2; color:rgba(255,255,255,.75); } #sa .st.lv { color:#ff6b6b; } #sa .st small { display:block; font-size:21px; font-weight:600; color:rgba(255,255,255,.5); margin-top:4px; }
#sa .tm { flex:1; min-width:0; } #sa .tr { display:flex; align-items:center; gap:16px; height:78px; } #sa .tr img { width:66px; height:66px; object-fit:contain; flex:none; } #sa .tr .n { flex:1; min-width:0; font-size:36px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } #sa .tr .n small { font-size:22px; font-weight:600; color:rgba(255,255,255,.5); margin-left:10px; } #sa .tr .s { font-size:50px; font-weight:800; font-variant-numeric:tabular-nums; min-width:90px; text-align:right; } #sa .tr.w .n, #sa .tr.w .s { color:#fff; } #sa .tr.l .n, #sa .tr.l .s { color:rgba(255,255,255,.55); }
#sa .wt { width:150px; flex:none; text-align:center; font-size:23px; font-weight:800; letter-spacing:.06em; } #sa .wt .e { font-size:46px; } #sa .wt.y { color:#ffd04a; } #sa .wt.n { color:rgba(255,255,255,.35); }
#sa .grp { font-size:28px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.6); margin:14px 4px 10px; }
#sa .rw { display:flex; align-items:center; gap:16px; padding:10px 18px; border-radius:18px; font-size:29px; font-weight:600; } #sa .rw:nth-child(even) { background:rgba(255,255,255,.05); } #sa .rw.me { background:rgba(255,208,74,.18); } #sa .rw img { width:48px; height:48px; object-fit:contain; } #sa .rw .a { width:62px; color:rgba(255,255,255,.5); font-weight:800; text-align:right; } #sa .rw .nm { flex:1; font-weight:700; } #sa .rw .c { width:130px; text-align:right; font-variant-numeric:tabular-nums; } #sa .rw.h { color:rgba(255,255,255,.5); font-size:23px; letter-spacing:.1em; }
#sa .msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:0 80px; font-size:36px; font-weight:700; color:rgba(255,255,255,.6); line-height:1.4; }
#sa .leg { flex:none; display:flex; justify-content:center; gap:28px; font-size:25px; font-weight:600; color:rgba(255,255,255,.55); white-space:nowrap; } #sa .leg b { color:#fff; background:rgba(255,255,255,.16); border-radius:10px; padding:2px 14px; margin-right:8px; }
#sa .gh { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 20px 4px; } #sa .gh .t { text-align:center; flex:1; } #sa .gh img { width:200px; height:200px; object-fit:contain; } #sa .gh .nm { font-size:34px; font-weight:800; margin-top:2px; } #sa .gh .sc { font-size:150px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; } #sa .gh .mid { width:230px; text-align:center; font-size:30px; font-weight:800; color:rgba(255,255,255,.8); } #sa .gh .mid .lv { color:#ff6b6b; }
#sa .ls { display:flex; justify-content:center; gap:10px; margin:6px 0 10px; } #sa .ls table { border-collapse:collapse; font-size:28px; font-weight:700; } #sa .ls td, #sa .ls th { padding:4px 16px; text-align:center; } #sa .ls th { color:rgba(255,255,255,.5); font-size:22px; }
#sa .pill { display:inline-block; padding:6px 20px; border-radius:24px; background:rgba(255,255,255,.14); font-size:24px; font-weight:800; letter-spacing:.06em; } #sa .pill.y { background:#ffd04a; color:#3a2a00; }
#sa .sec { font-size:26px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.55); margin:16px 6px 8px; }
#sa .ply { display:flex; gap:18px; padding:14px 18px; border-radius:20px; background:rgba(255,255,255,.06); margin-bottom:10px; font-size:28px; line-height:1.3; } #sa .ply .w { width:150px; flex:none; font-weight:800; color:rgba(255,255,255,.6); font-size:23px; } #sa .ply .sc2 { margin-left:auto; font-weight:800; white-space:nowrap; }
#sa .cmp { display:flex; align-items:center; gap:14px; padding:9px 12px; font-size:29px; font-weight:700; } #sa .cmp .l { width:150px; text-align:right; } #sa .cmp .m { flex:1; text-align:center; color:rgba(255,255,255,.55); font-size:24px; font-weight:600; } #sa .cmp .r { width:150px; }
#sa .ldr { display:grid; grid-template-columns:1fr 1fr; gap:20px; } #sa .ldr > div { background:rgba(255,255,255,.06); border-radius:22px; padding:14px 20px; } #sa .ldr .tt { font-size:24px; font-weight:800; letter-spacing:.12em; color:rgba(255,255,255,.6); margin-bottom:6px; } #sa .ldr .r { display:flex; justify-content:space-between; gap:10px; font-size:25px; padding:5px 0; border-top:1px solid rgba(255,255,255,.1); } #sa .ldr .r span { color:rgba(255,255,255,.55); }
#sa .opt { display:flex; align-items:center; gap:24px; padding:26px 32px; border-radius:30px; margin-bottom:16px; background:rgba(255,255,255,.07); border:3px solid transparent; font-size:38px; font-weight:800; } #sa .opt.on { background:rgba(255,255,255,.17); border-color:#fff; box-shadow:0 0 0 7px rgba(255,255,255,.16); } #sa .opt .x { flex:1; } #sa .opt small { display:block; font-size:25px; font-weight:600; color:rgba(255,255,255,.55); margin-top:5px; } #sa .opt .v { font-size:40px; font-variant-numeric:tabular-nums; }
#sa .toast { position:absolute; left:50%; top:46%; translate:-50% 0; background:rgba(14,12,26,.95); border:2px solid rgba(255,255,255,.3); border-radius:28px; padding:26px 48px; font-size:38px; font-weight:800; opacity:0; pointer-events:none; transition:opacity .2s; text-align:center; z-index:9; } #sa .toast.on { opacity:1; }`;
  document.head.appendChild(css);

  const root = document.createElement('div'); root.id = 'sa'; overlay.appendChild(root);
  const LEAGUES = ['nfl', 'nba', 'nhl', 'mlb'], TABS = ['Watching', 'NFL', 'NBA', 'NHL', 'MLB', 'Settings'], SUBS = ['Scores', 'Standings', 'Schedule'], GTABS = ['Summary', 'Plays', 'Stats', 'Players'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const k = b => `<b>${b}</b>`;
  const blip = (f, d = .04) => { if (window.playWiiSound) playWiiSound(f, 'sine', d); };
  const isOpen = () => overlay.classList.contains('active');
  let touched = false, tab = 1, sub = 0, zone = 'list', sel = 0, openedAt = 0, view = null, game = null, gtab = 0, data = {}, dates = {}, fetching = {}, toastT = null, info = { delay: 40, auto: true }, optSel = 0, testKind = 0;
  const api = async p => { const r = await fetch(p); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
  const post = async body => { const r = await fetch('/sports/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); info = Object.assign(info, { delay: j.delay, auto: j.auto }); return j.msg; };
  function toast(m) { const t = root.querySelector('.toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  const lg = () => LEAGUES[tab - 1];
  function ymd(iso, step) { const d = new Date(iso.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + step); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  async function load(kind, key, path, force) {
    const id = kind + ':' + key; if (fetching[id]) return; fetching[id] = 1;
    try { data[id] = await api(path); data[id].at = Date.now(); } catch (e) { data[id] = { error: e.message, at: Date.now() }; }
    fetching[id] = 0; if (isOpen()) paint();
  }
  const boardKey = l => l + ':' + (dates[l] || '');
  function want() {                                  // fetch what the current screen needs (and refresh live scores)
    if (game) { const id = 'game:' + game; if (!data[id] || Date.now() - data[id].at > 9000) load('game', game, '/sports/game?key=' + encodeURIComponent(game)); return; }
    if (tab === 0) LEAGUES.forEach(l => { const id = 'board:' + l + ':'; if (!data[id] || Date.now() - data[id].at > 14000) load('board', l + ':', '/sports/board?lg=' + l); });
    else if (tab <= 4) {
      const l = lg();
      if (sub === 0) { const id = 'board:' + boardKey(l); if (!data[id] || Date.now() - data[id].at > 14000) load('board', boardKey(l), '/sports/board?lg=' + l + (dates[l] ? '&date=' + dates[l] : '')); }
      else if (sub === 1) { const id = 'standings:' + l; if (!data[id] || Date.now() - data[id].at > 300000) load('standings', l, '/sports/standings?lg=' + l); }
      else { const id = 'schedule:' + l; if (!data[id] || Date.now() - data[id].at > 300000) load('schedule', l, '/sports/schedule?lg=' + l); }
    }
  }
  setInterval(() => { if (isOpen() && !document.hidden) want(); }, 4000);

  // ---- lists ----
  function items() {                                // the selectable rows of the current screen
    if (game) return [];
    if (tab === 5) return [0, 1, 2];
    if (tab === 0) return LEAGUES.flatMap(l => ((data['board:' + l + ':'] || {}).games || []).filter(g => g.watched));
    if (sub === 0) return (data['board:' + boardKey(lg())] || {}).games || [];
    if (sub === 2) return (data['schedule:' + lg()] || {}).events || [];
    return [];
  }
  const when = g => g.state === 'in' ? [g.detail, 'LIVE'] : g.state === 'post' ? ['Final', g.detail.replace(/^Final\/?/, '')] : (() => { const d = new Date(g.start); return [d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })]; })();
  function card(g, i) {
    const [a, b] = when(g), hs = g.home.score, as = g.away.score, fin = g.state === 'post', pre = g.state === 'pre';
    const row = (t, sc, w) => `<div class="tr${fin ? (w ? ' w' : ' l') : ''}"><img src="${esc(t.logo)}" alt=""><div class="n">${esc(t.short || t.name)}${t.record ? `<small>${esc(t.record)}</small>` : ''}</div><div class="s">${pre ? '' : esc(sc == null ? '' : sc)}</div></div>`;
    const aw = fin && Number(as) > Number(hs), hw = fin && Number(hs) > Number(as);
    return `<div class="card${i === sel ? ' on' : ''}${g.fav ? ' fav' : ''}" data-i="${i}"><div class="st${g.state === 'in' ? ' lv' : ''}">${esc(a)}<small>${esc(b)}${g.tv ? ' · ' + esc(g.tv) : ''}</small></div><div class="tm">${row(g.away, as, aw)}${row(g.home, hs, hw)}</div><div class="wt ${g.watched ? 'y' : 'n'}"><div class="e">${g.watched ? '👁' : '○'}</div>${g.watched ? 'WATCHING' : 'X: WATCH'}</div></div>`;
  }
  function schedRow(e, i) {
    const d = new Date(e.date), fin = e.state === 'post', res = fin ? `${e.win ? 'W' : 'L'} ${e.us}–${e.them}` : e.state === 'in' ? 'LIVE' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const g = { watched: ((data['board:' + boardKey(lg())] || {}).games || []).some(x => x.key === e.key && x.watched) };
    return `<div class="card${i === sel ? ' on' : ''}" data-i="${i}"><div class="st">${esc(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}<small>${esc(d.toLocaleDateString('en-US', { weekday: 'long' }))}</small></div><div class="tm"><div class="tr"><img src="${esc(e.opp.logo)}" alt=""><div class="n">${e.home ? 'vs' : '@'} ${esc(e.opp.name)}</div><div class="s" style="font-size:36px;${fin ? (e.win ? 'color:#6ee7a0' : 'color:#ff8a8a') : ''}">${esc(res)}</div></div></div><div class="wt n"><small>${esc(e.tv || '')}</small></div></div>`;
  }
  function standings(d) {
    return d.groups.map(g => `<div class="grp">${esc(g.name)}</div><div class="rw h"><span class="a"></span><span style="width:48px"></span><span class="nm">TEAM</span>${d.cols.map(c => `<span class="c">${c}</span>`).join('')}</div>` + g.rows.map((r, i) => `<div class="rw${r.team.abbr === 'DET' ? ' me' : ''}"><span class="a">${i + 1}</span><img src="${esc(r.team.logo)}" alt=""><span class="nm">${esc(r.team.short || r.team.name)}</span>${r.cells.map(c => `<span class="c">${esc(c)}</span>`).join('')}</div>`).join('')).join('');
  }
  function settings() {
    const o = [`<div class="opt${optSel === 0 ? ' on' : ''}"><div class="x">📺 TV delay<small>◀▶ adjust · A: tap right after a play shows on your TV and it measures the gap</small></div><div class="v">◀ ${info.delay}s ▶</div></div>`,
      `<div class="opt${optSel === 1 ? ' on' : ''}"><div class="x">🦁 Watch Detroit games automatically<small>Lions, Pistons, Red Wings and Tigers while they play</small></div><div class="v">${info.auto ? 'ON' : 'OFF'}</div></div>`,
      `<div class="opt${optSel === 2 ? ' on' : ''}"><div class="x">🎉 Test a celebration<small>A plays it: ${['big (touchdown / goal)', 'banner (field goal / three)', 'pill (everything else)'][testKind]} · ◀▶ changes it</small></div><div class="v">▶</div></div>`];
    return o.join('') + `<div class="sec" style="margin-top:26px">How it works</div><div style="font-size:29px;line-height:1.45;color:rgba(255,255,255,.7);padding:0 6px">Press <b>X</b> on any game to start watching it. While you watch, the screensaver shows its live scoreboard, other games' posters step aside, and a big play gets a celebration. Scores and plays are held back by the TV delay above so nothing is spoiled.</div>`;
  }

  // ---- game detail ----
  function gameView(d) {
    const g = d.game, H = g.home, A = g.away, live = g.state === 'in', pre = g.state === 'pre';
    const lines = (t) => (t.lines || []);
    const n = Math.max(lines(H).length, lines(A).length);
    const head = `<div class="gh"><div class="t"><img src="${esc(A.logo)}" alt=""><div class="nm">${esc(A.short || A.name)}</div><div class="sc">${pre ? '–' : esc(A.score)}</div></div><div class="mid">${live ? '<span class="lv">● LIVE</span><br>' : ''}${esc(g.detail)}${g.tv ? '<br><span style="font-size:24px;opacity:.7">' + esc(g.tv) + '</span>' : ''}<br><span class="pill${g.watched ? ' y' : ''}" style="margin-top:12px">${g.watched ? '👁 WATCHING' : 'X: WATCH'}</span></div><div class="t"><img src="${esc(H.logo)}" alt=""><div class="nm">${esc(H.short || H.name)}</div><div class="sc">${pre ? '–' : esc(H.score)}</div></div></div>`
      + (n && !pre ? `<div class="ls"><table><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>T</th></tr><tr><td>${esc(A.abbr)}</td>${Array.from({ length: n }, (_, i) => `<td>${esc(lines(A)[i] ?? '')}</td>`).join('')}<td><b>${esc(A.score)}</b></td></tr><tr><td>${esc(H.abbr)}</td>${Array.from({ length: n }, (_, i) => `<td>${esc(lines(H)[i] ?? '')}</td>`).join('')}<td><b>${esc(H.score)}</b></td></tr></table></div>` : '');
    const tabs = `<div class="tabs" style="margin:6px 0 12px">${GTABS.map((t, i) => `<div class="tab${i === gtab ? ' on' : ''}">${t}</div>`).join('')}</div>`;
    let body = '';
    if (gtab === 0) {
      body = (d.wp != null && !pre && g.state !== 'post' ? `<div class="sec">Win probability</div><div style="display:flex;justify-content:space-between;font-size:28px;font-weight:800;padding:0 6px"><span>${esc(A.abbr)} ${100 - Math.round(d.wp * 100)}%</span><span>${Math.round(d.wp * 100)}% ${esc(H.abbr)}</span></div><div style="height:20px;border-radius:10px;overflow:hidden;display:flex;margin:8px 6px 4px;background:#333"><i style="width:${100 - Math.round(d.wp * 100)}%;background:${esc(A.alt)}"></i><i style="width:${Math.round(d.wp * 100)}%;background:${esc(H.alt)}"></i></div>` : '')
        + (d.leaders.length ? `<div class="sec">Leaders${d.held ? ' <span style="color:#ffd04a;letter-spacing:.04em">⚠ live: may be ahead of your TV</span>' : ''}</div><div class="ldr">${d.leaders.map(x => `<div><div class="tt">${esc(x.team)}</div>${x.rows.map(r => `<div class="r"><span>${esc(r.cat)}</span><b>${esc(r.who)} ${esc(r.val)}</b></div>`).join('')}</div>`).join('')}</div>` : '')
        + (d.plays.length ? `<div class="sec">Latest scoring</div>${d.plays.slice(-3).reverse().map(plyRow).join('')}` : '') + (d.venue ? `<div class="sec">Venue</div><div style="font-size:28px;padding:0 6px">${esc(d.venue)}</div>` : '');
    } else if (gtab === 1) body = d.plays.length ? d.plays.slice().reverse().map(plyRow).join('') : '<div class="msg" style="position:static;padding:80px 0">No scoring yet</div>';
    else if (gtab === 2) body = (d.held ? '<div class="sec" style="color:#ffd04a">⚠ live stats: may be ahead of your TV</div>' : '') + (d.stats.length ? `<div class="cmp" style="font-weight:800"><span class="l">${esc(A.abbr)}</span><span class="m"></span><span class="r">${esc(H.abbr)}</span></div>` + d.stats.map(s => `<div class="cmp"><span class="l">${esc(s.away)}</span><span class="m">${esc(s.label)}</span><span class="r">${esc(s.home)}</span></div>`).join('') : '<div class="msg" style="position:static;padding:80px 0">No stats yet</div>');
    else body = (d.held ? '<div class="sec" style="color:#ffd04a">⚠ live stats: may be ahead of your TV</div>' : '') + (d.players.length ? d.players.map(p => `<div class="sec">${esc(p.team)} · ${esc(p.cat)}${p.labels.length ? ' <span style="opacity:.6;letter-spacing:.04em">' + esc(p.labels.join(' ')) + '</span>' : ''}</div>` + p.rows.map(r => `<div class="ply"><div class="w">${esc(r.pos)}</div><div style="flex:1">${esc(r.name)}</div><div class="sc2" style="font-weight:600;font-size:25px">${esc(r.line)}</div></div>`).join('')).join('') : '<div class="msg" style="position:static;padding:80px 0">No player stats yet</div>');
    return { head, tabs, body };
  }
  const plyRow = p => `<div class="ply"><div class="w">${esc(p.period)}<br>${esc(p.clock)}</div><div style="flex:1"><b>${esc(p.team)}</b> ${esc(p.type && p.type.toLowerCase() !== 'jump shot' ? p.type + ': ' : '')}${esc(p.text)}</div><div class="sc2">${esc(p.away)}–${esc(p.home)}</div></div>`;

  // ---- paint ----
  function paint() {
    if (!isOpen()) return;
    const bodyEl = root.querySelector('.body'), keep = bodyEl ? bodyEl.scrollTop : 0;
    let html, legend;
    const liveN = LEAGUES.reduce((n, l) => n + (((data['board:' + l + ':'] || {}).games || []).filter(g => g.watched && g.state === 'in').length), 0);
    if (game) {
      const d = data['game:' + game];
      if (!d) html = '<div class="gh"></div><div class="body"><div class="msg">Loading…</div></div>';
      else if (d.error) html = `<div class="body"><div class="msg">Couldn’t load that game<br>${esc(d.error)}</div></div>`;
      else { const v = gameView(d); html = `${v.head}${v.tabs}<div class="body" style="flex:1">${v.body}</div>`; root.style.setProperty('--tc', d.game.home.color); }
      legend = `<span>${k('◀▶')}Tab</span><span>${k('▲▼')}Scroll</span><span>${k('X')}Watch</span><span>${k('B')}Back</span>`;
    } else {
      root.style.setProperty('--tc', '#2f7bff');
      const tabsHtml = `<div class="tabs">${TABS.map((t, i) => `<div class="tab${i === tab ? ' cur' : ''}${zone === 'tabs' && i === tab ? ' on' : ''}">${t}</div>`).join('')}</div>`;
      const subsHtml = tab >= 1 && tab <= 4 ? `<div class="subs">${SUBS.map((t, i) => `<div class="tab${i === sub ? ' cur' : ''}${zone === 'sub' && i === sub ? ' on' : ''}">${t}</div>`).join('')}</div>` : '';
      let inner = '', day = '';
      const list = items();
      if (tab === 5) inner = settings();
      else if (tab === 0) { const loaded = LEAGUES.every(l => data['board:' + l + ':']); inner = list.length ? list.map(card).join('') : `<div class="msg">${loaded ? 'Not watching anything yet.<br>Pick a game in a league tab and press X.<br><br>Detroit games are watched automatically when they’re about to start.' : 'Loading…'}</div>`; }
      else if (sub === 0) { const d = data['board:' + boardKey(lg())]; day = d && d.day ? new Date(d.day.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + (d.step === 7 ? ' (week)' : '') : ''; inner = !d ? '<div class="msg">Loading…</div>' : d.error ? `<div class="msg">${esc(d.error)}</div>` : list.length ? list.map(card).join('') : '<div class="msg">No games this day</div>'; }
      else if (sub === 1) { const d = data['standings:' + lg()]; inner = !d ? '<div class="msg">Loading…</div>' : d.error ? `<div class="msg">${esc(d.error)}</div>` : standings(d); }
      else { const d = data['schedule:' + lg()]; day = d && d.team ? d.team : ''; inner = !d ? '<div class="msg">Loading…</div>' : d.error ? `<div class="msg">${esc(d.error)}</div>` : list.length ? list.map(schedRow).join('') : '<div class="msg">No games scheduled</div>'; }
      html = `<div class="hd"><h1>🏟 Sports</h1>${liveN ? `<span class="live">● ${liveN} LIVE</span>` : ''}</div>${tabsHtml}${subsHtml}${day ? `<div class="day">${day}</div>` : ''}<div class="body">${inner}</div>`;
      legend = tab === 5 ? `<span>${k('▲▼')}Pick</span><span>${k('◀▶')}Change</span><span>${k('A')}Do it</span><span>${k('B')}Back</span>`
        : sub === 0 || tab === 0 ? `<span>${k('A')}Open</span><span>${k('X')}Watch</span>${tab ? `<span>${k('LB')}${k('RB')}Day</span>` : ''}<span>${k('B')}Back</span>` : `<span>${k('▲▼')}Scroll</span><span>${k('B')}Back</span>`;
    }
    root.innerHTML = html + `<div class="leg">${legend}</div><div class="toast"></div>`;
    const nb = root.querySelector('.body');
    if (nb) { nb.style.scrollBehavior = 'auto'; nb.scrollTop = keep; nb.style.scrollBehavior = ''; const on = nb.querySelector('.card.on, .opt.on'); if (on) nb.scrollTop = Math.max(0, on.offsetTop - nb.clientHeight / 2 + on.offsetHeight / 2); }
  }

  // ---- actions ----
  async function toggleWatch(g) {
    if (!g || !g.key) return;
    try { await post({ act: 'watch', key: g.key, on: !g.watched }); g.watched = !g.watched; Object.values(data).forEach(d => (d.games || []).forEach(x => { if (x.key === g.key) x.watched = g.watched; })); if (game && data['game:' + game]) data['game:' + game].game.watched = g.watched; toast(g.watched ? '👁 Watching: it will show on the screensaver' : 'Stopped watching'); blip(g.watched ? 880 : 400, .1); }
    catch (e) { toast(e.message); }
    paint();
  }
  function openGame(g) { if (!g || !g.key) return; game = g.key; gtab = 0; delete data['game:' + g.key]; blip(880, .1); want(); paint(); }
  function move(dx, dy) {
    if (game) {
      if (dx) { gtab = (gtab + dx + GTABS.length) % GTABS.length; blip(520); paint(); }
      else { const b = root.querySelector('.body'); if (b) b.scrollTop += dy * 360; }
      return;
    }
    const n = items().length;
    if (zone === 'tabs') {
      if (dx) { tab = (tab + dx + TABS.length) % TABS.length; sel = 0; blip(520); want(); paint(); }
      else if (dy > 0) { zone = tab >= 1 && tab <= 4 ? 'sub' : 'list'; blip(520); paint(); }
    } else if (zone === 'sub') {
      if (dx) { sub = (sub + dx + SUBS.length) % SUBS.length; sel = 0; blip(520); want(); paint(); }
      else if (dy < 0) { zone = 'tabs'; paint(); } else if (dy > 0) { zone = 'list'; paint(); }
    } else {
      if (tab === 5) { if (dy) { optSel = Math.max(0, Math.min(2, optSel + dy)); paint(); } else if (dx) opt(dx); return; }
      if (dy < 0) { if (sel === 0 || !n) { zone = tab >= 1 && tab <= 4 ? 'sub' : 'tabs'; } else sel--; } else if (dy > 0) { if (sel < n - 1) sel++; else if (!n || sub !== 0 && tab) { const b = root.querySelector('.body'); if (b) b.scrollTop += 360; } }
      if (dx && tab) { /* ◀▶ on a list does nothing */ }
      blip(520); paint();
    }
  }
  async function opt(dx, press) {
    try {
      if (optSel === 0) { if (press) toast(await post({ act: 'sync' })); else { await post({ act: 'delay', delay: Math.max(0, Math.min(180, info.delay + dx * 5)) }); } }
      else if (optSel === 1) { if (press || dx) toast(await post({ act: 'auto', on: !info.auto })); }
      else { if (press) toast(await post({ act: 'test', kind: ['big', 'med', 'small'][testKind] })); else testKind = (testKind + dx + 3) % 3; }
    } catch (e) { toast(e.message); }
    paint();
  }
  function enter() {
    if (game) return;
    if (zone === 'tabs') return move(0, 1);
    if (zone === 'sub') return move(0, 1);
    if (tab === 5) return opt(0, true);
    const it = items()[sel]; if (!it) return;
    if (sub === 2 && tab) { openGame(it); return; }
    openGame(it);
  }
  function day(d) {                                   // LB / RB: the previous / next day (a week for the NFL)
    if (game) { move(d, 0); return; }
    if (tab < 1 || tab > 4 || sub !== 0) return;
    const l = lg(), b = data['board:' + boardKey(l)]; if (!b || !b.day) return;
    dates[l] = ymd(b.day, d * b.step); sel = 0; blip(520); want(); paint();
  }
  window.sportsBack = () => {
    if (!isOpen()) return false;
    if (performance.now() - openedAt < 400) return true;
    blip(300);
    if (game) { game = null; paint(); return true; }
    if (zone === 'list') { zone = tab >= 1 && tab <= 4 ? 'sub' : 'tabs'; paint(); return true; }
    if (zone === 'sub') { zone = 'tabs'; paint(); return true; }
    return false;
  };
  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(key) || ['Escape', 'Backspace', 'b'].includes(key)) return;
    e.stopImmediatePropagation(); e.preventDefault(); touched = true;
    if (performance.now() - openedAt < 400) return;
    if (key === 'ArrowLeft') move(-1, 0); else if (key === 'ArrowRight') move(1, 0); else if (key === 'ArrowUp') move(0, -1); else if (key === 'ArrowDown') move(0, 1);
    else if (key === 'Enter' || key === ' ') enter();
    else if (key === 'x') { if (game) toggleWatch((data['game:' + game] || {}).game); else if (zone === 'list' && tab !== 5 && sub === 0 || tab === 0) toggleWatch(items()[sel]); }
    else if (key === '[') day(-1); else if (key === ']') day(1);
  }, true);
  // X / LB / RB from the controller (the dashboard's pad module only sends the d-pad, A and B)
  const was = {};
  (function pad() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    [[2, 'x'], [4, '['], [5, ']']].forEach(([b, key]) => { const d = !!(p && p.buttons[b] && p.buttons[b].pressed); if (d && !was[b] && isOpen() && !window.MirrorExternal) window.dispatchEvent(new KeyboardEvent('keydown', { key })); was[b] = d; });
    requestAnimationFrame(pad);
  })();
  new MutationObserver(() => {
    if (isOpen()) { openedAt = performance.now(); game = null; zone = 'tabs'; sel = 0; touched = false;
      api('/sports/info').then(j => { info = Object.assign(info, { delay: j.delay, auto: j.auto }); }).catch(() => {});
      want(); paint(); setTimeout(() => { const live = LEAGUES.some(l => ((data['board:' + l + ':'] || {}).games || []).some(g => g.watched)); if (live && !touched && tab !== 0) { tab = 0; paint(); } }, 1800); }
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
})();
