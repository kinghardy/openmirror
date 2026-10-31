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

  // Wii Options channel: debug overlay toggle
  const tile = [...document.querySelectorAll('.channel-tile')].find(t => /wii options/i.test(t.textContent));
  let ov = tile && document.getElementById('app-' + tile.dataset.app);
  if (tile && !ov) {
    ov = document.createElement('div'); ov.className = 'app-overlay'; ov.id = 'app-' + tile.dataset.app;
    ov.innerHTML = '<h2 style="text-align:center;font-size:44px;margin:90px 0 30px;color:#4a5a6a">⚙️ Wii Options</h2>'
      + '<div style="position:absolute;bottom:40px;left:0;right:0;text-align:center;font-size:24px;color:#6b7b8b">▲▼ Choose &nbsp;&nbsp; A Select &nbsp;&nbsp; B Wii Menu</div>';
    document.body.appendChild(ov);
  }
  if (!ov) return;
  const isOn = () => { try { return localStorage.getItem('haDbg') === '1'; } catch (_) { return false; } };
  const items = [
    { label: () => '🎬  Replay Intro', hint: 'Plays the Wii Mirror boot animation and music', run: () => {
        document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active')); activeApp = null;   // back to the Wii menu, then play
        setTimeout(() => window.playIntro && window.playIntro(), 350); } },
    ...(window.OM_PROMO ? [{ label: () => '🎥  Play the Wii Mirror 1.0 movie', hint: 'The 3-minute film about everything this mirror does (B exits)', run: () => { location.href = '/promo.html'; } }] : []),
    { label: () => '⚙️  Settings', hint: 'Devices, API keys, Wi-Fi and theme: set up the mirror without a terminal', run: () => { if (window.OpenMirrorSettings) window.OpenMirrorSettings.open(); } },
    { label: () => '🎨  Theme: ' + (() => { const T = window.OpenMirrorThemes || {}, m = T.mode || 'auto', nm = id => ((T.themes || []).find(t => t.id === id) || {}).name || id; return m === 'auto' ? 'Auto (now: ' + nm(T.current) + ')' : nm(m); })(), hint: 'Auto switches by date (Halloween Oct 24-31); press A to try each theme', run: async () => {
        const T = window.OpenMirrorThemes; if (!T) return; const order = ['auto'].concat(T.themes.map(t => t.id)), next = order[(order.indexOf(T.mode) + 1) % order.length];
        try { await fetch('/theme/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: next }) }); await T.reload(); } catch (_) {} } },
    { label: () => '🔇  Quiet while music plays: ' + (window.mirrorQuietOn && window.mirrorQuietOn() ? 'ON' : 'OFF'), hint: 'The mirror’s own sounds (clicks, YouTube, games) stay off while the Sonos plays', run: () => {
        const v = !(window.mirrorQuietOn && window.mirrorQuietOn()); if (window.mirrorQuietSet) window.mirrorQuietSet(v); } },
    { label: () => '🎉  Party mode: ' + (window.PartyMode && PartyMode.on() ? 'ON' : 'OFF'), hint: 'Songs keep playing: everyone’s picks join one queue (off: a pick plays, then stops)', run: () => {
        if (window.PartyMode) PartyMode.set(!PartyMode.on()); } },
    { label: () => '🎤  Karaoke lyrics: ' + (window.Karaoke ? Karaoke.label() : 'OFF'), hint: 'Timed lyrics on the player (X in the player switches it)', run: () => { if (window.Karaoke) Karaoke.cycle(); } },
    { label: () => 'Debug Overlay: ' + (isOn() ? 'ON' : 'OFF'), hint: 'Shows the last few button presses on screen', run: () => {
        const v = !isOn(); try { localStorage.setItem('haDbg', v ? '1' : '0'); } catch (_) {}
        d.style.display = v ? 'block' : 'none'; playWiiSound(v ? 880 : 400, 'sine', .1); } },
  ];
  // watermark shown on this screen only
  const wm = document.createElement('div');
  wm.style.cssText = 'position:absolute;left:0;right:0;bottom:150px;text-align:center;pointer-events:none;user-select:none;opacity:.55;z-index:5';
  wm.innerHTML = '<div style="font:800 96px/1 -apple-system,\'Segoe UI\',Roboto,sans-serif;letter-spacing:-3px;color:#0099ff">Wii<span style="font-size:30px;letter-spacing:5px;background:#0099ff;color:#fff;padding:5px 16px;border-radius:16px;margin-left:12px;vertical-align:18px">MIRROR</span></div>'
    + '<div style="font:700 28px -apple-system,\'Segoe UI\',Roboto,sans-serif;letter-spacing:.14em;color:#5d7690;margin-top:12px;text-transform:uppercase">Created by Alex</div>'
    + '<div style="font:600 22px -apple-system,\'Segoe UI\',Roboto,sans-serif;letter-spacing:.3em;color:#8aa0b6;margin-top:8px;text-transform:uppercase">Open Source</div>';
  ov.appendChild(wm);
  let sel = 0;
  const list = document.createElement('div'); list.style.cssText = 'margin:40px auto 0;width:84%;display:flex;flex-direction:column;gap:24px';
  ov.appendChild(list);
  const paint = () => {
    list.innerHTML = items.map((it, i) => `<div style="padding:28px 36px;border-radius:28px;background:#fff;color:#4a5a6a;border:5px solid ${i === sel ? '#00aaff' : '#d0d7e2'};box-shadow:${i === sel ? '0 0 0 8px rgba(0,170,255,.3),' : ''}0 6px 16px rgba(0,0,0,.1);transform:scale(${i === sel ? 1.02 : 1});transition:all .15s">`
      + `<div style="font-size:36px;font-weight:800">${it.label()}</div><div style="font-size:23px;color:#778899;margin-top:6px">${it.hint}</div></div>`).join('');
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
    if (e.key === 'Enter') { items[sel].run(); paint(); return; }
    sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paint(); playWiiSound(520, 'sine', .05);
  }, true);
})();
