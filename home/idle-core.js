    // Screensaver wake + idle tracking. Registered before the page's key handler so the press that
    // wakes the screensaver is swallowed instead of also acting on the screen underneath.
    window.MirrorIdle = { last: performance.now(), wokeAt: 0, saver: null };
    // tap the Xbox button (proxy.py watches it: the browser can't see it over bluetooth) -> the Xbox menu: music controls, volume, screensaver.
    // Same idea as the menu pad_quit.py draws during games; this one is for the dashboard and every channel on it, the music app included.
    (function () {
      const css = document.createElement('style');
      css.textContent = `#xm { position:fixed; inset:0; z-index:6000; display:none; align-items:center; justify-content:center; background:rgba(4,4,10,.82); backdrop-filter:blur(18px); font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#fff; }
#xm.on { display:flex; }
#xm .card { width:940px; background:rgba(24,24,36,.96); border:2px solid rgba(255,255,255,.16); border-radius:44px; padding:44px 44px 36px; box-shadow:0 40px 100px rgba(0,0,0,.7); }
#xm .hd { display:flex; align-items:center; gap:30px; }
#xm .hd img, #xm .hd .ph { width:190px; height:190px; border-radius:26px; object-fit:cover; background:rgba(255,255,255,.1); flex:none; display:flex; align-items:center; justify-content:center; font-size:90px; color:rgba(255,255,255,.3); }
#xm .hd .t { font-size:46px; font-weight:800; line-height:1.1; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
#xm .hd .a { margin-top:8px; font-size:32px; font-weight:600; color:rgba(255,255,255,.65); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#xm .hd .x { min-width:0; flex:1; }
#xm .row { margin-top:22px; border-radius:30px; border:3px solid transparent; padding:20px 26px; font-size:40px; font-weight:800; display:flex; align-items:center; gap:24px; background:rgba(255,255,255,.07); }
#xm .row.on { background:rgba(255,255,255,.16); border-color:#fff; box-shadow:0 0 0 7px rgba(255,255,255,.14); }
#xm .tr { justify-content:center; gap:34px; background:none; }
#xm .tr .b { width:150px; height:150px; border-radius:50%; background:rgba(255,255,255,.12); border:3px solid rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; font-size:60px; }
#xm .tr .b.big { width:180px; height:180px; font-size:76px; background:rgba(255,255,255,.2); }
#xm .tr .b.on { background:#fff; color:#12101c; transform:scale(1.14); box-shadow:0 0 0 9px rgba(255,255,255,.25); }
#xm .tr.on { border-color:transparent; box-shadow:none; background:none; }
#xm .vol .bar { flex:1; height:16px; border-radius:8px; background:rgba(255,255,255,.2); overflow:hidden; } #xm .vol .bar i { display:block; height:100%; background:#fff; border-radius:8px; }
#xm .vol b { width:80px; text-align:right; font-variant-numeric:tabular-nums; }
#xm .leg { margin-top:26px; display:flex; justify-content:center; gap:34px; font-size:25px; font-weight:600; color:rgba(255,255,255,.55); }
#xm .leg b { background:rgba(255,255,255,.16); color:#fff; border-radius:10px; padding:2px 14px; margin-right:8px; }`;
      document.head.appendChild(css);
      const el = document.createElement('div'); el.id = 'xm'; document.body.appendChild(el);
      let open = false, row = 0, col = 1, vol = null, volT = null, last = 0, n = null, rn = null;
      const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Enter', b: 'Escape', back: 'Backspace', start: 'Tab' };
      const fire = key => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      function remoteDo(c) {
        const I = window.MirrorIdle, sv = I.saver;
        if (c.cmd === 'on') { if (!sv.active) sv.show(); }
        else if (c.cmd === 'off') { if (sv.active) { sv.hide(); I.wokeAt = performance.now(); I.last = performance.now(); } }
        else if (c.cmd === 'home') { sv.home(); I.last = performance.now(); }
        else if (c.cmd === 'next' || c.cmd === 'prev') { if (!sv.active) sv.show(); else sv.nav(c.cmd === 'next' ? 1 : -1); }
        else if (c.cmd === 'text') { if (window.MusicLib && MusicLib.isOpen()) [...c.text].forEach(ch => fire(ch.toLowerCase())); }
        else if (c.cmd === 'key') {
          I.last = performance.now();
          if (c.key === 'xbox') { if (sv.active) { sv.hide(); I.wokeAt = performance.now(); } else if (open) hide(); else show(); }
          else if (c.key === 'x' || c.key === 'y') { if (window.MirrorPadKey) MirrorPadKey(c.key); else fire(c.key); }
          else fire(KEY[c.key]);
        }
      }
      const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const sonos = (c, body) => fetch('/sonos/' + c, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {});
      const np = () => (window.mirrorNow && window.mirrorNow()) || {};
      function paint() {
        const p = np(), ok = p.ok && p.title, v = vol != null ? vol : (p.volume || 0), play = p.state === 'playing';
        el.innerHTML = `<div class="card"><div class="hd">${ok && p.art ? `<img src="${esc(p.art)}" alt="">` : '<div class="ph">♪</div>'}<div class="x"><div class="t">${ok ? esc(p.title) : 'Nothing playing'}</div><div class="a">${ok ? esc(p.artist) : 'Sonos Era 300'}</div></div></div>
          <div class="row tr${row === 0 ? ' on' : ''}"><div class="b${row === 0 && col === 0 ? ' on' : ''}">⏮</div><div class="b big${row === 0 && col === 1 ? ' on' : ''}">${play ? '⏸' : '▶'}</div><div class="b${row === 0 && col === 2 ? ' on' : ''}">⏭</div></div>
          <div class="row vol${row === 1 ? ' on' : ''}">🔊<div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>
          <div class="row${row === 2 ? ' on' : ''}">🖼️ Screensaver</div>
          <div class="row${row === 3 ? ' on' : ''}">😴 Deep sleep <span style="font-size:26px;font-weight:600;color:rgba(255,255,255,.55)">screen off · any button wakes it</span></div>
          <div class="row${row === 4 ? ' on' : ''}">✕ Close</div>
          <div class="leg"><span><b>▲▼</b>Move</span><span><b>◀▶</b>${row === 1 ? 'Volume' : 'Pick'}</span><span><b>A</b>Select</span><span><b>B</b>Close</span></div></div>`;
      }
      function show() { if (open) return; open = true; row = 0; col = 1; vol = null; last = performance.now(); el.classList.add('on'); paint(); }
      function hide() { open = false; el.classList.remove('on'); }
      function act() {
        if (row === 0) { sonos(['prev', 'toggle', 'next'][col]); if (col === 1) { const p = np(); p.state = p.state === 'playing' ? 'paused' : 'playing'; paint(); } }
        else if (row === 2) { hide(); const I = window.MirrorIdle; if (I && I.saver) I.saver.show(); }
        else if (row === 3) { hide(); if (window.MirrorSleep) MirrorSleep.enter(); }
        else if (row === 4) hide();
      }
      function key(k) {
        if (k === 'ArrowUp') row = Math.max(0, row - 1); else if (k === 'ArrowDown') row = Math.min(4, row + 1);
        else if (k === 'ArrowLeft' || k === 'ArrowRight') {
          const d = k === 'ArrowRight' ? 1 : -1;
          if (row === 0) col = Math.max(0, Math.min(2, col + d));
          else if (row === 1) { vol = Math.max(0, Math.min(100, (vol != null ? vol : (np().volume || 0)) + 5 * d)); clearTimeout(volT); volT = setTimeout(() => sonos('volume', { volume: vol }), 150); }
        } else if (k === 'Enter' || k === ' ') return act();
        paint();
      }
      window.addEventListener('keydown', e => {
        if (!open) return;
        last = performance.now(); e.stopImmediatePropagation(); e.preventDefault();
        if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(e.key)) return;
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key.toLowerCase() === 'b') return hide();
        key(e.key);
      }, true);
      setInterval(() => { if (open) { if (performance.now() - last > 60e3) hide(); else paint(); } }, 1000);
      setInterval(async () => {
        try {
          const j = await (await fetch('/mirror/xbox')).json(), I = window.MirrorIdle;
          if (n !== null && j.n !== n && j.age < 3 && !window.MirrorExternal) {
            if (I.saver && I.saver.active) { I.saver.hide(); I.wokeAt = performance.now(); }      // a tap wakes the screensaver like any other button
            else if (open) hide(); else show();
          }
          n = j.n;
          if (j.build) { if (window.MirrorBuild && window.MirrorBuild !== j.build && !window.MirrorExternal && performance.now() - I.last > 20000) { location.reload(); return; } window.MirrorBuild = window.MirrorBuild || j.build; }      // a new version was deployed: reload once nobody is using it
          const R = j.r;                                              // the phone remote (an admin's phone): buttons and screensaver commands, in order
          if (R) {
            if (rn !== null && !window.MirrorExternal && I.saver && !window.MirrorAsleep) R.cmds.filter(c => c.id > rn).forEach(c => remoteDo(c));
            rn = R.n;
          }
        } catch (e) {}
      }, 300);
    })();

    // Deep sleep: black page, nothing animating, pollers throttled; proxy.py turns the HDMI output off and wakes it on any controller button.
    // Starts from the Xbox menu, or by itself after the screensaver has run SLEEP_MIN minutes with no music playing (Party mode keeps a song going, so it never gets there).
    (function () {
      const SLEEP_MIN = window.MirrorSleepMin || 45;
      const css = document.createElement('style');
      css.textContent = '#zz { position:fixed; inset:0; z-index:9999; background:#000; display:none; } body.zz #zz { display:block; } body.zz > *:not(#zz):not(script):not(style) { display:none !important; } body.zz * { animation:none !important; transition:none !important; }';
      document.head.appendChild(css);
      const z = document.createElement('div'); z.id = 'zz'; document.body.appendChild(z);
      // while asleep the pollers that still run get a 45 s old answer instead of hitting the speaker / Home Assistant every second
      const f = window.fetch.bind(window), cache = new Map();
      window.fetch = (u, o) => {
        if (!window.MirrorAsleep || typeof u !== 'string' || (o && o.method && o.method !== 'GET') || u.startsWith('/mirror/')) return f(u, o);
        const c = cache.get(u); if (c && Date.now() - c.t < 45000) return Promise.resolve(c.r.clone());
        return f(u, o).then(r => { cache.set(u, { t: Date.now(), r: r.clone() }); return r; });
      };
      const post = on => f('/mirror/sleep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).catch(() => {});
      let enteredAt = 0;
      function enter() {
        if (window.MirrorAsleep) return;
        enteredAt = performance.now();
        const I = window.MirrorIdle; if (I && I.saver) { if (I.saver.active) I.saver.hide(); I.saver.home(); }
        window.MirrorAsleep = true; document.body.classList.add('zz'); post(true);
      }
      function wake() {
        if (!window.MirrorAsleep) return;
        window.MirrorAsleep = false; document.body.classList.remove('zz');
        const I = window.MirrorIdle; if (I) { I.last = performance.now(); I.wokeAt = performance.now() + 500; }      // the press that woke it does nothing else
        cache.clear();
      }
      window.MirrorSleep = { enter, wake, get asleep() { return !!window.MirrorAsleep; } };
      // asleep: swallow every key (and ask the proxy to wake), and follow the proxy's state (it wakes on controller buttons the page can't see)
      window.addEventListener('keydown', e => { if (!window.MirrorAsleep) return; e.stopImmediatePropagation(); e.preventDefault(); post(false); }, true);
      setInterval(async () => {
        try {
          const j = await (await f('/mirror/sleep')).json();
          if (window.MirrorAsleep && !j.asleep && performance.now() - enteredAt > 3000) wake();
          else if (!window.MirrorAsleep && j.asleep) enter();      // told to sleep from elsewhere
        } catch (e) {}
      }, 1000);
      // the screensaver has been up long enough, nothing is playing: sleep
      setInterval(() => {
        const I = window.MirrorIdle, n = window.mirrorNow && window.mirrorNow();
        if (window.MirrorAsleep || window.MirrorExternal || !I || !I.saver || !I.saver.active) return;
        if (n && n.state === 'playing') return;                   // music (Party mode always has some) keeps the mirror up
        if (performance.now() - I.saver.shownAt > SLEEP_MIN * 60e3) enter();
      }, 30000);
    })();
    window.addEventListener('keydown', e => {
      const I = window.MirrorIdle, now = performance.now();
      I.last = now;
      if (window.MirrorExternal) { e.stopImmediatePropagation(); return; }   // ES-DE is running: input is for the games
      if (I.saver && I.saver.active) {
        e.stopImmediatePropagation(); const k = e.key.toLowerCase(), a = { arrowleft: -1, arrowup: -1, arrowright: 1, arrowdown: 1 }[k];
        if (a) { if (!e.repeat) I.saver.nav(a); return; }                                  // the d-pad steers the slides
        I.saver.hide(); I.wokeAt = now;
        if (k === 'x') { I.saver.home(); return; }                                         // X: the dashboard home
        if (k === 'y' && window.MusicSaver) MusicSaver.pick();                             // Y: the jukebox; anything else just wakes it
        return;
      }
      if (now - I.wokeAt < 600) e.stopImmediatePropagation();
    }, true);
  
