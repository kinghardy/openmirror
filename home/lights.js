(() => {
  const C = window.HA_CFG || {};
  const LIGHTS = C.lights || [], SCENES = C.scenes || [], FADE = C.fadeSec ?? 1.5, GUARD = 600;
  const panel = document.getElementById('app-lights'), root = document.getElementById('ha-root');
  const tile = document.querySelector('[data-app="lights"]');
  const tileSub = tile.querySelector('.channel-subtitle'), tileIco = tile.querySelector('.channel-icon');
  const pk = document.createElement('div'); pk.id = 'lt-pk'; panel.appendChild(pk);
  const BACK = ['Escape', 'Backspace', 'b', 'B'];
  const MINE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'y', 'Y'];
  const COLORS = [['Red', 0], ['Orange', 25], ['Amber', 40], ['Green', 120], ['Teal', 175], ['Blue', 225], ['Purple', 275], ['Pink', 320]];
  const WHITES = [[2200, 'Candle'], [2700, 'Warm'], [3500, 'Soft'], [4500, 'Neutral'], [5500, 'Day'], [6500, 'Cool']];
  const FX_ICON = { Candlelight: '🕯️', Fire: '🔥', Aurora: '🌌', 'Starry Sky': '✨', 'Dance Party': '🪩', Rainbow: '🌈' };

  const st = {};         // entity_id -> Home Assistant state
  const lag = {};        // entity_id -> last measured confirm time (ms) for sendLast lights
  const hold = {};       // entity_id -> { p, until }: brightness just set here; shown instead of polled state until HA catches up
  const sendT = {}, sentAt = {};   // entity_id -> pending brightness send / time of the last one
  let haOk = null;       // null until the first load; false when HA / the proxy can't be reached
  let F = { r: 0, c: 0 }, pick = null;
  let openedAt = 0, sawOpen = false, backAt = 0, active = null, busy = null, later = null, toastT = null;

  const isOpen = () => panel.classList.contains('active');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KC = { A: 'a', B: 'b', X: 'x', Y: 'y' };
  const key = (k, l) => `<span>${k.split(' ').map(x => `<i class="pg-k ${KC[x] || ''}">${x}</i>`).join('')}${l}</span>`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hover = () => playWiiSound(520, 'sine', .05), nope = () => playWiiSound(220, 'sawtooth', .1), ok = () => playWiiSound(660);
  const S = L => st[L.entity];
  const avail = L => !!S(L) && S(L).state !== 'unavailable';
  const isOn = L => avail(L) && S(L).state === 'on';
  const pct = L => isOn(L) && S(L).attributes.brightness ? Math.max(1, Math.round(S(L).attributes.brightness / 2.55)) : 0;

  // ---- colors for display ----
  const KT = [[2000, [255, 137, 14]], [2700, [255, 169, 87]], [3500, [255, 196, 137]], [4500, [255, 219, 186]], [5500, [255, 236, 224]], [6500, [255, 249, 253]], [9000, [214, 225, 255]]];
  function kcss(k) {
    let i = 1; while (i < KT.length - 1 && k > KT[i][0]) i++;
    const [k0, a] = KT[i - 1], [k1, b] = KT[i], t = Math.min(1, Math.max(0, (k - k0) / (k1 - k0)));
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * t)).join(',')})`;
  }
  const RAINBOW = 'conic-gradient(#ff4d4d,#ffd24d,#4dff88,#4dc3ff,#b84dff,#ff4d4d)';
  function setCss(v) {
    if (v === 'off') return '#39424d';
    if (v.effect) return RAINBOW;
    if (v.hs_color) return `hsl(${v.hs_color[0]},${v.hs_color[1]}%,55%)`;
    if (v.color_temp_kelvin) return kcss(v.color_temp_kelvin);
    if (v.rgb_color) return `rgb(${v.rgb_color.join(',')})`;
    return '#ffd24a';
  }
  function nowCss(L) {
    if (!avail(L)) return '#cfd6de';
    if (!isOn(L)) return '#39424d';
    const a = S(L).attributes;
    if (a.effect && a.effect !== 'off') return RAINBOW;
    return a.rgb_color ? `rgb(${a.rgb_color.join(',')})` : '#ffd24a';
  }
  function describe(L) {
    if (!S(L)) return haOk === false ? 'No data' : 'Loading…';
    if (!avail(L)) return 'Offline in Home Assistant';
    if (!isOn(L)) return 'Off';
    const a = S(L).attributes;
    const what = a.effect && a.effect !== 'off' ? a.effect : a.color_mode === 'color_temp' && a.color_temp_kelvin ? `${a.color_temp_kelvin} K white` : 'Color';
    return `On · ${what}` + (L.sendLast && lag[L.entity] ? ` · confirms in ${(lag[L.entity] / 1000).toFixed(1)} s` : '');
  }

  // ---- Home Assistant ----
  async function post(svc, body) {
    const r = await fetch('/ha/api/services/' + svc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status);
  }
  // one light command; resolves with how long HA took to confirm it
  async function cmd(L, v, fade = FADE) {
    const t0 = performance.now(), b = { entity_id: L.entity };
    if (v !== 'off') Object.assign(b, v);
    if (fade && !L.noFade) b.transition = fade;
    await post(v === 'off' ? 'light/turn_off' : 'light/turn_on', b);
    return performance.now() - t0;
  }
  async function load() {
    try {
      const r = await fetch('/ha/api/states'); if (!r.ok) throw 0;
      (await r.json()).forEach(s => st[s.entity_id] = s); haOk = true;
    } catch (e) { haOk = false; }
    applyHolds();
    paintTile();
    const sig = JSON.stringify([haOk, LIGHTS.map(L => S(L) && [S(L).state, S(L).attributes.brightness, S(L).attributes.rgb_color, S(L).attributes.effect])]);
    if (isOpen() && !pick && sig !== lastSig) render();   // only redraw when something changed
    lastSig = sig;
  }
  let lastSig = '';
  const setLocal = (L, p) => { S(L).state = p ? 'on' : 'off'; S(L).attributes.brightness = p * 2.55; };
  // a fading Zigbee light or a slow cloud light reports old levels for a moment; don't let that yank the slider back
  function applyHolds() {
    const n = performance.now();
    LIGHTS.forEach(L => {
      const h = hold[L.entity]; if (!h || !S(L)) return;
      const reported = isOn(L) ? Math.round(S(L).attributes.brightness / 2.55) : 0;
      if (n > h.until || (!sendT[L.entity] && Math.abs(reported - h.p) <= 1)) delete hold[L.entity];
      else if (avail(L)) setLocal(L, h.p);
    });
  }
  const refreshSoon = () => { setTimeout(load, 700); setTimeout(load, 2500); };
  (function loop() { load().finally(() => setTimeout(loop, isOpen() ? 4000 : 15000)); })();

  // Send a scene's settings. The Zigbee lights go first; `sendLast` lights (the Govee strip) follow once
  // HA confirms the first batch (or maxWaitMs passes), plus an optional afterMs pause.
  async function run(set) {
    const go = LIGHTS.filter(L => set[L.key] !== undefined && avail(L));
    const first = go.filter(L => !L.sendLast), last = go.filter(L => L.sendLast), fails = [];
    go.forEach(L => { clearTimeout(sendT[L.entity]); sendT[L.entity] = null; delete hold[L.entity]; });
    const firstDone = Promise.all(first.map(L => cmd(L, set[L.key]).catch(() => fails.push(L))));
    if (last.length) {
      await Promise.race([firstDone, sleep(Math.max(...last.map(L => L.maxWaitMs || 4000)))]);
      const after = Math.max(...last.map(L => L.afterMs || 0));
      if (after) await sleep(after);
      await Promise.all(last.map(L => cmd(L, set[L.key]).then(ms => { lag[L.entity] = ms; }, () => fails.push(L))));
    }
    await firstDone;
    return fails;
  }
  async function applyScene(sc) {
    if (busy) return nope();
    clearTimeout(later); later = null;
    const off = LIGHTS.filter(L => sc.set[L.key] !== undefined && !avail(L));
    busy = sc.id; active = sc.id; render(); ok();
    toast(`${sc.icon} ${sc.name}` + (off.length ? ` · ${off.map(L => L.name).join(', ')} offline` : sc.then && sc.then.note ? ` · ${sc.then.note}` : ''));
    const fails = await run(sc.set);
    busy = null;
    if (fails.length) { toast(`${fails.map(L => L.name).join(', ')} didn't respond`, true); nope(); }
    if (sc.then) later = setTimeout(() => { later = null; run(sc.then.set).then(refreshSoon); }, sc.then.afterSec * 1000);
    render(); refreshSoon();
  }
  async function toggle(L) {
    if (!avail(L)) { toast(`${L.name} is offline in Home Assistant`, true); return nope(); }
    const turnOn = !isOn(L);
    clearTimeout(sendT[L.entity]); sendT[L.entity] = null; delete hold[L.entity];
    S(L).state = turnOn ? 'on' : 'off'; active = null; render(); ok();
    try { await cmd(L, turnOn ? {} : 'off', .4); } catch (e) { toast(`${L.name} didn't respond`, true); nope(); }
    refreshSoon();
  }
  function dim(L, d) {
    if (!avail(L)) { toast(`${L.name} is offline in Home Assistant`, true); return nope(); }
    const p = Math.min(100, Math.max(0, (isOn(L) ? pct(L) : 0) + d));
    if (p === pct(L)) return nope();
    setLocal(L, p); active = null;
    hold[L.entity] = { p, until: performance.now() + 10000 };
    paintLight(L); playWiiSound(500 + p * 4, 'sine', .04);
    // Zigbee: stream the level while the button is held (at most every 250 ms) so the light follows the slider.
    // Govee is a rate-limited cloud light: only the level you stop on is sent.
    const gap = L.noFade ? 600 : 250, e = L.entity;
    clearTimeout(sendT[e]);
    sendT[e] = setTimeout(() => {
      sendT[e] = null; sentAt[e] = performance.now();
      const q = hold[e] ? hold[e].p : p;
      cmd(L, q ? { brightness_pct: q } : 'off', L.noFade ? 0 : .3)
        .then(() => { if (hold[e]) hold[e].until = performance.now() + (L.noFade ? 8000 : 3000); })
        .catch(() => { delete hold[e]; toast(`${L.name} didn't respond`, true); nope(); load(); });
    }, L.noFade ? gap : Math.max(0, (sentAt[e] || 0) + gap - performance.now()));
  }
  // redraw one light row in place, so the brightness bar slides instead of being rebuilt
  function paintLight(L) {
    const row = root.querySelector(`.lt-light[data-e="${L.entity}"]`);
    if (!row) return render();
    const css = nowCss(L);
    row.classList.toggle('on', isOn(L)); row.classList.toggle('off', avail(L) && !isOn(L));
    row.style.setProperty('--glow', css.startsWith('conic') ? '#c77dff' : css);
    row.querySelector('.lt-orb').style.background = css;
    row.querySelector('.s').textContent = describe(L);
    row.querySelector('.lt-bri b').textContent = pct(L) + '%';
    row.querySelector('.lt-bar i').style.width = pct(L) + '%';
    root.querySelector('.pg-sub').textContent = summary();
    paintTile();
  }

  // ---- main screen ----
  const rows = () => {
    const R = [];
    for (let i = 0; i < SCENES.length; i += 3) R.push(SCENES.slice(i, i + 3).map(sc => ({ t: 'scene', sc })));
    LIGHTS.forEach(L => R.push([{ t: 'light', L }]));
    return R;
  };
  function render() {
    const R = rows();
    if (!R.length) { root.innerHTML = '<div class="pg-note">ha-config.js is missing or has no lights.</div>'; return; }
    F.r = Math.min(F.r, R.length - 1); F.c = Math.min(F.c, R[F.r].length - 1);
    const it = R[F.r][F.c], sub = summary();
    const f = (r, c) => r === F.r && c === F.c ? ' f' : '';
    let h = `<div class="pg-head"><div class="ico">💡</div><div><div class="pg-crumb">Home Assistant</div><div class="pg-title">Basement Lights</div><div class="pg-sub">${esc(sub)}</div></div></div>`;
    h += '<div class="lt-label">Scenes</div><div class="lt-scenes">';
    R.forEach((row, r) => row.forEach((x, c) => {
      if (x.t !== 'scene') return;
      const sc = x.sc, chip = busy === sc.id ? '<span class="lt-chip busy">Applying…</span>' : active === sc.id ? '<span class="lt-chip">Active</span>' : '';
      h += `<div class="pg-tile lt-scene${f(r, c)}">${chip}<div class="e">${esc(sc.icon)}</div><div class="n">${esc(sc.name)}</div><div class="lt-dots">${LIGHTS.map(L => `<i style="background:${sc.set[L.key] === undefined ? 'transparent' : setCss(sc.set[L.key])}"></i>`).join('')}</div></div>`;
    }));
    h += `</div><div class="lt-desc">${it.t === 'scene' ? esc(it.sc.desc || '') : '&nbsp;'}</div><div class="lt-label">Lights</div><div class="lt-lights">`;
    R.forEach((row, r) => row.forEach((x, c) => {
      if (x.t !== 'light') return;
      const L = x.L, cls = !avail(L) ? ' un' : isOn(L) ? ' on' : ' off', css = nowCss(L);
      h += `<div class="pg-tile lt-light${cls}${f(r, c)}" data-e="${esc(L.entity)}" style="--glow:${css.startsWith('conic') ? '#c77dff' : css}"><div class="lt-orb" style="background:${css}">${esc(L.icon || '💡')}</div><div class="tx"><div class="n">${esc(L.name)}</div><div class="s">${esc(describe(L))}</div></div><div class="lt-bri"><b>${pct(L)}%</b><div class="lt-bar"><i style="width:${pct(L)}%"></i></div></div></div>`;
    }));
    const lg = it.t === 'scene'
      ? [key('✚', 'Move'), key('A', 'Apply scene'), key('B', 'Wii Menu')]
      : [key('▲▼', 'Move'), key('A', 'On / Off'), key('◀▶', 'Brightness'), key('Y', 'Color'), key('B', 'Wii Menu')];
    root.innerHTML = h + `</div><div class="pg-legend" style="margin-top:auto">${lg.join('')}</div>`;
  }
  function summary() {
    const on = LIGHTS.filter(isOn).length, off = LIGHTS.filter(L => S(L) && !avail(L));
    return haOk === false ? 'Can’t reach Home Assistant' : `${on} of ${LIGHTS.length} on` + (off.length ? ` · ${off.map(L => L.name).join(', ')} offline` : '');
  }
  function paintTile() {
    const on = LIGHTS.filter(isOn).length;
    tileSub.textContent = haOk === false ? 'HA offline' : on ? `${on} of ${LIGHTS.length} on` : 'All off';
    tileIco.style.opacity = on ? 1 : .45;
  }
  function toast(msg, bad) {
    panel.querySelector('.pg-toast')?.remove(); clearTimeout(toastT);
    const t = document.createElement('div'); t.className = 'pg-toast' + (bad ? ' bad' : ''); t.textContent = msg;
    panel.appendChild(t); toastT = setTimeout(() => t.remove(), 1600);
  }

  // ---- color picker (Y on a light) ----
  function pickRows(L) {
    const a = S(L).attributes, lo = a.min_color_temp_kelvin || 2000, hi = a.max_color_temp_kelvin || 6500;
    const R = [
      { label: 'Colors', sw: COLORS.map(([n, h]) => ({ n, css: `hsl(${h},100%,55%)`, v: { hs_color: [h, 100] } })) },
      { label: 'Whites  (warm → cool)', sw: WHITES.map(([k, n]) => { k = Math.min(hi, Math.max(lo, k)); return { n, css: kcss(k), v: { color_temp_kelvin: k } }; }) }
    ];
    const fx = (C.effects || []).filter(e => (a.effect_list || []).includes(e));
    if (fx.length) R.push({ label: 'Effects', fx: true, sw: fx.map(e => ({ n: e, css: RAINBOW, icon: FX_ICON[e] || '✨', v: { effect: e } })) });
    return R;
  }
  function pkRender() {
    const L = pick.L, R = pickRows(L);
    pick.r = Math.min(pick.r, R.length - 1); pick.c = Math.min(pick.c, R[pick.r].sw.length - 1);
    pk.innerHTML = `<div class="pg-head"><div class="ico"><div class="lt-orb" style="background:${nowCss(L)}">${esc(L.icon || '💡')}</div></div><div><div class="pg-crumb">Basement Lights · Color</div><div class="pg-title">${esc(L.name)}</div><div class="pg-sub">Now: ${esc(describe(L))}</div></div></div>`
      + R.map((row, r) => `<div class="lt-label">${row.label}</div><div class="lt-row${row.fx ? ' fx' : ''}">` + row.sw.map((s, c) => `<div class="lt-sw${r === pick.r && c === pick.c ? ' s' : ''}"><b style="background:${s.css}">${s.icon || ''}</b>${esc(s.n)}</div>`).join('') + '</div>').join('')
      + `<div class="pg-legend" style="margin-top:auto">${[key('✚', 'Move'), key('A', 'Apply'), key('B', 'Done')].join('')}</div>`;
  }
  async function pkApply() {
    const L = pick.L, s = pickRows(L)[pick.r].sw[pick.c];
    ok(); toast(`${L.name} → ${s.n}`); active = null;
    clearTimeout(sendT[L.entity]); sendT[L.entity] = null; delete hold[L.entity];
    try { await cmd(L, s.v, .6); } catch (e) { toast(`${L.name} didn't respond`, true); nope(); }
    setTimeout(() => load().then(() => pick && pkRender()), 900);
  }
  function pkKey(k) {
    const R = pickRows(pick.L), n = R[pick.r].sw.length;
    if (k === 'Enter' || k === ' ') return pkApply();
    if (k === 'ArrowRight') pick.c = (pick.c + 1) % n;
    else if (k === 'ArrowLeft') pick.c = (pick.c + n - 1) % n;
    else if (k === 'ArrowDown' && pick.r < R.length - 1) pick.r++;
    else if (k === 'ArrowUp' && pick.r > 0) pick.r--;
    else return nope();
    pkRender(); hover();
  }
  function pkClose() { pick = null; pk.classList.remove('on'); render(); playWiiSound(300, 'triangle', .12); }

  // ---- input ----
  function onKey(k) {
    if (pick) return pkKey(k);
    const R = rows(), it = R[F.r][F.c];
    if (k === 'Enter' || k === ' ') return it.t === 'scene' ? applyScene(it.sc) : toggle(it.L);
    if (k === 'y') {
      if (it.t !== 'light') return nope();
      if (!avail(it.L)) { toast(`${it.L.name} is offline in Home Assistant`, true); return nope(); }
      pick = { L: it.L, r: 0, c: 0 }; pk.classList.add('on'); pkRender(); return playWiiSound(780, 'sine', .1);
    }
    if (it.t === 'light' && (k === 'ArrowLeft' || k === 'ArrowRight')) return dim(it.L, k === 'ArrowRight' ? 10 : -10);
    if (k === 'ArrowDown' && F.r < R.length - 1) { F.r++; F.c = Math.min(F.c, R[F.r].length - 1); }
    else if (k === 'ArrowUp' && F.r > 0) { F.r--; F.c = Math.min(F.c, R[F.r].length - 1); }
    else if (k === 'ArrowRight' && F.c < R[F.r].length - 1) F.c++;
    else if (k === 'ArrowLeft' && F.c > 0) F.c--;
    else return;
    render(); hover();
  }
  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    const k = e.key;
    // the press that opened the channel can arrive here after the page opened it: start the guard now
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    if (!BACK.includes(k) && !MINE.includes(k)) return;
    if (performance.now() - openedAt < GUARD) { e.stopImmediatePropagation(); return; }   // input guard after opening
    if (BACK.includes(k)) { if (e.repeat) e.stopImmediatePropagation(); return; }       // page handler calls haBack()
    e.stopImmediatePropagation();
    onKey(k.length === 1 ? k.toLowerCase() : k);
  }, true);

  // B: closes the color picker first; false at the top lets the page close the channel
  window.haBack = () => {
    const n = performance.now();
    if (n - openedAt < GUARD || n - backAt < 250) return true;
    if (!pick) return false;
    backAt = n; pkClose(); return true;
  };

  // Y only acts inside this channel (outside any channel it toggles music)
  let yWas = false;
  (function poll() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    const d = !!(p && p.buttons[3] && p.buttons[3].pressed);
    if (d && !yWas && isOpen()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
    yWas = d;
    requestAnimationFrame(poll);
  })();

  let was = isOpen();
  new MutationObserver(() => {
    const now = isOpen(); if (now === was) return; was = now;
    pick = null; pk.classList.remove('on');
    if (!now) { sawOpen = false; return; }
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    F = { r: 0, c: 0 }; render(); load();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  render();
})();
