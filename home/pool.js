(() => {
  const G = window.POOL_GUIDE || { categories: [], games: {} };
  const panel = document.getElementById('app-pool'), root = document.getElementById('pool-root');
  const tileSub = document.querySelector('[data-app="pool"] .channel-subtitle');
  const GUARD = 600;
  const SECS = [['setup', 'Setup'], ['play', 'Play'], ['fouls', 'Common Fouls']];
  const BALL = ['#f5c400', '#1d4fd8', '#d62828', '#5b2a8c', '#f26b1d', '#0f7a43', '#7d1f1f', '#151515'];
  const BACK = ['Escape', 'Backspace', 'b', 'B'];
  const MINE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'x', 'X', 'y', 'Y', '[', ']'];
  const S = { view: 'cats', cr: 0, cc: 0, cat: null, li: 0, game: null, sec: 0 };
  const SB = { n: 2, pts: [0, 0, 0], sel: 0, armed: 0 };
  let openedAt = 0, sawOpen = false, backAt = 0, uid = 0, scrollGoal = 0;
  const isOpen = () => panel.classList.contains('active');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const KC = { A: 'a', B: 'b', X: 'x', Y: 'y', LB: 'bump', RB: 'bump' };
  const key = (k, l) => `<span>${k.split(' ').map(x => `<i class="pg-k ${KC[x] || ''}">${x}</i>`).join('')}${l}</span>`;
  const hover = () => playWiiSound(520, 'sine', .05), nope = () => playWiiSound(220, 'sawtooth', .1), open = () => playWiiSound(780, 'sine', .1);

  // ---- SVG diagrams (balls 1-7 solid, 8 black, 9-15 striped, 0 cue) ----
  function ball(n, x, y, r) {
    const c = BALL[(n - 1) % 8], id = 'pgc' + (++uid);
    let s = n === 0 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfbf7"/>`
      : n > 8 ? `<clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><circle cx="${x}" cy="${y}" r="${r}" fill="#fbfbf7"/><rect x="${x - r}" y="${y - r * .58}" width="${r * 2}" height="${r * 1.16}" fill="${c}" clip-path="url(#${id})"/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    if (n > 0 && r >= 14) s += `<circle cx="${x}" cy="${y}" r="${r * .48}" fill="#fff"/><text x="${x}" y="${y}" font-size="${r * (n > 9 ? .5 : .6)}" font-weight="800" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="central" fill="#111">${n}</text>`;
    return s + `<ellipse cx="${x - r * .35}" cy="${y - r * .42}" rx="${r * .3}" ry="${r * .18}" fill="#fff" opacity=".35"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="${Math.max(1, r * .06)}"/>`;
  }
  // rows[0] is the apex; later rows stack away from it (dir -1 = up the screen, toward the foot rail)
  const rackPos = (rows, ax, ay, r, dir) => rows.flatMap((row, i) => row.map((n, j) => ({ n, x: ax + (j - (row.length - 1) / 2) * r * 2.04, y: ay + dir * i * r * 1.77 })));
  const svgBall = n => `<svg viewBox="0 0 100 100">${ball(n, 50, 50, 46)}</svg>`;

  function rackSvg(d) {
    const r = 40, rows = d.rows || [], W = Math.max(...rows.map(x => x.length), 3) * r * 2 + 100;
    const ay = 50 + (rows.length - 1) * r * 1.77 + r, H = ay + r + 76, rings = d.rings || [];
    const P = rackPos(rows, W / 2, ay, r, -1);
    return `<svg viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="26" fill="#1f7a4d"/>`
      + P.filter(p => rings.includes(p.n)).map(p => `<circle cx="${p.x}" cy="${p.y}" r="${r + 9}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="11 7"/>`).join('')
      + P.map(p => ball(p.n, p.x, p.y, r)).join('')
      + `<text x="${W / 2}" y="${H - 24}" font-size="28" font-weight="800" font-family="Arial,sans-serif" text-anchor="middle" fill="#fff">▼ apex on the foot spot</text></svg>`;
  }

  function tableSvg(d) {
    const W = 300, H = 560, m = 22, fw = W - 2 * m, fh = H - 2 * m, footY = m + fh * .25, headY = m + fh * .75;
    let s = `<svg viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="22" fill="#6b3f1f"/><rect x="${m}" y="${m}" width="${fw}" height="${fh}" fill="#1f7a4d"/>`
      + `<rect x="${m}" y="${headY}" width="${fw}" height="${H - m - headY}" fill="#000" opacity=".14"/>`
      + `<line x1="${m}" y1="${headY}" x2="${W - m}" y2="${headY}" stroke="#fff" stroke-width="3" stroke-dasharray="10 8" opacity=".85"/>`
      + `<text x="${W / 2}" y="${H - m - 16}" font-size="22" font-weight="800" font-family="Arial,sans-serif" letter-spacing="3" text-anchor="middle" fill="#fff" opacity=".85">KITCHEN</text>`;
    for (let i = 1; i < 8; i++) if (i !== 4) s += [m / 2, W - m / 2].map(x => `<circle cx="${x}" cy="${m + fh * i / 8}" r="3" fill="#f3e6c8"/>`).join('');
    for (let i = 1; i < 4; i++) s += [m / 2, H - m / 2].map(y => `<circle cx="${m + fw * i / 4}" cy="${y}" r="3" fill="#f3e6c8"/>`).join('');
    [[m, m], [W - m, m], [m, H / 2], [W - m, H / 2], [m, H - m], [W - m, H - m]].forEach(([x, y]) => s += `<circle cx="${x}" cy="${y}" r="15" fill="#111"/>`);
    s += `<circle cx="${W / 2}" cy="${footY}" r="4" fill="#fff"/>`;
    if (d.rack) s += rackPos(d.rack, W / 2, footY, 11, -1).map(p => ball(p.n, p.x, p.y, 11)).join('');
    if (d.cue !== false) s += ball(0, W / 2, headY + 40, 11);
    return s + '</svg>';
  }

  const fig = d => `<figure class="pg-fig ${d.type === 'table' ? 'tbl' : 'rk'}">${d.type === 'table' ? tableSvg(d) : rackSvg(d)}${d.caption ? `<figcaption>${md(d.caption)}</figcaption>` : ''}</figure>`;
  function block(b) {
    if (b.h) return `<h3>${md(b.h)}</h3>`;
    if (b.p) return `<p>${md(b.p)}</p>`;
    if (b.note) return `<div class="pg-note"><span>💡</span><div>${md(b.note)}</div></div>`;
    if (b.steps) return `<ol class="pg-steps">${b.steps.map(x => `<li><div>${md(x)}</div></li>`).join('')}</ol>`;
    if (b.items) return `<div class="pg-items${b.tone === 'bad' ? ' bad' : ''}">${b.items.map(([t, d]) => `<div class="pg-item"><div class="t">${md(t)}</div><div class="d">${md(d)}</div></div>`).join('')}</div>`;
    if (b.diagrams) return `<div class="pg-figs">${b.diagrams.map(fig).join('')}</div>`;
    return '';
  }

  // ---- screens ----
  const gamesOf = c => (c.games || []).filter(id => G.games[id]).map(id => Object.assign({ id }, G.games[id]));
  function catRows() {
    const rows = [[{ t: 'score' }]];
    for (let i = 0; i < G.categories.length; i += 2) rows.push(G.categories.slice(i, i + 2).map(c => ({ t: 'cat', c })));
    return rows;
  }
  const head = (ico, crumb, title, sub) => `<div class="pg-head"><div class="ico">${ico}</div><div><div class="pg-crumb">${crumb}</div><div class="pg-title">${title}</div>${sub ? `<div class="pg-sub">${sub}</div>` : ''}</div></div>`;
  const mini = () => SB.pts.slice(0, SB.n).map((p, i) => `<div><span>P${i + 1}</span><b>${p}</b></div>`).join('');

  function render(keepScroll) {
    const old = root.querySelector('.pg-scroll'), top = keepScroll && old ? old.scrollTop : 0;
    let h, b, lg, extra = '';
    if (S.view === 'cats') {
      const R = catRows();
      S.cr = Math.min(S.cr, R.length - 1); S.cc = Math.min(S.cc, R[S.cr].length - 1);
      h = head('🎱', 'Billiards Rack', 'Pool Guide', 'Pick a game, or keep score');
      b = '<div class="pg-cats">' + R.map((row, r) => `<div class="pg-row${row.length === 1 ? ' one' : ''}">` + row.map((it, c) => {
        const f = r === S.cr && c === S.cc ? ' f' : '';
        if (it.t === 'score') return `<div class="pg-tile pg-scoretile${f}"><div><div class="n">🏆 Scoreboard</div><div class="s">${SB.n}-player game</div></div><div class="pg-mini">${mini()}</div></div>`;
        const n = gamesOf(it.c).length;
        return `<div class="pg-tile pg-cat${n ? '' : ' soon'}${f}"><div class="e">${esc(it.c.icon || '🎱')}</div><div class="n">${esc(it.c.name)}</div><div class="s">${esc(it.c.blurb || '')}</div><span class="pg-chip${n ? '' : ' soon'}">${n ? `${n} game${n === 1 ? '' : 's'}` : 'Coming soon'}</span></div>`;
      }).join('') + '</div>').join('') + '</div>';
      if (!window.POOL_GUIDE) b += '<div class="pg-note"><span>⚠️</span><div>pool-games.js did not load, so only the scoreboard is available.</div></div>';
      lg = [key('✚', 'Move'), key('A', 'Open'), key('B', 'Wii Menu'), key('LB RB', 'Volume')];
    } else if (S.view === 'list') {
      const L = gamesOf(S.cat);
      h = head(esc(S.cat.icon || '🎱'), 'Pool Guide', esc(S.cat.name), esc(S.cat.blurb || ''));
      b = '<div class="pg-list">' + L.map((g, i) => `<div class="pg-tile pg-game${g.soon ? ' soon' : ''}${i === S.li ? ' f' : ''}">${svgBall(g.ball || 8)}<div><div class="n">${esc(g.name)}</div><div class="s">${esc(g.tagline || '')}</div><div class="cs">${g.players ? `<span class="pg-chip">${esc(g.players)}</span>` : ''}${g.soon ? '<span class="pg-chip soon">Coming soon</span>' : ''}</div></div></div>`).join('') + '</div>';
      lg = [key('▲▼', 'Move'), key('A', 'Open'), key('B', 'Categories'), key('LB RB', 'Volume')];
    } else if (S.view === 'game') {
      const g = S.game, sec = (g.sections || {})[SECS[S.sec][0]] || [{ p: 'Nothing written for this section yet.' }];
      h = head(svgBall(g.ball || 8), `${esc(S.cat.name)}${g.ruleset ? ' · ' + esc(g.ruleset) : ''}`, esc(g.name), esc(g.tagline || ''));
      extra = `<div class="pg-tabs"><i class="pg-k bump">LB</i>${SECS.map(([, t], i) => `<div class="pg-tab${i === S.sec ? ' on' : ''}">${t}</div>`).join('')}<i class="pg-k bump">RB</i></div>`;
      b = `<div class="pg-sec">${sec.map(block).join('')}</div>`;
      lg = [key('LB RB', 'Section'), key('▲▼', 'Scroll'), key('B', 'Game List')];
    } else {
      h = head('🏆', 'Billiards Rack', 'Scoreboard', `${SB.n}-player game`);
      b = `<div class="pg-mode">${[2, 3].map(n => `<span class="${SB.n === n ? 'on' : ''}">${n} Players</span>`).join('')}</div>`
        + `<div class="pg-cards n${SB.n}" style="grid-template-columns:repeat(${SB.n},1fr)">`
        + SB.pts.slice(0, SB.n).map((p, i) => `<div class="pg-tile pg-card${i === SB.sel ? ' f' : ''}"><div class="pn">PLAYER ${i + 1}</div><div class="sc">${p}</div><div class="adj">${i === SB.sel ? '▲ +1 &nbsp; ▼ −1' : '&nbsp;'}</div></div>`).join('') + '</div>'
        + (SB.armed > performance.now() ? '<div class="pg-reset">Press Y again to reset every score to 0</div>' : '');
      lg = [key('◀▶', 'Player'), key('▲▼', '+1 / −1'), key('A', '+1'), key('X', '2 / 3 Players'), key('Y', 'Reset'), key('B', 'Back')];
    }
    root.innerHTML = h + extra + `<div class="pg-body"><div class="pg-scroll">${b}</div><div class="pg-more up">▲ more</div><div class="pg-more dn">▼ more</div></div><div class="pg-legend">${lg.join('')}</div>`;
    const sc = root.querySelector('.pg-scroll');
    sc.scrollTop = scrollGoal = top;
    sc.addEventListener('scroll', more);
    root.querySelector('.pg-scroll .f')?.scrollIntoView({ block: 'nearest' });
    more();
  }
  function more() {
    const body = root.querySelector('.pg-body'), sc = root.querySelector('.pg-scroll');
    if (!sc) return;
    body.classList.toggle('up', sc.scrollTop > 4);
    body.classList.toggle('dn', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
  }
  function toast(msg) {
    panel.querySelector('.pg-toast')?.remove();
    const t = document.createElement('div'); t.className = 'pg-toast'; t.textContent = msg;
    panel.appendChild(t); setTimeout(() => t.remove(), 1600);
  }
  function updateTile() {
    const p = SB.pts.slice(0, SB.n);
    tileSub.textContent = p.some(x => x) ? `Score ${p.join(' – ')}` : 'Rules & Scoreboard';
  }

  // ---- input ----
  function onKey(k) {
    const A = k === 'Enter' || k === ' ';
    if (S.view === 'cats') {
      const R = catRows(), it = R[S.cr][S.cc];
      if (A) {
        if (it.t === 'score') { S.view = 'score'; SB.armed = 0; }
        else if (gamesOf(it.c).length) { S.view = 'list'; S.cat = it.c; S.li = 0; }
        else { toast(`${it.c.name}: coming soon`); return nope(); }
        render(); return open();
      }
      if (k === 'ArrowDown' && S.cr < R.length - 1) { S.cr++; S.cc = Math.min(S.cc, R[S.cr].length - 1); }
      else if (k === 'ArrowUp' && S.cr > 0) { S.cr--; S.cc = Math.min(S.cc, R[S.cr].length - 1); }
      else if (k === 'ArrowRight' && S.cc < R[S.cr].length - 1) S.cc++;
      else if (k === 'ArrowLeft' && S.cc > 0) S.cc--;
      else return;
      render(); return hover();
    }
    if (S.view === 'list') {
      const L = gamesOf(S.cat), g = L[S.li];
      if (A) {
        if (!g || g.soon) { toast(`${g ? g.name : 'This game'}: coming soon`); return nope(); }
        S.game = g; S.sec = 0; S.view = 'game'; render(); return open();
      }
      if (k === 'ArrowDown' && S.li < L.length - 1) S.li++;
      else if (k === 'ArrowUp' && S.li > 0) S.li--;
      else return;
      render(true); return hover();
    }
    if (S.view === 'game') {
      const sc = root.querySelector('.pg-scroll');
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        // aim at a running target so held / repeated presses don't restart the smooth scroll from mid-flight
        const max = sc.scrollHeight - sc.clientHeight, t = Math.min(max, Math.max(0, scrollGoal + (k === 'ArrowDown' ? 280 : -280)));
        if (t === scrollGoal) return nope();
        scrollGoal = t; sc.scrollTo({ top: t, behavior: 'smooth' });
        return hover();
      }
      const d = k === ']' || k === 'ArrowRight' ? 1 : k === '[' || k === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      if (S.sec + d < 0 || S.sec + d >= SECS.length) return nope();
      S.sec += d; render(); return hover();
    }
    // scoreboard
    if (k === 'ArrowLeft') SB.sel = (SB.sel + SB.n - 1) % SB.n;
    else if (k === 'ArrowRight') SB.sel = (SB.sel + 1) % SB.n;
    else if (k === 'ArrowUp' || A) { SB.pts[SB.sel]++; playWiiSound(600); }
    else if (k === 'ArrowDown') { if (!SB.pts[SB.sel]) return nope(); SB.pts[SB.sel]--; playWiiSound(400); }
    else if (k === 'x') { SB.n = SB.n === 2 ? 3 : 2; SB.sel = Math.min(SB.sel, SB.n - 1); open(); }
    else if (k === 'y') {
      if (SB.armed > performance.now()) { SB.pts = [0, 0, 0]; SB.armed = 0; toast('Scores reset'); playWiiSound(350); }
      else { SB.armed = performance.now() + 3000; nope(); setTimeout(() => { if (S.view === 'score') render(); }, 3050); }
    } else return;
    if (k === 'ArrowLeft' || k === 'ArrowRight') hover();
    updateTile(); render();
  }

  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    const k = e.key;
    // the press that opened the channel can arrive here after the page opened it: start the guard now
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    if (!BACK.includes(k) && !MINE.includes(k)) return;
    if (performance.now() - openedAt < GUARD) { e.stopImmediatePropagation(); return; }   // input guard after opening
    if (BACK.includes(k)) { if (e.repeat) e.stopImmediatePropagation(); return; }       // page handler calls poolBack()
    e.stopImmediatePropagation();
    onKey(k.length === 1 ? k.toLowerCase() : k);
  }, true);

  // B: one level up per press; false at the top lets the page close the channel
  window.poolBack = () => {
    const n = performance.now();
    if (n - openedAt < GUARD || n - backAt < 250) return true;
    if (S.view === 'cats') return false;
    backAt = n;
    S.view = S.view === 'game' ? 'list' : 'cats';
    render(); playWiiSound(300, 'triangle', .12);
    return true;
  };
  // LB/RB flip sections on a game page instead of changing music volume
  window.poolOwnsBumpers = () => isOpen() && S.view === 'game';
  // the screensaver never covers the scoreboard mid-game
  window.poolOwnsScreen = () => isOpen() && S.view === 'score';

  // X / Y / LB / RB only act inside this channel
  const prev = {};
  (function poll() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    [[2, 'x'], [3, 'y'], [4, '['], [5, ']']].forEach(([i, key]) => {
      const d = !!(p && p.buttons[i] && p.buttons[i].pressed);
      if (d && !prev[i] && isOpen()) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      prev[i] = d;
    });
    requestAnimationFrame(poll);
  })();

  let was = isOpen();
  new MutationObserver(() => {
    const now = isOpen(); if (now === was) return; was = now;
    if (!now) { sawOpen = false; return; }
    if (!sawOpen) { sawOpen = true; openedAt = performance.now(); }
    S.view = 'cats'; SB.armed = 0; render();
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  render(); updateTile();
})();
