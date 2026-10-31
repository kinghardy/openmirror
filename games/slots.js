// King Hardy Slots: 5 reels x 3 rows, 10 paylines, a wild King, treasure chests for free spins (x2). Play money only.
// The reel strips and paytable come from tools/slots_sim.py (about 94% payback, a win on roughly 1 spin in 4); edit there, re-run, paste here.
// Controls: A spin (or slam the reels to a stop) / skip a banner,  < > or LB RB or up down = bet,  X max bet,  Y auto-spin,  B back.
(() => {
  const HG = window.HardyGames; if (!HG) return;
  const slotsName = () => (window.OM_BRAND && window.OM_BRAND.slots) || 'King Hardy Slots';                 // the owner can rename it in Settings
  const slotsWords = () => slotsName().toUpperCase().split(/\s+/), slotsMain = () => { const w = slotsWords(); return w.length > 1 ? w.slice(0, -1).join(' ') : w[0]; }, slotsSub = () => { const w = slotsWords(); return w.length > 1 ? w[w.length - 1] : ''; };
  const NAMES = ['KING', 'CREST', 'GOBLET', 'RING', 'CASTLE', 'A', 'K', 'Q', 'J', 'CHEST'];
  const STRIPS = [["A","CASTLE","Q","J","Q","A","K","J","Q","CASTLE","GOBLET","CASTLE","Q","K","J","K","GOBLET","RING","A","CASTLE","CREST","J","A","GOBLET","J","GOBLET","CASTLE","Q","J","CREST","Q","CREST","Q","RING","J","K","RING","CASTLE","GOBLET","CREST","A","RING","Q","J","A","K","CREST","K","A","CHEST","RING","Q","RING","J","K","A","K","CHEST"],["J","A","Q","RING","Q","CASTLE","J","CREST","Q","K","CHEST","A","J","RING","A","K","GOBLET","A","Q","KING","Q","K","CHEST","K","CASTLE","K","GOBLET","CASTLE","KING","A","KING","CASTLE","GOBLET","K","Q","CASTLE","K","J","K","J","CREST","RING","A","CREST","Q","KING","GOBLET","CASTLE","J","Q","RING","CREST","GOBLET","Q","A","J","CREST","RING","J","A","J","RING"],["A","Q","A","RING","J","K","CASTLE","CREST","K","J","Q","CREST","J","CHEST","A","J","K","Q","A","KING","Q","KING","J","Q","K","Q","RING","GOBLET","RING","J","A","CASTLE","GOBLET","Q","CREST","J","CASTLE","RING","GOBLET","J","K","RING","GOBLET","A","CHEST","RING","J","CASTLE","CREST","K","KING","K","CASTLE","A","Q","GOBLET","CASTLE","K","CREST","A","Q","KING"],["RING","CREST","CASTLE","K","J","Q","A","RING","KING","Q","GOBLET","Q","J","A","CASTLE","A","K","GOBLET","A","GOBLET","K","A","GOBLET","CASTLE","A","CREST","RING","J","K","J","CASTLE","J","RING","J","Q","CASTLE","Q","CREST","J","K","CREST","KING","RING","K","J","Q","CHEST","RING","Q","CHEST","J","A","K","Q","CASTLE","GOBLET","KING","Q","CREST","KING","K","A"],["CASTLE","RING","GOBLET","RING","CASTLE","Q","K","CASTLE","K","GOBLET","CREST","Q","K","CHEST","A","J","A","GOBLET","Q","K","Q","A","CREST","GOBLET","Q","CREST","RING","J","CREST","J","A","J","CHEST","J","A","Q","CASTLE","RING","J","K","A","K","J","Q","CASTLE","CREST","RING","GOBLET","Q","A","CASTLE","K","RING","J","Q","J","A","K"]];
  const LINES = [[1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2], [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,1,1,0]];
  const LINE_COLORS = ['#ffd04a', '#ff5470', '#4cd964', '#3be1ff', '#c77dff', '#ff9f43', '#ffffff', '#ff6fb5', '#9be564', '#6c8cff'];
  const PAY = { KING: [70, 340, 1300], CREST: [45, 180, 650], GOBLET: [34, 130, 440], RING: [22, 90, 330], CASTLE: [18, 66, 220], A: [13, 45, 170], K: [11, 34, 135], Q: [9, 28, 110], J: [7, 22, 90] };
  const SCAT_PAY = { 3: 2, 4: 10, 5: 50 }, FREE = { 3: 8, 4: 12, 5: 20 }, FS_MULT = 2;
  const BETS = [1, 2, 5, 10, 20, 50], CELL = 190, GAP = 8;
  const fmt = n => Math.round(n).toLocaleString('en-US');

  // ---- artwork: one SVG sprite sheet, every symbol is a <use> ----
  const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><defs>
    <linearGradient id="kg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffc928"/><stop offset="1" stop-color="#b87400"/></linearGradient>
    <radialGradient id="kg-purple" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#9b4dff"/><stop offset="1" stop-color="#3a0f7a"/></radialGradient>
    <linearGradient id="kg-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5470"/><stop offset="1" stop-color="#9c0f2e"/></linearGradient>
    <linearGradient id="kg-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe6ff"/><stop offset="1" stop-color="#0a6fb8"/></linearGradient>
    <linearGradient id="kg-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe38a"/><stop offset="1" stop-color="#0f7a2b"/></linearGradient>
    <linearGradient id="kg-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e8f0"/><stop offset="1" stop-color="#7d8798"/></linearGradient>
    <linearGradient id="kg-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c5853f"/><stop offset="1" stop-color="#5e3314"/></linearGradient></defs>
    <symbol id="s-KING" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55" fill="url(#kg-purple)" stroke="url(#kg-gold)" stroke-width="6"/>
      <path d="M26 82 L22 40 L44 58 L60 28 L76 58 L98 40 L94 82 Z" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3" stroke-linejoin="round"/>
      <rect x="26" y="82" width="68" height="12" rx="4" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3"/>
      <circle cx="22" cy="38" r="6" fill="url(#kg-red)" stroke="#7a4d00" stroke-width="2"/><circle cx="60" cy="26" r="7" fill="url(#kg-blue)" stroke="#7a4d00" stroke-width="2"/><circle cx="98" cy="38" r="6" fill="url(#kg-red)" stroke="#7a4d00" stroke-width="2"/>
      <circle cx="44" cy="88" r="3" fill="#fff"/><circle cx="60" cy="88" r="3" fill="#fff"/><circle cx="76" cy="88" r="3" fill="#fff"/>
      <rect x="32" y="97" width="56" height="16" rx="8" fill="#14052a" stroke="url(#kg-gold)" stroke-width="2.5"/>
      <text x="60" y="110" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="13" fill="#ffd04a">WILD</text></symbol>
    <symbol id="s-CREST" viewBox="0 0 120 120"><path d="M60 8 L106 22 V62 C106 90 84 108 60 114 C36 108 14 90 14 62 V22 Z" fill="url(#kg-red)" stroke="url(#kg-gold)" stroke-width="7" stroke-linejoin="round"/>
      <path d="M60 22 L95 32 V62 C95 82 79 96 60 101 C41 96 25 82 25 62 V32 Z" fill="none" stroke="#ffd04a" stroke-width="2.5"/>
      <text x="60" y="82" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="58" fill="url(#kg-gold)" stroke="#5a3500" stroke-width="2" paint-order="stroke">H</text>
      <path d="M42 32 L46 20 L53 27 L60 15 L67 27 L74 20 L78 32 Z" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="2" stroke-linejoin="round"/></symbol>
    <symbol id="s-GOBLET" viewBox="0 0 120 120"><path d="M28 16 H92 C92 52 80 66 60 68 C40 66 28 52 28 16 Z" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="4" stroke-linejoin="round"/>
      <path d="M37 25 H83" stroke="#fff3b0" stroke-width="4" stroke-linecap="round" opacity=".7"/><rect x="54" y="68" width="12" height="26" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3"/>
      <ellipse cx="60" cy="102" rx="30" ry="9" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3.5"/><ellipse cx="60" cy="68" rx="14" ry="5" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3"/>
      <circle cx="60" cy="40" r="11" fill="url(#kg-red)" stroke="#7a4d00" stroke-width="3"/><circle cx="56" cy="36" r="3.5" fill="#fff" opacity=".8"/></symbol>
    <symbol id="s-RING" viewBox="0 0 120 120"><ellipse cx="60" cy="80" rx="34" ry="29" fill="none" stroke="url(#kg-gold)" stroke-width="13"/><ellipse cx="60" cy="80" rx="34" ry="29" fill="none" stroke="#7a4d00" stroke-width="2" opacity=".7"/>
      <path d="M60 12 L86 32 L74 56 H46 L34 32 Z" fill="url(#kg-blue)" stroke="url(#kg-gold)" stroke-width="5" stroke-linejoin="round"/>
      <path d="M34 32 H86 M60 12 L51 32 L60 56 L69 32 Z" fill="none" stroke="#fff" stroke-width="2" opacity=".75"/></symbol>
    <symbol id="s-CASTLE" viewBox="0 0 120 120"><path d="M12 108 V52 H24 V42 H32 V52 H42 V38 H52 V46 H68 V38 H78 V52 H88 V42 H96 V52 H108 V108 Z" fill="url(#kg-stone)" stroke="#4a5568" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M42 38 L47 22 L52 38 Z M68 38 L73 22 L78 38 Z" fill="url(#kg-red)" stroke="#6b0f22" stroke-width="2"/><path d="M47 22 V8 L64 13 L47 18" fill="#ff3b5c" stroke="#6b0f22" stroke-width="2" stroke-linejoin="round"/>
      <path d="M48 108 V86 C48 72 72 72 72 86 V108 Z" fill="#3a1d0a" stroke="#1b0a02" stroke-width="3"/><rect x="20" y="64" width="8" height="14" rx="4" fill="#2b3544"/><rect x="92" y="64" width="8" height="14" rx="4" fill="#2b3544"/></symbol>
    <symbol id="s-A" viewBox="0 0 120 120"><rect x="9" y="9" width="102" height="102" rx="22" fill="url(#kg-red)" stroke="url(#kg-gold)" stroke-width="6"/><text x="60" y="88" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="80" fill="#fff6c8" stroke="#5a3500" stroke-width="3" paint-order="stroke">A</text></symbol>
    <symbol id="s-K" viewBox="0 0 120 120"><rect x="9" y="9" width="102" height="102" rx="22" fill="url(#kg-purple)" stroke="url(#kg-gold)" stroke-width="6"/><text x="60" y="88" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="80" fill="#fff6c8" stroke="#2a0a55" stroke-width="3" paint-order="stroke">K</text></symbol>
    <symbol id="s-Q" viewBox="0 0 120 120"><rect x="9" y="9" width="102" height="102" rx="22" fill="url(#kg-blue)" stroke="url(#kg-gold)" stroke-width="6"/><text x="60" y="88" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="80" fill="#fff6c8" stroke="#04436e" stroke-width="3" paint-order="stroke">Q</text></symbol>
    <symbol id="s-J" viewBox="0 0 120 120"><rect x="9" y="9" width="102" height="102" rx="22" fill="url(#kg-green)" stroke="url(#kg-gold)" stroke-width="6"/><text x="60" y="88" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="80" fill="#fff6c8" stroke="#064d19" stroke-width="3" paint-order="stroke">J</text></symbol>
    <symbol id="s-CHEST" viewBox="0 0 120 120"><circle cx="40" cy="22" r="7" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="2"/><circle cx="60" cy="16" r="8" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="2"/><circle cx="80" cy="22" r="7" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="2"/>
      <path d="M16 62 C16 36 34 28 60 28 C86 28 104 36 104 62 Z" fill="url(#kg-wood)" stroke="#2b1405" stroke-width="4"/><rect x="16" y="62" width="88" height="46" rx="6" fill="url(#kg-wood)" stroke="#2b1405" stroke-width="4"/>
      <rect x="16" y="58" width="88" height="10" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3"/><rect x="30" y="29" width="10" height="79" fill="url(#kg-gold)" opacity=".9"/><rect x="80" y="29" width="10" height="79" fill="url(#kg-gold)" opacity=".9"/>
      <rect x="50" y="60" width="20" height="24" rx="5" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="3"/><circle cx="60" cy="71" r="3.5" fill="#3a1d0a"/>
      <text x="60" y="102" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="900" font-size="12" fill="#fff3b0" stroke="#2b1405" stroke-width="2" paint-order="stroke">BONUS</text></symbol></svg>`;
  if (!document.getElementById('kg-sprite')) { const d = document.createElement('div'); d.id = 'kg-sprite'; d.innerHTML = SPRITE; document.body.appendChild(d); }
  const sym = (name, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 120 120"><use href="#s-${name}"/></svg>`;
  const CROWN = `<svg viewBox="0 0 170 120"><path d="M20 98 L12 36 L56 68 L85 14 L114 68 L158 36 L150 98 Z" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="5" stroke-linejoin="round"/><rect x="22" y="98" width="126" height="16" rx="6" fill="url(#kg-gold)" stroke="#7a4d00" stroke-width="5"/>
    <circle cx="12" cy="32" r="9" fill="url(#kg-red)" stroke="#7a4d00" stroke-width="3"/><circle cx="85" cy="12" r="10" fill="url(#kg-blue)" stroke="#7a4d00" stroke-width="3"/><circle cx="158" cy="32" r="9" fill="url(#kg-red)" stroke="#7a4d00" stroke-width="3"/>
    <circle cx="58" cy="106" r="4" fill="#fff"/><circle cx="85" cy="106" r="4" fill="#fff"/><circle cx="112" cy="106" r="4" fill="#fff"/></svg>`;
  const CASTLE_BG = `<svg class="ks-castle" viewBox="0 0 1080 520" preserveAspectRatio="none"><path d="M0 520 V330 H60 V280 H100 V330 H150 V250 H200 V300 H300 V230 H340 V300 H420 V200 H470 V150 L500 110 L530 150 V200 H580 V300 H660 V230 H700 V300 H800 V250 H850 V330 H920 V280 H960 V330 H1080 V520 Z" fill="#1a0a2e" stroke="#3a1a5e" stroke-width="3"/></svg>`;

  HG.register({
    id: 'kinghardy', get title() { return slotsName(); },
    tagline: 'Spin for the crown: wild kings, treasure chests and free spins.',
    art: `<svg viewBox="0 0 170 120" style="width:230px;height:160px">${CROWN.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`,
    tag: () => `${fmt(HG.save.get('kinghardy', 'credits', 1000))} coins`,
    start(api) {
      const S = api.save, snd = api.snd, G = 'kinghardy';
      let credits = S.get(G, 'credits', 1000), betIdx = Math.min(BETS.length - 1, S.get(G, 'bet', 2)), best = S.get(G, 'best', 0), spins = S.get(G, 'spins', 0);
      let grid = [0, 1, 2, 3, 4].map(r => { const st = Math.floor(Math.random() * STRIPS[r].length); return [0, 1, 2].map(k => STRIPS[r][(st + k) % STRIPS[r].length]); });
      let spinning = false, counting = null, overlay = null, auto = 0, fs = { left: 0, total: 0, won: 0 }, pending = null;
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
      const total = () => BETS[betIdx] * LINES.length;

      api.root.innerHTML = `<div class="ks">${CASTLE_BG}<div class="ks-glow"></div>
        <div class="ks-title">${CROWN}<div class="t">${slotsMain()}</div><div class="s">${slotsSub()}</div></div>
        <div class="ks-banner"></div>
        <div class="ks-cab"><div class="ks-bulbs a"></div><div class="ks-bulbs b"></div><div class="ks-reels">${[0, 1, 2, 3, 4].map(() => '<div class="ks-reel"><div class="ks-strip"></div></div>').join('')}<svg class="ks-lines" viewBox="0 0 928 570" preserveAspectRatio="none"></svg></div></div>
        <div class="ks-win"><div class="l">WIN</div><div class="n">0</div><div class="m"></div></div>
        <div class="ks-meters"><div class="ks-m"><div class="l">CREDITS</div><div class="v c"></div></div><div class="ks-m bet"><div class="l">TOTAL BET</div><div class="v"><b>◀</b><span class="b"></span><b>▶</b></div></div><div class="ks-m"><div class="l">BEST WIN</div><div class="v w"></div></div></div>
        <div class="ks-side l"><div>MAX BET</div><small>X</small></div><div class="ks-spin"><div class="w">SPIN</div><div class="k">A</div></div><div class="ks-side r"><div>AUTO</div><small>Y</small></div>
        <div class="ks-pay"></div>
        <div class="ks-legend"><span>${api.k('◀▶')} Bet</span><span>${api.k('A', 'a')} Spin</span><span>${api.k('X', 'x')} Max</span><span>${api.k('Y', 'y')} Auto</span><span>${api.k('B', 'b')} Back</span></div>
        <div class="ks-big"></div><div class="ks-coins"></div></div>`;
      const $ = q => api.root.querySelector(q), reels = [...api.root.querySelectorAll('.ks-strip')], reelEls = [...api.root.querySelectorAll('.ks-reel')];
      const cellHTML = n => `<div class="ks-cell">${sym(n)}</div>`;
      const showGrid = () => reels.forEach((s, r) => { s.style.transition = 'none'; s.style.transform = 'translateY(0)'; s.innerHTML = grid[r].map(cellHTML).join(''); });

      function paint() {
        $('.ks-m .c').textContent = fmt(credits); $('.ks-m.bet .b').textContent = fmt(total()); $('.ks-m .w').textContent = fmt(best);
        $('.ks').classList.toggle('fs', fs.left > 0);
        $('.ks-banner').className = 'ks-banner' + (fs.left > 0 ? ' fs' : '');
        $('.ks-banner').textContent = fs.left > 0 ? `FREE SPINS  ${fs.left} LEFT  ·  ALL WINS ×${FS_MULT}` : '10 LINES  ·  WILD KING  ·  3 CHESTS = FREE SPINS';
        $('.ks-side.l').classList.toggle('on', false); $('.ks-side.r').classList.toggle('on', auto > 0);
        $('.ks-side.r small').textContent = auto > 0 ? `ON · ${auto}` : 'Y';
        $('.ks-spin').classList.toggle('busy', spinning);
        S.set(G, 'credits', credits); S.set(G, 'bet', betIdx); S.set(G, 'best', best); S.set(G, 'spins', spins);
      }
      const toast = msg => { api.root.querySelector('.ks-toast')?.remove(); const t = document.createElement('div'); t.className = 'ks-toast'; t.textContent = msg; $('.ks').appendChild(t); later(() => t.remove(), 2300); };

      // paytable ticker: one symbol at a time, at the current bet
      let pi = 0;
      function payTick() {
        const n = Object.keys(PAY)[pi++ % 9], p = PAY[n], b = BETS[betIdx];
        $('.ks-pay').innerHTML = `${sym(n)}<div class="p"><i>5×</i>${fmt(p[2] * b)}</div><div class="p"><i>4×</i>${fmt(p[1] * b)}</div><div class="p"><i>3×</i>${fmt(p[0] * b)}</div>`;
      }
      payTick(); const payT = setInterval(payTick, 3200);

      // ---- maths: the same as tools/slots_sim.py ----
      function linePay(syms) {
        let nw = 0; while (nw < 5 && syms[nw] === 'KING') nw++;
        let best = nw >= 3 ? PAY.KING[nw - 3] : 0, name = 'KING', count = nw;
        if (nw < 5 && syms[nw] !== 'CHEST') {
          const base = syms[nw]; let run = nw; while (run < 5 && (syms[run] === base || syms[run] === 'KING')) run++;
          if (run >= 3 && PAY[base][run - 3] > best) { best = PAY[base][run - 3]; name = base; count = run; }
        }
        return { pay: best, name, count };
      }
      function evaluate(g) {
        const wins = [];
        LINES.forEach((ln, li) => { const syms = ln.map((row, r) => g[r][row]), w = linePay(syms); if (w.pay) wins.push({ li, ...w, cells: ln.slice(0, w.count).map((row, r) => [r, row]) }); });
        const sc = []; g.forEach((col, r) => col.forEach((s, row) => { if (s === 'CHEST') sc.push([r, row]); }));
        return { wins, sc };
      }

      // ---- spinning ----
      function spin() {
        if (spinning || overlay) return;
        const inFS = fs.left > 0;
        if (!inFS) {
          if (credits < BETS[0] * LINES.length) { credits += 1000; S.set(G, 'credits', credits); snd.arp([392, 523, 659, 784], .09); toast('A royal gift: +1,000 coins'); paint(); return; }
          if (credits < total()) { while (betIdx > 0 && credits < total()) betIdx--; toast('Bet lowered to what you have'); }
          credits -= total();
        } else fs.left--;
        spins++; spinning = true; clearWins();
        const forced = window.SLOTS_FORCE; window.SLOTS_FORCE = null;
        const stops = forced || STRIPS.map(s => Math.floor(Math.random() * s.length));
        const old = grid; grid = stops.map((st, r) => [0, 1, 2].map(k => STRIPS[r][(st + k) % STRIPS[r].length]));
        pending = { inFS };
        paint(); snd.sweep(240, 90, .5, 'sawtooth', .06); snd.noise(.25, .07);
        reels.forEach((strip, r) => {
          const L = 14 + r * 6, rnd = Array.from({ length: L }, () => NAMES[Math.floor(Math.random() * NAMES.length)]);
          strip.innerHTML = [...grid[r], ...rnd, ...old[r]].map(cellHTML).join('');
          strip.style.transition = 'none'; strip.style.transform = `translateY(${-(L + 3) * CELL}px)`; void strip.offsetWidth;
          const d = 1.0 + r * 0.34;
          reelEls[r].classList.add('moving'); strip.dataset.done = '';
          strip.style.transition = `transform ${d}s cubic-bezier(.14,.82,.2,1.04)`; strip.style.transform = 'translateY(0)';
          strip._t = later(() => stopReel(r), d * 1000 + 40);
        });
      }
      function stopReel(r) {
        const strip = reels[r]; if (strip.dataset.done) return; strip.dataset.done = '1'; clearTimeout(strip._t);
        strip.style.transition = 'none'; strip.style.transform = 'translateY(0)'; strip.innerHTML = grid[r].map(cellHTML).join(''); reelEls[r].classList.remove('moving');
        snd.tone(150 + r * 14, .12, 'sine', .16); snd.noise(.05, .08);
        if (grid[r].includes('CHEST')) snd.tone(880 + r * 110, .3, 'triangle', .1);
        if (reels.every(s => s.dataset.done)) later(settle, 120);
      }
      function slam() {                               // A while spinning: every reel snaps to its result
        reels.forEach((s, r) => { if (!s.dataset.done) stopReel(r); });
      }
      function clearWins() { api.root.querySelectorAll('.ks-cell.win').forEach(c => c.classList.remove('win')); $('.ks-lines').innerHTML = ''; $('.ks-win .m').textContent = ''; }

      function settle() {
        spinning = false;
        const inFS = pending.inFS, ev = evaluate(grid), mult = inFS ? FS_MULT : 1, bet = BETS[betIdx];
        const lineWin = ev.wins.reduce((s, w) => s + w.pay, 0) * bet, scatWin = ev.sc.length >= 3 ? SCAT_PAY[Math.min(ev.sc.length, 5)] * total() : 0;
        const win = (lineWin + scatWin) * mult;
        // show the winning cells and lines
        ev.wins.forEach(w => w.cells.forEach(([r, row]) => reelEls[r].querySelectorAll('.ks-cell')[row]?.classList.add('win')));
        if (ev.sc.length >= 3) ev.sc.forEach(([r, row]) => reelEls[r].querySelectorAll('.ks-cell')[row]?.classList.add('win'));
        const rw = (928 - GAP * 4) / 5;
        $('.ks-lines').innerHTML = ev.wins.map(w => `<polyline stroke="${LINE_COLORS[w.li]}" style="color:${LINE_COLORS[w.li]}" points="${LINES[w.li].map((row, r) => `${r * (rw + GAP) + rw / 2},${row * CELL + CELL / 2}`).join(' ')}"/>`).join('');
        const top = ev.wins.slice().sort((a, b) => b.pay - a.pay)[0];
        $('.ks-win .m').textContent = ev.sc.length >= 3 ? `${ev.sc.length} CHESTS${scatWin ? ' · PAYS ' + fmt(scatWin * mult) : ''}` : top ? `${top.count} × ${top.name === 'KING' ? 'WILD KING' : top.name === 'CREST' ? 'ROYAL CREST' : top.name}${ev.wins.length > 1 ? `  ·  ${ev.wins.length} LINES` : ''}` : '';
        pending = null;
        if (ev.sc.length >= 3) { const n = FREE[Math.min(ev.sc.length, 5)]; fs.left += n; fs.total += n; snd.arp([523, 659, 784, 1047, 1319], .1, 'triangle', .14); }
        const finish = () => { if (win && inFS) fs.won += win; paint(); afterRound(ev.sc.length >= 3 ? FREE[Math.min(ev.sc.length, 5)] : 0); };
        if (!win) { later(finish, 350); return; }
        countUp(win, total(), () => { credits += win; if (win > best) best = win; finish(); });
      }

      function countUp(win, bet, done) {
        const lvl = win >= bet * 60 ? 'ROYAL WIN' : win >= bet * 25 ? 'MEGA WIN' : win >= bet * 10 ? 'BIG WIN' : '';
        const dur = Math.min(4200, Math.max(700, (win / bet) * 120)), t0 = performance.now(), el = $('.ks-win .n'), box = $('.ks-win');
        box.classList.add('on'); snd.arp(win >= bet * 5 ? [523, 659, 784, 1047] : [659, 784], .08, 'triangle', .13);
        if (lvl) bigWin(lvl, win, dur);
        let tick = 0;
        const frame = () => {
          if (!counting) return; const now = performance.now();
          const k = Math.max(0, Math.min(1, (now - t0) / dur)), v = Math.round(win * k * k * (3 - 2 * k)); el.textContent = fmt(v);
          if (now - tick > 90) { tick = now; snd.tone(1200 + 900 * k, .04, 'square', .035); }
          if (lvl) { const n = api.root.querySelector('.ks-big .n'); if (n) n.textContent = fmt(v); }
          if (k >= 1) { finishCount(); return; }
          counting.raf = requestAnimationFrame(frame);
        };
        counting = { win, done, el, raf: requestAnimationFrame(frame), lvl };
      }
      function finishCount() {
        if (!counting) return; const c = counting; counting = null; cancelAnimationFrame(c.raf);
        c.el.textContent = fmt(c.win); $('.ks-win').classList.remove('on');
        const bn = api.root.querySelector('.ks-big .n'); if (bn) bn.textContent = fmt(c.win);
        if (c.lvl) later(() => hideOverlay(), 1400);
        c.done();
      }
      function bigWin(label, win, dur) {
        overlay = 'big'; const b = $('.ks-big'); b.innerHTML = `<div class="e">YOUR MAJESTY</div><div class="t">${label}</div><div class="n">0</div><div class="s">A to continue</div>`; b.classList.add('on');
        snd.arp([392, 494, 587, 784, 988, 1175], .12, 'sawtooth', .1); coins(label === 'ROYAL WIN' ? 90 : label === 'MEGA WIN' ? 60 : 36);
      }
      function hideOverlay() { overlay = null; $('.ks-big').classList.remove('on'); later(next, 250); }
      function coins(n) {
        const box = $('.ks-coins'); for (let i = 0; i < n; i++) { const c = document.createElement('i'); c.style.cssText = `left:${Math.random() * 1030}px;animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * 1.2}s;width:${34 + Math.random() * 24}px;height:${34 + Math.random() * 24}px`; box.appendChild(c); }
        later(() => { box.innerHTML = ''; }, 4600);
      }

      function afterRound(newFree) {
        if (newFree) {                                // the chests: free spins banner
          overlay = 'fs'; const b = $('.ks-big'); b.innerHTML = `<div class="e">TREASURE FOUND</div><div class="t">${newFree}</div><div class="e">FREE SPINS</div><div class="s">All wins ×${FS_MULT} · A to begin</div>`; b.classList.add('on'); coins(40);
          snd.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], .1, 'triangle', .14); later(() => { if (overlay === 'fs') hideOverlay(), next(); }, 2800); return;
        }
        if (fs.left === 0 && fs.total) {              // free spins just ended
          const won = fs.won; fs = { left: 0, total: 0, won: 0 }; paint();
          if (won) { toast(`Free spins paid ${fmt(won)}`); snd.arp([784, 988, 1175, 1568], .1); }
        }
        later(next, fs.left > 0 ? 1100 : 250);
      }
      function next() {                               // free spins and auto-play keep going on their own
        if (spinning || overlay || counting) return;
        if (fs.left > 0) return spin();
        if (auto > 0) { if (credits < total()) { auto = 0; paint(); toast('Auto-play stopped: not enough coins'); return; } auto--; paint(); later(spin, 350); }
      }

      function bump(d) {
        if (spinning || fs.left > 0) return;
        const n = Math.max(0, Math.min(BETS.length - 1, betIdx + d)); if (n === betIdx) { snd.tone(220, .08, 'sawtooth', .06); return; }
        betIdx = n; snd.tone(520 + betIdx * 70, .06, 'sine', .1); paint(); payTick();
      }
      function dismiss() { if (overlay === 'big') { if (counting) finishCount(); hideOverlay(); } else if (overlay === 'fs') { hideOverlay(); next(); } }

      showGrid(); paint();
      return {
        key(k) {
          if (overlay) return dismiss();
          if (k === 'Enter' || k === ' ') { if (spinning) slam(); else if (counting) finishCount(); else { auto = 0; spin(); } }
          else if (k === 'ArrowLeft' || k === '[' || k === 'ArrowDown') bump(-1);
          else if (k === 'ArrowRight' || k === ']' || k === 'ArrowUp') bump(1);
          else if (k === 'x') { if (!spinning && fs.left === 0) { betIdx = BETS.length - 1; while (betIdx > 0 && credits < total()) betIdx--; paint(); payTick(); snd.arp([392, 523, 659], .06); } }
          else if (k === 'y') { auto = auto > 0 ? 0 : 10; paint(); if (auto > 0 && !spinning && !counting) next(); snd.tone(auto ? 660 : 330, .1); }
        },
        back() { if (overlay) { dismiss(); return true; } return false; },
        stop() {                                      // leaving mid-spin pays out what was already decided
          timers.forEach(clearTimeout); clearInterval(payT); if (counting) { cancelAnimationFrame(counting.raf); credits += counting.win; if (counting.win > best) best = counting.win; counting = null; }
          else if (spinning && pending) { const ev = evaluate(grid), w = (ev.wins.reduce((s, x) => s + x.pay, 0) * BETS[betIdx] + (ev.sc.length >= 3 ? SCAT_PAY[Math.min(ev.sc.length, 5)] * total() : 0)) * (pending.inFS ? FS_MULT : 1); credits += w; }
          S.set(G, 'credits', credits); S.set(G, 'best', best); S.set(G, 'spins', spins);
        }
      };
    }
  });
})();
