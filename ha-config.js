// Lights channel (#app-lights in index.html): an EXAMPLE. Copy this file to ~/.config/mirror/ha-config.js and edit that copy:
// if it exists it replaces this one (so your device names stay out of the project folder). Reload the kiosk after editing.
window.HA_CFG = {
  // The lights, in the order shown on screen. `key` is how scenes refer to them.
  // sendLast: scenes change this light AFTER the others. The Zigbee lights are sent first; once Home
  //   Assistant confirms them (or maxWaitMs passes) the strip follows. afterMs adds an extra pause
  //   before the strip (0 = right away); raise it if the strip should come in later.
  // noFade: the light can't do smooth transitions (Govee), so it never gets one.
  lights: [
    { key: 'table',  entity: 'light.example_table',            name: 'Pool Table',  icon: '🎱' },
    { key: 'strip',  entity: 'light.example_strip',           name: 'Light Strip', icon: '🌈', sendLast: true, afterMs: 0, maxWaitMs: 4000, noFade: true },
    { key: 'stairs', entity: 'light.example_stairs', name: 'Stairs',      icon: '🪜' }
  ],

  fadeSec: 1.5,   // fade time for scene changes on lights that support it

  // Each scene sets some or all lights. A value is 'off', or Home Assistant light.turn_on data:
  //   brightness_pct (1-100), color_temp_kelvin (white; Zigbee bulbs do 2202-7042 K),
  //   hs_color [hue 0-360, saturation 0-100], or effect (Govee strip only, names from its effect list).
  // then: an optional follow-up step `afterSec` later (cancelled if another scene is picked first).
  scenes: [
    { id: 'game', icon: '🎱', name: 'Game Night', desc: 'Bright table, cool blue glow behind it',
      set: { table: { brightness_pct: 100, color_temp_kelvin: 4000 }, strip: { brightness_pct: 45, hs_color: [225, 100] }, stairs: { brightness_pct: 35, color_temp_kelvin: 2700 } } },
    { id: 'tourney', icon: '🏆', name: 'Tournament', desc: 'Crisp daylight on the table, nothing else to distract',
      set: { table: { brightness_pct: 100, color_temp_kelvin: 5000 }, strip: 'off', stairs: { brightness_pct: 15, color_temp_kelvin: 3000 } } },
    { id: 'lounge', icon: '🍺', name: 'Lounge', desc: 'Warm and low, for hanging out between racks',
      set: { table: { brightness_pct: 45, color_temp_kelvin: 2700 }, strip: { brightness_pct: 60, hs_color: [30, 90] }, stairs: { brightness_pct: 40, color_temp_kelvin: 2700 } } },
    { id: 'movie', icon: '🎬', name: 'Movie Night', desc: 'Table dark, faint warm glow so you can find your drink',
      set: { table: 'off', strip: { brightness_pct: 15, color_temp_kelvin: 2200 }, stairs: { brightness_pct: 8, color_temp_kelvin: 2700 } } },
    { id: 'party', icon: '🎉', name: 'Party', desc: 'Magenta table, cyan stairs, dancing strip',
      set: { table: { brightness_pct: 70, hs_color: [300, 85] }, strip: { effect: 'Dance Party' }, stairs: { brightness_pct: 60, hs_color: [190, 90] } } },
    { id: 'fire', icon: '🔥', name: 'Fireside', desc: 'Candle-warm table with a flickering strip',
      set: { table: { brightness_pct: 25, color_temp_kelvin: 2202 }, strip: { effect: 'Candlelight' }, stairs: { brightness_pct: 15, color_temp_kelvin: 2202 } } },
    { id: 'clean', icon: '🧹', name: 'Clean Up', desc: 'Everything full and bright',
      set: { table: { brightness_pct: 100, color_temp_kelvin: 5000 }, strip: { brightness_pct: 100, color_temp_kelvin: 5000 }, stairs: { brightness_pct: 100, color_temp_kelvin: 5000 } } },
    { id: 'up', icon: '🌙', name: 'Heading Up', desc: 'Table and strip off, stairs lit for a minute',
      set: { table: 'off', strip: 'off', stairs: { brightness_pct: 100, color_temp_kelvin: 3000 } },
      then: { afterSec: 60, set: { stairs: 'off' }, note: 'Stairs turn off in 1 minute' } },
    { id: 'off', icon: '⏻', name: 'All Off', desc: 'Every light off',
      set: { table: 'off', strip: 'off', stairs: 'off' } }
  ],

  // Strip effects offered in its color picker (only names the strip actually supports are shown).
  effects: ['Candlelight', 'Fire', 'Aurora', 'Starry Sky', 'Dance Party', 'Rainbow']
};
