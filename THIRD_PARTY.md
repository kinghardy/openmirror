# Third-party components, services and assets

OpenMirror's own code is Apache-2.0 ([LICENSE](LICENSE)). It depends on, talks to, or ships the following. If something here is wrong or missing, please open an issue.

## Software bundled in this repository

| Component | Use | License / status |
|---|---|---|
| `qrcode.js` | draws the QR codes | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 by Kazuhiko Arase, MIT license (the license header is at the top of the file). The official npm release, checksum-verified. The word "QR Code" is a registered trademark of DENSO WAVE INCORPORATED. |

## Python packages (installed with `pip`, not bundled)

| Package | Use | License |
|---|---|---|
| `cryptography` | local certificate authority, Web Push encryption | Apache-2.0 / BSD |
| `evdev` (optional) | controller guide button, wake on button | BSD-3-Clause |
| `Pillow` (optional) | poster build tools only | HPND |

## Programs it can start or use (not bundled)

NetworkManager (Wi-Fi), Avahi (`party.local`), Google Chrome / Chromium, PipeWire, UxPlay (AirPlay receiver), EmulationStation Desktop Edition, RetroArch and Visual Pinball X (the arcade channel). You install these yourself, and **ROMs and game data are never part of this project**; their licenses are your responsibility.

## Online services (called from your network, with your own keys where needed)

| Service | Use | Notes |
|---|---|---|
| Sonos (local UPnP) | playback | on your network only; unofficial use of the speaker's local interface |
| Apple Music / iTunes Search API | song lookup and playback by id | public API with rate limits; terms may change |
| Deezer public API | search and charts | public API; terms may change |
| ESPN scoreboard / summary JSON | sports | an unofficial feed that can change or disappear |
| The Movie Database (TMDB) | movie and TV posters | **needs your own free key; "This product uses the TMDB API but is not endorsed or certified by TMDB."** |
| Open-Meteo | weather and place search | free for non-commercial use, attribution under CC BY 4.0 |
| Wikipedia | artist facts | CC BY-SA text |
| Google Fonts (Oswald) | one font on the poster channel | SIL Open Font License; loading it tells Google your IP |
| Home Assistant | lights and devices | your own instance |

## Assets

Images, sounds and artwork in the repository are listed in [docs/ASSETS.md](docs/ASSETS.md) with their origin and license, where known.

## Trademarks

Nintendo, Wii, Apple, Sonos, Google, Home Assistant, ESPN, Deezer, TMDB and other names are trademarks of their owners and are used here only to describe what OpenMirror works with. No endorsement is implied.
