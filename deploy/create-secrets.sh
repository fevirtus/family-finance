#!/usr/bin/env bash
# Create/replace the finance-api-env and finance-web-env secrets on the homelab cluster.
# Run it yourself: secret values are typed at hidden prompts (or passed as env vars)
# and go straight to kubectl — they are never printed.
#
#   KUBECONFIG=~/.kube/homelab ./deploy/create-secrets.sh
#
# Optional env vars to skip prompts: DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# ALLOWED_EMAILS. With 1Password CLI you can do e.g.
#   DATABASE_URL="$(op read 'op://<vault>/<item>/<field>')" ./deploy/create-secrets.sh
set -euo pipefail

NS=finance
WEB_URL=https://finance.fevirtus.dev

ask() { # ask VAR "prompt" [secret]
  local var=$1 prompt=$2 secret=${3:-}
  if [[ -z "${!var:-}" ]]; then
    if [[ -n "$secret" ]]; then read -rsp "$prompt: " "$var"; echo; else read -rp "$prompt: " "$var"; fi
  fi
  [[ -n "${!var}" ]] || { echo "$var is required" >&2; exit 1; }
}

ask DATABASE_URL "DATABASE_URL (postgresql+asyncpg://finance:<pw>@<host>:5432/finance)" secret
ask GOOGLE_CLIENT_ID "Google OAuth client ID"
ask GOOGLE_CLIENT_SECRET "Google OAuth client secret" secret
ask ALLOWED_EMAILS "ALLOWED_EMAILS (comma-separated)"

[[ "$DATABASE_URL" == postgresql+asyncpg://* ]] || { echo "DATABASE_URL must start with postgresql+asyncpg://" >&2; exit 1; }

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl -n "$NS" create secret generic finance-api-env \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_IDS="$GOOGLE_CLIENT_ID" \
  --from-literal=ALLOWED_EMAILS="$ALLOWED_EMAILS" \
  --from-literal=PUBLIC_WEB_URL="$WEB_URL" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl -n "$NS" create secret generic finance-web-env \
  --from-literal=API_URL="http://finance-api.$NS.svc.cluster.local" \
  --from-literal=NEXTAUTH_URL="$WEB_URL" \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  --from-literal=GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "Secrets finance-api-env and finance-web-env are in namespace $NS."
