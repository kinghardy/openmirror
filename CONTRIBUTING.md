# Contributing

Thank you for helping! OpenMirror is small enough that one person can understand all of it, and we would like to keep it that way.

## Ground rules

- Be kind: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- **Never commit secrets, keys, personal addresses or real names.** Turn on the guard once: `git config core.hooksPath tools/hooks`.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.
- Prefer small pull requests that do one thing.

## Setting up

```sh
pip install -r requirements.txt
python3 -m unittest discover -s tests    # fast, needs no hardware
python3 tools/check_names.py             # undefined names (a typo here would crash the server on start)
```

`python3 tools/smoke.py` checks a *running* mirror (it needs the server on this machine and talks to real devices); CI cannot run it. If you change the server, run it.

## Where things are

| Path | What |
|---|---|
| `proxy.py` | the server: routes only, the logic lives in the `mirror_*.py` modules |
| `channels/<id>/channel.json` | a home-screen channel and the permissions it needs |
| `themes/<id>/` | a theme (see [docs/THEMES.md](docs/THEMES.md)) |
| `settings.js`, `setup.html` | the settings screen on the mirror and the phone setup page |
| `guest.html` | the guests' phone app |
| `tests/`, `tools/smoke.py` | automated checks |

Modules are layered (no module imports one above it); `tools/check_names.py` and the tests catch most slips.

## Themes and channels

A theme is the easiest first contribution: a folder with a `theme.json` and some CSS. Read [docs/THEMES.md](docs/THEMES.md). A channel's `channel.json` must only ask for permissions from the list in `mirror_channels.py`; unknown permissions are refused on load.

## Pull requests

- Say what and why; add or update a test when you change behavior; keep the style of the surrounding code (short comments that explain *why*).
- Sign your commits off (`git commit -s`) to confirm the [Developer Certificate of Origin](https://developercertificate.org/): you wrote it or have the right to contribute it, under the project's Apache-2.0 license.
- Do not add assets (images, sounds, fonts) unless you can state their license in the PR; they are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
