// Karaoke lyrics: timed lyrics (proxy.py /music/lyrics, from LRCLIB) shown full screen over the Now Playing channel, in step with the song.
// Switch: X in the player, or Wii Options (Auto = on while Party mode is on). Uses the player's position (window.mirrorPos), so pause / skip / seek just work.
(() => {
  const overlay = document.getElementById('app-music');
  if (!overlay) return;
  const css = document.createElement('style');
  css.textContent = `
#kj { position:absolute; inset:0; z-index:3; display:none; flex-direction:column; background:#07060d; color:#fff; overflow:hidden;
  font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
#kj.on { display:flex; }
#kj .bg { position:absolute; inset:-120px; background:var(--kart) center/cover; filter:blur(80px) brightness(.45) saturate(1.7); }
#kj .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(7,6,13,.4),rgba(7,6,13,.82)); }
#kj .in { position:relative; flex:1; display:flex; flex-direction:column; padding:70px 56px 40px; min-height:0; }
#kj .hd { display:flex; align-items:center; gap:26px; }
#kj .hd img { width:120px; height:120px; border-radius:20px; object-fit:cover; box-shadow:0 10px 30px rgba(0,0,0,.5); }
#kj .hd .t { font-size:42px; font-weight:800; line-height:1.15; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
#kj .hd .a { font-size:30px; font-weight:600; color:var(--np-accent-soft,#ffb3c8); margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#kj .hd .x { flex:1; min-width:0; }
#kj .hd .tag { font-size:24px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; padding:8px 20px; border-radius:24px; background:rgba(255,255,255,.14); border:1.5px solid rgba(255,255,255,.22); white-space:nowrap; }
#kj .stage { flex:1; min-height:0; position:relative; overflow:hidden; margin-top:24px;
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%); mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%); }
#kj .col { position:absolute; left:0; right:0; top:0; transition:transform .45s cubic-bezier(.2,.8,.2,1); will-change:transform; }
#kj .ln { font-size:62px; font-weight:800; line-height:1.18; padding:20px 10px; text-align:center; color:rgba(255,255,255,.3); transform:scale(.9); transition:color .3s, transform .3s, text-shadow .3s; }
#kj .ln.past { color:rgba(255,255,255,.22); }
#kj .ln.cur { color:#fff; transform:scale(1.06); text-shadow:0 0 36px color-mix(in srgb, var(--np-accent,#ff5a8a) 70%, transparent); }
#kj .ln.nx { color:rgba(255,255,255,.5); }
#kj .plain { font-size:40px; font-weight:700; line-height:1.4; text-align:center; color:rgba(255,255,255,.85); white-space:pre-wrap; padding:0 10px; }
#kj .msg { position:absolute; inset:0; display:flex; flex-direction:column; gap:18px; align-items:center; justify-content:center; text-align:center; font-size:40px; font-weight:700; color:rgba(255,255,255,.6); padding:0 80px; }
#kj .msg .e { font-size:130px; opacity:.6; }
#kj .bar { height:10px; border-radius:5px; background:rgba(255,255,255,.18); overflow:hidden; margin-top:18px; }
#kj .bar i { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--np-accent,#ff5a8a),#fff); }
#kj .leg { display:flex; justify-content:center; gap:34px; margin-top:22px; font-size:26px; font-weight:600; color:rgba(255,255,255,.55); white-space:nowrap; }
#kj .leg b { color:#fff; background:rgba(255,255,255,.16); border-radius:10px; padding:2px 14px; margin-right:8px; font-weight:700; }
#kj .pz { position:absolute; right:56px; top:230px; font-size:30px; font-weight:800; letter-spacing:.14em; background:rgba(0,0,0,.55); border-radius:20px; padding:8px 22px; display:none; }
#kj.paused .pz { display:block; }
#kj .toast { position:absolute; left:50%; bottom:200px; translate:-50% 0; background:rgba(14,12,26,.95); border:2px solid rgba(255,255,255,.3); border-radius:26px; padding:20px 44px; font-size:36px; font-weight:800; opacity:0; pointer-events:none; transition:opacity .2s; }
#kj .toast.on { opacity:1; }`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.id = 'kj';
  el.innerHTML = `<div class="bg"></div><div class="shade"></div><div class="in">
    <div class="hd"><img id="kj-art" alt=""><div class="x"><div class="t" id="kj-t"></div><div class="a" id="kj-a"></div></div><div class="tag">🎤 Karaoke</div></div>
    <div class="stage" id="kj-stage"><div class="col" id="kj-col"></div></div>
    <div class="bar"><i id="kj-fill"></i></div>
    <div class="leg"><span><b>A</b>Play / Pause</span><span><b>X</b>Lyrics off</span><span><b>Y</b>Find music</span><span><b>B</b>Back</span></div></div>
    <div class="pz">PAUSED</div><div class="toast" id="kj-toast"></div>`;
  overlay.appendChild(el);
  const $ = id => document.getElementById(id);
  const col = $('kj-col'), stage = $('kj-stage');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let pref = ''; try { pref = localStorage.getItem('karaoke') || ''; } catch (e) {}
  const party = () => !!(window.PartyMode && PartyMode.on());
  const effective = () => pref === 'on' || (pref !== 'off' && party());
  const setPref = v => { pref = v; try { localStorage.setItem('karaoke', v); } catch (e) {} };
  const np = () => (window.mirrorNow && window.mirrorNow()) || { ok: false };
  const libOpen = () => !!(window.MusicLib && MusicLib.isOpen());
  const playerOpen = () => overlay.classList.contains('active');

  let key = '', lines = [], plain = '', status = 'idle', curIdx = -2, toastT = null, shown = false;
  function toast(msg) { const t = $('kj-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); }

  function render() {
    curIdx = -2; col.style.transform = 'translateY(0)';
    const old = stage.querySelector('.msg'); if (old) old.remove();
    if (status === 'ok') { col.innerHTML = plain ? `<div class="plain">${esc(plain)}</div>` : lines.map((l, i) => `<div class="ln" data-i="${i}">${esc(l[1] || '♪')}</div>`).join(''); return; }
    col.innerHTML = '';
    stage.insertAdjacentHTML('beforeend', status === 'loading' ? '<div class="msg"><div class="e">🎤</div>Finding the lyrics…</div>'
      : '<div class="msg"><div class="e">🎤</div>No lyrics found for this one<br><span style="font-size:30px;font-weight:600">The music keeps playing</span></div>');
  }
  function load(n) {
    const k = n.artist + '|' + n.title; if (k === key) return;
    key = k; lines = []; plain = ''; status = 'loading'; render();
    fetch('/music/lyrics?' + new URLSearchParams({ artist: n.artist || '', title: n.title || '', dur: n.dur || '' })).then(r => r.json()).then(d => {
      if (key !== k) return;
      lines = d.synced || []; plain = d.plain || ''; status = lines.length || plain ? 'ok' : 'none'; render();
    }).catch(() => { if (key === k) { status = 'none'; render(); } });
  }
  function place() {
    const n = np(), p = window.mirrorPos ? mirrorPos() : 0;
    $('kj-fill').style.width = n.dur ? Math.min(100, p / n.dur * 100) + '%' : '0';
    el.classList.toggle('paused', n.state !== 'playing');
    if (status !== 'ok') return;
    if (plain) { const over = Math.max(0, col.scrollHeight - stage.clientHeight + 200); col.style.transform = `translateY(${-over * (n.dur ? Math.min(1, p / n.dur) : 0)}px)`; return; }
    let i = -1; const t = p + 0.3;
    for (let j = 0; j < lines.length; j++) { if (lines[j][0] <= t) i = j; else break; }
    if (i === curIdx) return; curIdx = i;
    const kids = col.children;
    for (let j = 0; j < kids.length; j++) kids[j].className = 'ln' + (j === i ? ' cur' : j < i ? ' past' : j <= i + 2 ? ' nx' : '');
    const c = i >= 0 ? kids[i] : kids[0];
    if (c) col.style.transform = `translateY(${stage.clientHeight / 2 - (c.offsetTop + c.offsetHeight / 2)}px)`;
  }
  function tick() {
    const n = np(), want = effective() && playerOpen() && !libOpen() && n.ok && n.title;
    if (want !== shown) { shown = want; el.classList.toggle('on', !!want); if (want) { key = ''; curIdx = -2; } }
    if (!want) return;
    if (el.dataset.k !== n.title + n.art) { el.dataset.k = n.title + n.art; $('kj-t').textContent = n.title; $('kj-a').textContent = n.artist; $('kj-art').src = n.art || ''; el.style.setProperty('--kart', n.art ? `url("${n.art}")` : 'none'); }
    load(n); place();
  }
  setInterval(tick, 200);

  const toggle = () => { const on = effective(); setPref(on ? 'off' : 'on'); toast(on ? 'Lyrics off' : '🎤 Karaoke lyrics on'); tick(); };
  window.Karaoke = {
    toggle,
    label: () => pref === '' ? 'AUTO (on in Party mode)' : pref === 'on' ? 'ON' : 'OFF',
    cycle: () => { setPref(pref === '' ? 'on' : pref === 'on' ? 'off' : ''); tick(); }
  };
  window.addEventListener('keydown', e => {
    if ((e.key === 'x' || e.key === 'X') && !e.repeat && playerOpen() && !libOpen() && !window.MirrorExternal && np().ok && np().title) toggle();
  });
  let was = false;
  (function pad() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    const d = !!(p && p.buttons[2] && p.buttons[2].pressed);
    if (d && !was && playerOpen() && !libOpen() && !window.MirrorExternal && np().ok && np().title) toggle();
    was = d; requestAnimationFrame(pad);
  })();
})();
