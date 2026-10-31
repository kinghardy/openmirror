# Maintainers' guide

## Before the first public push

1. `python3 tools/export_public.py --out ~/openmirror-export` (add `--brand "words you intend to keep"` for names the scanner flags on purpose). It builds a one-commit copy from the last commit, leaves out private notes and the promo film, scans for secrets and personal data, and refuses to continue if it finds any.
2. Look through the exported folder. Confirm `docs/ASSETS.md` is true: especially any audio, images and fonts you did not make.
3. Create the GitHub repository (empty, no README), then `git remote add origin <url> && git push -u origin main` from the exported folder.

## Repository settings to turn on

- **Security → Private vulnerability reporting** (SECURITY.md points to it), **Secret scanning** and **push protection**, **Dependabot alerts**.
- **Branch protection** on `main`: pull request required, CI must pass, no force-push, at least one review once there is more than one maintainer.
- Optional: require signed commits and sign release tags.

## Releasing

Update `VERSION` and `CHANGELOG.md`, tag `vX.Y.Z` (`git tag -s` if you sign), and attach the exported source archive and its SHA-256 to the release.

## Keeping the public repo clean

Install the guard (`git config core.hooksPath tools/hooks`). `tools/scan_secrets.py` also runs in CI. If a secret is ever pushed: rotate it first, then clean history; deleting a commit does not un-leak a key.
