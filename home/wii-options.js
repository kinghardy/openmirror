(() => {
  // Debug overlay: last few back/select keys and which overlay was active. Toggled from Wii Options.
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:rgba(0,0,0,.85);color:#0f0;font:16px monospace;padding:6px;pointer-events:none;white-space:pre';
  d.id = 'ha-dbg';
  try { d.style.display = localStorage.getItem('haDbg') === '1' ? 'block' : 'none'; } catch (_) { d.style.display = 'none'; }
  document.body.appendChild(d);
  const log = [];
  const ovName = () => { const a = document.querySelector('.app-overlay.active'); return a ? a.id : 'none'; };
  window.addEventListener('keydown', e => {
    if (!['Escape', 'Backspace', 'b', 'B', 'Enter'].includes(e.key)) return;
    const pre = ovName();
    setTimeout(() => {
      log.push(e.key + ' | ' + pre + ' -> ' + ovName());
      if (log.length > 6) log.shift();
      d.textContent = log.join('\n');
    }, 50);
  }, true);

  // Wii Options channel: the mirror's own switches (intro, theme, sounds, party, karaoke, debug) and the way into Settings. Styled by home/menus.css.
  const tile = [...document.querySelectorAll('.channel-tile')].find(t => /wii options/i.test(t.textContent));
  let ov = tile && document.getElementById('app-' + tile.dataset.app);
  if (tile && !ov) { ov = document.createElement('div'); ov.className = 'app-overlay'; ov.id = 'app-' + tile.dataset.app; document.body.appendChild(ov); }
  if (!ov) return;
  ov.classList.add('om-page');
  const isOn = () => { try { return localStorage.getItem('haDbg') === '1'; } catch (_) { return false; } };
  const onOff = v => ({ text: v ? 'On' : 'Off', cls: v ? 'on' : 'off' });
  const themeName = () => { const T = window.OpenMirrorThemes || {}, m = T.mode || 'auto', nm = id => ((T.themes || []).find(t => t.id === id) || {}).name || id; return m === 'auto' ? 'Auto · ' + nm(T.current) : nm(m); };
  const items = [
    { ic: '🎬', t: 'Replay intro', d: 'The Wii Mirror boot animation and music', run: () => {
        document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active')); activeApp = null;   // back to the Wii menu, then play
        setTimeout(() => window.playIntro && window.playIntro(), 350); } },
    ...(window.OM_PROMO ? [{ ic: '🎥', t: 'Play the Wii Mirror 1.0 movie', d: 'Three minutes on everything this mirror does (B exits)', run: () => { location.href = '/promo.html'; } }] : []),
    { ic: '⚙️', t: 'Settings', d: 'Devices, keys, Wi-Fi and channels, without a terminal', go: true, run: () => { if (window.OpenMirrorSettings) window.OpenMirrorSettings.open(); } },
    { ic: '🎨', t: 'Theme', d: 'Auto follows the calendar; A tries the next one', v: () => ({ text: themeName(), cls: '' }), run: async () => {
        const T = window.OpenMirrorThemes; if (!T) return; const order = ['auto'].concat(T.themes.map(t => t.id)), next = order[(order.indexOf(T.mode) + 1) % order.length];
        try { await fetch('/theme/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: next }) }); await T.reload(); } catch (_) {} } },
    { ic: '🔇', t: 'Quiet while music plays', d: 'Clicks, YouTube and games stay silent while the Sonos plays', v: () => onOff(window.mirrorQuietOn && window.mirrorQuietOn()), run: () => {
        const v = !(window.mirrorQuietOn && window.mirrorQuietOn()); if (window.mirrorQuietSet) window.mirrorQuietSet(v); } },
    { ic: '🎉', t: 'Party mode', d: 'Everyone’s picks join one queue that keeps playing', v: () => onOff(window.PartyMode && PartyMode.on()), run: () => {
        if (window.PartyMode) PartyMode.set(!PartyMode.on()); } },
    { ic: '🎤', t: 'Karaoke lyrics', d: 'Timed lyrics on the player (X in the player switches them)', v: () => {
        const l = window.Karaoke ? Karaoke.label() : 'OFF'; return l === 'ON' ? onOff(true) : l === 'OFF' ? onOff(false) : { text: 'Auto', cls: '' }; }, run: () => { if (window.Karaoke) Karaoke.cycle(); } },
    { ic: '🐞', t: 'Debug overlay', d: 'Shows the last few button presses on screen', v: () => onOff(isOn()), run: () => {
        const v = !isOn(); try { localStorage.setItem('haDbg', v ? '1' : '0'); } catch (_) {}
        d.style.display = v ? 'block' : 'none'; playWiiSound(v ? 880 : 400, 'sine', .1); } },
  ];
  ov.innerHTML = '<div class="om-kicker">Wii Mirror</div><h1 class="om-h1">Options</h1><div class="om-list" id="wo-list"></div>'
    + '<div class="om-foot"><div class="wo-brand">Wii<span>MIRROR</span><small>Created by Alex · Open source</small></div>'
    + '<div class="om-legend"><span><b>▲▼</b>Choose</span><span><b>A</b>Select</span><span><b>B</b>Back</span></div></div>';
  const st = document.createElement('style');
  st.textContent = '.wo-brand { font:800 54px/1 -apple-system,"Segoe UI",Roboto,sans-serif; letter-spacing:-2px; color:rgba(255,255,255,.22); text-align:center; }'
    + '.wo-brand span { font-size:18px; letter-spacing:5px; background:rgba(255,255,255,.14); color:rgba(255,255,255,.6); padding:4px 12px; border-radius:10px; margin-left:10px; vertical-align:12px; }'
    + '.wo-brand small { display:block; margin-top:12px; font-size:18px; font-weight:700; letter-spacing:.3em; text-transform:uppercase; color:#59607c; }';
  document.head.appendChild(st);
  const list = ov.querySelector('#wo-list');
  let sel = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paint = () => {
    list.innerHTML = items.map((it, i) => { const v = it.v && it.v();
      return `<div class="om-row${i === sel ? ' sel' : ''}"><div class="ic">${it.ic}</div><div class="tx"><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div>`
        + (v ? `<div class="om-v ${v.cls}">${esc(v.text)}</div>` : '') + (it.go ? '<div class="go">›</div>' : '') + '</div>'; }).join('');
  };
  paint();
  // The menu only reacts once it has been open for a moment: the A press that opens it is dispatched from a script, so it can reach
  // this handler (while the screen is already 'active') before any observer has had a chance to note the opening.
  let armed = false, was = false, armT = null;
  new MutationObserver(() => {
    const now = ov.classList.contains('active'); if (now === was) return; was = now;
    clearTimeout(armT); armed = false;
    if (now) { sel = 0; paint(); armT = setTimeout(() => { armed = true; }, 700); }
  }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('keydown', e => {
    if (!ov.classList.contains('active') || !['Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.stopImmediatePropagation();
    if (!armed || e.repeat) return;
    if (e.key === 'Enter') { Promise.resolve(items[sel].run()).then(paint, paint); paint(); return; }   // (again once the theme switch has finished)
    sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); playWiiSound(520, 'sine', .05);
  }, true);
})();
