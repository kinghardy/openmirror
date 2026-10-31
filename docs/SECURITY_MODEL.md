# Security model

What OpenMirror protects, from whom, how, and where it does **not** protect you yet. This is the honest version; if you find a mismatch with the code, that is a bug worth reporting (see [SECURITY.md](../SECURITY.md)).

## What is worth protecting

Your Wi-Fi password, Home Assistant token, TMDB key, the guest accounts (names, PINs, coins), the ability to control your speaker, lights and devices, and the local certificate authority's private key.

## Who we worry about

| Actor | Can reach | We assume |
|---|---|---|
| A guest on your Wi-Fi (phone app) | the guest server (ports 80/443/8766/8443) | not trusted: can request songs, nothing else |
| Another device on your network | the same | not trusted |
| A web page in the mirror's browser | the local server on 127.0.0.1 | not trusted (it could be a DNS-rebinding or cross-site attempt) |
| Someone with a login on the machine | everything | **trusted**: local access is game over, by design |
| A third-party channel or theme | whatever it is given | untrusted (but third-party channels are **not loaded yet**) |

## Controls that exist today

- **Secrets are write-only.** Keys are saved to `~/.config/mirror/<name>` with mode 0600 (written atomically, private from the first byte). Every API and screen shows only a masked tail (`••••1a2b`); there is no way to read a saved secret back, and tests assert that a saved secret never appears in a response.
- **The settings API answers only to the mirror itself.** It checks the `Host` header (a DNS-rebinding page cannot make the browser send `localhost`) and requires a custom header that a cross-site page cannot add.
- **Phone setup needs physical presence.** A 6-digit code is created only on the mirror's screen, lasts 10 minutes, works once, locks after 5 wrong guesses, and each address is rate-limited. A successful code gives a short session (random token, kept only as a hash, 15 minutes after last use) in an `HttpOnly`, `SameSite=Strict` cookie, which is `Secure` over HTTPS. Cancelling on the mirror ends every session.
- **Keys and addresses only over HTTPS.** Changing a key, or an address that could receive one (the Home Assistant address), is refused over plain HTTP.
- **Host and Origin checks** on the setup API; public host names are refused.
- **Input is validated**: addresses, IPs, time zones, coordinates, names and Wi-Fi inputs; channel and theme names are plain identifiers; theme files can only be served from inside a theme folder (path traversal is tested).
- **Required channels cannot be hidden**, so nobody can lock themselves out of settings.
- **Wi-Fi rollback**: a failed join puts the previous connection back, so a typo cannot leave the mirror offline.
- **A private certificate authority** for `https://party.local` is *name-constrained* to `.local`, `localhost` and private IP ranges, so a stolen CA key cannot be used to impersonate public websites in clients that enforce name constraints.
- **Push notifications** use the standard encrypted Web Push protocol (RFC 8291/8292) with a per-install key; the contents are encrypted end to end.
- **No telemetry.** The mirror contacts only the services you set up.

## Known gaps (please read)

- The local web server serves the **whole project folder** to the browser on localhost (source code, tools). It is bound to 127.0.0.1, but the public build should serve only an allow-list of web files.
- Guest PINs are 4 digits (with lockouts); guest tokens live in the phone's `localStorage`; the guest server also listens on plain HTTP.
- A Wi-Fi password is passed to `nmcli` as an argument, so another user **on the same machine** could see it in the process list for a moment.
- The settings and `/mirror/*` endpoints trust anything running as your user on the same machine.
- Third-party channels/themes with code are not supported and not sandboxed yet: **only install themes and channels you have read.** (A theme can contain JavaScript that runs on the mirror's page.) See the roadmap.
- The home page loads a font from Google Fonts, and music, sports, weather and poster lookups are made from your network to those services, which can see your IP address and what you search.
- The local certificate authority's key is on the machine and is only as safe as the machine.
