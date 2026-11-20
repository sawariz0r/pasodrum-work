#!/usr/bin/env bash
# Writes dev/.env.production so seed and probe can run against production. Run: pnpm setup:prod
set -euo pipefail
cd "$(dirname "$0")/.."
out=dev/.env.production

read -rp "Domain [pasodrum.work]: " domain
domain=${domain:-pasodrum.work}

echo "Registration token: Coolify → this resource → Environment Variables → SERVICE_PASSWORD_64_REGISTRATION"
read -rsp "Paste it (hidden): " token
echo
[ -n "$token" ] || { echo "No token entered."; exit 1; }

valid=$(curl -fsS -m 15 "https://$domain/_matrix/client/v1/register/m.login.registration_token/validity?token=$token" || true)
case "$valid" in
  *'"valid":true'*) echo "Token accepted by $domain." ;;
  *) echo "The server didn't accept that token (${valid:-no response}). Nothing written."; exit 1 ;;
esac

umask 077
cat > "$out" <<EOF
MATRIX_BASE=https://$domain
MATRIX_SERVER=$domain
REGISTRATION_TOKEN=$token
EOF
echo "Saved $out (gitignored)."
