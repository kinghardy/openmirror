# Changelog

## 0.1.0 (first public version)

Alpha. Built for one home first and generalized for the release.

- Wii-style channel home screen for a portrait kiosk, driven by a game controller; channels are described by manifests (`channels/`).
- Music: discovery-first search, queue "jukebox", party mode, karaoke lyrics, Sonos playback.
- Guests: phone app (installable, push notifications, live updates), coins, requests and votes.
- Sports: delayed live scoreboard and celebrations, a sports channel, a phone Game tab.
- Themes (`themes/`): the Wii Mirror look, Halloween; seasonal themes switch themselves by date.
- Settings on the mirror itself: devices and status, keys and services (write-only secrets), Wi-Fi, home location, speaker picker, home-screen editor, and a phone setup page protected by a one-time pairing code.
- Local certificate authority so `https://party.local` can be trusted on your own phones.
- Health page, nightly backups, automated checks (`tools/smoke.py`, `tests/`).
