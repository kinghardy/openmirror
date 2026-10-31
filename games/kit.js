// Hardy Party Games: the hub and the little kit every game shares (controller keys, sound, saved scores).
// A game is one file that calls HardyGames.register({ id, title, tagline, tag, art, start(api) }), where start() returns { key(k), back(), stop() }:
//   api.root   the element the game draws into (1080 x 1920)        api.exit()   leave the game for the hub
//   api.snd    tone / sweep / noise / arp (silent while the Sonos is playing music)
//   api.save   get(game, key, default) / set(game, key, value): kept on the server, so they survive reboots
//   api.k      a controller-button glyph for legends: api.k('A', 'a')
// Keys a game receives: ArrowUp/Down/Left/Right, Enter (A), 'x', 'y', '[' (LB), ']' (RB). B is back().
window.HardyGames = (() => {
  const brand = () => (window.OM_BRAND && window.OM_BRAND.games) || 'Hardy Party Games';                    // the owner can rename it in Settings
  const hubTitle = () => { const w = brand().toUpperCase().split(/\s+/); return w.length > 1 ? w[0] + '<br>' + w.slice(1).join(' ') : w[0]; };
  const games = [];
  const panel = document.getElementById('app-party'), root = document.getElementById('pty-root');
  if (!panel || !root) return { register() {} };
  let mode = 'hub', sel = 0, inst = null, openedAt = 0, backAt = 0;
  const isOpen = () => panel.classList.contains('active');
  const k = (b, cls) => `<i class="pg-k ${cls || ''}">${b}</i>`;
  const quiet = () => !!(window.mirrorQuiet && window.mirrorQuiet());

  // ---- saved data (server file via proxy.py, with the browser as a fallback) ----
  const store = { data: {}, ready: false };
  try { store.data = JSON.parse(localStorage.getItem('hardy-games') || '{}'); } catch (e) {}
  fetch('/games/save').then(r => r.json()).then(j => { store.data = Object.assign({}, store.data, j); store.ready = true; }).catch(() => { store.ready = true; });
  let pT = null;
  function persist() {
    try { localStorage.setItem('hardy-games', JSON.stringify(store.data)); } catch (e) {}
    clearTimeout(pT);
    pT = setTimeout(() => { if (store.ready) fetch('/games/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.data) }).catch(() => {}); }, 700);
  }
  // coins are the house's and the guests' wallets (proxy.py /wallet/*, the same coins guests spend on song requests): whoever is "playing as" owns them
  let players = [], pIdx = 0, wT = null;
  const who = () => players[pIdx];
  const loadPlayers = () => fetch('/wallet/list').then(r => r.json()).then(l => { const id = who() && who().id; players = l; pIdx = Math.max(0, l.findIndex(p => p.id === id)); if (mode === 'hub') render(); }).catch(() => {});
  loadPlayers();
  const save = {
    get: (game, key, def) => { if (key === 'credits' && who()) return who().coins; const v = (store.data[game] || {})[key]; return v === undefined ? def : v; },
    set: (game, key, val) => {
      if (key === 'credits' && who()) { const p = who(); p.coins = Math.max(0, Math.round(val)); clearTimeout(wT); wT = setTimeout(() => fetch('/wallet/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, coins: p.coins }) }).catch(() => {}), 400); return; }
      (store.data[game] = store.data[game] || {})[key] = val; persist();
    }
  };

  // ---- sound: small synth on the page's AudioContext; nothing plays while music is playing on the Sonos ----
  const ctxOK = () => typeof audioCtx !== 'undefined' && !quiet() && (audioCtx.state === 'suspended' && audioCtx.resume(), true);
  const snd = {
    tone(freq, dur = .12, type = 'sine', vol = .12, when = 0) {
      if (!ctxOK()) return;
      const t = audioCtx.currentTime + when, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + .03);
    },
    sweep(f0, f1, dur = .3, type = 'sawtooth', vol = .08, when = 0) {
      if (!ctxOK()) return;
      const t = audioCtx.currentTime + when, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + .03);
    },
    noise(dur = .08, vol = .1, when = 0) {
      if (!ctxOK()) return;
      const n = Math.floor(audioCtx.sampleRate * dur), buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1800; g.gain.value = vol; s.buffer = buf;
      s.connect(f); f.connect(g); g.connect(audioCtx.destination); s.start(audioCtx.currentTime + when);
    },
    arp(notes, step = .09, type = 'triangle', vol = .12) { notes.forEach((f, i) => snd.tone(f, .28, type, vol, i * step)); }
  };

  // ---- hub ----
  function toHub() {
    if (inst && inst.stop) { try { inst.stop(); } catch (e) {} }
    inst = null; mode = 'hub'; render();
  }
  function render() {
    root.innerHTML = `<div class="pty-hub"><div class="pty-head"><div class="k">THE</div><div class="t">${hubTitle()}</div><div class="s">${who() ? `Playing as <b>${who().name}</b> · ${who().coins.toLocaleString()} coins` : 'Built for the mirror'}</div></div>
      <div class="pty-list">${games.map((g, i) => `<div class="pty-card${i === sel ? ' on' : ''}" data-i="${i}"><div class="art">${g.art || ''}</div>
        <div><div class="ct">${g.title}</div><div class="cs">${g.tagline || ''}</div>${g.tag ? `<span class="cn">${g.tag()}</span>` : ''}</div></div>`).join('')}
        <div class="pty-card soon"><div class="art">🎲</div><div><div class="ct">More on the way</div></div></div></div>
      <div class="pty-legend"><span>${k('▲▼')} Choose</span><span>${k('A', 'a')} Play</span>${players.length > 1 ? `<span>${k('LB')}${k('RB')} Player</span>` : ''}<span>${k('B', 'b')} Back</span></div></div>`;
  }
  function launch(g) {
    mode = 'game'; root.innerHTML = '<div class="pty-game" style="position:absolute;inset:0"></div>';
    const box = root.firstChild;
    inst = g.start({ root: box, exit: toHub, snd, save, k, quiet });
  }
  function open() {
    document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active'));
    panel.classList.add('active'); activeApp = 'app-party';
    openedAt = performance.now(); mode = 'hub'; render(); loadPlayers();
  }
  function leave() {                       // back to the Retro Arcade chooser
    if (inst && inst.stop) { try { inst.stop(); } catch (e) {} }
    inst = null; panel.classList.remove('active');
    const a = document.getElementById('app-arcade'); if (a) { a.classList.add('active'); activeApp = 'app-arcade'; }
  }
  window.partyBack = () => {
    if (!isOpen()) return false;
    const n = performance.now();
    if (n - openedAt < 600 || n - backAt < 250) return true;
    backAt = n;
    if (mode === 'game') { if (!(inst && inst.back && inst.back())) toHub(); }
    else leave();
    return true;
  };

  const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'x', 'X', 'y', 'Y', '[', ']'];
  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (!KEYS.includes(e.key)) return;
    e.stopImmediatePropagation();
    if (performance.now() - openedAt < 600) return;
    const key = e.key.length === 1 && e.key !== ' ' ? e.key.toLowerCase() : e.key;
    if (mode === 'game') { if (inst && inst.key) inst.key(key); return; }
    if (key === 'ArrowDown' || key === 'ArrowUp') { sel = (sel + (key === 'ArrowDown' ? 1 : games.length - 1)) % games.length; render(); snd.tone(520, .05, 'sine', .08); }
    else if (key === 'Enter' || key === ' ') { snd.arp([523, 659, 784], .07); launch(games[sel]); }
    else if ((key === '[' || key === ']') && players.length > 1) { pIdx = (pIdx + (key === ']' ? 1 : players.length - 1)) % players.length; render(); snd.tone(660, .06, 'sine', .08); }
  }, true);

  // X / Y / LB / RB from the controller (the dashboard's own pad module only sends the d-pad, A and B)
  const was = {};
  (function pad() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    [[2, 'x'], [3, 'y'], [4, '['], [5, ']']].forEach(([b, key]) => {
      const d = !!(p && p.buttons[b] && p.buttons[b].pressed);
      if (d && !was[b] && isOpen() && !window.MirrorExternal) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      was[b] = d;
    });
    requestAnimationFrame(pad);
  })();
  // LB / RB belong to the game while it is open (elsewhere they are the Sonos volume)
  const prevOwns = window.poolOwnsBumpers;
  window.poolOwnsBumpers = () => (prevOwns && prevOwns()) || (isOpen() && mode === 'game');

  let wasOpen = false;
  new MutationObserver(() => {
    const now = isOpen(); if (now === wasOpen) return; wasOpen = now;
    if (!now && inst) { try { inst.stop && inst.stop(); } catch (e) {} inst = null; mode = 'hub'; }
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  return { register(g) { games.push(g); }, open, snd, save, k };
})();
