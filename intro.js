// Wii Mirror boot intro: plays IntroMusic.mp3 with a light-bloom logo reveal, then pops every channel onto the beat in its real
// home-screen position, flashes, and fades into the dashboard. Plays once per boot (the kiosk's Chrome profile lives in /tmp, so the
// localStorage flag below is wiped by a reboot); any button skips it.
//   Y button on the home screen, I key, window.playIntro()   replay it       ?intro=1 in the URL   force it       ?intro=1&t=5.2   freeze one frame (for testing)
(() => {
  'use strict';
  const BOOT_KEY = 'wm-intro-boot', SRC = 'IntroMusic.mp3', VOLUME = 0.85;
  const T = { bloom: 0.9, logo: 0.5, badge: 1.3, up: 3.2, clock: 3.7, tiles: 4.0, step: 0.48, hero: 8.9, flash: 11.2, flashFull: 12.2, flashEnd: 13.4, fade: 11.6, audioEnd: 15.4 };
  const search = location.search + location.hash, force = /(^|[?#&])intro(=|&|$)/.test(search);
  const seek = (/[?&#]t=([\d.]+)/.exec(search) || [])[1];
  let running = false;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const easeOutBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  const css = document.createElement('style');
  css.textContent = `
body.intro-on .channel-tile { animation: none !important; transform: none !important; }
body.intro-played .channel-tile:not(.focused):not(.hero) { animation-duration: .01s !important; animation-delay: 0s !important; }
#wm-intro { position:fixed; left:0; top:0; width:1080px; height:1920px; z-index:9000; overflow:hidden; background:#000; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
#wm-intro > * { position:absolute; }
.wi-bg { inset:0; background:radial-gradient(circle at 50% 40%, #ffffff 0%, #eaf4ff 38%, #c9e2f7 72%, #aacbea 100%); opacity:0; }
.wi-bloom { left:50%; top:40%; width:700px; height:700px; margin:-350px 0 0 -350px; border-radius:50%; background:radial-gradient(circle, #fff 0%, rgba(255,255,255,.9) 25%, rgba(190,225,255,0) 70%); opacity:0; }
.wi-fx { inset:0; pointer-events:none; }
.wi-logo { left:0; top:0; width:760px; height:520px; transform-origin:50% 50%; opacity:0; text-align:center; will-change:transform; }
.wi-wii { font:800 400px/1 'Nunito','Arial Rounded MT Bold','Segoe UI',Roboto,sans-serif; letter-spacing:-14px; color:#0099ff; text-shadow:0 0 50px rgba(0,153,255,.45), 0 10px 0 #0079cc, 0 24px 40px rgba(0,60,120,.25); margin-top:6px; }
.wi-badge { position:absolute; left:50%; top:388px; margin-left:-215px; width:430px; padding:6px 0; border-radius:44px; background:linear-gradient(180deg,#27b0ff,#0088ee); color:#fff; font:800 80px/1.15 'Nunito','Segoe UI',Roboto,sans-serif; letter-spacing:12px; box-shadow:0 12px 30px rgba(0,100,200,.4), inset 0 3px 0 rgba(255,255,255,.45); transform-origin:50% 50%; opacity:0; }
.wi-clock { left:62px; top:46px; opacity:0; }
.wi-clock .t { font:200 116px/.95 -apple-system,'Segoe UI',Roboto,sans-serif; letter-spacing:-4px; color:#2f4660; }
.wi-clock .d { font:600 28px/1 -apple-system,'Segoe UI',Roboto,sans-serif; letter-spacing:.22em; color:#7d93ad; margin-top:12px; text-transform:uppercase; }
.wi-clock .g { font:800 22px/1 -apple-system,'Segoe UI',Roboto,sans-serif; letter-spacing:.3em; color:#0099ff; margin-top:14px; text-transform:uppercase; }
.wi-tile { display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box; border-radius:34px; opacity:0; overflow:hidden; transform-origin:50% 50%;
  background:linear-gradient(145deg,#ffffff,#e6eef7); border:3px solid #d0dcea; box-shadow:0 18px 40px rgba(20,70,130,.22), inset 0 3px 6px rgba(255,255,255,.9); will-change:transform,opacity; }
.wi-tile .ic { font-size:92px; line-height:1; margin-bottom:12px; filter:drop-shadow(0 6px 8px rgba(0,0,0,.14)); }
.wi-tile .tt { font:700 29px/1.2 -apple-system,'Segoe UI',Roboto,sans-serif; color:#2f4660; text-align:center; padding:0 14px; }
.wi-tile .ss { font:500 19px/1.3 -apple-system,'Segoe UI',Roboto,sans-serif; color:#7d93ad; margin-top:4px; text-align:center; padding:0 14px; }
.wi-tile.hero { border-radius:50px; background:linear-gradient(145deg,#ffffff,#dcecfb); }
.wi-tile.hero .ic { font-size:210px; margin-bottom:6px; color:#0099ff; }
.wi-tile.hero .tt { font-size:60px; } .wi-tile.hero .ss { font-size:28px; }
.wi-tile .sheen { position:absolute; top:0; left:0; width:40%; height:100%; background:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent); transform:translateX(-150%) skewX(-20deg); }
.wi-ring { border-radius:50px; border:6px solid #0099ff; opacity:0; }
.wi-flash { inset:0; background:#fff; opacity:0; }
.wi-skip { left:0; right:0; bottom:34px; text-align:center; font:600 22px -apple-system,'Segoe UI',Roboto,sans-serif; letter-spacing:.2em; color:rgba(47,70,96,.45); text-transform:uppercase; transition:opacity .6s; }
`;
  document.head.appendChild(css);

  async function run(manual) {
    if (running) return; running = true;
    document.body.classList.add('intro-on');
    const tiles = [...document.querySelectorAll('.channel-tile')];
    const rects = tiles.map(t => { const r = t.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    const root = document.createElement('div'); root.id = 'wm-intro';
    root.innerHTML = `<div class="wi-bg"></div><div class="wi-bloom"></div><canvas class="wi-fx" width="1080" height="1920"></canvas>
      <div class="wi-clock"><div class="t"></div><div class="d"></div><div class="g"></div></div>
      <div class="wi-logo"><div class="wi-wii">Wii</div><div class="wi-badge">MIRROR</div></div>
      <div class="wi-flash"></div><div class="wi-skip">Press any button to skip</div>`;
    const bg = root.querySelector('.wi-bg'), bloom = root.querySelector('.wi-bloom'), cv = root.querySelector('canvas'), cx = cv.getContext('2d');
    const logo = root.querySelector('.wi-logo'), badge = root.querySelector('.wi-badge'), clock = root.querySelector('.wi-clock'), flash = root.querySelector('.wi-flash'), skip = root.querySelector('.wi-skip');
    // channel tiles at their real home positions; the big music card is last
    const items = tiles.map((el, i) => {
      const hero = el.classList.contains('hero'), d = document.createElement('div'); d.className = 'wi-tile' + (hero ? ' hero' : '');
      const r = rects[i]; d.style.cssText = `left:${r.l}px;top:${r.t}px;width:${r.w}px;height:${r.h}px`;
      const icon = hero ? '♪' : (el.querySelector('.channel-icon') || {}).innerHTML || '', title = hero ? 'Music' : (el.querySelector('.channel-title') || {}).textContent || '';
      const sub = hero ? 'Apple Music · Sonos' : (el.querySelector('.channel-subtitle') || {}).textContent || '';
      d.innerHTML = `<div class="ic">${icon}</div><div class="tt">${title}</div><div class="ss">${sub}</div><div class="sheen"></div>`;
      root.insertBefore(d, flash);
      let ring = null; if (hero) { ring = document.createElement('div'); ring.className = 'wi-ring'; ring.style.cssText = d.style.cssText; root.insertBefore(ring, flash); }
      return { el: d, ring, hero, cx: r.l + r.w / 2, cy: r.t + r.h / 2, w: r.w, h: r.h, sheen: d.querySelector('.sheen'), pop: null };
    });
    const order = [...items.slice(1), items[0]];
    order.forEach((it, i) => it.nominal = it.hero ? T.hero : T.tiles + i * T.step);
    document.body.appendChild(root); document.documentElement.classList.remove('intro-pre');

    // clock / greeting
    const now = new Date(), h = now.getHours();
    clock.querySelector('.t').textContent = `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    clock.querySelector('.d').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    clock.querySelector('.g').textContent = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

    // sparkles
    const stars = [], COLORS = ['#0099ff', '#4cc3ff', '#ffd24d', '#8a7bff', '#ff7ab8'];
    const burst = (x, y, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 120 + Math.random() * 420; stars.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1, decay: .9 + Math.random() * .8, size: 7 + Math.random() * 12, c: COLORS[i % COLORS.length], spin: Math.random() * 6 }); } };
    const star = (x, y, r, rot) => { cx.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4, rr = i % 2 ? r * .28 : r; cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } cx.closePath(); cx.fill(); };

    // audio + beat detection
    let audio = null, analyser = null, bins = null, ema = 0, lastBeat = -9, pulse = 0, beatNow = false, audioOK = false, started = false, t0 = 0, done = false, fastOut = null;
    if (seek === undefined && !(window.mirrorQuiet && window.mirrorQuiet())) {      // music playing on the Sonos: the intro plays silently
      audio = new Audio(SRC); audio.volume = VOLUME; audio.preload = 'auto';
      try {
        const ac = typeof audioCtx !== 'undefined' ? audioCtx : new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') { try { await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 400))]); } catch (e) {} }
        if (ac.state === 'running') {
          const src = ac.createMediaElementSource(audio); analyser = ac.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .25;
          src.connect(analyser); analyser.connect(ac.destination); bins = new Uint8Array(analyser.frequencyBinCount);
        }
      } catch (e) { analyser = null; }
      try { await Promise.race([audio.play(), new Promise((_, rej) => setTimeout(() => rej(), 1500))]); audioOK = true; } catch (e) { audioOK = false; }
    }
    t0 = performance.now();
    const clockT = () => seek !== undefined ? parseFloat(seek) : (audioOK && audio.currentTime > 0 ? audio.currentTime : (performance.now() - t0) / 1000);

    function popTile(it, t) {
      it.pop = t; burst(it.cx, it.cy, it.hero ? 70 : 22);
      if (!seek && window.playWiiSound) { try { playWiiSound(it.hero ? 880 : 660 + Math.random() * 120, 'sine', .08); } catch (e) {} }
    }
    function frame(t, dt) {
      // beats from the music itself (falls back to a fixed 124 bpm grid when it can't be read)
      if (analyser) {
        analyser.getByteFrequencyData(bins); let low = 0; for (let i = 1; i <= 5; i++) low += bins[i]; low /= 5;
        beatNow = low > ema * 1.16 && low > 120 && t - lastBeat > .27; ema = ema * .93 + low * .07;
      } else beatNow = !seek && Math.floor(t * 124 / 60) !== Math.floor((t - dt) * 124 / 60);
      if (seek !== undefined) beatNow = false;
      if (beatNow) { lastBeat = t; pulse = 1; }
      pulse = Math.max(0, pulse - dt * 4.5);
      // background / bloom
      const b = easeOutCubic(t / T.bloom);
      root.style.background = '#000'; bg.style.opacity = b; bloom.style.opacity = t < 1.6 ? clamp(Math.sin(clamp(t / 1.6) * Math.PI) * 1.2) : 0; bloom.style.transform = `scale(${.2 + easeOutCubic(t / 1.4) * 3.4})`;
      // logo: pops in, pulses on the beat, then flies up to the header corner
      const li = clamp((t - T.logo) / 1.1), up = easeInOut((t - T.up) / .9), sc = (.5 + .5 * easeOutBack(li)) * (1 - .78 * up) * (1 + .04 * pulse);
      const lx = 540 + (860 - 540) * up, ly = 640 + (112 - 640) * up;
      logo.style.opacity = clamp(li * 2.5); logo.style.transform = `translate(${lx - 380}px,${ly - 260}px) scale(${sc})`;
      badge.style.opacity = clamp((t - T.badge) / .15); badge.style.transform = `scale(${.4 + .6 * easeOutBack((t - T.badge) / .55)})`;
      const cl = clamp((t - T.clock) / .6); clock.querySelector('.g').style.opacity = 1 - clamp((t - 8.2) / .4); clock.style.opacity = cl; clock.style.transform = `translateY(${(1 - easeOutCubic(cl)) * -30}px)`;
      // channels: each one waits for the next beat after its slot (at most .22 s), in order
      const next = order.find(o => o.pop === null);
      if (next && t >= next.nominal && (beatNow || seek !== undefined || t >= next.nominal + .22)) {
        const prev = order[order.indexOf(next) - 1];
        if (seek !== undefined) { order.forEach(o => { if (o.pop === null && t >= o.nominal) o.pop = o.nominal; }); }
        else if (!prev || t - prev.pop > .3) popTile(next, t);
      }
      items.forEach(it => {
        if (it.pop === null) { it.el.style.opacity = 0; if (it.ring) it.ring.style.opacity = 0; return; }
        const s = clamp((t - it.pop) / (it.hero ? .8 : .55)), e = easeOutBack(s), bob = it.pop !== null && s >= 1 ? Math.sin(t * 2 + it.cx) * 3 : 0;
        it.el.style.opacity = clamp(s * 3); it.el.style.transform = `translateY(${bob}px) scale(${(.25 + .75 * e) * (1 + (it.hero ? .006 : .012) * pulse)})`;
        it.sheen.style.transform = `translateX(${-150 + 420 * clamp((t - it.pop - .15) / .8)}%) skewX(-20deg)`;
        if (it.ring) { const r = clamp((t - it.pop) / .9); it.ring.style.opacity = (1 - r) * .8; it.ring.style.transform = `scale(${1 + r * .35})`; }
      });
      // finale: flash to white, reveal the real dashboard underneath, fade out
      let f = 0;
      if (t >= T.flashEnd - .01) f = 0; else if (t >= T.flashFull) f = 1 - clamp((t - T.flashFull) / (T.flashEnd - T.flashFull)); else if (t >= T.flash) f = easeInOut((t - T.flash) / (T.flashFull - T.flash));
      flash.style.opacity = f;
      const covered = t >= T.flashFull;
      bg.style.display = logo.style.display = clock.style.display = covered ? 'none' : ''; items.forEach(it => { it.el.style.display = covered ? 'none' : ''; if (it.ring) it.ring.style.display = covered ? 'none' : ''; });
      root.style.background = covered ? 'transparent' : '#000';
      skip.style.opacity = t > 3 ? 0 : .9;
      // sparkles
      cx.clearRect(0, 0, 1080, 1920);
      if (!seek && t > .3 && t < T.flash && Math.random() < .35) stars.push({ x: Math.random() * 1080, y: 1920 + 10, vx: (Math.random() - .5) * 40, vy: -(80 + Math.random() * 160), life: 1, decay: .22 + Math.random() * .2, size: 5 + Math.random() * 8, c: COLORS[(Math.random() * 5) | 0], spin: Math.random() * 6 });
      for (let i = stars.length - 1; i >= 0; i--) {
        const p = stars[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt * (p.decay > .9 ? 1 : 0); p.life -= p.decay * dt;
        if (p.life <= 0) { stars.splice(i, 1); continue; }
        cx.globalAlpha = Math.min(1, p.life * 1.4); cx.fillStyle = p.c; star(p.x, p.y, p.size * (.5 + .5 * p.life), p.spin + t * 2);
      }
      cx.globalAlpha = 1;
      // music fade (keeps playing softly under the dashboard)
      if (audio && !fastOut) audio.volume = VOLUME * (1 - clamp((t - T.fade) / (T.audioEnd - T.fade)));
    }

    function finish(fast) {
      if (done) return; done = true;
      document.body.classList.remove('intro-on'); document.body.classList.add('intro-played');
      window.removeEventListener('keydown', onKey, true);
      if (window.MirrorIdle) { MirrorIdle.last = performance.now(); MirrorIdle.wokeAt = performance.now(); }
      root.style.transition = 'opacity .4s'; root.style.opacity = 0; setTimeout(() => root.remove(), 450);
      if (audio) {
        const v0 = audio.volume, s = performance.now(), dur = fast ? 450 : 1500;
        (function fade() { const k = (performance.now() - s) / dur; if (k >= 1) { audio.pause(); running = false; return; } audio.volume = v0 * (1 - k); requestAnimationFrame(fade); })();
      } else running = false;
    }
    function onKey(e) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (!fastOut) { fastOut = true; finish(true); }
    }
    if (seek === undefined) window.addEventListener('keydown', onKey, true);

    let last = performance.now();
    (function loop() {
      if (done) return;
      const nowMs = performance.now(), dt = Math.min(.05, (nowMs - last) / 1000); last = nowMs;
      const t = clockT(); frame(t, dt);
      if (seek === undefined && t >= T.flashEnd) { fastOut = false; finish(false); return; }
      requestAnimationFrame(loop);
    })();
    if (seek !== undefined) { // frozen test frame: still need a couple of ticks to settle
      window.__introFrame = t => frame(t, .016);
    }
  }

  window.playIntro = () => run(true);
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'i' && !running && !(typeof activeApp !== 'undefined' && activeApp)) run(true);
  });
  let yWas = false;                                  // Y on the controller replays it (home screen only)
  (function pad() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    const y = !!(p && p.buttons[3] && p.buttons[3].pressed);
    if (y && !yWas && !running && !window.MirrorExternal && !(typeof activeApp !== 'undefined' && activeApp)) run(true);
    yWas = y; requestAnimationFrame(pad);
  })();
  const go = () => {
    let seen = false; try { seen = !!localStorage.getItem(BOOT_KEY); } catch (e) {}
    if (force || !seen) { try { localStorage.setItem(BOOT_KEY, String(Date.now())); } catch (e) {} run(false); }
    else document.documentElement.classList.remove('intro-pre');
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
