# Writing a theme

A theme is a folder in `themes/`. The mirror lists the folders, picks one (you choose, or **Auto** picks the seasonal theme whose date window contains today in the viewer's own time zone), and applies it. No build step.

```
themes/
  my-theme/
    theme.json
    theme.css        optional: styles for the mirror
    phone.css        optional: styles for the phone app
    theme.js         optional: decorations for the mirror
```

## theme.json

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "description": "One sentence.",
  "author": "You",
  "license": "Apache-2.0",
  "window": ["12-01", "12-26"],
  "css": "theme.css",
  "phone_css": "phone.css",
  "js": "theme.js"
}
```

- `id` must equal the folder name (lowercase letters, digits, `-`, `_`).
- `window` is optional: `["MM-DD", "MM-DD"]`, inclusive, and it may wrap the year end (`["12-20", "01-05"]`). Without it the theme is only used when someone picks it.
- File names are plain names inside the theme's own folder; only `.css`, `.js`, `.json`, `.png`, `.jpg`, `.svg` and `.webp` are served.

## Styling the mirror

Override the home screen's CSS in `theme.css` (add `!important` where the page sets inline values). Useful hooks: `.mirror-frame` (background), `.time-display`, `.date-display`, `.channel-tile`, `.channel-tile.focused`, `.channel-title`, `.hero-kicker`, `.remote-legend`. Look at `themes/halloween/theme.css` for a complete example.

## Styling the phone app

The phone app is built on CSS variables, so a palette is a whole theme: set `--bg`, `--card`, `--card2`, `--tx`, `--dim`, `--ac` (accent), `--gold`, `--ok` in `phone.css` (see `themes/halloween/phone.css`).

## Decorations (theme.js)

Define `window.OpenMirrorTheme = { start() {...}, stop() {...} }`. `start()` adds your elements (give them `pointer-events: none`), `stop()` removes everything and clears timers; the loader calls `stop()` when the theme changes. Use transforms and opacity (the mirror is a small computer), and put decorations below `z-index: 100` so apps and the screensaver stay on top.

## Safety

**`theme.js` is code that runs on the mirror's page.** Only install themes you have read; CSS-only themes cannot run code. Third-party theme installation from a store is not built yet (see [ROADMAP.md](ROADMAP.md)).

## Testing it

Pick it in *Settings → Theme*, or set the date window around today and choose *Auto*. `python3 -m unittest discover -s tests` checks that every theme lists and that its files are reachable only from inside its folder.
