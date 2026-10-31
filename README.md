# OpenMirror

An open-source smart mirror for a portrait screen on the wall: a channel menu you drive with a game controller, a party jukebox on a Sonos speaker, live sports, a phone app for your guests, and themes. It runs on a small Linux computer with no cloud account of its own.

> **Status: alpha (0.1.0).** It was built for one home first and is being generalized. Expect rough edges, and read [SECURITY.md](SECURITY.md) before putting it on a network you do not control.

## What it does

- **Channels**: a home screen of tiles (music, lights, arcade, posters, sports, ...) described by manifests in `channels/`. You choose, rename and order them on the mirror itself.
- **Music**: search that forgives typos, a queue "jukebox", party mode that never stops, synced karaoke lyrics, playback through a Sonos speaker.
- **Guests**: they scan a QR code and get a phone app (installable, push notifications, live updates) to request songs, vote and play with coins.
- **Sports**: scores held back to match your TV so nothing is spoiled, big celebrations, a sports channel and a phone Game tab.
- **Themes**: `themes/` holds the looks. Seasonal themes switch themselves on by date (Halloween ships in the box). See [docs/THEMES.md](docs/THEMES.md).
- **Set up without a terminal**: on the mirror, *Settings* covers devices and status, API keys, Wi-Fi, location, the speaker and the home screen. Long keys are pasted from your phone after you type a one-time code shown on the mirror.
- **Looks after itself**: a health page, nightly backups, automated checks.

## What you need

- A Linux desktop machine with Google Chrome or Chromium, Python 3.10+, and a portrait (1080x1920) display. It was built on Ubuntu.
- `pip install -r requirements.txt` (only `cryptography` is required).
- A Sonos speaker for music (the rest works without one).
- Optional: Home Assistant (lights and devices), an Xbox controller, NetworkManager (Wi-Fi settings), Avahi (the `party.local` name), a free TMDB key (movie posters).

## Quick start

```sh
git clone https://github.com/kinghardy/openmirror.git ~/mirror-dashboard && cd ~/mirror-dashboard
pip install -r requirements.txt
python3 proxy.py                    # the server, on http://127.0.0.1:8765
./launch-kiosk.sh                   # full-screen Chrome pointed at it (needs a display)
```

A brand-new mirror opens a **Getting started** checklist by itself. To keep it running across reboots, install the service in `tools/mirror.service` (the instructions are at the top of that file). For the `party.local` name used by the phone app, see `tools/mirror-mdns.service`.

Everything you enter is kept in `~/.config/mirror/` (override with `OPENMIRROR_CONFIG`); nothing is sent anywhere except to the services you set up (Sonos on your network, Home Assistant, the music, sports, movie and weather sources).

## Safety

OpenMirror handles Wi-Fi settings and API keys, so it is built to be safe by default: secrets are write-only, the settings screen only answers on the mirror itself, the phone setup page needs a one-time code from the mirror's own screen, and keys are only accepted over an encrypted connection. The details, and what is *not* protected yet, are in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). Report problems privately as described in [SECURITY.md](SECURITY.md).

## Developing

```sh
python3 -m unittest discover -s tests     # no hardware needed
python3 tools/check_names.py              # catches undefined names
python3 tools/smoke.py                    # needs the server running on this machine
git config core.hooksPath tools/hooks     # refuse commits that contain keys
```

See [CONTRIBUTING.md](CONTRIBUTING.md). The direction of the project is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Not affiliated

OpenMirror is an independent project. It is not affiliated with or endorsed by Nintendo, Apple, Sonos, Google, Home Assistant, ESPN, Deezer or The Movie Database. "Wii" is a trademark of Nintendo; the default look is an homage to the console's channel menu. Other names belong to their owners. See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
