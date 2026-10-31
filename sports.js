// Sports: the games you're watching (proxy.py /sports/state, ESPN's public feed, held back by how far behind your TV is so nothing is spoiled).
//  - celebrations: a full-screen takeover for a touchdown / goal / home run (big), a banner for a field goal / three (med), a pill for everything else (small)
//  - the screensaver: while a watched game is on, live scoreboard slides alternate with the rest and other games' posters step aside (index.html asks Sports.active() / Sports.slide())
(() => {
  const css = document.createElement('style');
  css.textContent = `
#cele { position:fixed; inset:0; z-index:9000; display:none; overflow:hidden; font-family:'Oswald','Arial Narrow','Roboto Condensed',Impact,sans-serif; text-transform:uppercase; color:#fff; pointer-events:none; }
#cele.on { display:block; }
#cele .bgc { position:absolute; inset:0; background:radial-gradient(1000px 900px at 50% 42%, var(--c1) 0%, color-mix(in srgb, var(--c1) 40%, #000) 55%, #000 100%); animation:cBurst .6s ease-out; }
#cele .rays { position:absolute; left:50%; top:42%; width:3000px; height:3000px; margin:-1500px 0 0 -1500px; background:repeating-conic-gradient(rgba(255,255,255,.14) 0 7deg, transparent 7deg 18deg); animation:cSpin 14s linear infinite; }
#cele .box { position:absolute; left:0; right:0; top:170px; text-align:center; }
#cele .lg { width:520px; height:520px; object-fit:contain; filter:drop-shadow(0 20px 50px rgba(0,0,0,.6)); animation:cPop .9s cubic-bezier(.2,1.6,.3,1) both; }
#cele .tt { margin-top:30px; font-size:172px; font-weight:700; line-height:.95; letter-spacing:-2px; text-shadow:0 10px 0 var(--c2), 0 24px 60px rgba(0,0,0,.6); animation:cSlam .7s cubic-bezier(.2,1.4,.3,1) .25s both; }
#cele .tm { margin-top:6px; font-size:84px; font-weight:600; letter-spacing:.06em; color:#ffe27a; animation:cFade .6s ease-out .6s both; }
#cele .tx { margin:26px auto 0; max-width:900px; font-size:42px; font-weight:400; letter-spacing:.02em; text-transform:none; color:rgba(255,255,255,.92); line-height:1.25; animation:cFade .6s ease-out .9s both; }
#cele .sc { margin-top:40px; font-size:110px; font-weight:700; letter-spacing:.04em; animation:cFade .6s ease-out 1.1s both; } #cele .sc small { font-size:44px; font-weight:500; opacity:.8; margin:0 20px; }
#cele canvas { position:absolute; inset:0; width:100%; height:100%; }
#cele.med .big, #cele.small .big { display:none; }
#cele .bar { display:none; }
#cele.med .bar { position:absolute; left:40px; right:40px; top:70px; display:flex; align-items:center; gap:30px; padding:20px 40px; border-radius:60px; background:linear-gradient(90deg,var(--c1),color-mix(in srgb, var(--c1) 55%, #000)); border:4px solid var(--c2); box-shadow:0 20px 60px rgba(0,0,0,.6); animation:cDrop .55s cubic-bezier(.2,1.4,.3,1); }
#cele.med .bar img { width:130px; height:130px; object-fit:contain; } #cele.med .bar .t1 { font-size:96px; font-weight:700; line-height:1; } #cele.med .bar .t2 { font-size:34px; font-weight:400; text-transform:none; opacity:.92; margin-top:4px; } #cele.med .bar .s3 { margin-left:auto; font-size:76px; font-weight:700; white-space:nowrap; }
#cele.small .bar { position:absolute; left:50%; bottom:360px; translate:-50% 0; display:flex; align-items:center; gap:22px; padding:14px 38px 14px 18px; border-radius:50px; background:rgba(10,10,18,.92); border:3px solid var(--c1); box-shadow:0 14px 40px rgba(0,0,0,.6); white-space:nowrap; animation:cDrop .5s cubic-bezier(.2,1.4,.3,1); }
#cele.small .bar img { width:84px; height:84px; object-fit:contain; } #cele.small .bar .t1 { font-size:50px; font-weight:700; } #cele.small .bar .t2 { font-size:26px; text-transform:none; opacity:.8; } #cele.small .bar .s3 { font-size:44px; font-weight:700; margin-left:12px; color:#ffe27a; }
@keyframes cBurst { from { opacity:0; transform:scale(1.4) } } @keyframes cSpin { to { transform:rotate(360deg) } } @keyframes cPop { from { transform:scale(0) rotate(-25deg) } } @keyframes cSlam { from { transform:scale(3); opacity:0 } }
@keyframes cFade { from { opacity:0; transform:translateY(24px) } } @keyframes cDrop { from { transform:translateY(-160px); opacity:0 } }
/* the live scoreboard slide */
#pw-saver .ms.sbd { font-family:'Oswald','Arial Narrow','Roboto Condensed',Impact,sans-serif; text-transform:uppercase; }
#pw-saver .ms.sbd .bgs { position:absolute; inset:0; background:linear-gradient(115deg, var(--ca) 0%, color-mix(in srgb, var(--ca) 35%, #000) 40%, color-mix(in srgb, var(--ch) 35%, #000) 60%, var(--ch) 100%); }
#pw-saver .ms.sbd .bgs::after { content:''; position:absolute; inset:0; background:radial-gradient(900px 700px at 50% 45%, rgba(0,0,0,.2), rgba(0,0,0,.75)); }
#pw-saver .ms.sbd .w { padding:70px 50px 0; }
#pw-saver .ms.sbd .tag { display:flex; align-items:center; gap:18px; font-size:34px; font-weight:600; letter-spacing:.24em; } #pw-saver .ms.sbd .tag i { width:20px; height:20px; border-radius:50%; background:#ff3b3b; box-shadow:0 0 18px #ff3b3b; animation:sbBlink 1.4s ease-in-out infinite; } @keyframes sbBlink { 50% { opacity:.25 } }
#pw-saver .ms.sbd .st { margin-top:6px; font-size:78px; font-weight:700; letter-spacing:.04em; text-align:center; }
#pw-saver .ms.sbd .tms { margin-top:30px; align-self:stretch; display:grid; grid-template-columns:1fr 1fr; gap:20px; }
#pw-saver .ms.sbd .tmc { text-align:center; position:relative; } #pw-saver .ms.sbd .tmc img { width:330px; height:330px; object-fit:contain; filter:drop-shadow(0 16px 40px rgba(0,0,0,.6)); }
#pw-saver .ms.sbd .tn { margin-top:4px; font-size:54px; font-weight:600; letter-spacing:.04em; } #pw-saver .ms.sbd .tn b { display:inline-block; width:16px; height:16px; border-radius:50%; background:#ffe27a; margin-left:12px; vertical-align:middle; }
#pw-saver .ms.sbd .sc { font-size:270px; font-weight:700; line-height:1; letter-spacing:-4px; text-shadow:0 10px 0 rgba(0,0,0,.35), 0 20px 50px rgba(0,0,0,.5); font-variant-numeric:tabular-nums; }
#pw-saver .ms.sbd .ls { display:flex; justify-content:center; gap:16px; margin-top:6px; font-size:34px; font-weight:500; opacity:.9; } #pw-saver .ms.sbd .ls span { min-width:42px; text-align:center; }
#pw-saver .ms.sbd .sit { margin-top:38px; align-self:stretch; text-align:center; font-size:44px; font-weight:500; letter-spacing:.05em; color:#ffe27a; min-height:52px; }
#pw-saver .ms.sbd .lp { margin-top:14px; align-self:stretch; padding:22px 34px; border-radius:26px; background:rgba(0,0,0,.45); border:2px solid rgba(255,255,255,.2); font-size:36px; font-weight:400; text-transform:none; line-height:1.28; text-align:center; letter-spacing:.01em; }
#pw-saver .ms.sbd .wp { margin-top:30px; align-self:stretch; } #pw-saver .ms.sbd .wp .l { display:flex; justify-content:space-between; font-size:28px; letter-spacing:.14em; margin-bottom:8px; } #pw-saver .ms.sbd .wp .bar { height:22px; border-radius:11px; overflow:hidden; display:flex; background:rgba(255,255,255,.25); } #pw-saver .ms.sbd .wp .bar i { display:block; height:100%; transition:width 1s; }
#pw-saver .ms.sbd .ld { margin-top:26px; align-self:stretch; display:grid; grid-template-columns:1fr 1fr; gap:30px; font-size:28px; letter-spacing:.04em; } #pw-saver .ms.sbd .ld div { display:flex; justify-content:space-between; gap:14px; padding:5px 0; border-bottom:1px solid rgba(255,255,255,.2); } #pw-saver .ms.sbd .ld span { opacity:.75; } #pw-saver .ms.sbd .ld b { font-weight:600; text-align:right; }
#pw-saver .ms.sbd .sc.bump { animation:sbBump 1.1s cubic-bezier(.2,1.5,.3,1); } @keyframes sbBump { 0% { transform:scale(1); } 25% { transform:scale(1.28); color:#ffe27a; text-shadow:0 0 60px #ffe27a; } 100% { transform:scale(1); } }
#pw-saver .ms.sbd .plus { position:absolute; left:50%; top:30px; translate:-50% 0; font-size:130px; font-weight:700; color:#ffe27a; text-shadow:0 8px 30px rgba(0,0,0,.6); animation:sbPlus 1.8s ease-out forwards; } @keyframes sbPlus { 0% { transform:translateY(60px) scale(.5); opacity:0 } 20% { opacity:1; transform:translateY(0) scale(1.1) } 100% { transform:translateY(-120px); opacity:0 } }
#pw-saver .ms.sbd .sy { font-size:70px; margin-top:20px; opacity:.85; }`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.id = 'cele'; document.body.appendChild(el);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let S = { games: [], delay: 40 }, since = null, queue = [], showing = false, rot = 0, raf = 0;

  function sound(kind) {
    if (!window.playWiiSound) return;
    const seq = kind === 'big' ? [392, 523, 659, 784, 659, 784, 1047] : kind === 'med' ? [523, 659, 784] : [660, 880];
    seq.forEach((f, i) => setTimeout(() => playWiiSound(f, i % 2 ? 'square' : 'triangle', kind === 'big' ? .24 : .14), i * (kind === 'big' ? 130 : 110)));
  }
  function confetti(cv, colors) {
    const ctx = cv.getContext('2d'), W = cv.width = 1080, H = cv.height = 1920, P = Array.from({ length: 150 }, (_, i) => ({ x: Math.random() * W, y: -Math.random() * H, w: 12 + Math.random() * 16, h: 18 + Math.random() * 22, v: 5 + Math.random() * 9, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[i % colors.length], sw: Math.random() * 6 }));
    const t0 = performance.now();
    cancelAnimationFrame(raf);
    (function f() {
      ctx.clearRect(0, 0, W, H);
      P.forEach(p => { p.y += p.v; p.r += p.vr; p.x += Math.sin(p.y / 60 + p.sw) * 3; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
      if (performance.now() - t0 < 8500 && el.classList.contains('on')) raf = requestAnimationFrame(f);
    })();
  }
  function celebrate(ev) {
    showing = true; const big = ev.kind === 'big', ms = big ? 9000 : ev.kind === 'med' ? 5500 : 3800;
    el.className = 'on ' + ev.kind; el.style.setProperty('--c1', ev.color); el.style.setProperty('--c2', ev.alt);
    const sc = `${ev.away.abbr} ${ev.away.score == null ? '' : ev.away.score}<small>–</small>${ev.home.score == null ? '' : ev.home.score} ${ev.home.abbr}`;
    el.innerHTML = big ? `<div class="bgc"></div><div class="rays"></div><canvas></canvas><div class="box big"><img class="lg" src="${esc(ev.logo)}" alt=""><div class="tt">${esc(ev.title)}</div><div class="tm">${esc(ev.tname)}</div><div class="tx">${esc(ev.text)}</div><div class="sc">${sc}</div></div>`
      : `<div class="bar"><img src="${esc(ev.logo)}" alt=""><div><div class="t1">${esc(ev.title)}</div><div class="t2">${esc(ev.tname)}${ev.text && ev.text !== 'Test celebration' ? ' · ' + esc(ev.text.length > 70 ? ev.text.slice(0, 68) + '…' : ev.text) : ''}</div></div><div class="s3">${ev.away.score == null ? '' : ev.away.score + ' - ' + ev.home.score}</div></div>`;
    if (big) confetti(el.querySelector('canvas'), [ev.color, ev.alt, '#ffffff', '#ffe27a']);
    sound(ev.kind);
    setTimeout(() => { el.className = ''; el.innerHTML = ''; showing = false; next(); }, ms);
  }
  function next() { if (showing || !queue.length || window.MirrorAsleep || window.MirrorExternal) return; celebrate(queue.shift()); }
  async function poll() {
    if (window.MirrorAsleep) return;
    try {
      const d = await (await fetch('/sports/state?since=' + (since == null ? 0 : since))).json();
      S = d; onData();
      if (since == null) since = d.last;                                         // (what already happened before this page loaded is not replayed)
      else { d.events.forEach(e => { since = Math.max(since, e.id); queue.push(e); }); next(); }
    } catch (e) {}
  }
  setInterval(poll, 2500); poll();

  // ---- the screensaver slide ----
  const live = () => S.games.filter(g => g.state === 'in' || g.state === 'pre' || (g.state === 'post' && g.home.score != null));
  function inner(g) {
    const H = g.home, A = g.away, fin = g.state === 'post', pre = g.state === 'pre', sync = g.syncing;
    const team = t => `<div class="tmc"><img src="${esc(t.logo)}" alt=""><div class="tn">${esc(t.short)}${g.poss && g.poss === t.id ? '<b></b>' : ''}</div><div class="sc">${pre || sync ? '–' : esc(t.score)}</div>${t.lines && t.lines.length && !pre && !sync ? `<div class="ls">${t.lines.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>`;
    const wp = g.wp, hp = wp == null ? null : Math.round(wp * 100);
    const lead = (g.leaders || []).slice(0, 2).map(x => `<div style="flex-direction:column;border:0"><div style="border:0;font-size:30px;letter-spacing:.14em;opacity:.8">${esc(x.team)}</div>${x.rows.map(r => `<div><span>${esc(r.cat)}</span><b>${esc(r.who)} ${esc(r.val)}</b></div>`).join('')}</div>`).join('');
    const when = pre && g.start ? 'KICKOFF ' + new Date(g.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return `<div class="tag">${fin ? '' : '<i></i>'}${g.lg.toUpperCase()} · ${fin ? 'FINAL' : pre ? 'UP NEXT' : 'LIVE'}</div>
      <div class="st">${esc(sync ? 'SYNCING TO YOUR TV…' : when || g.detail)}</div>
      <div class="tms">${team(A)}${team(H)}</div>
      ${g.sit && !fin ? `<div class="sit">${esc(g.sit)}</div>` : '<div class="sit"></div>'}
      ${g.last && !fin && !pre && !sync ? `<div class="lp">${esc(g.last.length > 150 ? g.last.slice(0, 148) + '…' : g.last)}</div>` : ''}
      ${hp != null && !pre && !sync && !fin ? `<div class="wp"><div class="l"><span>${esc(A.abbr)} ${100 - hp}%</span><span>WIN PROBABILITY</span><span>${hp}% ${esc(H.abbr)}</span></div><div class="bar"><i style="width:${100 - hp}%;background:${A.alt}"></i><i style="width:${hp}%;background:${H.alt}"></i></div></div>` : ''}
      ${lead && !pre && !sync ? `<div class="ld">${lead}</div>` : ''}`;
  }
  function slide(key) {
    const L = live(); if (!L.length) return '';
    const g = (key && L.find(x => x.key === key)) || L[rot++ % L.length];
    return `<div class="ms sbd" data-key="${esc(g.key)}" data-a="${esc(g.away.score)}" data-h="${esc(g.home.score)}" style="--ca:${g.away.color};--ch:${g.home.color}"><div class="bgs"></div><div class="w">${inner(g)}</div></div>`;
  }
  // the slide that is on screen keeps up with the game: new numbers pop in place, the way they would on the TV
  const last = {};
  function onData() {
    S.games.forEach(g => {
      const sig = g.away.score + '-' + g.home.score, prev = last[g.key]; last[g.key] = sig;
      if (prev !== undefined && prev !== sig && g.state === 'in' && !g.syncing) {
        const sv = window.MirrorIdle && MirrorIdle.saver;
        if (sv && sv.active && sv.sport && !document.querySelector('#pw-saver .slide.show .ms.sbd[data-key="' + g.key + '"]')) sv.sport(g.key);       // the screensaver cuts to the game when it scores
      }
    });
    document.querySelectorAll('#pw-saver .ms.sbd').forEach(el => {
      const g = S.games.find(x => x.key === el.dataset.key); if (!g) return;
      const na = String(g.away.score), nh = String(g.home.score), oa = el.dataset.a, oh = el.dataset.h;
      if (na === oa && nh === oh && el.dataset.d === g.detail && el.dataset.l === (g.last || '') && el.dataset.s === String(g.syncing)) return;
      el.querySelector('.w').innerHTML = inner(g); el.dataset.a = na; el.dataset.h = nh; el.dataset.d = g.detail; el.dataset.l = g.last || ''; el.dataset.s = String(g.syncing);
      const bump = (side, o, n) => { const d = Number(n) - Number(o); if (!isNaN(d) && d > 0 && !g.syncing) { const sc = el.querySelectorAll('.tmc .sc')[side === 'a' ? 0 : 1]; if (sc) { sc.classList.add('bump'); const p = document.createElement('div'); p.className = 'plus'; p.textContent = '+' + d; sc.parentElement.appendChild(p); setTimeout(() => p.remove(), 2000); } } };
      bump('a', oa, na); bump('h', oh, nh);
    });
  }
  window.Sports = { active: () => live().some(g => g.state === 'in' || g.state === 'pre'), slide, games: () => S.games, delay: () => S.delay };
})();
