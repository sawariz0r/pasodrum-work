# Pasodrum work for Mac

Electron shell around https://pasodrum.work (D-44). Plain CommonJS, no bundler, own `package-lock.json` (use npm here, not pnpm; this folder is outside the pnpm workspace). The M9-01 spike results are in `tasks/done/M9-01-shell-spike.md` and in git history (`RESULT.md`).

## Run locally

1. `npm --prefix apps/desktop-electron ci`
2. `npm --prefix apps/desktop-electron start` loads http://localhost:4173 (or `PASODRUM_URL`).
3. `npm --prefix apps/desktop-electron run pack` builds an ad-hoc signed app in `release/mac-arm64/` (no Apple account; it can't install updates).
4. On a packaged build, `PASODRUM_URL` picks the server and `PASODRUM_FEED` the update feed.

## Release (CEO, on your Mac, from the repo root)

Releases are a local command on a signed-in Mac, no CI (D-44).

One time:

1. Xcode → Settings → Accounts → Manage Certificates → + → **Developer ID Application** (PRPL development AB).
2. Check it: `security find-identity -v -p codesigning` lists `Developer ID Application: PRPL development AB (754ZSYKPH7)`.
3. Store the notary login: `xcrun notarytool store-credentials pasodrum-notary` (key ID, issuer ID and `.p8` path from App Store Connect → Users and Access → Integrations → Keys).
4. On the server: `mkdir -p /data/pasodrum-downloads/mac`, then redeploy in Coolify.

Every release:

1. Bump `version` in `apps/desktop-electron/package.json`.
2. `npm --prefix apps/desktop-electron ci && npm --prefix apps/desktop-electron run release` (signs and notarizes, ~5 min).
3. Check it: `spctl -a -vv "apps/desktop-electron/release/mac-arm64/Pasodrum work.app"` says `accepted` and `Notarized Developer ID`.
4. `PASODRUM_DOWNLOADS=<you>@<server>:/data/pasodrum-downloads/mac/ npm --prefix apps/desktop-electron run publish:feed` (uploads `latest-mac.yml` last, so apps only see a complete release).
5. First release only: set `MAC_DOWNLOAD = true` in `apps/web/src/platform/web.ts` and push, so browsers on Mac offer "Download for Mac".

Installed apps check the feed at start and every 4 hours, download in the background and install on quit.
