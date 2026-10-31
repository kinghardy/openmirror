// YouTube Shorts channel: starts the vertical Shorts feed in its own full-screen window (proxy.py -> launch-youtube.sh), hands the controller over
// to it while it runs, and comes back to the Wii menu when it closes (hold Xbox, or Xbox menu > Back to Dashboard).
(() => {
  const panel = document.getElementById('app-youtube'), root = document.getElementById('yt-root');
  if (!panel || !root) return;
  const css = document.createElement('style');
  css.textContent = `
#app-youtube { padding:56px 46px 40px; background:radial-gradient(120% 70% at 50% 0%, #3b0d14 0%, #0b0f16 62%); color:#e8edf3; }
#yt-root { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:34px; text-align:center; }
#yt-root .ic { line-height:0; animation:ytBob 1.6s ease-in-out infinite alternate; filter:drop-shadow(0 18px 30px rgba(255,0,0,.35)); }
@keyframes ytBob { to { transform:translateY(-16px) scale(1.04); } }
#yt-root .t { font-size:64px; font-weight:800; }
#yt-root .s { font-size:34px; font-weight:600; color:#b6a9ad; line-height:1.45; }
#yt-root .tips { margin-top:30px; display:flex; flex-direction:column; gap:22px; font-size:32px; font-weight:700; color:#d6cfd2; }
#yt-root .tips span { display:inline-flex; align-items:center; justify-content:center; gap:12px; }
#yt-root .err { color:#ff8a80; }`;
  document.head.appendChild(css);
  const k = b => `<i class="pg-k">${b}</i>`;
  const LOGO = '<svg viewBox="0 0 92 66" width="260" height="187"><rect width="92" height="66" rx="18" fill="#ff0000"/><path d="M37 19v28l24-14z" fill="#fff"/></svg>';
  const TIPS = `<div class="tips"><span>${k('▲')} ${k('▼')} Previous / Next &nbsp;&nbsp; ${k('A')} Play / Pause</span>
    <span>${k('B')} Exit &nbsp;&nbsp; ${k('LB')} ${k('RB')} Volume</span>
    <span>Tap ${k('Xbox')} for the menu &nbsp;·&nbsp; hold it to go home</span></div>`;
  let watch = null, mode = 'idle';
  const show = (title, sub, extra = '') => root.innerHTML = `<div class="ic">${LOGO}</div><div class="t">${title}</div><div class="s">${sub}</div>${extra}`;
  function close() {
    mode = 'idle';
    document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active'));
    if (typeof activeApp !== 'undefined') activeApp = null;
  }
  function back(msg) {
    clearInterval(watch); watch = null;
    window.MirrorExternal = false; mode = 'idle';
    if (window.MirrorIdle) { MirrorIdle.last = MirrorIdle.wokeAt = performance.now() + 900; }   // swallow the press that closed it
    if (msg) { mode = 'run'; show('Couldn’t start', `<span class="err">${msg}</span>`); setTimeout(close, 4500); } else close();
  }
  async function launch() {
    mode = 'run'; show('Starting Shorts…', window.mirrorQuiet && window.mirrorQuiet() ? '🔇 Music is playing, so Shorts stays silent' : 'One moment', TIPS);
    window.MirrorExternal = true;                  // from now on the controller belongs to YouTube
    try {
      const r = await fetch('/launch/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    } catch (e) { return back(String(e.message || e)); }
    let seen = false; const t0 = Date.now();
    watch = setInterval(async () => {
      try {
        const st = await (await fetch('/launch/status')).json();
        if (st.youtube) seen = true;
        else if (seen || Date.now() - t0 > 20000) back(seen ? '' : 'It exited right away; see /tmp/mirror-youtube.log');
      } catch (e) {}
    }, 1500);
  }
  let was = panel.classList.contains('active');
  new MutationObserver(() => {
    const now = panel.classList.contains('active'); if (now === was) return; was = now;
    if (now && !window.MirrorExternal) launch(); else if (!now && mode === 'run' && !watch) mode = 'idle';
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
