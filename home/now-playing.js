(() => {
  // Sonos Era 300 via the mirror's own proxy (/sonos/now, /sonos/<cmd>). Same speaker, any source: Apple Music, AirPlay, ...
  const overlay = document.getElementById('app-music'), root = document.getElementById('np-root');
  const tile = document.querySelector('[data-app="music"]');
  const hero = document.getElementById('np-hero'), hh = id => document.getElementById('hh-' + id);
  const mini = document.createElement('div'); mini.id = 'np-mini'; document.body.appendChild(mini);
  const ico = {
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2.4v14H6zM20 5v14L9.6 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M15.6 5H18v14h-2.4zM4 5l10.4 7L4 19z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM15.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.4 5.6a9 9 0 0 1 0 12.8L17 17a7 7 0 0 0 0-10z"/></svg>'
  };
  root.innerHTML = `<div class="np-bg"></div><div class="np-shade"></div>
    <div class="np-wrap" id="np-wrap">
      <div class="np-top"><span class="np-chip" id="np-src">Apple Music</span><span>Sonos Era 300</span></div>
      <div class="np-artbox"><img id="np-art" alt=""></div>
      <div class="np-meta"><div class="np-title" id="np-title"></div><div class="np-artist" id="np-artist"></div><div class="np-album" id="np-album"></div></div>
      <div class="np-prog"><span id="np-el">0:00</span><div class="np-bar"><i id="np-fill"></i></div><span id="np-rem">0:00</span></div>
      <div class="np-idle"><div class="big">♪</div><div class="h" id="np-ih">Nothing playing</div><div class="s" id="np-is"></div></div>
      <div class="np-ctrl"><div class="np-btn" data-c="prev">${ico.prev}</div><div class="np-btn big" data-c="toggle" id="np-pp">${ico.play}</div><div class="np-btn" data-c="next">${ico.next}</div></div>
      <div class="np-vol">${ico.vol}<div class="np-bar"><i id="np-vfill"></i></div><b id="np-vnum">0</b></div>
      <div class="np-hint"><span><b>◀ ▶</b>Select</span><span><b>A</b>Press</span><span><b>▲ ▼</b>Volume</span><span><b>X</b>Lyrics</span><span><b>Y</b>Find</span><span><b>B</b>Back</span></div>
    </div>`;
  const $ = id => document.getElementById(id), wrap = $('np-wrap');
  const btns = [...root.querySelectorAll('.np-btn')];
  let np = { ok: false }, at = Date.now(), key = '', pausedSince = 0, focus = 1, volTarget = null, volTimer = null, accent = null;
  const isOpen = () => overlay.classList.contains('active');
  const has = () => np.ok && !!np.title;
  // the Sonos is the music player: while it plays, the mirror's own sounds stay off (the dashboard's clicks here; tools/audio_policy.py
  // mutes everything else the PC plays). The switch lives in Wii Options and is stored by the proxy.
  let quietOn = true;
  fetch('/mirror/quiet').then(r => r.json()).then(j => { quietOn = j.enabled !== false; }).catch(() => {});
  window.mirrorQuiet = () => quietOn && np.ok && np.state === 'playing' && np.source !== 'Bluetooth' && !np.pc;
  window.mirrorQuietOn = () => quietOn;
  window.mirrorNow = () => np;
  window.mirrorPos = () => pos();
  window.mirrorQuietSet = async v => { quietOn = v; try { await fetch('/mirror/quiet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: v }) }); } catch (e) {} };
  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const pos = () => Math.min(np.dur || 1e9, (np.pos || 0) + (np.state === 'playing' ? (Date.now() - at) / 1000 : 0));
  const setVar = (k, v) => document.documentElement.style.setProperty(k, v);

  function pickAccent(url) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sat = mx ? (mx - mn) / mx : 0, k = sat * sat * mx + 1;
          r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k;
        }
        r /= w * 255; g /= w * 255; b /= w * 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
        if (mx !== mn) {
          const dd = mx - mn; s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn);
          h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60;
        }
        s = Math.max(.6, Math.min(.95, s * 1.15)); l = Math.max(.55, Math.min(.68, l + .12));
        setVar('--np-accent', `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`);
        setVar('--np-accent-soft', `hsl(${h.toFixed(0)} ${(s * 80).toFixed(0)}% 82%)`);
      } catch (e) {}
    };
    img.src = url;
  }

  function paintTile() {
    const live = has();
    hero.classList.toggle('live', live); hero.classList.toggle('playing', live && np.state === 'playing');
    if (!live) {
      hh('kick').textContent = 'MUSIC'; hh('title').textContent = np.ok ? 'Nothing playing' : 'Speaker offline'; hh('title').classList.remove('long');
      hh('artist').textContent = 'Apple Music · Era 300';
      hh('album').textContent = np.ok ? 'Press Y to find music, or start something in Apple Music and pick Era 300' : 'Check that the Sonos is on and on the same network';
      return;
    }
    hh('kick').textContent = (np.state === 'playing' ? 'Now playing' : 'Paused') + ' · ' + np.source + (window.mirrorQuiet() ? ' · 🔇' : '');
    hh('title').textContent = np.title; hh('title').classList.toggle('long', np.title.length > 30);
    hh('artist').textContent = np.artist || np.source; hh('album').textContent = np.album;
    if (np.art && hh('art').getAttribute('src') !== np.art) { hh('art').src = np.art; hero.style.setProperty('--np-art', `url("${np.art}")`); }
    hh('pp').innerHTML = np.state === 'playing' ? ico.pause : ico.play; hh('xl').textContent = np.state === 'playing' ? 'Pause' : 'Play';
    tickHero();
  }
  function tickHero() {
    if (!has() || !np.dur) return;
    const p = pos(); hh('fill').style.width = (p / np.dur * 100) + '%'; hh('el').textContent = fmt(p); hh('rem').textContent = '-' + fmt(np.dur - p);
  }
  let miniTimer = null, miniApp = '';
  function expandMini() { mini.classList.remove('compact'); clearTimeout(miniTimer); miniTimer = setTimeout(() => mini.classList.add('compact'), 6000); }
  function paintMini() {
    const onChannel = (typeof activeApp !== 'undefined' && activeApp) || (window.MirrorIdle && MirrorIdle.saver && MirrorIdle.saver.active);
    const show = has() && onChannel && !isOpen() && !window.MirrorExternal && (np.state === 'playing' || Date.now() - pausedSince < 45000);
    const wasOn = mini.classList.contains('on');
    mini.classList.toggle('on', show); mini.classList.toggle('paused', np.state !== 'playing');
    const appNow = (typeof activeApp !== 'undefined' && activeApp) || '';
    if (show && (!wasOn || appNow !== miniApp)) expandMini();
    miniApp = appNow;
    if (!mini.dataset.k || mini.dataset.k !== key) {
      mini.dataset.k = key;
      const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      mini.innerHTML = `${np.art ? `<img src="${np.art}" alt="">` : ''}<div class="tx"><div class="t">${esc(np.title)}</div><div class="a">${esc(np.artist || np.source)}</div></div><div class="eq"><i></i><i></i><i></i><i></i></div><div class="pg"><i></i></div>`;
      mini.classList.remove('pop'); void mini.offsetWidth; mini.classList.add('pop'); expandMini();
    }
    const f = mini.querySelector('.pg i'); if (f && np.dur) f.style.width = (pos() / np.dur * 100) + '%';
  }
  function paintFull() {
    wrap.classList.toggle('idle', !has());
    wrap.classList.toggle('playing', has() && np.state === 'playing'); wrap.classList.toggle('paused', has() && np.state !== 'playing');
    $('np-pp').innerHTML = np.state === 'playing' ? ico.pause : ico.play;
    if (!has()) {
      $('np-ih').textContent = np.ok ? 'Nothing playing' : 'Can’t reach the Sonos';
      $('np-is').innerHTML = np.ok ? 'Start something in Apple Music on your phone and pick <b>Era 300</b>,<br>or press <b>A</b> to resume what was last playing.' : 'Check that the speaker is on and on the same network.';
    } else {
      $('np-src').textContent = np.source; $('np-title').textContent = np.title; $('np-title').classList.toggle('long', np.title.length > 26);
      $('np-artist').textContent = np.artist; $('np-album').textContent = np.album;
      if (np.art && $('np-art').getAttribute('src') !== np.art) { $('np-art').src = np.art; root.style.setProperty('--np-art', `url("${np.art}")`); }
      $('np-art').style.display = np.art ? '' : 'none';
    }
    btns.forEach((b, i) => b.classList.toggle('on', i === focus));
    paintVol(); tickBar();
  }
  function paintVol() { const v = volTarget ?? np.volume ?? 0; $('np-vfill').style.width = v + '%'; $('np-vnum').textContent = v; }
  function tickBar() {
    if (!has() || !np.dur) { $('np-fill').style.width = '0'; $('np-el').textContent = '0:00'; $('np-rem').textContent = '0:00'; return; }
    const p = pos(); $('np-fill').style.width = (p / np.dur * 100) + '%'; $('np-el').textContent = fmt(p); $('np-rem').textContent = '-' + fmt(np.dur - p);
  }

  function apply(d) {
    const was = np.state; np = d; at = Date.now();
    if (np.state !== 'playing' && was === 'playing') pausedSince = Date.now();
    if (np.state === 'playing') pausedSince = 0;
    const k = np.ok ? `${np.title}|${np.artist}|${np.art}` : '';
    if (k !== key) { key = k; if (np.art) pickAccent(np.art); }
    paintTile(); paintMini(); if (isOpen()) paintFull();
  }
  async function poll() { try { apply(await (await fetch('/sonos/now')).json()); } catch (e) { apply({ ok: false }); } }
  (function loop() { poll().finally(() => setTimeout(loop, isOpen() ? 1500 : np.state === 'playing' ? 3000 : 8000)); })();
  setInterval(() => { paintMini(); tickHero(); if (isOpen()) tickBar(); }, 500);

  async function cmd(c, body) {
    try {
      const r = await fetch('/sonos/' + c, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      if (r.ok) apply(await r.json());
    } catch (e) {}
  }
  function press(i) {
    const c = btns[i].dataset.c;
    if (window.playWiiSound) playWiiSound(660, 'sine', .06);
    if (c === 'toggle') { np.state = np.state === 'playing' ? 'paused' : 'playing'; at = Date.now(); paintFull(); }   // feels instant; the speaker's answer corrects it
    cmd(c);
  }
  function bumpVol(d) {
    volTarget = Math.max(0, Math.min(100, (volTarget ?? np.volume ?? 0) + d)); paintVol();
    clearTimeout(volTimer);
    volTimer = setTimeout(async () => { const v = volTarget; await cmd('volume', { volume: v }); volTarget = null; paintVol(); }, 120);
  }

  window.addEventListener('keydown', e => {
    if (!isOpen() || (window.MusicLib && MusicLib.isOpen())) return;     // the song picker has the controller while it is up
    if (e.key === 'ArrowLeft') { focus = (focus + 2) % 3; paintFull(); if (window.playWiiSound) playWiiSound(520, 'sine', .04); }
    else if (e.key === 'ArrowRight') { focus = (focus + 1) % 3; paintFull(); if (window.playWiiSound) playWiiSound(520, 'sine', .04); }
    else if (e.key === 'ArrowUp') bumpVol(3);
    else if (e.key === 'ArrowDown') bumpVol(-3);
    else if (e.key === 'Enter' || e.key === ' ') press(has() ? focus : 1);
  });
  btns.forEach((b, i) => b.addEventListener('click', () => { focus = i; press(i); }));
  const onHero = () => !isOpen() && (typeof activeApp === 'undefined' || !activeApp) && typeof tiles !== 'undefined' && tiles[currentIndex] === hero && has() && !window.MirrorExternal;
  const heroTap = i => { const b = hero.querySelectorAll('.hb')[i]; b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 140); if (window.playWiiSound) playWiiSound(660, 'sine', .06); };
  window.addEventListener('keydown', e => {
    if (!onHero()) return;
    if (e.key === 'ArrowLeft') { heroTap(0); cmd('prev'); }
    else if (e.key === 'ArrowRight') { heroTap(2); cmd('next'); }
    else if (e.key.toLowerCase() === 'x') { heroTap(1); np.state = np.state === 'playing' ? 'paused' : 'playing'; at = Date.now(); paintTile(); cmd('toggle'); }
  });

  // LB / RB change the Sonos volume on every screen (hold to repeat), except where a channel uses the bumpers itself
  // (Poster Wall game page, pool game) or a game owns the controller. A small volume bar shows outside this channel.
  const toast = document.createElement('div'); toast.id = 'np-toast';
  toast.innerHTML = ico.vol + '<div class="np-bar"><i></i></div><b></b>'; document.body.appendChild(toast);
  let toastT = null;
  const showToast = () => {
    if (isOpen()) return;
    const v = volTarget ?? np.volume ?? 0; toast.querySelector('i').style.width = v + '%'; toast.querySelector('b').textContent = v;
    toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 1400);
  };
  const bumpersFree = () => np.ok && !window.MirrorExternal && !(window.poolOwnsBumpers && window.poolOwnsBumpers());
  const was = {}, nextAt = {};
  (function pad() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    const x = !!(p && p.buttons[2] && p.buttons[2].pressed);
    if (x && !was.x && onHero()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    was.x = x;
    const t = performance.now();
    [[4, -3], [5, 3]].forEach(([b, d]) => {
      const down = !!(p && p.buttons[b] && p.buttons[b].pressed);
      if (down && bumpersFree()) {
        if (!was[b]) { bumpVol(d); showToast(); nextAt[b] = t + 400; }
        else if (t >= nextAt[b]) { bumpVol(d); showToast(); nextAt[b] = t + 110; }
      }
      was[b] = down;
    });
    requestAnimationFrame(pad);
  })();

  let opened = false;
  new MutationObserver(() => {
    const now = isOpen(); if (now === opened) return; opened = now;
    if (now) { focus = 1; poll().then(paintFull); paintFull(); }
    paintMini();
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  paintTile();
})();
