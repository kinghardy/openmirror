(() => {
  const DEAD = 0.5, DELAY = 400, RATE = 120;
  const status = document.getElementById('controller-status');
  const held = {};
  const keys = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', a:'Enter', b:'Escape' };
  const repeatable = new Set(['up','down','left','right']);
  const map = {
    up:    p => p.buttons[12]?.pressed || p.axes[1] < -DEAD,
    down:  p => p.buttons[13]?.pressed || p.axes[1] >  DEAD,
    left:  p => p.buttons[14]?.pressed || p.axes[0] < -DEAD,
    right: p => p.buttons[15]?.pressed || p.axes[0] >  DEAD,
    a:     p => p.buttons[0]?.pressed,
    b:     p => p.buttons[1]?.pressed
  };
  const fire = n => window.dispatchEvent(new KeyboardEvent('keydown', { key: keys[n] }));
  function pad() {
    const pads = [...navigator.getGamepads()].filter(p => p && p.connected);
    return pads.find(p => p.mapping === 'standard') || pads[0];
  }
  function loop(t) {
    const p = pad();
    if (status) status.style.display = p ? 'none' : 'block';
    if (p) for (const [name, test] of Object.entries(map)) {
      if (test(p)) {
        const h = held[name];
        if (!h) { held[name] = { next: t + DELAY }; fire(name); }
        else if (repeatable.has(name) && t >= h.next) { h.next = t + RATE; fire(name); }
      } else delete held[name];
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
