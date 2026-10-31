# Security policy

OpenMirror runs in your home, keeps your Wi-Fi and API keys, and can reach your speaker and your smart-home hub. Security reports are welcome and taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Use GitHub's private reporting: on the repository page choose **Security → Report a vulnerability**. If that is not available, contact the maintainers through the address listed on the maintainers' profile pages.

Please include what you found, how to reproduce it, and what it lets an attacker do. We aim to acknowledge a report within 7 days, to agree on a fix and a disclosure date with you, and to credit you if you wish.

## What is in scope

- The settings screen and API, pairing and the phone setup page, the guest server, the local certificate authority, push notifications, theme and channel loading, and anything that exposes a key, a token or a Wi-Fi password.
- Ways for a guest or another device on the network to do something only the owner should be able to do.

Out of scope: attacks that need physical control of the machine or its login, and denial of service by someone already on your Wi-Fi.

## Supported versions

Only the latest release receives fixes while the project is in alpha.

## How it protects you (short version)

Secrets are write-only and stored with mode 0600; the settings API answers only to the mirror itself; the phone setup page needs a one-time code shown on the mirror and only accepts keys over HTTPS; input is validated; third-party channels are not loaded yet. The full list, and the known gaps, are in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).
