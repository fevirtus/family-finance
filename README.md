# Family Finance

Family spending tracker: FastAPI (`api/`), Next.js (`web/`), deployed to homelab k3s (`deploy/`).
Design: `docs/superpowers/specs/2026-09-29-family-finance-design.md`.

## Local development

```bash
# API
cd api
docker compose up -d db
cp .env.example .env        # fill GOOGLE_CLIENT_IDS, ALLOWED_EMAILS
uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload
uv run pytest               # uses the finance_test database

# Web
cd web
cp .env.example .env.local  # fill Google OAuth values
pnpm install && pnpm dev    # http://localhost:3000
pnpm test
```
