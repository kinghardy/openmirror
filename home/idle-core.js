    // Screensaver wake + idle tracking. Registered before the page's key handler so the press that
    // wakes the screensaver is swallowed instead of also acting on the screen underneath.
    window.MirrorIdle = { last: performance.now(), wokeAt: 0, saver: null };
    // tap the Xbox button (proxy.py watches it: the browser can't see it over bluetooth) -> the Xbox menu: music controls, volume, screensaver.
    // Same idea as the menu pad_quit.py draws during games; this one is for the dashboard and every channel on it, the music app included.
    (function () {
      const css = document.createElement('style');
      css.textContent = `#xm { position:fixed; inset:0; z-index:6000; display:none; align-items:center; justify-content:center; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#f3f5fb;
  background:radial-gradient(900px 700px at 50% 30%, color-mix(in srgb, var(--ui-accent) 18%, transparent), transparent 70%), rgba(5,6,11,.9); }
#xm.on { display:flex; animation:xmIn .22s ease-out; } @keyframes xmIn { from { opacity:0; transform:scale(.97) } }
#xm .card { width:940px; border-radius:50px; padding:40px 40px 34px; background:radial-gradient(700px 360px at 30% 0%, color-mix(in srgb, var(--ui-accent) 20%, transparent), transparent 75%), #0b0a14;
  border:1.5px solid rgba(255,255,255,.14); box-shadow:0 40px 100px rgba(0,0,0,.7); }
#xm .hd { display:flex; align-items:center; gap:30px; }
#xm .hd img, #xm .hd .ph { width:180px; height:180px; border-radius:30px; object-fit:cover; background:rgba(255,255,255,.08); flex:none; display:flex; align-items:center; justify-content:center; font-size:84px; color:rgba(255,255,255,.3);
  box-shadow:0 20px 50px rgba(0,0,0,.55), 0 0 60px color-mix(in srgb, var(--ui-accent) 35%, transparent); }
#xm .hd .x { min-width:0; flex:1; }
#xm .hd .t { margin-top:10px; font-size:44px; font-weight:800; line-height:1.1; letter-spacing:-.5px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
#xm .hd .a { margin-top:8px; font-size:30px; font-weight:600; color:var(--np-accent-soft, #cfd6ff); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#xm .tr { display:flex; justify-content:center; align-items:center; gap:40px; margin:34px 0 26px; }
#xm .tr .b { width:120px; height:120px; border-radius:50%; background:rgba(255,255,255,.1); border:2px solid rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; color:#fff; transition:transform .15s, background .15s, box-shadow .15s; }
#xm .tr .b svg { width:52px; height:52px; fill:currentColor; }
#xm .tr .b.big { width:150px; height:150px; background:rgba(255,255,255,.18); } #xm .tr .b.big svg { width:68px; height:68px; }
#xm .tr .b.on { background:#fff; color:#12101c; border-color:#fff; transform:scale(1.12); box-shadow:0 0 0 9px color-mix(in srgb, var(--ui-accent) 55%, transparent), 0 18px 44px rgba(0,0,0,.5); }
#xm .om-list { margin-top:0; gap:14px; }
#xm .om-row { padding:16px 28px 16px 16px; }
#xm .om-row .ic { width:68px; height:68px; font-size:38px; border-radius:20px; }
#xm .vol .bar { flex:1; height:14px; border-radius:7px; background:rgba(255,255,255,.16); overflow:hidden; }
#xm .vol .bar i { display:block; height:100%; border-radius:7px; background:linear-gradient(90deg, var(--ui-accent), #fff); }
#xm .vol b { width:70px; text-align:right; font-size:30px; font-weight:800; font-variant-numeric:tabular-nums; }
#xm .om-legend { margin-top:28px; }`;
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
      const ICO = {
        prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2.4v14H6zM20 5v14L9.6 12z"/></svg>', next: '<svg viewBox="0 0 24 24"><path d="M15.6 5H18v14h-2.4zM4 5l10.4 7L4 19z"/></svg>',
        play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>', pause: '<svg viewBox="0 0 24 24"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
        vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9zM15.5 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.4 5.6a9 9 0 0 1 0 12.8L17 17a7 7 0 0 0 0-10z"/></svg>' };
      function paint() {
        const p = np(), ok = p.ok && p.title, v = vol != null ? vol : (p.volume || 0), play = p.state === 'playing';
        const r = (i, ic, t, d) => `<div class="om-row${row === i ? ' sel' : ''}"><div class="ic">${ic}</div><div class="tx"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div></div>`;
        const h = `<div class="card"><div class="hd">${ok && p.art ? `<img src="${esc(p.art)}" alt="">` : '<div class="ph">♪</div>'}<div class="x"><div class="om-kicker">${ok ? (play ? 'Now playing' : 'Paused') : 'Music'}</div><div class="t">${ok ? esc(p.title) : 'Nothing playing'}</div><div class="a">${ok ? esc(p.artist) : 'Sonos Era 300'}</div></div></div>
          <div class="tr"><div class="b${row === 0 && col === 0 ? ' on' : ''}">${ICO.prev}</div><div class="b big${row === 0 && col === 1 ? ' on' : ''}">${play ? ICO.pause : ICO.play}</div><div class="b${row === 0 && col === 2 ? ' on' : ''}">${ICO.next}</div></div>
          <div class="om-list"><div class="om-row vol${row === 1 ? ' sel' : ''}"><div class="ic">${ICO.vol}</div><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>
          ${r(2, '🖼️', 'Screensaver', 'Posters, scores and the music wall')}${r(3, '😴', 'Deep sleep', 'Screen off · any button wakes it')}${r(4, '↩', 'Back to the mirror', '')}</div>
          <div class="om-legend"><span><b>▲▼</b>Move</span><span><b>◀▶</b>${row === 1 ? 'Volume' : 'Pick'}</span><span><b>A</b>Select</span><span><b>B</b>Close</span></div></div>`;
        if (h !== el._h) { el.innerHTML = h; el._h = h; }   // (it repaints every second while open: rebuilding unchanged rows would restart the focus glow)
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
  
