# Roadmap

OpenMirror started as one person's living-room mirror and is being opened up. This is where it is and where it is going; priorities change.

## Done

- Home screen built from channel manifests; choose, rename and order channels on the mirror.
- Settings on the mirror: devices and status, keys and services (write-only secrets), Wi-Fi with rollback, home location by city search, house name, time zone, units, speaker picker, theme.
- Phone setup page protected by a one-time pairing code; keys only over HTTPS.
- Themes with seasonal auto-switching.
- A getting-started checklist for a fresh install.
- Unit tests, a smoke test, a name checker, a secret scanner, a clean-history export tool.
- Code readability pass: Python formatted and linted with ruff, the request router turned into a table of small methods, and the 3,100-line home page split into `index.html` (markup) plus `home/*.css` and `home/*.js`.

## Next

- **Team picker** for sports (today the Sports channel is Detroit-first by default).
- **Lights picker**: list what Home Assistant finds instead of a hand-edited entity list (`ha-config.js`).
- **Serve only an allow-list of web files** from the local server (it currently serves the whole project folder to localhost).
- **More code cleanup:** a package layout (`openmirror/` for the Python, `web/` for the pages), tests for the older music, sports and party modules, and the same split for `guest.html` and `music.js`.
- **Controller pairing** from the mirror (Bluetooth).
- Bundle the one remote font so the home page makes no request to Google.
- Packaging: an installer script, a service for the audio policy, documentation with screenshots.

## Later: community channels and themes

The idea: anyone can publish a channel or theme from their own repository; a project-signed index lists the ones that have been reviewed.

- **Tier 0, declarative** (CSS themes, layouts, list packs): open to everyone, reviewed as a diff.
- **Tier 1, sandboxed web apps**: each in a sandboxed iframe on its own origin with a strict CSP, a narrow message API, and a permission list shown to the owner at install (re-approved when an update asks for more). Apps never see API keys: the mirror makes the call and adds the key itself, only to the domains the app declared.
- **Tier 2, server-side code**: not offered to ordinary users until there is a real process sandbox; developer mode only.
- **Trust levels**: *Verified* (reviewed by the project, signed index), *Community* (listed, unreviewed), *Sideloaded* (a URL, developer mode). Publisher keys are pinned on first install; updates must be signed by the same key; installs are pinned to a content hash; the project can revoke a key or an app; nothing updates silently.
- **Review**: submit a pull request with a manifest pointing at one exact release; CI checks the manifest, signature, size and that declared permissions match the code; a maintainer reads what is left; merging re-signs the index. A badge says *what was checked at which version*, not "safe".

Until this exists, only install themes and channels you have read.
