# Deploy — homelab k3s

All commands use the homelab kubeconfig: `export KUBECONFIG=~/.kube/homelab`.

## One-time setup

1. **Database** — on the existing Postgres, create a role and database:
   ```sql
   CREATE ROLE finance LOGIN PASSWORD '<password>';
   CREATE DATABASE finance OWNER finance;
   ```
2. **Google OAuth client** (Google Cloud Console → Credentials → OAuth client, type *Web*):
   - Authorized redirect URI: `https://finance.fevirtus.dev/api/auth/callback/google`
   - (Local dev) `http://localhost:3000/api/auth/callback/google`
3. **Secrets** — run `KUBECONFIG=~/.kube/homelab ./deploy/create-secrets.sh` (prompts hide input),
   or do it by hand (fill in values yourself; never commit them):
   ```bash
   kubectl create namespace finance --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n finance create secret generic finance-api-env \
     --from-literal=DATABASE_URL='postgresql+asyncpg://finance:<password>@<pg-host>:5432/finance' \
     --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
     --from-literal=GOOGLE_CLIENT_IDS='<web-client-id>' \
     --from-literal=ALLOWED_EMAILS='<your-email>' \
     --from-literal=PUBLIC_WEB_URL='https://finance.fevirtus.dev'
   kubectl -n finance create secret generic finance-web-env \
     --from-literal=API_URL='http://finance-api.finance.svc.cluster.local' \
     --from-literal=NEXTAUTH_URL='https://finance.fevirtus.dev' \
     --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
     --from-literal=GOOGLE_CLIENT_ID='<web-client-id>' \
     --from-literal=GOOGLE_CLIENT_SECRET='<web-client-secret>'
   ```
4. **Cloudflare Tunnel** — add public hostnames `finance.fevirtus.dev` and
   `finance-api.fevirtus.dev` pointing at the Traefik service, the same way as `reader`.

## Deploy / upgrade

```bash
cd deploy
kustomize edit set image ghcr.io/fevirtus/finance-api:sha-<git-sha> ghcr.io/fevirtus/finance-web:sha-<git-sha>
kubectl apply -k .
kubectl -n finance rollout status deploy/finance-api deploy/finance-web
```

The `migrate` initContainer runs `alembic upgrade head` under a Postgres advisory lock,
so both API replicas can start at once safely.

## Smoke test

```bash
curl -s https://finance-api.fevirtus.dev/healthz   # {"status":"ok"}
```
Then open https://finance.fevirtus.dev, sign in with Google, create the family group.
