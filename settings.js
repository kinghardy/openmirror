/* OpenMirror settings screen: devices & status, keys & services, Wi-Fi, theme. Driven by the controller (d-pad, A, B, X, Y) or a keyboard.
   Talks to the local-only /settings API (see mirror_settings.py): secrets are write-only, so a key can be replaced or removed here but never read back.
   Long values (API tokens) are easier to paste than to type with a controller: a physical keyboard works in the editor too. */
(function () {
  const J = { 'Content-Type': 'application/json', 'X-OpenMirror': 'settings' };
  const api = (p, body) => fetch(p, body === undefined ? {} : { method: 'POST', headers: J, body: JSON.stringify(body) }).then(r => r.json());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style'); css.textContent = `
#app-settings { background:#07080f !important; color:#f3f5fb; padding:60px 50px !important; }
#app-settings h2 { font-size:46px; font-weight:800; margin:0 0 6px; } #app-settings .st-sub { font-size:24px; color:#8f96b3; margin-bottom:26px; letter-spacing:.04em; min-height:30px; }
.st-row { display:flex; align-items:center; gap:24px; padding:26px 30px; margin-bottom:16px; border-radius:30px; background:rgba(255,255,255,.06); border:2px solid rgba(255,255,255,.1); }
.st-row.sel { background:rgba(41,196,255,.14); border-color:#29c4ff; box-shadow:0 0 0 6px rgba(41,196,255,.18); }
.st-row .ic { font-size:56px; width:70px; text-align:center; } .st-row .tx { flex:1; min-width:0; } .st-row .t { font-size:32px; font-weight:700; } .st-row .d { font-size:23px; color:#8f96b3; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.st-row .r { font-size:24px; font-weight:700; color:#8f96b3; text-align:right; white-space:nowrap; } .st-row .r.ok { color:#4ade80; } .st-row .r.no { color:#ff6b6b; } .st-row .r.warn { color:#ffd04a; }
.st-dot { width:22px; height:22px; border-radius:50%; background:#555; flex:none; } .st-dot.ok { background:#4ade80; box-shadow:0 0 14px #4ade80; } .st-dot.no { background:#ff6b6b; } .st-dot.warn { background:#ffd04a; }
#st-body { max-height:1560px; overflow-y:auto; scrollbar-width:none; } .st-row.cmp { padding:14px 28px; margin-bottom:10px; border-radius:22px; gap:20px; } .st-row.cmp .t { font-size:27px; } .st-row.cmp .d { font-size:20px; margin-top:2px; }
.st-leg { position:absolute; left:50px; right:50px; bottom:44px; display:flex; gap:34px; justify-content:center; font-size:24px; color:#8f96b3; } .st-leg b { color:#f3f5fb; background:rgba(255,255,255,.12); padding:3px 14px; border-radius:12px; margin-right:8px; }
.st-toast { position:absolute; left:50px; right:50px; bottom:110px; text-align:center; font-size:30px; font-weight:700; padding:20px; border-radius:24px; background:rgba(255,255,255,.12); opacity:0; transition:opacity .3s; } .st-toast.on { opacity:1; } .st-toast.bad { background:rgba(255,107,107,.25); } .st-toast.good { background:rgba(74,222,128,.22); }
.st-kb { position:absolute; inset:0; background:rgba(4,5,12,.96); padding:60px 40px; display:none; flex-direction:column; } .st-kb.on { display:flex; }
.st-kb .lab { font-size:30px; font-weight:700; } .st-kb .hint { font-size:22px; color:#8f96b3; margin:4px 0 20px; min-height:28px; } .st-kb .val { font-size:40px; font-family:'DejaVu Sans Mono',monospace; padding:24px 28px; border-radius:24px; background:rgba(255,255,255,.08); border:2px solid #29c4ff; min-height:96px; word-break:break-all; margin-bottom:26px; }
.st-kb .keys { display:grid; gap:10px; } .st-kb .kr { display:flex; gap:10px; } .st-kb .k { flex:1; height:96px; display:flex; align-items:center; justify-content:center; font-size:38px; font-weight:700; border-radius:20px; background:rgba(255,255,255,.08); border:2px solid transparent; min-width:0; }
.st-kb .k.wide { flex:2; } .st-kb .k.sel { background:#29c4ff; color:#05212e; border-color:#fff; } .st-kb .k.act { background:rgba(74,222,128,.22); } .st-kb .k.sel.act { background:#4ade80; }`;
  document.head.appendChild(css);
  const ov = document.createElement('div'); ov.className = 'app-overlay'; ov.id = 'app-settings';
  ov.innerHTML = '<h2>⚙️ Settings</h2><div class="st-sub" id="st-sub"></div><div id="st-body"></div><div class="st-toast" id="st-toast"></div><div class="st-leg" id="st-leg"></div><div class="st-kb" id="st-kb"></div>';
  document.body.appendChild(ov);
  const $ = id => document.getElementById(id);
  let open = false, view = 'menu', backTo = null, sel = 0, items = [], data = {}, kb = null, toastT = null, confirmKey = null;

  const toast = (m, kind) => { const t = $('st-toast'); t.textContent = m; t.className = 'st-toast on ' + (kind || ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'st-toast', 4200); };
  const legend = a => { $('st-leg').innerHTML = a.map(([k, t]) => `<span><b>${k}</b>${t}</span>`).join(''); };
  const row = (i, ic, t, d, r, cls) => `<div class="st-row${i === sel ? ' sel' : ''}">${ic ? `<div class="ic">${ic}</div>` : ''}<div class="tx"><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div><div class="r ${cls || ''}">${esc(r || '')}</div></div>`;

  // ---- screens ----
  function paint() {
    const b = $('st-body'); $('st-sub').textContent = { menu: 'Set up this mirror without a terminal', welcome: 'Welcome. Here is what is left to set up', speaker: 'Choose the speaker', home: 'Choose, rename and order the channels on the home screen', place: 'Weather location, house name, time zone', geo: 'Pick your place', phone: 'Use your phone to paste keys', status: 'What is connected right now', keys: 'API keys and services', wifi: 'Wi-Fi', theme: 'Look and feel' }[view] || '';
    if (view === 'menu') {
      items = [['🚀', 'Getting started', 'A checklist for a new mirror', 'welcome'], ['🔊', 'Speaker', 'Choose which Sonos to use', 'speaker'], ['📱', 'Set up from your phone', 'Paste API keys on a real keyboard', 'phone'], ['🏠', 'Home screen', 'Show, hide, rename and reorder the channels', 'home'], ['📍', 'Location & house', data.place ? data.place : 'Weather location, house name, time zone', 'place'], ['📡', 'Devices & status', 'Speaker, Home Assistant, controller, network', 'status'], ['🔑', 'Keys & services', 'Home Assistant, movie posters, speaker address', 'keys'], ['📶', 'Wi-Fi', data.wifiName ? 'Connected to ' + data.wifiName : 'Choose a network', 'wifi'], ['🎨', 'Theme', 'Auto switches by date (Halloween Oct 24-31)', 'theme']];
      b.innerHTML = items.map((x, i) => row(i, x[0], x[1], x[2], '›')).join(''); legend([['A', 'Open'], ['B', 'Close']]);
    } else if (view === 'phone') {
      const p = data.pair || {}, code = p.code ? p.code.slice(0, 3) + ' ' + p.code.slice(3) : '', u = (p.urls || {}).secure || (p.urls || {}).plain || '';
      const qr = u && window.qrcode ? (() => { const q = qrcode(0, 'M'); q.addData(u); q.make(); return q.createDataURL(10, 0); })() : '';
      b.innerHTML = `<div style="display:flex;gap:40px;align-items:center;margin-top:20px"><div style="flex:1"><div style="font-size:26px;color:#8f96b3;letter-spacing:.1em">1  ON YOUR PHONE, OPEN</div><div style="font-size:36px;font-weight:700;margin:8px 0 34px;word-break:break-all">${esc(u.replace('https://', '').replace('http://', ''))}</div>
        <div style="font-size:26px;color:#8f96b3;letter-spacing:.1em">2  ENTER THIS CODE</div><div style="white-space:nowrap;font-size:${code ? 118 : 52}px;font-weight:800;letter-spacing:.08em;font-family:'DejaVu Sans Mono',monospace;margin:6px 0;color:${code ? '#29c4ff' : '#8f96b3'}">${esc(code || (p.locked_for ? 'Locked' : 'No code'))}</div>
        <div style="font-size:26px;color:${p.paired ? '#4ade80' : '#8f96b3'}">${p.paired ? '✓ Your phone is connected: finish on the phone' : p.locked_for ? 'Too many wrong tries. Press A for a new code.' : code ? 'Waiting for your phone · code expires in ' + Math.floor(p.expires_in / 60) + ':' + String(p.expires_in % 60).padStart(2, '0') : 'Press A to make a new code'}</div></div>
        ${qr ? `<img src="${qr}" style="width:330px;height:330px;border-radius:24px;background:#fff;padding:14px">` : ''}</div>
        <div style="margin-top:34px;font-size:23px;color:#8f96b3;line-height:1.5">The code works once. Keys are saved on this mirror only and never shown again. ${(p.urls || {}).secure ? '' : 'The encrypted address is not available yet, so keys can only be typed on the mirror.'}</div>`;
      items = []; legend([['A', 'New code'], ['B', 'Done']]);
    } else if (view === 'welcome') {
      const st = data.steps || [], left = st.filter(x => !x.ok && !x.optional).length;
      items = st.map(x => Object.assign({}, x)).concat([{ id: '_done', label: left ? 'Finish later' : 'Finish setup', detail: left ? left + ' step' + (left > 1 ? 's' : '') + ' left. You can come back from Settings any time' : 'Everything needed is ready', done: true }]);
      b.innerHTML = items.map((x, i) => x.done ? row(i, left ? '⏭' : '🎉', x.label, x.detail, '') : row(i, x.ok ? '✅' : (x.optional ? '➕' : '⚠️'), x.label, x.detail, x.ok ? 'Done' : (x.optional ? 'Optional' : 'Set up'), x.ok ? 'ok' : (x.optional ? '' : 'warn'))).join('') || '<div class="st-sub">Checking…</div>';
      legend([['A', 'Open'], ['B', 'Close']]);
    } else if (view === 'speaker') {
      items = data.speakers || [];
      b.innerHTML = data.speakers ? (items.length ? items.map((s, i) => row(i, '🔊', s.room, (s.model || 'Sonos') + ' · ' + s.ip, s.ip === data.currentSpeaker ? 'In use' : '', 'ok')).join('') : '<div class="st-sub">No Sonos speaker answered. Check it is on the same Wi-Fi, or press X to look again.</div>') : '<div class="st-sub">Looking for speakers…</div>';
      legend([['A', 'Use this speaker'], ['X', 'Look again'], ['B', 'Back']]);
    } else if (view === 'place') {
      const S = k => (data.settings || []).find(s => s.key === k) || {}, loc = S('location_name');
      items = [{ k: 'loc', t: 'Home location', d: 'Used for the weather', r: loc.value || 'Not set' }].concat(['house_name', 'games_name', 'slots_name', 'tz', 'units'].map(k => ({ k, t: S(k).label, d: S(k).help, r: S(k).value || 'Not set' })));
      b.innerHTML = items.map((x, i) => row(i, '', x.t, x.d, x.r, x.r === 'Not set' ? 'no' : 'ok')).join(''); legend([['A', 'Change'], ['B', 'Back']]);
    } else if (view === 'geo') {
      items = data.places || [];
      b.innerHTML = items.length ? items.map((p, i) => row(i, '📍', p.label, p.tz || '', '')).join('') : '<div class="st-sub">No places found. Press B and try the city name on its own.</div>'; legend([['A', 'Use this place'], ['B', 'Back']]);
    } else if (view === 'home') {
      items = (data.channels || []).concat([{ id: '_reset', name: 'Reset to the default layout', subtitle: '', permissions: [], reset: true }]);
      b.innerHTML = items.map((c, i) => c.reset ? row(i, '↺', c.name, 'Shows every channel in the original order', '') : row(i, c.hidden ? '🚫' : '✅', c.name + (c.placeholder ? '  (coming soon)' : ''), c.permissions.length ? 'Can: ' + c.permissions.map(p => p.text).join(' · ') : 'Needs nothing special', c.required ? 'Always shown' : c.hidden ? 'Hidden' : 'Shown', c.hidden ? 'no' : 'ok')).join('') || '<div class="st-sub">Loading…</div>';
      legend([['A', 'Show / hide'], ['X', 'Move up'], ['Y', 'Move down'], ['Start', 'Rename'], ['B', 'Back']]);
    } else if (view === 'status') {
      const c = data.checks || [];
      b.innerHTML = c.length ? c.map(x => `<div class="st-row cmp"><div class="st-dot ${x.ok ? (x.warn ? 'warn' : 'ok') : 'no'}"></div><div class="tx"><div class="t">${esc(x.label)}</div><div class="d">${esc(x.detail)}</div></div></div>`).join('') : '<div class="st-sub">Loading…</div>';
      items = []; legend([['X', 'Refresh'], ['B', 'Back']]);
    } else if (view === 'keys') {
      items = (data.settings || []).filter(s => s.ui && s.group !== 'home');
      b.innerHTML = items.map((s, i) => row(i, '', s.label, s.help, s.kind === 'secret' ? (s.set ? s.masked : 'not set') : (s.value || 'not set'), s.set ? 'ok' : (s.kind === 'secret' ? 'no' : ''))).join('') || '<div class="st-sub">Loading…</div>';
      legend([['A', 'Change'], ['X', 'Test'], ['Y', confirmKey ? 'Press again to remove' : 'Remove'], ['B', 'Back']]);
    } else if (view === 'wifi') {
      items = data.networks || [];
      b.innerHTML = (data.wifiAvail === false ? '<div class="st-sub">Wi-Fi settings need NetworkManager, which this machine does not have.</div>' : items.map((n, i) => row(i, n.active ? '✅' : (n.secure ? '🔒' : '📶'), n.ssid, n.active ? 'Connected' : (n.secure ? 'Password needed' : 'Open network'), n.signal + '%', n.signal > 60 ? 'ok' : n.signal > 30 ? 'warn' : 'no')).join('') || '<div class="st-sub">Scanning…</div>');
      legend([['A', 'Join'], ['X', 'Rescan'], ['B', 'Back']]);
    } else if (view === 'theme') {
      const T = window.OpenMirrorThemes || { themes: [], mode: 'auto' };
      items = [{ id: 'auto', name: 'Auto', d: 'Switches by date: Halloween Oct 24-31, otherwise the Wii Mirror look' }].concat(T.themes.map(t => ({ id: t.id, name: t.name, d: t.description })));
      b.innerHTML = items.map((x, i) => row(i, x.id === 'auto' ? '🗓' : '🎨', x.name, x.d, x.id === T.mode ? 'Selected' : '', x.id === T.mode ? 'ok' : '')).join(''); legend([['A', 'Use this'], ['B', 'Back']]);
    }
    const r = b.querySelector('.st-row.sel'); if (r) r.scrollIntoView({ block: 'nearest' });
  }
  async function go(v) {
    view = v; sel = 0; confirmKey = null; paint();
    try {
      if (v === 'status') { const h = await fetch('/mirror/health').then(r => r.json()); data.checks = h.checks; }
      else if (v === 'welcome') { const c = await api('/settings/checklist'); data.steps = c.steps; }
      else if (v === 'speaker') { data.speakers = null; paint(); const sp = await api('/settings/speakers'); data.speakers = sp.speakers; data.currentSpeaker = sp.current; }
      else if (v === 'place') { data.settings = (await api('/settings/state')).settings; }
      else if (v === 'home') data.channels = (await fetch('/channels/list').then(r => r.json())).channels;
      else if (v === 'phone') { await api('/settings/pair', { action: 'new' }); data.pair = await api('/settings/pair'); }
      else if (v === 'keys') data.settings = (await api('/settings/state')).settings;
      else if (v === 'wifi') { const w = await api('/settings/wifi'); data.networks = w.networks; data.wifiAvail = w.available; data.wifiName = w.connected; }
      else if (v === 'menu') { const w = await api('/settings/wifi'); data.wifiName = w.connected; }
    } catch (e) { toast('Could not reach the mirror server', 'bad'); }
    if (view === v) paint();
  }

  // ---- the on-screen keyboard ----
  const L = [['1234567890-_'], ['qwertyuiop'], ['asdfghjkl'], ['zxcvbnm.:/']], S = [['!@#$%^&*()+='], ['~`[]{}<>|\\;'], ['"\',?/ABCDEF'], ['abcdefABCDEF']];
  function kbRows() {
    const base = kb.sym ? S : L, rows = base.map(r => [...r[0]].map(c => ({ k: kb.shift && /[a-z]/.test(c) ? c.toUpperCase() : c, t: 'c' })));
    rows.push([{ k: kb.shift ? '⇧' : '⇪', t: 'shift', lab: 'Shift', w: 1 }, { k: kb.sym ? 'abc' : '#+=', t: 'sym', w: 1 }, { k: '␣', t: 'space', w: 2 }, { k: '⌫', t: 'back', w: 1 }, { k: 'Cancel', t: 'cancel', w: 1, act: 1 }, { k: 'Done', t: 'done', w: 1, act: 1 }]);
    return rows;
  }
  function kbPaint() {
    const rows = kbRows(); kb.r = Math.min(kb.r, rows.length - 1); kb.c = Math.min(kb.c, rows[kb.r].length - 1);
    const shown = kb.secret ? (kb.v.length > 6 ? '•'.repeat(kb.v.length - 4) + kb.v.slice(-4) : kb.v) : kb.v;
    $('st-kb').innerHTML = `<div class="lab">${esc(kb.label)}</div><div class="hint">${esc(kb.hint || '')}${kb.secret ? ' · ' + kb.v.length + ' characters' : ''}</div><div class="val">${esc(shown)}▏</div><div class="keys">${rows.map((r, ri) => `<div class="kr">${r.map((x, ci) => `<div class="k${x.w === 2 ? ' wide' : ''}${x.act ? ' act' : ''}${ri === kb.r && ci === kb.c ? ' sel' : ''}">${esc(x.k)}</div>`).join('')}</div>`).join('')}</div>`;
    legend([['A', 'Type'], ['X', 'Delete'], ['Y', 'Space'], ['B', 'Cancel']]);
  }
  function kbOpen(opts, done) { kb = Object.assign({ v: '', r: 1, c: 4, shift: false, sym: false, done }, opts); $('st-kb').classList.add('on'); kbPaint(); }
  function kbClose() { kb = null; $('st-kb').classList.remove('on'); paint(); }
  function kbPress() {
    const x = kbRows()[kb.r][kb.c];
    if (x.t === 'c') { if (kb.v.length < 500) kb.v += x.k; if (kb.shift) kb.shift = false; }
    else if (x.t === 'space') kb.v += ' '; else if (x.t === 'back') kb.v = kb.v.slice(0, -1); else if (x.t === 'shift') kb.shift = !kb.shift; else if (x.t === 'sym') kb.sym = !kb.sym;
    else if (x.t === 'cancel') return kbClose(); else if (x.t === 'done') { const d = kb.done, v = kb.v; kbClose(); return d(v); }
    kbPaint();
  }

  // ---- actions ----
  async function activate() {
    if (view === 'menu') return go(items[sel][3]);
    if (view === 'welcome') {
      const x = items[sel]; if (!x) return;
      if (x.done) { await api('/settings/setup_done', {}); data.steps = null; ov.classList.remove('active'); open = false; activeApp = null; return; }
      backTo = 'welcome'; return go(x.view);
    }
    if (view === 'speaker') {
      const sp = items[sel]; if (!sp) return; const r = await api('/settings/set', { key: 'sonos_ip', value: sp.ip }); if (r.error) return toast(r.error, 'bad');
      data.currentSpeaker = sp.ip; paint(); return toast('Using ' + sp.room + '. It may take a few seconds to connect', 'good');
    }
    if (view === 'phone') return go('phone');
    if (view === 'place') {
      const x = items[sel]; if (!x) return;
      if (x.k === 'loc') return kbOpen({ label: 'Find your city', hint: 'For example Chicago Illinois, or just the city name', v: '', r: 1, c: 4 }, async q => {
        if (!q.trim()) return; toast('Searching…'); const r = await api('/settings/geocode', { q }); if (r.error) return toast(r.error, 'bad');
        data.places = r.places; view = 'geo'; sel = 0; paint(); });
      const s = (data.settings || []).find(z => z.key === x.k) || {};
      return kbOpen({ label: s.label, hint: s.help, v: s.value || '' }, async v => { const r = await api('/settings/set', { key: x.k, value: v }); if (r.error) return toast(r.error, 'bad'); data.settings = r.settings; paint(); toast('Saved' + (x.k === 'tz' ? '. The clock changes after the next restart' : ''), 'good'); });
    }
    if (view === 'geo') {
      const p = items[sel]; if (!p) return; const r = await api('/settings/location', { name: p.name, lat: p.lat, lon: p.lon }); if (r.error) return toast(r.error, 'bad');
      data.settings = r.settings; const tz = data.settings.find(z => z.key === 'tz'); if (tz && !tz.set && p.tz) await api('/settings/set', { key: 'tz', value: p.tz }).then(x => { if (x.settings) data.settings = x.settings; }).catch(() => {});
      toast('Location set to ' + p.name + '. The weather updates in a moment', 'good'); return go('place');
    }
    if (view === 'home') {
      const c = items[sel]; if (!c) return;
      const r = await api('/settings/channels', c.reset ? { action: 'reset' } : { action: c.hidden ? 'show' : 'hide', id: c.id }); if (r.error) return toast(r.error, 'bad');
      data.channels = r.channels; data.homeChanged = true; paint(); return toast(c.reset ? 'Back to the default layout' : (c.hidden ? 'Shown' : 'Hidden') + ': ' + c.name, 'good');
    }
    if (view === 'keys') {
      const s = items[sel]; if (!s) return;
      kbOpen({ label: s.label, hint: s.help, secret: s.kind === 'secret', v: s.kind === 'secret' ? '' : s.value }, async v => {
        if (!v.trim()) return toast('Nothing was entered', 'bad');
        const r = await api('/settings/set', { key: s.key, value: v }); if (r.error) return toast(r.error, 'bad');
        data.settings = r.settings; paint(); toast('Saved. Press X to test it', 'good');
      });
    } else if (view === 'wifi') {
      const n = items[sel]; if (!n || n.active) return;
      const join = async pw => { toast('Connecting to ' + n.ssid + '…'); const r = await api('/settings/wifi', { ssid: n.ssid, password: pw }); toast(r.message || r.error, r.ok ? 'good' : 'bad'); setTimeout(() => go('wifi'), 1500); };
      if (n.secure) kbOpen({ label: 'Password for ' + n.ssid, hint: 'The mirror stays on its current network if this fails', secret: true, r: 1, c: 4 }, join); else join('');
    } else if (view === 'theme') {
      const t = items[sel];
      await fetch('/theme/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: t.id }) }); if (window.OpenMirrorThemes) await window.OpenMirrorThemes.reload(); paint(); toast('Theme: ' + t.name, 'good');
    }
  }
  async function extra(k) {
    if (view === 'home' && k === 'Tab' && items[sel] && !items[sel].reset) {
      const c = items[sel]; return kbOpen({ label: 'Name for this channel', hint: 'Leave empty to go back to "' + (c.default_name || c.name) + '"', v: c.name, r: 1, c: 4 }, async v => {
        const r = await api('/settings/channels', { action: 'rename', id: c.id, text: v }); if (r.error) return toast(r.error, 'bad'); data.channels = r.channels; data.homeChanged = true; paint(); toast('Renamed', 'good'); });
    }
    if (view === 'home' && (k === 'x' || k === 'y') && items[sel] && !items[sel].reset) {
      const id = items[sel].id, r = await api('/settings/channels', { action: 'move', id, dir: k === 'y' ? 1 : -1 }); if (r.error) return toast(r.error, 'bad');
      data.channels = r.channels; data.homeChanged = true; sel = r.channels.findIndex(c => c.id === id); paint(); return;
    }
    if (view === 'speaker' && k === 'x') return go('speaker');
    if (view === 'status' && k === 'x') { data.checks = []; paint(); return go('status'); }
    if (view === 'wifi' && k === 'x') { toast('Scanning…'); const w = await api('/settings/wifi?rescan=1'); data.networks = w.networks; data.wifiName = w.connected; paint(); }
    if (view === 'keys' && items[sel]) {
      const s = items[sel];
      if (k === 'x') { if (!s.testable) return toast('Nothing to test for this one'); toast('Testing…'); const r = await api('/settings/test', { key: s.key }); toast((r.ok ? '✓ ' : '✗ ') + (r.message || r.error), r.ok ? 'good' : 'bad'); }
      if (k === 'y') {
        if (!s.set) return toast('Nothing saved to remove');
        if (confirmKey !== s.key) { confirmKey = s.key; paint(); return setTimeout(() => { if (confirmKey === s.key) { confirmKey = null; paint(); } }, 3000); }
        confirmKey = null; const r = await api('/settings/clear', { key: s.key }); data.settings = r.settings; paint(); toast('Removed', 'good');
      }
    }
  }
  function key(e) {
    if (!open) return; const k = e.key;
    if (kb) {
      e.preventDefault(); e.stopImmediatePropagation(); const rows = kbRows();
      if (k === 'ArrowUp') kb.r = (kb.r + rows.length - 1) % rows.length; else if (k === 'ArrowDown') kb.r = (kb.r + 1) % rows.length;
      else if (k === 'ArrowLeft') kb.c = (kb.c + rows[kb.r].length - 1) % rows[kb.r].length; else if (k === 'ArrowRight') kb.c = (kb.c + 1) % rows[kb.r].length;
      else if (k === 'Enter') { if (e.isTrusted) { const d = kb.done, v = kb.v; kbClose(); return d(v); } kbPress(); }          // a physical keyboard's Enter finishes; the controller's A presses the highlighted key
      else if (k === 'Escape') kbClose();
      else if (k === 'Backspace') kb.v = kb.v.slice(0, -1);
      else if (e.isTrusted && k.length === 1) { if (kb.v.length < 500) kb.v += k; }                                                    // typing on a real keyboard
      else if (k === 'x') kb.v = kb.v.slice(0, -1); else if (k === 'y') kb.v += ' ';                                                   // the controller's X and Y
      return kb && kbPaint();
    }
    if (['ArrowUp', 'ArrowDown', 'Enter', 'x', 'y', 'Tab'].includes(k)) { e.stopImmediatePropagation(); e.preventDefault(); }
    if (k === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); } else if (k === 'ArrowDown') { sel = Math.min(Math.max(0, items.length - 1), sel + 1); paint(); }
    else if (k === 'Enter') activate(); else if (k === 'x' || k === 'y' || k === 'Tab') extra(k);
  }
  window.addEventListener('keydown', key, true);
  window.settingsBack = () => { if (!open) return false; if (kb) { kbClose(); return true; } if (view === 'geo') { go('place'); return true; } if (view !== 'menu' && view !== 'welcome' && backTo === 'welcome') { backTo = null; go('welcome'); return true; } if (view === 'phone') api('/settings/pair', { action: 'cancel' }); if (view === 'home' && data.homeChanged) { data.homeChanged = false; toast('Updating the home screen…'); setTimeout(() => location.reload(), 600); return true; } if (view !== 'menu') { go('menu'); return true; } open = false; return false; };   // B: one step back; false lets the page close the screen
  // X and Y come from the controller directly (the page only turns the d-pad, A and B into keys)
  const was = {}; (function padLoop() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    [[2, 'x'], [3, 'y'], [9, 'Tab']].forEach(([b, k]) => { const d = !!(p && p.buttons[b] && p.buttons[b].pressed); if (d && !was[b] && open) key({ key: k, preventDefault() {}, stopImmediatePropagation() {}, isTrusted: false }); was[b] = d; });
    requestAnimationFrame(padLoop);
  })();
  setInterval(async () => { if (open && view === 'phone' && !kb) { try { data.pair = await api('/settings/pair'); paint(); } catch (e) {} } }, 2000);       // the code counts down, and shows when the phone has connected
  if (!window.qrcode) { const s = document.createElement('script'); s.src = 'qrcode.js'; document.head.appendChild(s); }
  new MutationObserver(() => { if (open && !ov.classList.contains('active')) { open = false; kb = null; $('st-kb').classList.remove('on'); } }).observe(ov, { attributes: true, attributeFilter: ['class'] });
  window.OpenMirrorSettings = { open(v) {
    document.querySelectorAll('.app-overlay').forEach(a => a.classList.remove('active')); ov.classList.add('active'); activeApp = 'app-settings'; open = true; backTo = null; go(v || 'menu'); } };
})();
