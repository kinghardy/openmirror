(() => {
  // Retro channel: choose Arcade or Pinball (both are ES-DE; Pinball opens on the Visual Pinball X list), ask proxy.py to start it, hand the
  // controller to the game while it runs, and come back to the Wii menu when it quits.
  const panel = document.getElementById('app-arcade'), root = document.getElementById('ar-root');
  const k = (b, cls) => `<i class="pg-k ${cls || ''}">${b}</i>`;
  const PIN_SVG = '<svg viewBox="0 0 120 120" width="150" height="150"><rect x="26" y="6" width="68" height="108" rx="30" fill="none" stroke="currentColor" stroke-width="7"/><circle cx="60" cy="38" r="9" fill="currentColor"/><circle cx="42" cy="58" r="6" fill="currentColor"/><circle cx="78" cy="58" r="6" fill="currentColor"/><path d="M36 92 L56 100 M84 92 L64 100" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="80" r="6" fill="#fff"/></svg>';
  const CHOICES = [
    { id: 'arcade', cls: '', ic: '🕹️', t: 'Arcade Games', s: 'NES · Game Boy Advance · Arcade classics', n: 'EmulationStation',
      tips: `<span>In a game: ${k('View')} + ${k('Start')} back to the game list</span><span>Hold ${k('Xbox')} to go home</span>` },
    { id: 'pinball', cls: 'pin', ic: PIN_SVG, t: 'Pinball', s: 'Visual Pinball X · real pinball tables', n: 'Visual Pinball X',
      tips: `<span>In a table: hold ${k('View')} + ${k('Start')} to leave it</span><span>Hold ${k('Xbox')} to go home</span>` },

    { id: 'party', cls: 'party', ic: '👑', get t() { return OM_BRAND.games; }, get s() { return OM_BRAND.slots + ' and more, made for the mirror'; }, n: 'Built for the mirror',
      tips: '' },
  ];
  let watch = null, sel = 0, mode = 'idle', info = { pinball: { ready: false } }, note = '';
  const show = (title, sub, extra = '') => root.innerHTML = `<div class="ic">${CHOICES.find(c => c.id === (mode === 'run' ? runKind : 'arcade')).ic}</div><div class="t">${title}</div><div class="s">${sub}</div>${extra}`;
  let runKind = 'arcade';

  async function refresh() {
    try { info = await (await fetch('/launch/status')).json(); } catch (e) {}
  }
  function choose() {
    mode = 'choose'; note = '';
    paint(); refresh().then(() => { if (mode === 'choose') paint(); });
  }
  function paint() {
    const pin = info.pinball || {};
    root.innerHTML = `<div class="ar-head">RETRO ARCADE</div><div class="ar-sub">What do you want to play?</div>
      <div class="ar-cards">${CHOICES.map((c, i) => {
        const warn = c.id === 'pinball' && !pin.ready;
        return `<div class="ar-card ${c.cls} ${i === sel ? 'on' : ''}" data-i="${i}"><div class="ci">${c.ic}</div>
          <div><div class="ct">${c.t}</div><div class="cs">${c.s}</div><span class="cn ${warn ? 'warn' : ''}">${warn ? (pin.tables === 0 ? 'Add tables' : 'Setup needed') : c.n + (c.id === 'pinball' && pin.tables ? ' · ' + pin.tables + ' table' + (pin.tables > 1 ? 's' : '') : '')}</span></div></div>`;
      }).join('')}</div>
      <div class="ar-note">${note}</div>
      <div class="ar-legend"><span>${k('▲▼')} Choose</span><span>${k('A', 'a')} Play</span><span>${k('B', 'b')} Back</span></div>`;
    root.querySelectorAll('.ar-card').forEach(el => el.addEventListener('click', () => { sel = +el.dataset.i; paint(); pick(); }));
  }
  function back(msg) {
    clearInterval(watch); watch = null;
    window.MirrorExternal = false; mode = 'idle';
    if (window.MirrorIdle) { MirrorIdle.last = MirrorIdle.wokeAt = performance.now() + 900; }   // swallow the press that quit the game
    if (msg) { mode = 'run'; show('Couldn’t start', `<span class="err">${msg}</span>`); setTimeout(close, 4500); } else close();
  }
  function close() {
    mode = 'idle';
    document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active'));
    activeApp = null;
  }
  async function pick() {
    const c = CHOICES[sel];
    if (c.id === 'party') { if (window.HardyGames && HardyGames.open) HardyGames.open(); return; }
    if (c.id === 'pinball' && !(info.pinball || {}).ready) { note = (info.pinball || {}).why || 'Pinball isn’t set up yet'; return paint(); }
    await launch(c);
  }
  async function launch(c) {
    mode = 'run'; runKind = c.id;
    show(c.id === 'pinball' ? 'Starting Pinball…' : 'Starting EmulationStation…', 'One moment', `<div class="tips">${c.tips}</div>`);
    window.MirrorExternal = true;   // from now on the controller belongs to the game
    try {
      const r = await fetch('/launch/' + c.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    } catch (e) { return back(String(e.message || e)); }
    let seen = false, t0 = Date.now();
    watch = setInterval(async () => {
      try {
        const st = await (await fetch('/launch/status')).json();
        if (st.running) seen = true;
        else if (seen || Date.now() - t0 > 15000) back(seen ? '' : 'It exited right away; see /tmp/mirror-arcade.log');
      } catch (e) {}
    }, 1500);
  }
  window.addEventListener('keydown', e => {
    if (mode !== 'choose' || window.MirrorExternal || !panel.classList.contains('active')) return;
    if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { sel = (sel + CHOICES.length - 1) % CHOICES.length; note = ''; paint(); playWiiSound?.(520, 'sine', 0.05); }
    else if (['ArrowDown', 'ArrowRight'].includes(e.key)) { sel = (sel + 1) % CHOICES.length; note = ''; paint(); playWiiSound?.(520, 'sine', 0.05); }
    else if (e.key === 'Enter' || e.key === ' ') pick();
  });
  let was = panel.classList.contains('active');
  new MutationObserver(() => {
    const now = panel.classList.contains('active'); if (now === was) return; was = now;
    if (now && !window.MirrorExternal) choose(); else if (!now && mode === 'choose') mode = 'idle';
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
