#!/usr/bin/env bash
# One-time Mac signing setup for the Pasodrum work desktop app (D-44).
# Puts the Developer ID certificate and the notarization key in YOUR keychain.
# Nothing is written to the repo, and nothing leaves this Mac except the Apple calls.
set -euo pipefail

TEAM_ID="754ZSYKPH7"
TEAM_NAME="PRPL development AB"
IDENTITY="Developer ID Application: ${TEAM_NAME} (${TEAM_ID})"
PROFILE="pasodrum-notary"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
todo() { printf '  \033[33m→\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
clean_path() { local p="$1"; p="${p%\"}"; p="${p#\"}"; p="${p%\'}"; p="${p#\'}"; p="${p//\\ / }"; p="${p%"${p##*[![:space:]]}"}"; printf '%s' "$p"; }
pause() { read -r -p "  Press Enter when done… " _; }

has_identity() { security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application: .*(${TEAM_ID})"; }

bold "Pasodrum desktop signing setup (team ${TEAM_NAME}, ${TEAM_ID})"
command -v xcrun >/dev/null && xcrun --find notarytool >/dev/null 2>&1 || fail "Xcode command line tools missing. Run: xcode-select --install"
ok "Xcode tools found"

# ── Step 1: Developer ID Application certificate ─────────────────────────────
bold "Step 1 of 3: Developer ID Application certificate"
if has_identity; then
  ok "Already in your keychain: $(security find-identity -v -p codesigning | grep -o "\"Developer ID Application: [^\"]*(${TEAM_ID})\"" | head -1)"
else
  todo "Not found. Only the team's Account Holder can create this certificate."
  echo
  how=2
  if open -Ra Xcode 2>/dev/null; then
    echo "  1) Xcode (easiest): Settings → Accounts → ${TEAM_NAME} → Manage Certificates → + → Developer ID Application"
    echo "  2) Browser: this script makes the request file, you upload it on developer.apple.com"
    read -r -p "  Pick 1 or 2: " how
  else
    todo "Xcode isn't installed, so we'll use the browser."
  fi
  if [ "$how" = "1" ]; then
    open -a Xcode || true
    pause
  else
    tmp="$(mktemp -d)"; chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT
    read -r -p "  Your Apple developer email (only goes into the request file): " email
    openssl req -new -newkey rsa:2048 -nodes -keyout "$tmp/devid.key" -out "$HOME/Desktop/PasodrumDeveloperID.certSigningRequest" \
      -subj "/emailAddress=${email}/CN=${TEAM_NAME}/C=SE" 2>/dev/null
    ok "Request file saved to your Desktop: PasodrumDeveloperID.certSigningRequest"
    todo "On the page that opens: + → Developer ID Application (G2) → upload that file → Download"
    open "https://developer.apple.com/account/resources/certificates/add"
    pause
    read -r -p "  Drag the downloaded .cer file here and press Enter: " cer
    cer="$(clean_path "$cer")"
    [ -f "$cer" ] || fail "File not found: $cer"
    curl -fsSL -o "$tmp/DeveloperIDG2CA.cer" https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
    security import "$tmp/DeveloperIDG2CA.cer" -k "$KEYCHAIN" >/dev/null 2>&1 || true
    security import "$tmp/devid.key" -k "$KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/productsign >/dev/null
    security import "$cer" -k "$KEYCHAIN" >/dev/null
    rm -f "$HOME/Desktop/PasodrumDeveloperID.certSigningRequest"
  fi
  has_identity && ok "Certificate installed: ${IDENTITY}" || fail "Still no Developer ID Application certificate for ${TEAM_ID}. Check Keychain Access → My Certificates."
fi

# ── Step 2 + 3: notarization key → keychain profile ──────────────────────────
bold "Step 2 of 3: App Store Connect API key (for notarization)"
if xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  ok "Keychain profile '${PROFILE}' already works"
else
  todo "On the page that opens: Team Keys → + → name 'Pasodrum notary', access 'Developer' → Generate → Download the .p8 (one chance only)"
  todo "Note the Key ID (in the row) and the Issuer ID (above the table)"
  open "https://appstoreconnect.apple.com/access/integrations/api"
  pause
  read -r -p "  Drag the AuthKey_….p8 file here and press Enter: " p8
  p8="$(clean_path "$p8")"
  [ -f "$p8" ] || fail "File not found: $p8"
  guess="$(basename "$p8" | sed -nE 's/^AuthKey_([A-Z0-9]+)\.p8$/\1/p')"
  read -r -p "  Key ID${guess:+ [$guess]}: " key_id; key_id="${key_id:-$guess}"
  read -r -p "  Issuer ID: " issuer
  [ -n "$key_id" ] && [ -n "$issuer" ] || fail "Key ID and Issuer ID are both needed"

  bold "Step 3 of 3: store it in your keychain as '${PROFILE}'"
  xcrun notarytool store-credentials "$PROFILE" --key "$p8" --key-id "$key_id" --issuer "$issuer" \
    || fail "Apple rejected the key. Check Key ID, Issuer ID and that the key has Developer access."
  ok "Profile '${PROFILE}' stored and checked with Apple"

  safe="$HOME/.appstoreconnect/private_keys"
  mkdir -p "$safe"; chmod 700 "$HOME/.appstoreconnect" "$safe"
  if [ "$(dirname "$p8")" != "$safe" ]; then mv "$p8" "$safe/" && chmod 600 "$safe/$(basename "$p8")"; ok "Moved the .p8 to $safe (out of Downloads)"; fi
fi

bold "Done. Tell the M9 session: signing ready"
echo "  Identity: ${IDENTITY}"
echo "  Notary profile: ${PROFILE}"
