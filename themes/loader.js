/* OpenMirror theme loader: shared by the mirror and the phone app.
   Asks the server which themes exist, picks one (a chosen theme, or in "auto" the seasonal theme whose date window contains today in the
   viewer's own time zone, else the default), and applies it: a stylesheet, and on the mirror an optional script with start()/stop(). */
(function () {
  const PHONE = !!window.OM_PHONE;
  const key = d => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const inWindow = (w, d) => { if (!w) return false; const k = key(d); return w[0] <= w[1] ? (k >= w[0] && k <= w[1]) : (k >= w[0] || k <= w[1]); };
  let cur = null, active = null, last = null;
  function pick(j) {
    if (j.mode && j.mode !== 'auto') return j.themes.find(t => t.id === j.mode) || null;
    const now = new Date();
    return j.themes.find(t => inWindow(t.window, now)) || j.themes.find(t => t.id === j.default) || null;
  }
  function clear() {
    document.querySelectorAll('[data-om-theme]').forEach(e => e.remove());
    if (active && active.stop) { try { active.stop(); } catch (e) {} }
    active = null; window.OpenMirrorTheme = null; document.documentElement.removeAttribute('data-theme');
  }
  async function apply(force) {
    let j; try { j = await (await fetch('/theme/list', { cache: 'no-store' })).json(); } catch (e) { return; }
    last = j; API.mode = j.mode; API.themes = j.themes; API.current = null;
    const t = pick(j), id = t ? t.id : ''; API.current = id;
    if (id === cur && !force) return; cur = id; clear(); if (!t) return;
    document.documentElement.setAttribute('data-theme', id);
    const css = PHONE ? t.phone_css : t.css;
    if (css) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = css; l.setAttribute('data-om-theme', id); document.head.appendChild(l); }
    if (!PHONE && t.js) { const s = document.createElement('script'); s.src = t.js; s.setAttribute('data-om-theme', id); s.onload = () => { active = window.OpenMirrorTheme; if (active && active.start) { try { active.start(); } catch (e) {} } }; document.head.appendChild(s); }
  }
  const API = window.OpenMirrorThemes = { mode: 'auto', themes: [], current: '', reload: () => apply(true) };
  apply(); setInterval(apply, 600000); document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
})();
