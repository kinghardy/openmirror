/* OpenMirror theme: Halloween (mirror decorations). Cobwebs, a dangling spider, drifting fog, embers, bats, the odd ghost and a flash of lightning.
   Transforms and opacity only, a handful of elements, nothing that reacts to the controller. start() / stop() are called by themes/loader.js. */
(function () {
  let box = null, timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const web = (right) => `<svg class="omw ${right ? 'r' : ''}" viewBox="0 0 300 300" width="300" height="300"><g fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.6">
    ${[0, 18, 36, 54, 72, 90].map(a => `<line x1="0" y1="0" x2="${300 * Math.cos(a * Math.PI / 180)}" y2="${300 * Math.sin(a * Math.PI / 180)}"/>`).join('')}
    ${[55, 105, 160, 220, 285].map(r => `<path d="M${r} 0 ${[18, 36, 54, 72, 90].map(a => `Q${r * 0.92 * Math.cos((a - 9) * Math.PI / 180)} ${r * 0.92 * Math.sin((a - 9) * Math.PI / 180)} ${r * Math.cos(a * Math.PI / 180)} ${r * Math.sin(a * Math.PI / 180)}`).join(' ')}"/>`).join('')}</g></svg>`;
  const bat = () => {
    if (!box) return; const dir = Math.random() < .5, y = rand(120, 1100), dur = rand(9, 15), el = document.createElement('div');
    el.className = 'omb'; el.textContent = '🦇'; el.style.cssText = `top:${y}px;font-size:${rand(46, 92)}px;animation-duration:${dur}s;${dir ? 'left:-120px;--dx:1320px' : 'left:1200px;--dx:-1320px'}`;
    el.style.setProperty('--wob', rand(60, 180) + 'px'); box.appendChild(el); later(() => el.remove(), dur * 1000 + 200); later(bat, rand(7000, 16000));
  };
  const ghost = () => {
    if (!box) return; const el = document.createElement('div'); el.className = 'omg'; el.textContent = '👻'; el.style.cssText = `left:${rand(60, 900)}px;font-size:${rand(80, 130)}px`;
    box.appendChild(el); later(() => el.remove(), 14000); later(ghost, rand(40000, 90000));
  };
  const bolt = () => { if (!box) return; const f = document.createElement('div'); f.className = 'oml'; box.appendChild(f); later(() => f.remove(), 900); later(bolt, rand(50000, 110000)); };
  const spider = () => { const s = box && box.querySelector('.oms'); if (!s) return; s.classList.remove('drop'); void s.offsetWidth; s.classList.add('drop'); later(spider, rand(25000, 50000)); };
  function start() {
    if (box) return; const st = document.createElement('style'); st.setAttribute('data-om-theme', 'halloween'); st.id = 'om-hw-style';
    st.textContent = `
#om-deco { position:fixed; inset:0; z-index:60; pointer-events:none; overflow:hidden; }
#om-deco .omw { position:absolute; top:0; left:0; opacity:.85; } #om-deco .omw.r { left:auto; right:0; transform:scaleX(-1); }
#om-deco .fog { position:absolute; left:-30%; width:160%; height:420px; background:radial-gradient(closest-side, rgba(180,120,255,.22), rgba(180,120,255,.1) 55%, transparent); animation:omfog 38s linear infinite alternate; }
#om-deco .fog.a { bottom:-120px; } #om-deco .fog.b { bottom:60px; animation-duration:52s; animation-direction:alternate-reverse; opacity:.7; background:radial-gradient(closest-side, rgba(255,120,30,.2), rgba(255,120,30,.09) 55%, transparent); }
@keyframes omfog { from { transform:translateX(-12%); } to { transform:translateX(12%); } }
#om-deco .ember { position:absolute; bottom:-20px; width:6px; height:6px; border-radius:50%; background:#ff9a3c; box-shadow:0 0 12px 3px rgba(255,140,40,.7); opacity:0; animation:omember linear infinite; }
@keyframes omember { 0% { opacity:0; transform:translate(0,0); } 12% { opacity:.9; } 100% { opacity:0; transform:translate(var(--ex),-1500px); } }
#om-deco .omb { position:absolute; text-shadow:0 0 14px rgba(0,0,0,.8); animation:ombat linear forwards; }
@keyframes ombat { 0% { transform:translate(0,0) scaleY(1); } 25% { transform:translate(calc(var(--dx)*.25),calc(var(--wob)*-1)) scaleY(.7); } 50% { transform:translate(calc(var(--dx)*.5),var(--wob)) scaleY(1); } 75% { transform:translate(calc(var(--dx)*.75),calc(var(--wob)*-.8)) scaleY(.7); } 100% { transform:translate(var(--dx),0) scaleY(1); } }
#om-deco .omg { position:absolute; bottom:-160px; opacity:0; text-shadow:0 0 24px rgba(200,170,255,.7); animation:omghost 14s ease-in-out forwards; }
@keyframes omghost { 0% { opacity:0; transform:translate(0,0); } 15% { opacity:.55; } 50% { transform:translate(80px,-900px); } 85% { opacity:.5; } 100% { opacity:0; transform:translate(-40px,-2100px); } }
#om-deco .oml { position:absolute; inset:0; background:radial-gradient(circle at 50% 20%, rgba(220,200,255,.55), rgba(120,80,255,.15) 60%, transparent); animation:omlight .9s ease-out forwards; }
@keyframes omlight { 0% { opacity:0; } 6% { opacity:1; } 14% { opacity:.15; } 22% { opacity:.85; } 100% { opacity:0; } }
#om-deco .oms { position:absolute; left:190px; top:-30px; width:2px; height:260px; background:linear-gradient(rgba(255,255,255,.45), rgba(255,255,255,.2)); transform-origin:top; transform:translateY(-300px); }
#om-deco .oms::after { content:"🕷️"; position:absolute; left:-17px; bottom:-26px; font-size:38px; }
#om-deco .oms.drop { animation:omspider 9s ease-in-out forwards; } @keyframes omspider { 0% { transform:translateY(-300px); } 22%,70% { transform:translateY(0); } 100% { transform:translateY(-300px); } }`;
    document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'om-deco'; box.setAttribute('data-om-theme', 'halloween');
    box.innerHTML = web(false) + web(true) + '<div class="oms"></div><div class="fog a"></div><div class="fog b"></div>'
      + Array.from({ length: 14 }, (_, i) => `<i class="ember" style="left:${(i * 83 + 40) % 1060}px;--ex:${(i % 2 ? 1 : -1) * (30 + i * 9)}px;animation-duration:${9 + (i % 6) * 2.3}s;animation-delay:${-(i * 1.7)}s"></i>`).join('');
    document.body.appendChild(box); later(bat, 3000); later(ghost, 14000); later(bolt, 30000); later(spider, 6000);
  }
  function stop() { timers.forEach(clearTimeout); timers = []; if (box) { box.remove(); box = null; } const s = document.getElementById('om-hw-style'); if (s) s.remove(); }
  window.OpenMirrorTheme = { start, stop };
})();
