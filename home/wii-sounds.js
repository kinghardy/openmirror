(() => {
  const ctx = audioCtx; // reuses the page's existing AudioContext
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.connect(master);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function note(f, t, dur, type, vol, dest, att = 0.01) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // Optional user-supplied files in ./sounds (used when present, synth otherwise)
  const samples = {};
  ['hover', 'select', 'back', 'launch', 'error'].forEach(n => {
    const a = new Audio(`sounds/${n}.mp3`); a.preload = 'auto';
    a.addEventListener('canplaythrough', () => samples[n] = a);
  });
  function sample(n) {
    if (!samples[n]) return false;
    const c = samples[n].cloneNode(); c.volume = 0.7; c.play().catch(() => {}); return true;
  }

  const synth = {
    hover:  t => { note(1318, t, .12, 'sine', .07, master); note(1760, t + .04, .14, 'sine', .05, master); },
    back:   t => { note(660, t, .12, 'sine', .1, master); note(440, t + .08, .18, 'sine', .1, master); },
    error:  t => note(160, t, .15, 'triangle', .12, master),
    launch: t => [523, 659, 784, 1047, 1319].forEach((f, i) => { note(f, t + i * .07, .5, 'sine', .09, master); note(f * 2, t + i * .07, .3, 'sine', .03, master); })
  };
  function sfx(name) { if (!sample(name)) synth[name](ctx.currentTime); }

  // Replace the page's old blip function; map its frequencies to named sounds
  window.playWiiSound = (f = 440, type, d = .08) => {
    if (window.mirrorQuiet && window.mirrorQuiet()) return;      // music is playing on the Sonos: the mirror stays quiet
    if (ctx.state === 'suspended') ctx.resume();
    if (f >= 800 && d >= .2) return sfx('launch');
    if (f === 520) return sfx('hover');
    if (f === 300) return sfx('back');
    if (f === 220) return sfx('error');
    note(f, ctx.currentTime, .18, 'sine', .1, master); note(f * 2, ctx.currentTime, .1, 'sine', .03, master);
  };

  window.addEventListener('keydown', () => { if (ctx.state === 'suspended') ctx.resume(); });

  // Xbox-style legend
  const lg = document.querySelector('.remote-legend');
  if (lg) lg.innerHTML = '<span><b>D-Pad:</b> Move</span><span><b>A:</b> Select</span><span><b>B:</b> Back</span><span><b>LB/RB:</b> Volume</span>';

  // Live weather (Open-Meteo, no key) for the home location set in Settings
  const icon = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : '⛈️';
  async function weather() {
    try {
      const cfg = await (await fetch('/mirror/config')).json(), L = cfg.location; if (!L) return;                      // no location yet: the tile says "Set your location"
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&current=temperature_2m,weather_code&temperature_unit=${cfg.units === 'metric' ? 'celsius' : 'fahrenheit'}`);
      const c = (await r.json()).current;
      const tile = document.querySelector('[data-app="weather"]'); if (!tile) return;
      tile.querySelector('.channel-icon').textContent = icon(c.weather_code);
      tile.querySelector('.channel-subtitle').textContent = `${Math.round(c.temperature_2m)}°${cfg.units === 'metric' ? 'C' : 'F'} · ${L.name}`;
    } catch (e) { /* offline: keep static text */ }
  }
  weather(); setInterval(weather, 15 * 60 * 1000);
  // a brand-new install opens the Getting started checklist once per boot (an install that already has settings never sees it)
  fetch('/mirror/config').then(r => r.json()).then(c => { if (c.first_run && !sessionStorage.getItem('omWelcome')) { sessionStorage.setItem('omWelcome', '1'); setTimeout(() => { if (window.OpenMirrorSettings && !activeApp) window.OpenMirrorSettings.open('welcome'); }, 7000); } }).catch(() => {});

})();
