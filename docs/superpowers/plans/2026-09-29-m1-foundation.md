# M1 — Nền tảng (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable FastAPI + Next.js app where an allowlisted Google user can sign in, create a family group, invite a member, manage accounts and categories, and add/edit/filter transactions on the web.

**Architecture:** Monorepo. `api/` is a stateless FastAPI service (SQLAlchemy async + asyncpg, Alembic migrations guarded by a Postgres advisory lock) that owns all data and auth; it exchanges a Google ID token for its own HS256 JWT. `web/` is a Next.js App Router app using next-auth (Google) whose server components and server actions call the API server-side with that JWT. `deploy/` holds kustomize manifests for the homelab k3s (namespace `finance`, Traefik ingress, Cloudflare Tunnel in front).

**Tech Stack:** Python 3.12, uv, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, pydantic-settings, python-jose, google-auth, pytest + pytest-asyncio + httpx; Next.js 16, React 19, next-auth 4, Tailwind 4, Vitest + Testing Library; Postgres 17 (local docker for dev/test); GitHub Actions → GHCR; kustomize.

**Spec:** `docs/superpowers/specs/2026-09-29-family-finance-design.md` (this plan implements milestone **M1** only).

## Global Constraints

- Money is `BIGINT` VND; negative = expense, positive = income. API JSON uses plain integers.
- Timestamps are `timestamptz` stored in UTC; month boundaries and display use `Asia/Ho_Chi_Minh`.
- Every business table has `group_id`; every group-scoped endpoint checks membership; non-members get **404** (never reveal existence).
- Only emails in `ALLOWED_EMAILS` (comma-separated, compared lowercase/trimmed) may sign in; empty list = nobody.
- The API is stateless (no local files, no in-memory state across requests); runs with 2 replicas.
- Migrations run from an initContainer with `pg_advisory_lock` so only one pod migrates.
- Images: `ghcr.io/fevirtus/finance-api`, `ghcr.io/fevirtus/finance-web` (public GHCR, no pull secret — same as `reader`).
- Hosts: `finance.fevirtus.dev` → web, `finance-api.fevirtus.dev` → api; ingress class `traefik`; no TLS in-cluster (Cloudflare terminates).
- Secrets are created by the owner; code and manifests only reference `finance-api-env` / `finance-web-env` by name. Never commit or print secret values.
- UI copy is Vietnamese.
- Local Postgres for dev/test: `localhost:55432`, user/password `finance`/`finance`, databases `finance` (dev) and `finance_test` (tests).

## Review Focus

1. A transaction body referencing an account or category from **another group** must be rejected (422), and group-scoped paths for a group the caller is not in must 404 — never silently succeed. (Task 5, Task 6)
2. A transaction at 23:30 on the last day of a month in Vietnam time (16:30 UTC) belongs to that month, not the next. (Task 6)
3. `ALLOWED_EMAILS` entries and Google emails differing only by case/whitespace must still match. (Task 3)
4. Invite links: reused by a different person → 410; expired → 410; accepted twice by the same member → 200 no-op. (Task 4)
5. Searching for text containing `%` or `_` must match literally, not as SQL wildcards. (Task 6)

---

## File Structure

```
family-finance/
  .gitignore
  README.md
  api/
    pyproject.toml, uv.lock, alembic.ini, Dockerfile, .dockerignore, .env.example, docker-compose.yml
    scripts/initdb.sql                      creates finance_test DB for local docker
    migrations/env.py, script.py.mako, versions/0001_initial.py
    app/
      main.py                               create_app(): wires routers
      config.py                             Settings (env)
      db.py                                 Base, engine, SessionLocal, get_session
      models.py                             ORM models for M1 tables
      health.py                             GET /healthz
      auth/  google.py (verify ID token)  tokens.py (JWT)  deps.py (get_current_user)  schemas.py  router.py (/auth/google, /me)
      groups/ default_categories.py  service.py (get_membership, create_group)  schemas.py  router.py (/groups, /invites)
      ledger/ common.py (get_in_group)  timeutil.py (month_range)  schemas.py  accounts.py  categories.py  transactions.py
    tests/
      __init__.py, conftest.py, helpers.py
      test_health.py, test_migrations.py, test_auth.py, test_groups.py,
      test_accounts_categories.py, test_timeutil.py, test_transactions.py
  web/
    (create-next-app scaffold) package.json, next.config.ts, vitest.config.ts, vitest.setup.ts, Dockerfile, .dockerignore, .env.example
    auth.ts                                 next-auth options (Google → API token exchange)
    types/next-auth.d.ts
    lib/ api.ts (server-only apiFetch, ApiError)  types.ts  money.ts(+test)  time.ts(+test)  ui.ts
    components/ sign-out-button.tsx
    app/ layout.tsx, page.tsx, globals.css
         api/auth/[...nextauth]/route.ts
         login/page.tsx, login/login-button.tsx
         onboarding/page.tsx, onboarding/actions.ts
         invite/[token]/page.tsx, invite/[token]/actions.ts
         g/[groupId]/layout.tsx, g/[groupId]/error.tsx
         g/[groupId]/accounts/{page.tsx,actions.ts}
         g/[groupId]/categories/{page.tsx,actions.ts}
         g/[groupId]/settings/{page.tsx,actions.ts,invite-link.tsx}
         g/[groupId]/transactions/{page.tsx,actions.ts,transaction-form.tsx,transaction-form.test.tsx}
  deploy/  kustomization.yaml, namespace.yaml, api.yaml, web.yaml, ingress.yaml, README.md
  .github/workflows/ api.yml, web.yml
```

---

### Task 1: API scaffold, config, DB session, health check

**Files:**
- Create: `.gitignore`, `api/pyproject.toml`, `api/.env.example`, `api/docker-compose.yml`, `api/scripts/initdb.sql`, `api/app/__init__.py`, `api/app/config.py`, `api/app/db.py`, `api/app/health.py`, `api/app/main.py`, `api/tests/__init__.py`, `api/tests/conftest.py`
- Test: `api/tests/test_health.py`

**Interfaces:**
- Produces: `app.config.settings: Settings` with `.database_url`, `.jwt_secret`, `.jwt_ttl_seconds`, `.google_client_id_list: list[str]`, `.allowed_email_set: set[str]`, `.public_web_url`; `app.db.Base`, `app.db.engine`, `app.db.SessionLocal`, `app.db.get_session() -> AsyncIterator[AsyncSession]`; `app.main.create_app() -> FastAPI`; test fixture `client: httpx.AsyncClient`.

- [ ] **Step 1: Create root `.gitignore`**

```gitignore
# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/
.ruff_cache/
# Node
node_modules/
.next/
out/
*.tsbuildinfo
# Env
.env
.env.local
.env.*.local
# OS
.DS_Store
```

- [ ] **Step 2: Create `api/pyproject.toml`**

```toml
[project]
name = "finance-api"
version = "0.1.0"
description = "Family Finance API"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.116.1",
  "uvicorn[standard]>=0.35.0",
  "sqlalchemy[asyncio]>=2.0.43",
  "asyncpg>=0.30.0",
  "alembic>=1.16.0",
  "pydantic-settings>=2.10.1",
  "python-jose[cryptography]>=3.5.0",
  "google-auth>=2.40.3",
  "requests>=2.32.5",
  "tzdata>=2025.2",
]

[dependency-groups]
dev = [
  "pytest>=8.4.0",
  "pytest-asyncio>=1.1.0",
  "httpx>=0.28.0",
  "ruff>=0.12.11",
]

[tool.uv]
package = false

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I"]

[tool.pytest.ini_options]
pythonpath = ["."]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "session"
asyncio_default_test_loop_scope = "session"
```

- [ ] **Step 3: Create local Postgres for dev/test**

`api/docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: finance
      POSTGRES_PASSWORD: finance
      POSTGRES_DB: finance
    ports:
      - "55432:5432"
    volumes:
      - ./scripts/initdb.sql:/docker-entrypoint-initdb.d/initdb.sql:ro
```

`api/scripts/initdb.sql`:

```sql
CREATE DATABASE finance_test;
```

`api/.env.example`:

```dotenv
DATABASE_URL=postgresql+asyncpg://finance:finance@localhost:55432/finance
JWT_SECRET=change-me
GOOGLE_CLIENT_IDS=xxxx.apps.googleusercontent.com
ALLOWED_EMAILS=you@gmail.com
PUBLIC_WEB_URL=http://localhost:3000
```

Run: `cd api && docker compose up -d db && uv sync`
Expected: container `db` running; `.venv` created.

- [ ] **Step 4: Create config and DB modules**

`api/app/__init__.py`: empty file.

`api/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://finance:finance@localhost:55432/finance"
    jwt_secret: str = "dev-secret-change-me"
    jwt_ttl_seconds: int = 7 * 24 * 60 * 60
    google_client_ids: str = ""
    allowed_emails: str = ""
    public_web_url: str = "http://localhost:3000"

    @property
    def google_client_id_list(self) -> list[str]:
        return [x.strip() for x in self.google_client_ids.split(",") if x.strip()]

    @property
    def allowed_email_set(self) -> set[str]:
        return {x.strip().lower() for x in self.allowed_emails.split(",") if x.strip()}


settings = Settings()
```

`api/app/db.py`:

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 5: Write the failing health test and test fixtures**

`api/tests/__init__.py`: empty file.

`api/tests/conftest.py`:

```python
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://finance:finance@localhost:55432/finance_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_CLIENT_IDS", "test-client")
os.environ.setdefault("ALLOWED_EMAILS", "me@example.com, wife@example.com, friend@example.com")
os.environ.setdefault("PUBLIC_WEB_URL", "http://web.test")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
```

`api/tests/test_health.py`:

```python
async def test_healthz_reports_ok_when_db_reachable(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

Run: `cd api && uv run pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 6: Implement health router and app factory**

`api/app/health.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return {"status": "ok"}
```

`api/app/main.py`:

```python
from fastapi import FastAPI

from app import health


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    return app


app = create_app()
```

- [ ] **Step 7: Run tests and lint**

Run: `cd api && uv run pytest -v && uv run ruff check .`
Expected: 1 passed; ruff `All checks passed!`

- [ ] **Step 8: Commit**

```bash
git add .gitignore api
git commit -m "feat(api): scaffold FastAPI app with config, db session and health check"
```

---

### Task 2: ORM models and initial Alembic migration

**Files:**
- Create: `api/app/models.py`, `api/alembic.ini`, `api/migrations/env.py`, `api/migrations/script.py.mako`, `api/migrations/versions/0001_initial.py` (generated)
- Modify: `api/tests/conftest.py` (add migrate + truncate fixtures)
- Test: `api/tests/test_migrations.py`

**Interfaces:**
- Consumes: `app.db.Base`, `app.config.settings`.
- Produces ORM classes in `app.models`: `User, Group, GroupMember, GroupInvite, Account, Category, Transaction` with the columns listed below (attribute names = column names). Test fixtures: session-scoped `migrated_db` (autouse) and function-scoped `clean_db` (autouse, truncates all tables after each test).

- [ ] **Step 1: Write `api/app/models.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    # No FK on purpose: avoids a users<->groups FK cycle; validated against membership on read.
    default_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = _created_at()


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(16), default="family")
    currency: Mapped[str] = mapped_column(String(3), default="VND")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = _created_at()


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16), default="member")
    joined_at: Mapped[datetime] = _created_at()


class GroupInvite(Base):
    __tablename__ = "group_invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created_at()


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(16))
    provider: Mapped[str | None] = mapped_column(String(32))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created_at()


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(16))
    icon: Mapped[str | None] = mapped_column(String(16))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _created_at()


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_group_occurred", "group_id", "occurred_at"),
        Index("ix_transactions_dedupe", "account_id", "amount", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    amount: Mapped[int] = mapped_column(BigInteger)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(Text, default="")
    merchant: Mapped[str | None] = mapped_column(String(255))
    counterparty: Mapped[str | None] = mapped_column(String(255))
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )
    source: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="confirmed")
    classified_by: Mapped[str | None] = mapped_column(String(8))
    is_internal_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    transfer_pair_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    # FK to raw_events is added in M2 when that table exists.
    raw_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Initialize Alembic (async template)**

Run: `cd api && uv run alembic init -t async migrations`
Expected: creates `alembic.ini`, `migrations/env.py`, `migrations/script.py.mako`, `migrations/versions/`.

Edit `api/alembic.ini`: keep the file, but set the `sqlalchemy.url` line to empty (`sqlalchemy.url =`) — `env.py` reads the URL from settings.

- [ ] **Step 3: Replace `api/migrations/env.py`**

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import settings
from app.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Session-level advisory lock so that only one pod runs migrations at a time.
MIGRATION_LOCK_ID = 7_314_001


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    connection.execute(text("SELECT pg_advisory_lock(:k)"), {"k": MIGRATION_LOCK_ID})
    connection.commit()
    try:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()
    finally:
        connection.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": MIGRATION_LOCK_ID})
        connection.commit()


async def run_async_migrations() -> None:
    engine = create_async_engine(settings.database_url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
```

- [ ] **Step 4: Generate the initial migration against the (empty) dev DB**

Run: `cd api && uv run alembic revision --autogenerate -m "initial" --rev-id 0001`
Expected: `migrations/versions/0001_initial.py` created containing `op.create_table` for `users, groups, group_members, group_invites, accounts, categories, transactions`, the two `ix_transactions_*` indexes, `ix_accounts_group_id`, `ix_categories_group_id`, and a `downgrade()` that drops them in reverse order. Open the file and confirm it contains all 7 tables; delete any `# ### commands auto generated` comments you don't want, but do not change the operations.

Run: `uv run alembic upgrade head && uv run alembic downgrade base && uv run alembic upgrade head`
Expected: all three commands succeed (proves downgrade works too).

- [ ] **Step 5: Write the failing drift test and DB fixtures**

Replace `api/tests/conftest.py` with:

```python
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://finance:finance@localhost:55432/finance_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_CLIENT_IDS", "test-client")
os.environ.setdefault("ALLOWED_EMAILS", "me@example.com, wife@example.com, friend@example.com")
os.environ.setdefault("PUBLIC_WEB_URL", "http://web.test")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402, F401
from app.db import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402

API_DIR = Path(__file__).resolve().parents[1]


def _alembic(*args: str) -> None:
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=API_DIR, check=True)


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    """Build the test schema with the real migrations, exactly like production."""
    _alembic("downgrade", "base")
    _alembic("upgrade", "head")


@pytest.fixture(autouse=True)
async def clean_db():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
```

`api/tests/test_migrations.py`:

```python
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.db import Base, engine


async def test_migrations_match_models():
    async with engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(MigrationContext.configure(sync_conn), Base.metadata)
        )
    assert diff == []
```

Run: `cd api && uv run pytest -v`
Expected: PASS for both tests. (To see it fail first, temporarily add a column to `Account` in `models.py`, re-run, observe `add_column` in the diff, then revert.)

- [ ] **Step 6: Lint and commit**

Run: `uv run ruff check .`
Expected: `All checks passed!` (add `migrations/versions/*` fixes via `uv run ruff check . --fix` if import ordering complains).

```bash
git add api
git commit -m "feat(api): add M1 ORM models and initial Alembic migration with advisory lock"
```

---

### Task 3: Google login, JWT, current user, `/me`

**Files:**
- Create: `api/app/auth/__init__.py`, `api/app/auth/google.py`, `api/app/auth/tokens.py`, `api/app/auth/deps.py`, `api/app/auth/schemas.py`, `api/app/auth/router.py`, `api/tests/helpers.py`
- Modify: `api/app/main.py`, `api/tests/conftest.py`
- Test: `api/tests/test_auth.py`

**Interfaces:**
- Consumes: `app.models.User, Group, GroupMember`, `app.db.get_session`, `app.config.settings`.
- Produces:
  - `app.auth.google.GoogleIdentity(sub: str, email: str, name: str, picture: str | None)`; `get_google_verifier() -> Callable[[str], GoogleIdentity]` (FastAPI dependency, overridable in tests).
  - `app.auth.tokens.create_access_token(user_id: UUID) -> tuple[str, datetime]`; `decode_access_token(token: str) -> UUID | None`.
  - `app.auth.deps.get_current_user` → `User` (401 if missing/invalid).
  - `app.auth.router.build_me(session, user) -> MeOut`.
  - HTTP: `POST /auth/google {id_token}` → `{access_token, expires_at, user: MeOut}`; `GET /me` → `MeOut`; `PATCH /me {default_group_id}` → `MeOut`.
  - `MeOut = {id, email, name, avatar_url, default_group_id, groups: [{id, name, type, role}]}`.
  - Test helpers: `tests.helpers.login(client, email="me@example.com", name="Me") -> dict[str, str]` (auth headers). Fake Google tokens have the form `"<sub>|<email>|<name>"`; the token `"bad"` is rejected with 401.

- [ ] **Step 1: Write the failing tests**

`api/tests/helpers.py`:

```python
from httpx import AsyncClient


async def login(client: AsyncClient, email: str = "me@example.com", name: str = "Me") -> dict:
    response = await client.post("/auth/google", json={"id_token": f"sub-{email}|{email}|{name}"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def create_group(client: AsyncClient, headers: dict, name: str = "Nhà mình") -> str:
    response = await client.post("/groups", json={"name": name}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]
```

`api/tests/test_auth.py`:

```python
async def test_login_creates_user_and_returns_token(client):
    response = await client.post("/auth/google", json={"id_token": "s1|me@example.com|Me"})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "me@example.com"
    assert body["user"]["groups"] == []
    assert body["user"]["default_group_id"] is None

    me = await client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


async def test_login_again_updates_profile_and_keeps_user(client):
    first = await client.post("/auth/google", json={"id_token": "s1|me@example.com|Old"})
    second = await client.post("/auth/google", json={"id_token": "s1|me@example.com|New"})
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert second.json()["user"]["name"] == "New"


async def test_email_not_in_allowlist_is_forbidden(client):
    response = await client.post("/auth/google", json={"id_token": "s2|stranger@example.com|X"})
    assert response.status_code == 403


async def test_allowlist_match_ignores_case(client):
    response = await client.post("/auth/google", json={"id_token": "s3|ME@Example.COM|Me"})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "me@example.com"


async def test_invalid_google_token_is_unauthorized(client):
    response = await client.post("/auth/google", json={"id_token": "bad"})
    assert response.status_code == 401


async def test_me_requires_valid_bearer(client):
    assert (await client.get("/me")).status_code == 401
    garbage = {"Authorization": "Bearer not-a-jwt"}
    assert (await client.get("/me", headers=garbage)).status_code == 401
```

Replace `api/tests/conftest.py` with (adds the fake Google verifier and overrides it in `client`):

```python
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://finance:finance@localhost:55432/finance_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("GOOGLE_CLIENT_IDS", "test-client")
os.environ.setdefault("ALLOWED_EMAILS", "me@example.com, wife@example.com, friend@example.com")
os.environ.setdefault("PUBLIC_WEB_URL", "http://web.test")

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402, F401
from app.auth.google import GoogleIdentity, get_google_verifier  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402

API_DIR = Path(__file__).resolve().parents[1]


def _alembic(*args: str) -> None:
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=API_DIR, check=True)


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    """Build the test schema with the real migrations, exactly like production."""
    _alembic("downgrade", "base")
    _alembic("upgrade", "head")


@pytest.fixture(autouse=True)
async def clean_db():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))


def fake_google_verifier(token: str) -> GoogleIdentity:
    """Test tokens look like 'sub|email|name'; anything else is rejected."""
    parts = token.split("|")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    sub, email, name = parts
    return GoogleIdentity(sub=sub, email=email, name=name, picture=None)


@pytest.fixture
async def client():
    app = create_app()
    app.dependency_overrides[get_google_verifier] = lambda: fake_google_verifier
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
```

Run: `cd api && uv run pytest tests/test_auth.py -v`
Expected: FAIL at import — `ModuleNotFoundError: No module named 'app.auth'`.

- [ ] **Step 2: Implement Google verification**

`api/app/auth/__init__.py`: empty file.

`api/app/auth/google.py`:

```python
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import HTTPException
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import settings

CLOCK_SKEW_SECONDS = 60


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None


GoogleVerifier = Callable[[str], GoogleIdentity]


def verify_google_id_token(token: str) -> GoogleIdentity:
    allowed_audiences = set(settings.google_client_id_list)
    if not allowed_audiences:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_IDS is not configured")
    try:
        info = google_id_token.verify_oauth2_token(
            token.strip(),
            google_requests.Request(),
            None,
            clock_skew_in_seconds=CLOCK_SKEW_SECONDS,
        )
    except google_exceptions.TransportError as exc:
        raise HTTPException(status_code=503, detail="Cannot reach Google to verify token") from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc

    token_audiences = {info.get("aud"), info.get("azp")} - {None}
    if token_audiences.isdisjoint(allowed_audiences):
        raise HTTPException(status_code=401, detail="Google token audience not allowed")
    if not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    return GoogleIdentity(
        sub=info["sub"],
        email=info["email"],
        name=info.get("name", ""),
        picture=info.get("picture"),
    )


def get_google_verifier() -> GoogleVerifier:
    return verify_google_id_token
```

- [ ] **Step 3: Implement JWT tokens and current-user dependency**

`api/app/auth/tokens.py`:

```python
import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=settings.jwt_ttl_seconds)
    payload = {
        "sub": str(user_id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM), expires_at


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != "access":
        return None
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None
```

`api/app/auth/deps.py`:

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.tokens import decode_access_token
from app.db import get_session
from app.models import User

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_access_token(credentials.credentials)
    user = await session.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
```

- [ ] **Step 4: Implement schemas and router**

`api/app/auth/schemas.py`:

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GoogleLoginIn(BaseModel):
    id_token: str = Field(min_length=1)


class GroupSummary(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    role: str


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None
    default_group_id: uuid.UUID | None
    groups: list[GroupSummary]


class LoginOut(BaseModel):
    access_token: str
    expires_at: datetime
    user: MeOut


class MePatch(BaseModel):
    default_group_id: uuid.UUID
```

`api/app/auth/router.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.google import GoogleVerifier, get_google_verifier
from app.auth.schemas import GoogleLoginIn, GroupSummary, LoginOut, MeOut, MePatch
from app.auth.tokens import create_access_token
from app.config import settings
from app.db import get_session
from app.models import Group, GroupMember, User

router = APIRouter(tags=["auth"])


async def build_me(session: AsyncSession, user: User) -> MeOut:
    rows = (
        await session.execute(
            select(Group, GroupMember.role)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user.id)
            .order_by(Group.created_at)
        )
    ).all()
    groups = [GroupSummary(id=g.id, name=g.name, type=g.type, role=role) for g, role in rows]
    member_ids = {g.id for g in groups}
    default_group_id = user.default_group_id if user.default_group_id in member_ids else None
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        default_group_id=default_group_id,
        groups=groups,
    )


@router.post("/auth/google", response_model=LoginOut)
async def google_login(
    body: GoogleLoginIn,
    session: AsyncSession = Depends(get_session),
    verify: GoogleVerifier = Depends(get_google_verifier),
) -> LoginOut:
    identity = await run_in_threadpool(verify, body.id_token)
    email = identity.email.strip().lower()
    if email not in settings.allowed_email_set:
        raise HTTPException(status_code=403, detail="Email not allowed")

    user = await session.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = User(
            google_sub=identity.sub, email=email, name=identity.name, avatar_url=identity.picture
        )
        session.add(user)
    else:
        user.email = email
        user.name = identity.name
        user.avatar_url = identity.picture
    await session.commit()

    token, expires_at = create_access_token(user.id)
    return LoginOut(access_token=token, expires_at=expires_at, user=await build_me(session, user))


@router.get("/me", response_model=MeOut)
async def get_me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> MeOut:
    return await build_me(session, user)


@router.patch("/me", response_model=MeOut)
async def patch_me(
    body: MePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    if await session.get(GroupMember, (body.default_group_id, user.id)) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    user.default_group_id = body.default_group_id
    await session.commit()
    return await build_me(session, user)
```

`api/app/main.py`:

```python
from fastapi import FastAPI

from app import health
from app.auth import router as auth_router


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    app.include_router(auth_router.router)
    return app


app = create_app()
```

- [ ] **Step 5: Run tests**

Run: `cd api && uv run pytest -v && uv run ruff check .`
Expected: all tests PASS; ruff clean.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): Google ID token login with email allowlist, JWT and /me"
```

---

### Task 4: Groups, default categories, invites

**Files:**
- Create: `api/app/groups/__init__.py`, `api/app/groups/default_categories.py`, `api/app/groups/service.py`, `api/app/groups/schemas.py`, `api/app/groups/router.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_groups.py`

**Interfaces:**
- Consumes: `get_current_user`, `get_session`, models, `settings.public_web_url`, `tests.helpers.login/create_group`.
- Produces:
  - `app.groups.service.get_membership(group_id: UUID, user=Depends(get_current_user), session=Depends(get_session)) -> GroupMember` — FastAPI dependency; 404 if caller is not a member. Used by every group-scoped router.
  - `app.groups.service.create_group(session, user, name: str, type_: str) -> Group` — also seeds `DEFAULT_CATEGORIES` and sets `user.default_group_id` if empty.
  - `app.groups.default_categories.DEFAULT_CATEGORIES: list[tuple[str, str, str]]` — (name, kind, icon); 16 expense + 5 income = 21 entries.
  - HTTP: `POST /groups {name, type="family"}` → 201 `GroupOut{id,name,type,currency,role}`; `GET /groups/{id}` → `GroupDetail{id,name,type,currency,members:[{user_id,name,email,avatar_url,role}]}`; `POST /groups/{id}/invites` (owner only) → 201 `{url, expires_at}`; `GET /invites/{token}` → `{group_id, group_name, expires_at, valid, already_member}`; `POST /invites/{token}/accept` → `GroupOut`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_groups.py`:

```python
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.db import SessionLocal
from app.models import Category, GroupInvite
from tests.helpers import create_group, login


async def test_create_group_makes_owner_seeds_categories_and_sets_default(client):
    me = await login(client)
    response = await client.post("/groups", json={"name": "Nhà mình"}, headers=me)
    assert response.status_code == 201
    group = response.json()
    assert group["role"] == "owner"
    assert group["type"] == "family"
    assert group["currency"] == "VND"

    profile = (await client.get("/me", headers=me)).json()
    assert profile["default_group_id"] == group["id"]
    assert [g["id"] for g in profile["groups"]] == [group["id"]]

    async with SessionLocal() as session:
        count = await session.scalar(
            select(func.count()).select_from(Category).where(Category.group_id == group["id"])
        )
    assert count == 21


async def test_second_group_does_not_change_default(client):
    me = await login(client)
    first = await create_group(client, me, "A")
    await create_group(client, me, "B")
    assert (await client.get("/me", headers=me)).json()["default_group_id"] == first


async def test_non_member_gets_404_for_group(client):
    me = await login(client)
    group_id = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.get(f"/groups/{group_id}", headers=wife)).status_code == 404


async def test_invite_flow_adds_member(client):
    me = await login(client)
    group_id = await create_group(client, me)
    invite = await client.post(f"/groups/{group_id}/invites", headers=me)
    assert invite.status_code == 201
    url = invite.json()["url"]
    assert url.startswith("http://web.test/invite/")
    token = url.rsplit("/", 1)[1]

    wife = await login(client, "wife@example.com", "Wife")
    preview = (await client.get(f"/invites/{token}", headers=wife)).json()
    assert preview["group_name"] == "Nhà mình"
    assert preview["valid"] is True
    assert preview["already_member"] is False

    accepted = await client.post(f"/invites/{token}/accept", headers=wife)
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "member"

    detail = (await client.get(f"/groups/{group_id}", headers=wife)).json()
    assert sorted(m["email"] for m in detail["members"]) == ["me@example.com", "wife@example.com"]
    assert (await client.get("/me", headers=wife)).json()["default_group_id"] == group_id


async def test_accepting_twice_is_a_no_op(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.post(f"/invites/{token}/accept", headers=wife)).status_code == 200
    again = await client.post(f"/invites/{token}/accept", headers=wife)
    assert again.status_code == 200
    assert again.json()["id"] == group_id


async def test_used_invite_rejects_another_person(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    wife = await login(client, "wife@example.com", "Wife")
    await client.post(f"/invites/{token}/accept", headers=wife)
    friend = await login(client, "friend@example.com", "Friend")
    assert (await client.post(f"/invites/{token}/accept", headers=friend)).status_code == 410
    preview = (await client.get(f"/invites/{token}", headers=friend)).json()
    assert preview["valid"] is False


async def test_expired_invite_is_gone(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    async with SessionLocal() as session:
        await session.execute(
            update(GroupInvite).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await session.commit()
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.post(f"/invites/{token}/accept", headers=wife)).status_code == 410


async def test_unknown_invite_is_404(client):
    me = await login(client)
    assert (await client.get("/invites/nope", headers=me)).status_code == 404
    assert (await client.post("/invites/nope/accept", headers=me)).status_code == 404


async def test_only_owner_can_create_invites(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    wife = await login(client, "wife@example.com", "Wife")
    await client.post(f"/invites/{token.rsplit('/', 1)[1]}/accept", headers=wife)
    assert (await client.post(f"/groups/{group_id}/invites", headers=wife)).status_code == 403


async def test_patch_me_default_group_requires_membership(client):
    me = await login(client)
    mine = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    theirs = await create_group(client, wife, "Nhà vợ")
    bad = await client.patch("/me", json={"default_group_id": theirs}, headers=me)
    assert bad.status_code == 404
    ok = await client.patch("/me", json={"default_group_id": mine}, headers=me)
    assert ok.status_code == 200
    assert ok.json()["default_group_id"] == mine
```

Run: `cd api && uv run pytest tests/test_groups.py -v`
Expected: FAIL — `POST /groups` returns 404 (route missing).

- [ ] **Step 2: Default categories**

`api/app/groups/__init__.py`: empty file.

`api/app/groups/default_categories.py`:

```python
# (name, kind, icon) seeded into every new group.
DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    ("Ăn uống", "expense", "🍜"),
    ("Đi chợ", "expense", "🛒"),
    ("Di chuyển", "expense", "🛵"),
    ("Nhà cửa", "expense", "🏠"),
    ("Hóa đơn", "expense", "💡"),
    ("Subscription", "expense", "📺"),
    ("Mua sắm", "expense", "🛍️"),
    ("Sức khỏe", "expense", "💊"),
    ("Giáo dục", "expense", "📚"),
    ("Con cái", "expense", "👶"),
    ("Giải trí", "expense", "🎮"),
    ("Hiếu hỉ", "expense", "🎁"),
    ("Gia đình", "expense", "👨‍👩‍👧"),
    ("Du lịch", "expense", "✈️"),
    ("Bảo hiểm", "expense", "🛡️"),
    ("Khác", "expense", "📦"),
    ("Lương", "income", "💼"),
    ("Thưởng", "income", "🎉"),
    ("Thu nhập phụ", "income", "💰"),
    ("Lãi tiết kiệm", "income", "🏦"),
    ("Thu khác", "income", "➕"),
]
```

- [ ] **Step 3: Service (membership dependency + create_group)**

`api/app/groups/service.py`:

```python
import uuid

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db import get_session
from app.groups.default_categories import DEFAULT_CATEGORIES
from app.models import Category, Group, GroupMember, User


async def get_membership(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupMember:
    member = await session.get(GroupMember, (group_id, user.id))
    if member is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return member


async def create_group(session: AsyncSession, user: User, name: str, type_: str) -> Group:
    group = Group(name=name, type=type_, created_by=user.id)
    session.add(group)
    await session.flush()
    session.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    session.add_all(
        Category(group_id=group.id, name=name_, kind=kind, icon=icon)
        for name_, kind, icon in DEFAULT_CATEGORIES
    )
    if user.default_group_id is None:
        user.default_group_id = group.id
    await session.commit()
    return group
```

- [ ] **Step 4: Schemas and router**

`api/app/groups/schemas.py`:

```python
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["family"] = "family"


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    currency: str
    role: str


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None
    role: str


class GroupDetail(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    currency: str
    members: list[MemberOut]


class InviteOut(BaseModel):
    url: str
    expires_at: datetime


class InvitePreview(BaseModel):
    group_id: uuid.UUID
    group_name: str
    expires_at: datetime
    valid: bool
    already_member: bool
```

`api/app/groups/router.py`:

```python
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.config import settings
from app.db import get_session
from app.groups.schemas import (
    GroupCreate,
    GroupDetail,
    GroupOut,
    InviteOut,
    InvitePreview,
    MemberOut,
)
from app.groups.service import create_group, get_membership
from app.models import Group, GroupInvite, GroupMember, User

router = APIRouter(tags=["groups"])

INVITE_TTL = timedelta(days=7)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _group_out(group: Group, role: str) -> GroupOut:
    return GroupOut(
        id=group.id, name=group.name, type=group.type, currency=group.currency, role=role
    )


async def _find_invite(session: AsyncSession, token: str, lock: bool = False) -> GroupInvite:
    stmt = select(GroupInvite).where(GroupInvite.token_hash == hash_token(token))
    if lock:
        stmt = stmt.with_for_update()
    invite = await session.scalar(stmt)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    return invite


def _invite_usable(invite: GroupInvite) -> bool:
    return invite.used_by is None and invite.expires_at > datetime.now(UTC)


@router.post("/groups", status_code=201, response_model=GroupOut)
async def create(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    group = await create_group(session, user, body.name.strip(), body.type)
    return _group_out(group, "owner")


@router.get("/groups/{group_id}", response_model=GroupDetail)
async def get_group(
    group_id: uuid.UUID,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> GroupDetail:
    group = await session.get(Group, group_id)
    rows = (
        await session.execute(
            select(User, GroupMember.role)
            .join(GroupMember, GroupMember.user_id == User.id)
            .where(GroupMember.group_id == group_id)
            .order_by(GroupMember.joined_at)
        )
    ).all()
    members = [
        MemberOut(user_id=u.id, name=u.name, email=u.email, avatar_url=u.avatar_url, role=role)
        for u, role in rows
    ]
    return GroupDetail(
        id=group.id, name=group.name, type=group.type, currency=group.currency, members=members
    )


@router.post("/groups/{group_id}/invites", status_code=201, response_model=InviteOut)
async def create_invite(
    group_id: uuid.UUID,
    member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> InviteOut:
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can invite")
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(UTC) + INVITE_TTL
    session.add(
        GroupInvite(
            group_id=group_id,
            token_hash=hash_token(token),
            created_by=member.user_id,
            expires_at=expires_at,
        )
    )
    await session.commit()
    return InviteOut(url=f"{settings.public_web_url.rstrip('/')}/invite/{token}", expires_at=expires_at)


@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(
    token: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> InvitePreview:
    invite = await _find_invite(session, token)
    group = await session.get(Group, invite.group_id)
    already_member = await session.get(GroupMember, (invite.group_id, user.id)) is not None
    return InvitePreview(
        group_id=group.id,
        group_name=group.name,
        expires_at=invite.expires_at,
        valid=already_member or _invite_usable(invite),
        already_member=already_member,
    )


@router.post("/invites/{token}/accept", response_model=GroupOut)
async def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    invite = await _find_invite(session, token, lock=True)
    group = await session.get(Group, invite.group_id)
    existing = await session.get(GroupMember, (invite.group_id, user.id))
    if existing is not None:
        return _group_out(group, existing.role)
    if invite.used_by is not None:
        raise HTTPException(status_code=410, detail="Invite already used")
    if invite.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=410, detail="Invite expired")

    session.add(GroupMember(group_id=group.id, user_id=user.id, role="member"))
    invite.used_by = user.id
    invite.used_at = datetime.now(UTC)
    if user.default_group_id is None:
        user.default_group_id = group.id
    await session.commit()
    return _group_out(group, "member")
```

Update `api/app/main.py`:

```python
from fastapi import FastAPI

from app import health
from app.auth import router as auth_router
from app.groups import router as groups_router


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    app.include_router(auth_router.router)
    app.include_router(groups_router.router)
    return app


app = create_app()
```

- [ ] **Step 5: Run tests**

Run: `cd api && uv run pytest -v && uv run ruff check .`
Expected: all PASS; ruff clean (fix the long `return InviteOut(...)` line if ruff flags E501 by wrapping arguments).

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): family groups with default categories and invite links"
```

---

### Task 5: Accounts and categories

**Files:**
- Create: `api/app/ledger/__init__.py`, `api/app/ledger/common.py`, `api/app/ledger/schemas.py`, `api/app/ledger/accounts.py`, `api/app/ledger/categories.py`
- Modify: `api/app/main.py`
- Test: `api/tests/test_accounts_categories.py`

**Interfaces:**
- Consumes: `get_membership`, `get_session`, models, test helpers.
- Produces:
  - `app.ledger.common.get_in_group(session, model, obj_id: UUID, group_id: UUID, label: str, status_code: int = 404)` → the row, or raises `HTTPException(status_code, f"{label} not found")` if missing or in another group.
  - Schemas in `app.ledger.schemas`: `AccountCreate, AccountUpdate, AccountOut, CategoryCreate, CategoryUpdate, CategoryOut` (Task 6 adds transaction schemas to the same file).
  - HTTP: `GET/POST /groups/{gid}/accounts` (`?include_archived=true`), `PATCH /groups/{gid}/accounts/{id}`; same shape for `/categories`. `AccountOut = {id, name, kind, provider, owner_user_id, archived}`; `CategoryOut = {id, name, kind, icon, parent_id, archived}`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_accounts_categories.py`:

```python
from tests.helpers import create_group, login


async def test_account_crud_and_archive(client):
    me = await login(client)
    gid = await create_group(client, me)
    created = await client.post(
        f"/groups/{gid}/accounts",
        json={"name": "TPBank", "kind": "bank", "provider": "tpbank"},
        headers=me,
    )
    assert created.status_code == 201
    account = created.json()
    assert account["archived"] is False

    patched = await client.patch(
        f"/groups/{gid}/accounts/{account['id']}", json={"archived": True}, headers=me
    )
    assert patched.status_code == 200
    assert (await client.get(f"/groups/{gid}/accounts", headers=me)).json() == []
    all_accounts = await client.get(f"/groups/{gid}/accounts?include_archived=true", headers=me)
    assert [a["id"] for a in all_accounts.json()] == [account["id"]]


async def test_account_validation(client):
    me = await login(client)
    gid = await create_group(client, me)
    bad_kind = await client.post(
        f"/groups/{gid}/accounts", json={"name": "X", "kind": "gold"}, headers=me
    )
    assert bad_kind.status_code == 422
    bad_provider = await client.post(
        f"/groups/{gid}/accounts", json={"name": "X", "kind": "bank", "provider": "TP Bank"},
        headers=me,
    )
    assert bad_provider.status_code == 422


async def test_account_owner_must_be_member(client):
    me = await login(client)
    gid = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    wife_id = (await client.get("/me", headers=wife)).json()["id"]
    response = await client.post(
        f"/groups/{gid}/accounts",
        json={"name": "Ví vợ", "kind": "ewallet", "owner_user_id": wife_id},
        headers=me,
    )
    assert response.status_code == 422


async def test_cannot_touch_other_groups_accounts(client):
    me = await login(client)
    mine = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    theirs = await create_group(client, wife, "Nhà vợ")
    their_account = (
        await client.post(
            f"/groups/{theirs}/accounts", json={"name": "MoMo", "kind": "ewallet"}, headers=wife
        )
    ).json()
    # Via their group path: I'm not a member.
    assert (await client.get(f"/groups/{theirs}/accounts", headers=me)).status_code == 404
    # Via my group path: the account is not in my group.
    response = await client.patch(
        f"/groups/{mine}/accounts/{their_account['id']}", json={"name": "hacked"}, headers=me
    )
    assert response.status_code == 404


async def test_default_categories_listed(client):
    me = await login(client)
    gid = await create_group(client, me)
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    assert len(categories) == 21
    assert {c["kind"] for c in categories} == {"expense", "income"}
    assert any(c["name"] == "Ăn uống" and c["icon"] == "🍜" for c in categories)


async def test_category_create_with_parent_and_archive(client):
    me = await login(client)
    gid = await create_group(client, me)
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    food = next(c for c in categories if c["name"] == "Ăn uống")
    salary = next(c for c in categories if c["name"] == "Lương")

    child = await client.post(
        f"/groups/{gid}/categories",
        json={"name": "Cà phê", "kind": "expense", "icon": "☕", "parent_id": food["id"]},
        headers=me,
    )
    assert child.status_code == 201
    assert child.json()["parent_id"] == food["id"]

    wrong_kind = await client.post(
        f"/groups/{gid}/categories",
        json={"name": "Sai", "kind": "expense", "parent_id": salary["id"]},
        headers=me,
    )
    assert wrong_kind.status_code == 422

    archived = await client.patch(
        f"/groups/{gid}/categories/{child.json()['id']}", json={"archived": True}, headers=me
    )
    assert archived.status_code == 200
    visible = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    assert all(c["id"] != child.json()["id"] for c in visible)
```

Run: `cd api && uv run pytest tests/test_accounts_categories.py -v`
Expected: FAIL — 404 on `/groups/{gid}/accounts`.

- [ ] **Step 2: Common helper and schemas**

`api/app/ledger/__init__.py`: empty file.

`api/app/ledger/common.py`:

```python
import uuid
from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def get_in_group(
    session: AsyncSession,
    model: type[T],
    obj_id: uuid.UUID,
    group_id: uuid.UUID,
    label: str,
    status_code: int = 404,
) -> T:
    obj = await session.get(model, obj_id)
    if obj is None or obj.group_id != group_id:
        raise HTTPException(status_code=status_code, detail=f"{label} not found")
    return obj
```

`api/app/ledger/schemas.py`:

```python
import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

AccountKind = Literal["bank", "ewallet", "cash", "credit"]
CategoryKind = Literal["expense", "income"]
Provider = Annotated[str | None, Field(max_length=32, pattern=r"^[a-z0-9_]+$")]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: AccountKind
    provider: Provider = None
    owner_user_id: uuid.UUID | None = None


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: AccountKind | None = None
    provider: Provider = None
    archived: bool | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    provider: str | None
    owner_user_id: uuid.UUID | None
    archived: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: CategoryKind
    icon: str | None = Field(default=None, max_length=16)
    parent_id: uuid.UUID | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = Field(default=None, max_length=16)
    archived: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    icon: str | None
    parent_id: uuid.UUID | None
    archived: bool
```

- [ ] **Step 3: Accounts router**

`api/app/ledger/accounts.py`:

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group
from app.ledger.schemas import AccountCreate, AccountOut, AccountUpdate
from app.models import Account, GroupMember

router = APIRouter(prefix="/groups/{group_id}/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    group_id: uuid.UUID,
    include_archived: bool = False,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> list[Account]:
    stmt = select(Account).where(Account.group_id == group_id)
    if not include_archived:
        stmt = stmt.where(Account.archived.is_(False))
    return list(await session.scalars(stmt.order_by(Account.archived, Account.name)))


@router.post("", status_code=201, response_model=AccountOut)
async def create_account(
    group_id: uuid.UUID,
    body: AccountCreate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Account:
    if body.owner_user_id is not None:
        if await session.get(GroupMember, (group_id, body.owner_user_id)) is None:
            raise HTTPException(status_code=422, detail="Owner is not a group member")
    account = Account(group_id=group_id, **body.model_dump())
    session.add(account)
    await session.commit()
    return account


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    group_id: uuid.UUID,
    account_id: uuid.UUID,
    body: AccountUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Account:
    account = await get_in_group(session, Account, account_id, group_id, "Account")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await session.commit()
    return account
```

- [ ] **Step 4: Categories router**

`api/app/ledger/categories.py`:

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group
from app.ledger.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.models import Category, GroupMember

router = APIRouter(prefix="/groups/{group_id}/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    group_id: uuid.UUID,
    include_archived: bool = False,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    stmt = select(Category).where(Category.group_id == group_id)
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    return list(await session.scalars(stmt.order_by(Category.kind, Category.created_at)))


@router.post("", status_code=201, response_model=CategoryOut)
async def create_category(
    group_id: uuid.UUID,
    body: CategoryCreate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Category:
    if body.parent_id is not None:
        parent = await get_in_group(
            session, Category, body.parent_id, group_id, "Parent category", status_code=422
        )
        if parent.kind != body.kind:
            raise HTTPException(status_code=422, detail="Parent category kind differs")
    category = Category(group_id=group_id, **body.model_dump())
    session.add(category)
    await session.commit()
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    group_id: uuid.UUID,
    category_id: uuid.UUID,
    body: CategoryUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Category:
    category = await get_in_group(session, Category, category_id, group_id, "Category")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await session.commit()
    return category
```

Update `api/app/main.py`:

```python
from fastapi import FastAPI

from app import health
from app.auth import router as auth_router
from app.groups import router as groups_router
from app.ledger import accounts, categories


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    app.include_router(auth_router.router)
    app.include_router(groups_router.router)
    app.include_router(accounts.router)
    app.include_router(categories.router)
    return app


app = create_app()
```

- [ ] **Step 5: Run tests**

Run: `cd api && uv run pytest -v && uv run ruff check .`
Expected: all PASS; ruff clean.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): accounts and categories scoped to groups"
```

---

### Task 6: Transactions (CRUD, filters, month in VN time, totals)

**Files:**
- Create: `api/app/ledger/timeutil.py`, `api/app/ledger/transactions.py`
- Modify: `api/app/ledger/schemas.py` (append transaction schemas), `api/app/main.py`
- Test: `api/tests/test_timeutil.py`, `api/tests/test_transactions.py`

**Interfaces:**
- Consumes: `get_in_group`, `get_membership`, `get_current_user`, models.
- Produces:
  - `app.ledger.timeutil.VN_TZ: ZoneInfo`; `month_range(month: str) -> tuple[datetime, datetime]` (UTC `[start, end)`; raises `ValueError` for anything but `YYYY-MM`).
  - HTTP under `/groups/{gid}/transactions`:
    - `GET` query: `month`, `account_id`, `category_id`, `uncategorized: bool`, `status`, `q`, `limit` (1–200, default 50), `offset` → `{items: TransactionOut[], total_count, sum_expense, sum_income}` (sums exclude `is_internal_transfer`; `sum_expense` is ≤ 0).
    - `POST` `TransactionCreate{account_id, amount≠0, occurred_at (timezone-aware), description="", category_id?, merchant?, note?, is_internal_transfer=false}` → 201 `TransactionOut` (`source="web"`, `status="confirmed"`, `classified_by="user"` iff category set).
    - `PATCH /{id}` partial `TransactionUpdate` → `TransactionOut`; `DELETE /{id}` → 204.
  - `TransactionOut = {id, account_id, user_id, amount, occurred_at, description, merchant, counterparty, category_id, source, status, classified_by, is_internal_transfer, reconciled, note, created_at, updated_at}`.

- [ ] **Step 1: Write the failing timeutil test**

`api/tests/test_timeutil.py`:

```python
from datetime import UTC, datetime

import pytest

from app.ledger.timeutil import month_range


def test_month_range_uses_vietnam_midnight():
    start, end = month_range("2026-09")
    assert start == datetime(2026, 8, 31, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 9, 30, 17, 0, tzinfo=UTC)


def test_month_range_rolls_over_december():
    start, end = month_range("2026-12")
    assert start == datetime(2026, 11, 30, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 12, 31, 17, 0, tzinfo=UTC)


@pytest.mark.parametrize("bad", ["2026-13", "2026", "2026-09-01", "abcd-ef", ""])
def test_month_range_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        month_range(bad)
```

Run: `cd api && uv run pytest tests/test_timeutil.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.ledger.timeutil'`.

- [ ] **Step 2: Implement timeutil**

`api/app/ledger/timeutil.py`:

```python
import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def month_range(month: str) -> tuple[datetime, datetime]:
    """Return the UTC [start, end) of a calendar month in Vietnam time."""
    match = _MONTH_RE.match(month)
    if not match:
        raise ValueError(f"invalid month: {month!r}")
    year, mon = int(match.group(1)), int(match.group(2))
    start = datetime(year, mon, 1, tzinfo=VN_TZ)  # raises ValueError for month 13
    end = datetime(year + 1, 1, 1, tzinfo=VN_TZ) if mon == 12 else datetime(year, mon + 1, 1, tzinfo=VN_TZ)
    return start.astimezone(UTC), end.astimezone(UTC)
```

Run: `uv run pytest tests/test_timeutil.py -v`
Expected: PASS (7 tests). Wrap the long `end = ...` line if ruff flags E501.

- [ ] **Step 3: Write the failing transaction tests**

`api/tests/test_transactions.py`:

```python
import pytest

from tests.helpers import create_group, login


@pytest.fixture
async def setup(client):
    me = await login(client)
    gid = await create_group(client, me)
    account = (
        await client.post(
            f"/groups/{gid}/accounts", json={"name": "TPBank", "kind": "bank"}, headers=me
        )
    ).json()
    cash = (
        await client.post(
            f"/groups/{gid}/accounts", json={"name": "Tiền mặt", "kind": "cash"}, headers=me
        )
    ).json()
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    food = next(c for c in categories if c["name"] == "Ăn uống")
    salary = next(c for c in categories if c["name"] == "Lương")
    return {"me": me, "gid": gid, "account": account, "cash": cash, "food": food, "salary": salary}


async def add(client, s, **overrides):
    body = {
        "account_id": s["account"]["id"],
        "amount": -45000,
        "occurred_at": "2026-09-15T12:00:00+07:00",
        "description": "Phở",
    }
    body.update(overrides)
    return await client.post(f"/groups/{s['gid']}/transactions", json=body, headers=s["me"])


async def test_create_expense_with_category(client, setup):
    response = await add(client, setup, category_id=setup["food"]["id"])
    assert response.status_code == 201
    txn = response.json()
    assert txn["amount"] == -45000
    assert txn["source"] == "web"
    assert txn["status"] == "confirmed"
    assert txn["classified_by"] == "user"


async def test_create_without_category_has_no_classifier(client, setup):
    txn = (await add(client, setup)).json()
    assert txn["category_id"] is None
    assert txn["classified_by"] is None


async def test_category_kind_must_match_sign(client, setup):
    response = await add(client, setup, category_id=setup["salary"]["id"])
    assert response.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [{"amount": 0}, {"occurred_at": "2026-09-15T12:00:00"}, {"description": "x" * 501}],
)
async def test_invalid_bodies_rejected(client, setup, overrides):
    assert (await add(client, setup, **overrides)).status_code == 422


async def test_refs_from_another_group_rejected(client, setup):
    wife = await login(client, "wife@example.com", "Wife")
    other = await create_group(client, wife, "Nhà vợ")
    other_account = (
        await client.post(
            f"/groups/{other}/accounts", json={"name": "MoMo", "kind": "ewallet"}, headers=wife
        )
    ).json()
    other_food = next(
        c
        for c in (await client.get(f"/groups/{other}/categories", headers=wife)).json()
        if c["name"] == "Ăn uống"
    )
    assert (await add(client, setup, account_id=other_account["id"])).status_code == 422
    assert (await add(client, setup, category_id=other_food["id"])).status_code == 422


async def test_month_filter_uses_vietnam_time(client, setup):
    await add(client, setup, occurred_at="2026-09-30T23:30:00+07:00", description="late sept")
    await add(client, setup, occurred_at="2026-10-01T00:10:00+07:00", description="early oct")
    gid, me = setup["gid"], setup["me"]
    sept = (await client.get(f"/groups/{gid}/transactions?month=2026-09", headers=me)).json()
    octo = (await client.get(f"/groups/{gid}/transactions?month=2026-10", headers=me)).json()
    assert [t["description"] for t in sept["items"]] == ["late sept"]
    assert [t["description"] for t in octo["items"]] == ["early oct"]


async def test_invalid_month_rejected(client, setup):
    url = f"/groups/{setup['gid']}/transactions?month=2026-13"
    assert (await client.get(url, headers=setup["me"])).status_code == 422


async def test_totals_exclude_internal_transfers_and_ignore_pagination(client, setup):
    await add(client, setup, amount=-100000)
    await add(client, setup, amount=5000000, description="Lương")
    await add(client, setup, amount=-2000000, is_internal_transfer=True, description="Nạp MoMo")
    url = f"/groups/{setup['gid']}/transactions?month=2026-09&limit=1"
    body = (await client.get(url, headers=setup["me"])).json()
    assert body["total_count"] == 3
    assert len(body["items"]) == 1
    assert body["sum_expense"] == -100000
    assert body["sum_income"] == 5000000


async def test_filters(client, setup):
    await add(client, setup, description="Phở bò", category_id=setup["food"]["id"])
    await add(client, setup, description="Grab", account_id=setup["cash"]["id"])
    await add(client, setup, description="Giảm 50% phí")
    gid, me = setup["gid"], setup["me"]

    async def descriptions(query: str) -> list[str]:
        body = (await client.get(f"/groups/{gid}/transactions?{query}", headers=me)).json()
        return sorted(t["description"] for t in body["items"])

    assert await descriptions(f"account_id={setup['cash']['id']}") == ["Grab"]
    assert await descriptions(f"category_id={setup['food']['id']}") == ["Phở bò"]
    assert await descriptions("uncategorized=true") == ["Giảm 50% phí", "Grab"]
    assert await descriptions("q=ph%E1%BB%9F") == ["Phở bò"]  # "phở", case-insensitive
    assert await descriptions("q=50%25") == ["Giảm 50% phí"]  # literal "50%"
    assert await descriptions("q=_") == []  # "_" is not a wildcard


async def test_patch_category_and_sign_rules(client, setup):
    txn = (await add(client, setup)).json()
    url = f"/groups/{setup['gid']}/transactions/{txn['id']}"
    me = setup["me"]

    patched = await client.patch(url, json={"category_id": setup["food"]["id"]}, headers=me)
    assert patched.status_code == 200
    assert patched.json()["classified_by"] == "user"

    flipped = await client.patch(url, json={"amount": 45000}, headers=me)
    assert flipped.status_code == 422  # income amount with an expense category

    null_amount = await client.patch(url, json={"amount": None}, headers=me)
    assert null_amount.status_code == 422

    cleared = await client.patch(url, json={"category_id": None}, headers=me)
    assert cleared.json()["category_id"] is None
    assert cleared.json()["classified_by"] is None


async def test_delete(client, setup):
    txn = (await add(client, setup)).json()
    url = f"/groups/{setup['gid']}/transactions/{txn['id']}"
    assert (await client.delete(url, headers=setup["me"])).status_code == 204
    assert (await client.patch(url, json={"note": "x"}, headers=setup["me"])).status_code == 404


async def test_non_member_cannot_list(client, setup):
    wife = await login(client, "wife@example.com", "Wife")
    url = f"/groups/{setup['gid']}/transactions"
    assert (await client.get(url, headers=wife)).status_code == 404
```

Run: `cd api && uv run pytest tests/test_transactions.py -v`
Expected: FAIL — 404 on `/groups/{gid}/transactions`.

- [ ] **Step 4: Append transaction schemas to `api/app/ledger/schemas.py`**

Add these imports at the top of the file (merge with existing ones):

```python
from datetime import datetime

from pydantic import AwareDatetime, field_validator, model_validator
```

Append:

```python
MAX_AMOUNT = 10**12


def _check_amount(value: int | None) -> int | None:
    if value is None:
        return value
    if value == 0:
        raise ValueError("amount must not be 0")
    if abs(value) > MAX_AMOUNT:
        raise ValueError("amount is too large")
    return value


class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    amount: int
    occurred_at: AwareDatetime
    description: str = Field(default="", max_length=500)
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    is_internal_transfer: bool = False

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: int) -> int:
        return _check_amount(value)


class TransactionUpdate(BaseModel):
    account_id: uuid.UUID | None = None
    amount: int | None = None
    occurred_at: AwareDatetime | None = None
    description: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    is_internal_transfer: bool | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: int | None) -> int | None:
        return _check_amount(value)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "TransactionUpdate":
        for name in ("account_id", "amount", "occurred_at", "description", "is_internal_transfer"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID | None
    amount: int
    occurred_at: datetime
    description: str
    merchant: str | None
    counterparty: str | None
    category_id: uuid.UUID | None
    source: str
    status: str
    classified_by: str | None
    is_internal_transfer: bool
    reconciled: bool
    note: str | None
    created_at: datetime
    updated_at: datetime


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total_count: int
    sum_expense: int
    sum_income: int
```

- [ ] **Step 5: Implement the transactions router**

`api/app/ledger/transactions.py`:

```python
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group
from app.ledger.schemas import (
    TransactionCreate,
    TransactionList,
    TransactionOut,
    TransactionUpdate,
)
from app.ledger.timeutil import month_range
from app.models import Account, Category, GroupMember, Transaction, User

router = APIRouter(prefix="/groups/{group_id}/transactions", tags=["transactions"])


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _validate_refs(
    session: AsyncSession,
    group_id: uuid.UUID,
    account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    amount: int,
) -> None:
    if account_id is not None:
        await get_in_group(session, Account, account_id, group_id, "Account", status_code=422)
    if category_id is not None:
        category = await get_in_group(
            session, Category, category_id, group_id, "Category", status_code=422
        )
        if (category.kind == "expense") != (amount < 0):
            raise HTTPException(status_code=422, detail="Category kind does not match amount sign")


@router.get("", response_model=TransactionList)
async def list_transactions(
    group_id: uuid.UUID,
    month: str | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    uncategorized: bool = False,
    status: Literal["confirmed", "needs_review"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> TransactionList:
    conditions = [Transaction.group_id == group_id]
    if month is not None:
        try:
            start, end = month_range(month)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="month must be YYYY-MM") from exc
        conditions += [Transaction.occurred_at >= start, Transaction.occurred_at < end]
    if account_id is not None:
        conditions.append(Transaction.account_id == account_id)
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if uncategorized:
        conditions.append(Transaction.category_id.is_(None))
    if status is not None:
        conditions.append(Transaction.status == status)
    if q:
        pattern = _like_pattern(q.strip())
        conditions.append(
            or_(
                *(
                    column.ilike(pattern, escape="\\")
                    for column in (
                        Transaction.description,
                        Transaction.merchant,
                        Transaction.counterparty,
                        Transaction.note,
                    )
                )
            )
        )

    not_transfer = Transaction.is_internal_transfer.is_(False)
    totals = (
        await session.execute(
            select(
                func.count(),
                func.coalesce(
                    func.sum(
                        case((and_(Transaction.amount < 0, not_transfer), Transaction.amount), else_=0)
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case((and_(Transaction.amount > 0, not_transfer), Transaction.amount), else_=0)
                    ),
                    0,
                ),
            ).where(*conditions)
        )
    ).one()
    items = await session.scalars(
        select(Transaction)
        .where(*conditions)
        .order_by(Transaction.occurred_at.desc(), Transaction.created_at.desc(), Transaction.id)
        .limit(limit)
        .offset(offset)
    )
    return TransactionList(
        items=[TransactionOut.model_validate(t) for t in items],
        total_count=int(totals[0]),
        sum_expense=int(totals[1]),
        sum_income=int(totals[2]),
    )


@router.post("", status_code=201, response_model=TransactionOut)
async def create_transaction(
    group_id: uuid.UUID,
    body: TransactionCreate,
    _member: GroupMember = Depends(get_membership),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    await _validate_refs(session, group_id, body.account_id, body.category_id, body.amount)
    txn = Transaction(
        group_id=group_id,
        user_id=user.id,
        source="web",
        status="confirmed",
        classified_by="user" if body.category_id else None,
        **body.model_dump(),
    )
    session.add(txn)
    await session.commit()
    await session.refresh(txn)
    return txn


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    group_id: uuid.UUID,
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    txn = await get_in_group(session, Transaction, transaction_id, group_id, "Transaction")
    changes = body.model_dump(exclude_unset=True)
    new_amount = changes.get("amount", txn.amount)
    new_category = changes["category_id"] if "category_id" in changes else txn.category_id
    await _validate_refs(session, group_id, changes.get("account_id"), new_category, new_amount)
    if "category_id" in changes:
        txn.classified_by = "user" if new_category else None
        txn.status = "confirmed"
    for field, value in changes.items():
        setattr(txn, field, value)
    await session.commit()
    await session.refresh(txn)
    return txn


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    group_id: uuid.UUID,
    transaction_id: uuid.UUID,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Response:
    txn = await get_in_group(session, Transaction, transaction_id, group_id, "Transaction")
    await session.delete(txn)
    await session.commit()
    return Response(status_code=204)
```

Update `api/app/main.py`:

```python
from fastapi import FastAPI

from app import health
from app.auth import router as auth_router
from app.groups import router as groups_router
from app.ledger import accounts, categories, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    app.include_router(auth_router.router)
    app.include_router(groups_router.router)
    app.include_router(accounts.router)
    app.include_router(categories.router)
    app.include_router(transactions.router)
    return app


app = create_app()
```

- [ ] **Step 6: Run the full API suite**

Run: `cd api && uv run pytest -v && uv run ruff check .`
Expected: all PASS; ruff clean (wrap long `case(...)` lines if E501).

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): transactions CRUD with VN-month filter, search and totals"
```

---

### Task 7: API container image and CI

**Files:**
- Create: `api/Dockerfile`, `api/.dockerignore`, `.github/workflows/api.yml`

**Interfaces:**
- Produces: image whose default command serves on port 8000; `.venv/bin/alembic upgrade head` works from `/app` (used by the initContainer in Task 12).

- [ ] **Step 1: Dockerfile and dockerignore**

`api/Dockerfile`:

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

EXPOSE 8000

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
```

`api/.dockerignore`:

```
.venv
__pycache__
.pytest_cache
.ruff_cache
tests
.env
docker-compose.yml
scripts
```

- [ ] **Step 2: Build and smoke-test the image locally**

Run:
```bash
cd api && docker build -t finance-api:dev . && \
docker run --rm --network host \
  -e DATABASE_URL=postgresql+asyncpg://finance:finance@localhost:55432/finance \
  finance-api:dev .venv/bin/alembic upgrade head
```
Expected: build succeeds; alembic prints `Running upgrade  -> 0001` or nothing if already at head, exit 0. (On macOS `--network host` may not reach the host; if so use `host.docker.internal` instead of `localhost` in the URL.)

- [ ] **Step 3: CI workflow**

`.github/workflows/api.yml`:

```yaml
name: api

on:
  push:
    branches: [main]
    paths: ["api/**", ".github/workflows/api.yml"]
  pull_request:
    paths: ["api/**", ".github/workflows/api.yml"]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: finance
          POSTGRES_PASSWORD: finance
          POSTGRES_DB: finance_test
        ports: ["55432:5432"]
        options: >-
          --health-cmd "pg_isready -U finance"
          --health-interval 5s --health-timeout 5s --health-retries 10
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - run: uv sync --frozen
      - run: uv run ruff check .
      - run: uv run pytest -q

  image:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/fevirtus/finance-api
          tags: |
            type=sha,format=long
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: api
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 4: Commit**

```bash
git add api/Dockerfile api/.dockerignore .github/workflows/api.yml
git commit -m "ci(api): container image and GitHub Actions test/build pipeline"
```

---

### Task 8: Web scaffold, auth, API client, money/time utils, onboarding

**Files:**
- Create (scaffold): `web/` via create-next-app
- Create: `web/vitest.config.ts`, `web/vitest.setup.ts`, `web/.env.example`, `web/auth.ts`, `web/types/next-auth.d.ts`, `web/app/api/auth/[...nextauth]/route.ts`, `web/lib/api.ts`, `web/lib/types.ts`, `web/lib/money.ts`, `web/lib/time.ts`, `web/lib/ui.ts`, `web/components/sign-out-button.tsx`, `web/app/login/page.tsx`, `web/app/login/login-button.tsx`, `web/app/onboarding/page.tsx`, `web/app/onboarding/actions.ts`
- Modify: `web/package.json` (scripts), `web/next.config.ts`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/globals.css`
- Test: `web/lib/money.test.ts`, `web/lib/time.test.ts`

**Interfaces:**
- Consumes: API `POST /auth/google`, `GET /me`, `POST /groups`.
- Produces:
  - `lib/api.ts`: `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` (server-only; redirects to `/login` on missing session or 401; throws `ApiError{status, detail}` otherwise); `class ApiError`.
  - `lib/money.ts`: `parseVnd(input: string): number | null` (positive magnitude), `formatVnd(amount: number): string` (e.g. `"1.200.000 đ"`).
  - `lib/time.ts`: `VN_TZ`, `toVnLocalInput(iso) → "YYYY-MM-DDTHH:mm"`, `vnLocalInputToIso(local) → "...:00+07:00"` (throws on bad format), `nowVnLocalInput(now?)`, `currentVnMonth(now?) → "YYYY-MM"`, `formatVnDateTime(iso) → "DD/MM HH:mm"`.
  - `lib/types.ts`: `Me, GroupSummary, GroupDetail, Member, Account, AccountKind, Category, Transaction, TransactionList, TransactionInput, InviteOut, InvitePreview, ActionResult`.
  - `lib/ui.ts`: `inputCls, btnCls, btnSecondaryCls` Tailwind class strings.
  - Session carries `session.apiToken?: string`.

- [ ] **Step 1: Scaffold Next.js and install deps**

Run:
```bash
cd /Users/thinhnguyen/workspace/personal/family-finance && \
pnpm create next-app@16 web --ts --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-pnpm --turbopack --yes && \
cd web && pnpm add next-auth@^4.24.13 server-only && \
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react \
  @testing-library/user-event @testing-library/dom @testing-library/jest-dom
```
Expected: `web/` created, dependencies installed. If a flag is rejected by the installed create-next-app version, drop that flag and answer the prompt with the same choice.

Delete the scaffold's `web/.git` if create-next-app created one: `rm -rf web/.git` (the monorepo root is the git repo).

- [ ] **Step 2: Configure scripts, Next and Vitest**

In `web/package.json` set `"scripts"` to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "next typegen && tsc --noEmit",
  "test": "vitest run"
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

`web/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
```

`web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`web/.env.example`:

```dotenv
API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
```

- [ ] **Step 3: Write failing tests for money and time utils**

`web/lib/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatVnd, parseVnd } from "./money";

describe("parseVnd", () => {
  it.each([
    ["45k", 45_000],
    ["45K", 45_000],
    ["320k ", 320_000],
    ["1tr2", 1_200_000],
    ["1tr25", 1_250_000],
    ["2tr", 2_000_000],
    ["1.5tr", 1_500_000],
    ["1,5tr", 1_500_000],
    ["1.200.000", 1_200_000],
    ["1,200,000", 1_200_000],
    ["1200000", 1_200_000],
    ["50.000đ", 50_000],
    ["50.000 vnđ", 50_000],
  ])("parses %s", (input, expected) => {
    expect(parseVnd(input)).toBe(expected);
  });

  it.each(["", "abc", "1.5", "-5k", "12.34.5"])("rejects %s", (input) => {
    expect(parseVnd(input)).toBeNull();
  });
});

describe("formatVnd", () => {
  it("uses Vietnamese grouping", () => {
    expect(formatVnd(1_200_000)).toBe("1.200.000 đ");
    expect(formatVnd(-45_000)).toBe("-45.000 đ");
  });
});
```

`web/lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  currentVnMonth,
  formatVnDateTime,
  toVnLocalInput,
  vnLocalInputToIso,
} from "./time";

describe("time helpers", () => {
  it("converts UTC ISO to a VN datetime-local value", () => {
    expect(toVnLocalInput("2026-09-30T16:30:00Z")).toBe("2026-09-30T23:30");
  });

  it("converts a VN datetime-local value to ISO with +07:00", () => {
    expect(vnLocalInputToIso("2026-09-30T23:30")).toBe("2026-09-30T23:30:00+07:00");
  });

  it("rejects malformed datetime-local values", () => {
    expect(() => vnLocalInputToIso("2026-09-30")).toThrow();
  });

  it("computes the current month in VN time", () => {
    expect(currentVnMonth(new Date("2026-09-30T17:05:00Z"))).toBe("2026-10");
  });

  it("formats for display in VN time", () => {
    expect(formatVnDateTime("2026-09-29T05:30:00Z")).toBe("29/09 12:30");
  });
});
```

Run: `cd web && pnpm test`
Expected: FAIL — cannot resolve `./money` / `./time`.

- [ ] **Step 4: Implement money and time utils**

`web/lib/money.ts`:

```ts
const MULTIPLIER: Record<string, number> = {
  k: 1_000,
  "nghìn": 1_000,
  tr: 1_000_000,
  "triệu": 1_000_000,
  m: 1_000_000,
};

/** Parse Vietnamese money input ("45k", "1tr2", "1.200.000đ") into a positive VND integer. */
export function parseVnd(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(vnđ|vnd|đ)$/u, "");
  if (!s) return null;

  let m = s.match(/^(\d+)(tr|triệu|m)(\d{1,3})$/u);
  if (m) return Number(m[1]) * 1_000_000 + Number(m[3].padEnd(3, "0")) * 1_000;

  m = s.match(/^(\d+(?:[.,]\d+)?)(k|nghìn|tr|triệu|m)$/u);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * MULTIPLIER[m[2]]);

  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

const vndFormatter = new Intl.NumberFormat("vi-VN");

export function formatVnd(amount: number): string {
  return `${vndFormatter.format(amount)} đ`;
}
```

`web/lib/time.ts`:

```ts
export const VN_TZ = "Asia/Ho_Chi_Minh";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function vnParts(date: Date): Record<string, string> {
  return Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
}

export function toVnLocalInput(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function vnLocalInputToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error(`invalid datetime-local value: ${local}`);
  }
  return `${local}:00+07:00`;
}

export function nowVnLocalInput(now: Date = new Date()): string {
  return toVnLocalInput(now.toISOString());
}

export function currentVnMonth(now: Date = new Date()): string {
  const p = vnParts(now);
  return `${p.year}-${p.month}`;
}

export function formatVnDateTime(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Types, UI classes, API client**

`web/lib/types.ts`:

```ts
export type GroupSummary = { id: string; name: string; type: string; role: "owner" | "member" };

export type Me = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  default_group_id: string | null;
  groups: GroupSummary[];
};

export type Member = {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: "owner" | "member";
};

export type GroupDetail = {
  id: string;
  name: string;
  type: string;
  currency: string;
  members: Member[];
};

export type AccountKind = "bank" | "ewallet" | "cash" | "credit";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  provider: string | null;
  owner_user_id: string | null;
  archived: boolean;
};

export type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string | null;
  parent_id: string | null;
  archived: boolean;
};

export type Transaction = {
  id: string;
  account_id: string;
  user_id: string | null;
  amount: number;
  occurred_at: string;
  description: string;
  merchant: string | null;
  counterparty: string | null;
  category_id: string | null;
  source: string;
  status: "confirmed" | "needs_review";
  classified_by: string | null;
  is_internal_transfer: boolean;
  reconciled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionList = {
  items: Transaction[];
  total_count: number;
  sum_expense: number;
  sum_income: number;
};

export type TransactionInput = {
  account_id: string;
  amount: number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  note: string | null;
};

export type InviteOut = { url: string; expires_at: string };

export type InvitePreview = {
  group_id: string;
  group_name: string;
  expires_at: string;
  valid: boolean;
  already_member: boolean;
};

export type ActionResult = { error?: string };
```

`web/lib/ui.ts`:

```ts
export const inputCls =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
export const btnCls =
  "rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
export const btnSecondaryCls =
  "rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
```

`web/types/next-auth.d.ts`:

```ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    apiToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    apiToken?: string;
    apiTokenExpires?: number;
  }
}
```

`web/auth.ts`:

```ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

type ApiLogin = { access_token: string; expires_at: string };

async function exchangeGoogleToken(idToken: string): Promise<ApiLogin> {
  const res = await fetch(`${process.env.API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API login failed with status ${res.status}`);
  return res.json();
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      // Only on sign-in: the API is the source of truth for the email allowlist.
      if (account?.id_token) {
        const login = await exchangeGoogleToken(account.id_token);
        token.apiToken = login.access_token;
        token.apiTokenExpires = Date.parse(login.expires_at);
      }
      return token;
    },
    async session({ session, token }) {
      const valid = typeof token.apiTokenExpires === "number" && token.apiTokenExpires > Date.now();
      session.apiToken = valid ? token.apiToken : undefined;
      return session;
    },
  },
};
```

`web/app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

`web/lib/api.ts`:

```ts
import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d))).join("; ");
  }
  return JSON.stringify(detail);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) redirect("/login");

  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiToken}`,
      ...init.headers,
    },
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = describeDetail((await res.json()).detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 6: Layout, login, root redirect, onboarding, sign-out**

`web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Finance",
  description: "Theo dõi chi tiêu gia đình",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
```

`web/app/globals.css` (replace scaffold content):

```css
@import "tailwindcss";
```

`web/app/login/login-button.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { btnCls } from "@/lib/ui";

export function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button className={btnCls} onClick={() => signIn("google", { callbackUrl })}>
      Đăng nhập bằng Google
    </button>
  );
}
```

`web/app/login/page.tsx`:

```tsx
import { LoginButton } from "./login-button";

function safeCallback(url?: string): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Family Finance</h1>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Đăng nhập thất bại hoặc email chưa được cho phép.
        </p>
      )}
      <LoginButton callbackUrl={safeCallback(callbackUrl)} />
    </main>
  );
}
```

`web/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

export default async function Home() {
  const me = await apiFetch<Me>("/me");
  const target = me.default_group_id ?? me.groups[0]?.id;
  redirect(target ? `/g/${target}/transactions` : "/onboarding");
}
```

`web/app/onboarding/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const group = await apiFetch<GroupSummary>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, type: "family" }),
  });
  redirect(`/g/${group.id}/transactions`);
}
```

`web/app/onboarding/page.tsx`:

```tsx
import { btnCls, inputCls } from "@/lib/ui";
import { createGroup } from "./actions";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Tạo nhóm gia đình</h1>
      <p className="text-sm text-neutral-500">Tạo nhóm rồi mời thành viên sau trong Cài đặt.</p>
      <form action={createGroup} className="flex flex-col gap-3">
        <input name="name" required maxLength={100} placeholder="VD: Nhà mình" className={inputCls} />
        <button className={btnCls}>Tạo nhóm</button>
      </form>
    </main>
  );
}
```

`web/components/sign-out-button.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import { btnSecondaryCls } from "@/lib/ui";

export function SignOutButton() {
  return (
    <button className={btnSecondaryCls} onClick={() => signOut({ callbackUrl: "/login" })}>
      Đăng xuất
    </button>
  );
}
```

Delete scaffold files no longer used (e.g. `web/public/*.svg` referenced only by the old home page) — keep `web/public/` itself.

- [ ] **Step 7: Verify**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: tests PASS; lint/typecheck clean; build succeeds (env vars are read at runtime, so no values are needed at build time).

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat(web): Next.js scaffold with Google auth, API client, VND/time utils and onboarding"
```

---

### Task 9: Group shell, accounts, categories, settings & invites

**Files:**
- Create: `web/app/g/[groupId]/layout.tsx`, `web/app/g/[groupId]/error.tsx`, `web/app/g/[groupId]/accounts/page.tsx`, `web/app/g/[groupId]/accounts/actions.ts`, `web/app/g/[groupId]/categories/page.tsx`, `web/app/g/[groupId]/categories/actions.ts`, `web/app/g/[groupId]/settings/page.tsx`, `web/app/g/[groupId]/settings/actions.ts`, `web/app/g/[groupId]/settings/invite-link.tsx`, `web/app/invite/[token]/page.tsx`, `web/app/invite/[token]/actions.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, types, `inputCls/btnCls/btnSecondaryCls`, `formatVnDateTime`, `SignOutButton`, `authOptions`.
- Produces: routes `/g/[groupId]/{accounts,categories,settings}`, `/invite/[token]`; server actions `createAccount(groupId, formData)`, `renameAccount(groupId, accountId, formData)`, `setAccountArchived(groupId, accountId, archived, formData?)`, `createCategory(groupId, formData)`, `renameCategory(groupId, categoryId, formData)`, `setCategoryArchived(groupId, categoryId, archived, formData?)`, `createInvite(groupId) → InviteOut`, `acceptInvite(token, formData?)`.

- [ ] **Step 1: Group layout and error boundary**

`web/app/g/[groupId]/layout.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

const NAV: [string, string][] = [
  ["transactions", "Giao dịch"],
  ["accounts", "Tài khoản"],
  ["categories", "Danh mục"],
  ["settings", "Cài đặt"],
];

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await apiFetch<Me>("/me");
  const group = me.groups.find((g) => g.id === groupId);
  if (!group) notFound();

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">{group.name}</div>
        <nav className="flex flex-wrap gap-4 text-sm">
          {NAV.map(([segment, label]) => (
            <Link key={segment} href={`/g/${groupId}/${segment}`} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
```

`web/app/g/[groupId]/error.tsx`:

```tsx
"use client";

import { btnSecondaryCls } from "@/lib/ui";

export default function GroupError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 rounded-md bg-red-50 p-4 text-sm text-red-700">
      <p>Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <button className={btnSecondaryCls} onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Accounts page**

`web/app/g/[groupId]/accounts/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createAccount(groupId: string, formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "").trim();
  await apiFetch(`/groups/${groupId}/accounts`, {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind")),
      provider: provider || null,
    }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}

export async function renameAccount(
  groupId: string,
  accountId: string,
  formData: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: String(formData.get("name") ?? "").trim() }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}

export async function setAccountArchived(
  groupId: string,
  accountId: string,
  archived: boolean,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}
```

`web/app/g/[groupId]/accounts/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { Account, AccountKind } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createAccount, renameAccount, setAccountArchived } from "./actions";

const KIND_LABEL: Record<AccountKind, string> = {
  bank: "Ngân hàng",
  ewallet: "Ví điện tử",
  cash: "Tiền mặt",
  credit: "Thẻ tín dụng",
};

export default async function AccountsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const accounts = await apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Tài khoản & ví</h1>
      <form action={createAccount.bind(null, groupId)} className="flex flex-wrap items-end gap-2">
        <input name="name" required maxLength={100} placeholder="VD: TPBank chính" className={inputCls} />
        <select name="kind" defaultValue="bank" className={inputCls}>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="provider"
          pattern="[a-z0-9_]*"
          maxLength={32}
          placeholder="provider: tpbank, momo…"
          className={inputCls}
        />
        <button className={btnCls}>Thêm</button>
      </form>

      <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {accounts.length === 0 && <li className="p-3 text-sm text-neutral-500">Chưa có tài khoản nào.</li>}
        {accounts.map((a) => (
          <li key={a.id} className={`flex flex-wrap items-center gap-3 p-3 ${a.archived ? "opacity-50" : ""}`}>
            <form action={renameAccount.bind(null, groupId, a.id)} className="flex gap-2">
              <input name="name" defaultValue={a.name} required maxLength={100} className={inputCls} />
              <button className={btnSecondaryCls}>Lưu</button>
            </form>
            <span className="text-sm text-neutral-500">
              {KIND_LABEL[a.kind]}
              {a.provider ? ` · ${a.provider}` : ""}
            </span>
            <form action={setAccountArchived.bind(null, groupId, a.id, !a.archived)} className="ml-auto">
              <button className={btnSecondaryCls}>{a.archived ? "Khôi phục" : "Lưu trữ"}</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Categories page**

`web/app/g/[groupId]/categories/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createCategory(groupId: string, formData: FormData): Promise<void> {
  const icon = String(formData.get("icon") ?? "").trim();
  await apiFetch(`/groups/${groupId}/categories`, {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind")),
      icon: icon || null,
    }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}

export async function renameCategory(
  groupId: string,
  categoryId: string,
  formData: FormData,
): Promise<void> {
  const icon = String(formData.get("icon") ?? "").trim();
  await apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: String(formData.get("name") ?? "").trim(), icon: icon || null }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}

export async function setCategoryArchived(
  groupId: string,
  categoryId: string,
  archived: boolean,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}
```

`web/app/g/[groupId]/categories/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { Category } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createCategory, renameCategory, setCategoryArchived } from "./actions";

const SECTIONS: [Category["kind"], string][] = [
  ["expense", "Chi"],
  ["income", "Thu"],
];

export default async function CategoriesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const categories = await apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Danh mục</h1>
      <form action={createCategory.bind(null, groupId)} className="flex flex-wrap items-end gap-2">
        <input name="icon" maxLength={16} placeholder="☕" className={`${inputCls} w-16`} />
        <input name="name" required maxLength={100} placeholder="Tên danh mục" className={inputCls} />
        <select name="kind" defaultValue="expense" className={inputCls}>
          <option value="expense">Chi</option>
          <option value="income">Thu</option>
        </select>
        <button className={btnCls}>Thêm</button>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map(([kind, title]) => (
          <div key={kind}>
            <h2 className="mb-2 font-medium">{title}</h2>
            <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className={`flex items-center gap-2 p-2 ${c.archived ? "opacity-50" : ""}`}>
                    <form action={renameCategory.bind(null, groupId, c.id)} className="flex flex-1 gap-2">
                      <input name="icon" defaultValue={c.icon ?? ""} maxLength={16} className={`${inputCls} w-14`} />
                      <input name="name" defaultValue={c.name} required maxLength={100} className={`${inputCls} flex-1`} />
                      <button className={btnSecondaryCls}>Lưu</button>
                    </form>
                    <form action={setCategoryArchived.bind(null, groupId, c.id, !c.archived)}>
                      <button className={btnSecondaryCls}>{c.archived ? "Khôi phục" : "Ẩn"}</button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Settings page with invite link**

`web/app/g/[groupId]/settings/actions.ts`:

```ts
"use server";

import { apiFetch } from "@/lib/api";
import type { InviteOut } from "@/lib/types";

export async function createInvite(groupId: string): Promise<InviteOut> {
  return apiFetch<InviteOut>(`/groups/${groupId}/invites`, { method: "POST" });
}
```

`web/app/g/[groupId]/settings/invite-link.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { formatVnDateTime } from "@/lib/time";
import type { InviteOut } from "@/lib/types";
import { btnCls, inputCls } from "@/lib/ui";

export function InviteLink({ action }: { action: () => Promise<InviteOut> }) {
  const [invite, formAction, pending] = useActionState<InviteOut | null>(() => action(), null);

  return (
    <form action={formAction} className="space-y-2">
      <button className={btnCls} disabled={pending}>
        Tạo link mời
      </button>
      {invite && (
        <div className="space-y-1">
          <input
            readOnly
            value={invite.url}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputCls} w-full`}
          />
          <p className="text-xs text-neutral-500">
            Dùng được 1 lần, hết hạn {formatVnDateTime(invite.expires_at)}.
          </p>
        </div>
      )}
    </form>
  );
}
```

`web/app/g/[groupId]/settings/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { GroupDetail, Me } from "@/lib/types";
import { createInvite } from "./actions";
import { InviteLink } from "./invite-link";

export default async function SettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [group, me] = await Promise.all([
    apiFetch<GroupDetail>(`/groups/${groupId}`),
    apiFetch<Me>("/me"),
  ]);
  const isOwner = group.members.some((m) => m.user_id === me.id && m.role === "owner");

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Cài đặt nhóm</h1>
      <div>
        <h2 className="mb-2 font-medium">Thành viên</h2>
        <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {group.members.map((m) => (
            <li key={m.user_id} className="flex justify-between p-3 text-sm">
              <span>
                {m.name} <span className="text-neutral-500">({m.email})</span>
              </span>
              <span className="text-neutral-500">{m.role === "owner" ? "Chủ nhóm" : "Thành viên"}</span>
            </li>
          ))}
        </ul>
      </div>
      {isOwner && (
        <div>
          <h2 className="mb-2 font-medium">Mời thành viên</h2>
          <p className="mb-2 text-sm text-neutral-500">
            Email người được mời phải nằm trong danh sách cho phép (ALLOWED_EMAILS).
          </p>
          <InviteLink action={createInvite.bind(null, groupId)} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Invite acceptance page**

`web/app/invite/[token]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";

export async function acceptInvite(token: string, _formData?: FormData): Promise<void> {
  const group = await apiFetch<GroupSummary>(`/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
  redirect(`/g/${group.id}/transactions`);
}
```

`web/app/invite/[token]/page.tsx`:

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ApiError, apiFetch } from "@/lib/api";
import type { InvitePreview } from "@/lib/types";
import { btnCls } from "@/lib/ui";
import { acceptInvite } from "./actions";

function Message({ text }: { text: string }) {
  return <main className="mx-auto max-w-sm p-6 text-sm">{text}</main>;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let preview: InvitePreview;
  try {
    preview = await apiFetch<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return <Message text="Link mời không tồn tại." />;
    throw e;
  }
  if (preview.already_member) redirect(`/g/${preview.group_id}/transactions`);
  if (!preview.valid) return <Message text="Link mời đã hết hạn hoặc đã được sử dụng." />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Tham gia nhóm “{preview.group_name}”</h1>
      <form action={acceptInvite.bind(null, token)}>
        <button className={btnCls}>Tham gia</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Verify**

Run: `cd web && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all clean; build lists routes `/g/[groupId]/accounts`, `/categories`, `/settings`, `/invite/[token]`.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): group shell with accounts, categories, members and invite links"
```

---

### Task 10: Transactions page and form

**Files:**
- Create: `web/app/g/[groupId]/transactions/page.tsx`, `web/app/g/[groupId]/transactions/actions.ts`, `web/app/g/[groupId]/transactions/transaction-form.tsx`
- Test: `web/app/g/[groupId]/transactions/transaction-form.test.tsx`

**Interfaces:**
- Consumes: `parseVnd`, `formatVnd`, `vnLocalInputToIso`, `toVnLocalInput`, `nowVnLocalInput`, `currentVnMonth`, `formatVnDateTime`, types, `apiFetch`, `ApiError`.
- Produces: `TransactionForm({accounts, categories, initial?, submitLabel, action: (input: TransactionInput) => Promise<ActionResult>})`; server actions `createTransaction(groupId, input) → ActionResult`, `updateTransaction(groupId, id, input) → ActionResult`, `deleteTransaction(groupId, id, formData?)`.

- [ ] **Step 1: Write the failing form tests**

`web/app/g/[groupId]/transactions/transaction-form.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account, Category } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

const accounts: Account[] = [
  { id: "a1", name: "TPBank", kind: "bank", provider: "tpbank", owner_user_id: null, archived: false },
  { id: "a2", name: "Ví cũ", kind: "cash", provider: null, owner_user_id: null, archived: true },
];
const categories: Category[] = [
  { id: "c1", name: "Ăn uống", kind: "expense", icon: "🍜", parent_id: null, archived: false },
  { id: "c2", name: "Lương", kind: "income", icon: "💼", parent_id: null, archived: false },
];

function setup(action = vi.fn().mockResolvedValue({})) {
  render(
    <TransactionForm accounts={accounts} categories={categories} submitLabel="Lưu" action={action} />,
  );
  return { action, user: userEvent.setup() };
}

describe("TransactionForm", () => {
  it("submits an expense as a negative amount in VN time", async () => {
    const { action, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "45k");
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c1");
    fireEvent.change(screen.getByLabelText("Thời gian"), { target: { value: "2026-09-29T12:30" } });
    await user.type(screen.getByLabelText("Mô tả"), "Phở");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        account_id: "a1",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        description: "Phở",
        category_id: "c1",
        note: null,
      }),
    );
  });

  it("switches to income: positive amount and only income categories", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "Thu" }));
    const categorySelect = screen.getByLabelText("Danh mục");
    expect(categorySelect).toHaveTextContent("Lương");
    expect(categorySelect).not.toHaveTextContent("Ăn uống");

    await user.type(screen.getByLabelText("Số tiền"), "20tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][0].amount).toBe(20_000_000);
  });

  it("hides archived accounts", () => {
    setup();
    expect(screen.getByLabelText("Tài khoản")).not.toHaveTextContent("Ví cũ");
  });

  it("rejects an invalid amount without calling the action", async () => {
    const { action, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "abc");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Số tiền không hợp lệ")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the API error message", async () => {
    const { user } = setup(vi.fn().mockResolvedValue({ error: "Category kind does not match amount sign" }));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Category kind does not match amount sign")).toBeInTheDocument();
  });
});
```

Run: `cd web && pnpm test`
Expected: FAIL — cannot resolve `./transaction-form`.

- [ ] **Step 2: Implement the form**

`web/app/g/[groupId]/transactions/transaction-form.tsx`:

```tsx
"use client";

import { useId, useState, useTransition } from "react";
import { parseVnd } from "@/lib/money";
import { nowVnLocalInput, toVnLocalInput, vnLocalInputToIso } from "@/lib/time";
import type { Account, ActionResult, Category, Transaction, TransactionInput } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";

type Kind = "expense" | "income";

type Props = {
  accounts: Account[];
  categories: Category[];
  initial?: Transaction;
  submitLabel: string;
  action: (input: TransactionInput) => Promise<ActionResult>;
};

export function TransactionForm({ accounts, categories, initial, submitLabel, action }: Props) {
  const id = useId();
  const [kind, setKind] = useState<Kind>(initial && initial.amount > 0 ? "income" : "expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const usableAccounts = accounts.filter((a) => !a.archived || a.id === initial?.account_id);
  const kindCategories = categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === initial?.category_id),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const magnitude = parseVnd(String(data.get("amount") ?? ""));
    if (!magnitude || magnitude <= 0) {
      setError("Số tiền không hợp lệ");
      return;
    }
    const accountId = String(data.get("account_id") ?? "");
    if (!accountId) {
      setError("Chọn tài khoản");
      return;
    }
    let occurredAt: string;
    try {
      occurredAt = vnLocalInputToIso(String(data.get("occurred_at") ?? ""));
    } catch {
      setError("Thời gian không hợp lệ");
      return;
    }

    const input: TransactionInput = {
      account_id: accountId,
      amount: kind === "expense" ? -magnitude : magnitude,
      occurred_at: occurredAt,
      description: String(data.get("description") ?? "").trim(),
      category_id: String(data.get("category_id") ?? "") || null,
      note: String(data.get("note") ?? "").trim() || null,
    };
    setError(null);
    startTransition(async () => {
      const result = await action(input);
      if (result.error) {
        setError(result.error);
      } else if (!initial) {
        form.reset();
      }
    });
  }

  const kindButton = (value: Kind, label: string) => (
    <button
      type="button"
      aria-pressed={kind === value}
      onClick={() => setKind(value)}
      className={kind === value ? btnCls : btnSecondaryCls}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2">
        {kindButton("expense", "Chi")}
        {kindButton("income", "Thu")}
      </div>

      <label htmlFor={`${id}-amount`} className="text-sm">
        Số tiền
      </label>
      <input
        id={`${id}-amount`}
        name="amount"
        inputMode="decimal"
        placeholder="45k, 1tr2, 1.200.000"
        defaultValue={initial ? String(Math.abs(initial.amount)) : ""}
        className={inputCls}
      />

      <label htmlFor={`${id}-account`} className="text-sm">
        Tài khoản
      </label>
      <select
        id={`${id}-account`}
        name="account_id"
        defaultValue={initial?.account_id ?? usableAccounts[0]?.id ?? ""}
        className={inputCls}
      >
        {usableAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-category`} className="text-sm">
        Danh mục
      </label>
      <select
        key={kind}
        id={`${id}-category`}
        name="category_id"
        defaultValue={initial && (initial.amount > 0) === (kind === "income") ? (initial.category_id ?? "") : ""}
        className={inputCls}
      >
        <option value="">— Chưa phân loại —</option>
        {kindCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-time`} className="text-sm">
        Thời gian
      </label>
      <input
        id={`${id}-time`}
        name="occurred_at"
        type="datetime-local"
        defaultValue={initial ? toVnLocalInput(initial.occurred_at) : nowVnLocalInput()}
        suppressHydrationWarning
        className={inputCls}
      />

      <label htmlFor={`${id}-description`} className="text-sm">
        Mô tả
      </label>
      <input
        id={`${id}-description`}
        name="description"
        maxLength={500}
        defaultValue={initial?.description ?? ""}
        className={inputCls}
      />

      <label htmlFor={`${id}-note`} className="text-sm">
        Ghi chú
      </label>
      <input
        id={`${id}-note`}
        name="note"
        maxLength={2000}
        defaultValue={initial?.note ?? ""}
        className={inputCls}
      />

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className={btnCls} disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
```

Run: `pnpm test`
Expected: PASS (all form tests plus earlier util tests).

- [ ] **Step 3: Server actions**

`web/app/g/[groupId]/transactions/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, TransactionInput } from "@/lib/types";

async function run(groupId: string, call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e; // includes Next.js redirects
  }
  revalidatePath(`/g/${groupId}/transactions`);
  return {};
}

export async function createTransaction(
  groupId: string,
  input: TransactionInput,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions`, { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function updateTransaction(
  groupId: string,
  transactionId: string,
  input: TransactionInput,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteTransaction(
  groupId: string,
  transactionId: string,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/transactions/${transactionId}`, { method: "DELETE" });
  revalidatePath(`/g/${groupId}/transactions`);
}
```

- [ ] **Step 4: Transactions page**

`web/app/g/[groupId]/transactions/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import { formatVnd } from "@/lib/money";
import { currentVnMonth, formatVnDateTime } from "@/lib/time";
import type { Account, Category, TransactionList } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createTransaction, deleteTransaction, updateTransaction } from "./actions";
import { TransactionForm } from "./transaction-form";

type SearchParams = {
  month?: string;
  account_id?: string;
  category_id?: string;
  q?: string;
  uncategorized?: string;
};

const PAGE_LIMIT = 200;

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { groupId } = await params;
  const sp = await searchParams;
  const month = sp.month || currentVnMonth();

  const query = new URLSearchParams({ month, limit: String(PAGE_LIMIT) });
  if (sp.account_id) query.set("account_id", sp.account_id);
  if (sp.category_id) query.set("category_id", sp.category_id);
  if (sp.q) query.set("q", sp.q);
  if (sp.uncategorized === "1") query.set("uncategorized", "true");

  const [accounts, categories, list] = await Promise.all([
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
    apiFetch<TransactionList>(`/groups/${groupId}/transactions?${query}`),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Giao dịch</h1>

      <form className="flex flex-wrap items-end gap-2">
        <input type="month" name="month" defaultValue={month} className={inputCls} />
        <select name="account_id" defaultValue={sp.account_id ?? ""} className={inputCls}>
          <option value="">Tất cả tài khoản</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="category_id" defaultValue={sp.category_id ?? ""} className={inputCls}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={sp.q ?? ""} maxLength={100} placeholder="Tìm…" className={inputCls} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="uncategorized" value="1" defaultChecked={sp.uncategorized === "1"} />
          Chưa phân loại
        </label>
        <button className={btnSecondaryCls}>Lọc</button>
      </form>

      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          Chi: <b className="text-red-600">{formatVnd(list.sum_expense)}</b>
        </span>
        <span>
          Thu: <b className="text-emerald-600">{formatVnd(list.sum_income)}</b>
        </span>
        <span className="text-neutral-500">{list.total_count} giao dịch</span>
      </div>

      <details className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <summary className={`${btnCls} inline-block cursor-pointer list-none`}>+ Thêm giao dịch</summary>
        <div className="mt-4">
          <TransactionForm
            accounts={accounts}
            categories={categories}
            submitLabel="Thêm"
            action={createTransaction.bind(null, groupId)}
          />
        </div>
      </details>

      <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {list.items.length === 0 && <li className="p-3 text-sm text-neutral-500">Không có giao dịch.</li>}
        {list.items.map((t) => {
          const category = t.category_id ? categoryById.get(t.category_id) : undefined;
          return (
            <li key={t.id} className="p-3">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                  <span className="w-24 text-xs text-neutral-500">{formatVnDateTime(t.occurred_at)}</span>
                  <span className="flex-1 truncate">
                    {category ? `${category.icon ?? ""} ${category.name}` : "❔ Chưa phân loại"}
                    {t.description && <span className="text-neutral-500"> · {t.description}</span>}
                  </span>
                  <span className="text-xs text-neutral-500">{accountName.get(t.account_id)}</span>
                  <span className={`w-32 text-right font-medium ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatVnd(t.amount)}
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <TransactionForm
                    accounts={accounts}
                    categories={categories}
                    initial={t}
                    submitLabel="Lưu"
                    action={updateTransaction.bind(null, groupId, t.id)}
                  />
                  <form action={deleteTransaction.bind(null, groupId, t.id)}>
                    <button className="text-sm text-red-600 hover:underline">Xoá giao dịch</button>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {list.total_count > list.items.length && (
        <p className="text-sm text-neutral-500">
          Đang hiển thị {list.items.length}/{list.total_count}. Lọc hẹp hơn để xem thêm.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "feat(web): transactions page with filters, totals and add/edit/delete form"
```

---

### Task 11: Web container image and CI

**Files:**
- Create: `web/Dockerfile`, `web/.dockerignore`, `.github/workflows/web.yml`

**Interfaces:**
- Produces: image listening on port 3000 (`node server.js`), configured purely by runtime env (`API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

- [ ] **Step 1: Dockerfile and dockerignore**

`web/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

`web/.dockerignore`:

```
node_modules
.next
.env*
!.env.example
*.test.ts
*.test.tsx
```

- [ ] **Step 2: Build locally**

Run: `cd web && docker build -t finance-web:dev .`
Expected: build succeeds.

Run: `docker run --rm -d -p 3001:3000 -e API_URL=http://127.0.0.1:1 -e NEXTAUTH_URL=http://localhost:3001 -e NEXTAUTH_SECRET=x --name fw finance-web:dev && sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login; docker rm -f fw`
Expected: `200`.

- [ ] **Step 3: CI workflow**

`.github/workflows/web.yml`:

```yaml
name: web

on:
  push:
    branches: [main]
    paths: ["web/**", ".github/workflows/web.yml"]
  pull_request:
    paths: ["web/**", ".github/workflows/web.yml"]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  image:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/fevirtus/finance-web
          tags: |
            type=sha,format=long
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: web
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

`pnpm/action-setup@v4` reads the pnpm version from `web/package.json` `packageManager`; if create-next-app did not set it, add `"packageManager": "pnpm@<version from pnpm --version>"` to `web/package.json` and set `package_json_file: web/package.json` under `with:` of that step.

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile web/.dockerignore web/package.json .github/workflows/web.yml
git commit -m "ci(web): container image and GitHub Actions test/build pipeline"
```

---

### Task 12: Kubernetes manifests, runbook, README

**Files:**
- Create: `deploy/kustomization.yaml`, `deploy/namespace.yaml`, `deploy/api.yaml`, `deploy/web.yaml`, `deploy/ingress.yaml`, `deploy/README.md`, `README.md`

**Interfaces:**
- Consumes: images from Tasks 7/11; Secrets `finance-api-env` (keys `DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_IDS, ALLOWED_EMAILS, PUBLIC_WEB_URL`) and `finance-web-env` (keys `API_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET`) created by the owner.
- Produces: `kubectl apply -k deploy` deploys namespace `finance`, Deployments `finance-api` (2 replicas, migrate initContainer) and `finance-web`, Services on port 80 named `http`, Ingress `finance`.

- [ ] **Step 1: Manifests**

`deploy/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: finance
```

`deploy/api.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finance-api
  namespace: finance
spec:
  replicas: 2
  selector:
    matchLabels: { app: finance-api }
  template:
    metadata:
      labels: { app: finance-api }
    spec:
      initContainers:
        - name: migrate
          image: ghcr.io/fevirtus/finance-api
          command: [".venv/bin/alembic", "upgrade", "head"]
          envFrom:
            - secretRef: { name: finance-api-env }
      containers:
        - name: api
          image: ghcr.io/fevirtus/finance-api
          ports:
            - { name: http, containerPort: 8000 }
          envFrom:
            - secretRef: { name: finance-api-env }
          readinessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
            timeoutSeconds: 3
          livenessProbe:
            tcpSocket: { port: http }
            periodSeconds: 20
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { memory: 384Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: finance-api
  namespace: finance
spec:
  selector: { app: finance-api }
  ports:
    - { name: http, port: 80, targetPort: http }
```

`deploy/web.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finance-web
  namespace: finance
spec:
  replicas: 1
  selector:
    matchLabels: { app: finance-web }
  template:
    metadata:
      labels: { app: finance-web }
    spec:
      containers:
        - name: web
          image: ghcr.io/fevirtus/finance-web
          ports:
            - { name: http, containerPort: 3000 }
          envFrom:
            - secretRef: { name: finance-web-env }
          readinessProbe:
            httpGet: { path: /login, port: http }
            periodSeconds: 10
            timeoutSeconds: 3
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { memory: 384Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: finance-web
  namespace: finance
spec:
  selector: { app: finance-web }
  ports:
    - { name: http, port: 80, targetPort: http }
```

`deploy/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: finance
  namespace: finance
spec:
  ingressClassName: traefik
  rules:
    - host: finance.fevirtus.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: finance-web, port: { name: http } }
    - host: finance-api.fevirtus.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: finance-api, port: { name: http } }
```

`deploy/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - api.yaml
  - web.yaml
  - ingress.yaml
images:
  - name: ghcr.io/fevirtus/finance-api
    newTag: latest
  - name: ghcr.io/fevirtus/finance-web
    newTag: latest
```

- [ ] **Step 2: Validate manifests**

Run: `kubectl kustomize deploy | head -40`
Expected: rendered YAML with image `ghcr.io/fevirtus/finance-api:latest` for both the initContainer and container.

Run: `KUBECONFIG=~/.kube/homelab kubectl apply -k deploy --dry-run=client`
Expected: every object reports `(dry run)` with no errors. (Client dry-run only — nothing is sent to the cluster.)

- [ ] **Step 3: Runbook**

`deploy/README.md`:

````markdown
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
3. **Secrets** (fill in values yourself; never commit them):
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
````

`README.md` (repo root):

````markdown
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
````

- [ ] **Step 4: Commit**

```bash
git add deploy README.md
git commit -m "chore(deploy): k3s manifests, deploy runbook and README"
```

- [ ] **Step 5: Hand off to the owner (do NOT do these without explicit approval)**

These steps publish code or change the live cluster, so stop and ask the owner before each:
1. Create GitHub repo `fevirtus/family-finance` and push `main` (CI builds and pushes images to GHCR; make the two GHCR packages public so the cluster can pull without a secret, like `reader`).
2. Owner performs `deploy/README.md` one-time setup (DB, Google OAuth client, secrets, Cloudflare hostnames).
3. `kubectl apply -k deploy` and run the smoke test.

---

## Self-review notes

- Spec §2 M1 coverage: Google login + allowlist (Task 3), family group + invite link (Task 4), accounts/categories with Vietnamese defaults (Tasks 4–5), transactions CRUD + filters on web (Tasks 6, 10), stateless deploy with advisory-locked migrations (Tasks 2, 12), CI to GHCR (Tasks 7, 11).
- Spec items intentionally deferred to later milestones: Telegram, LLM classification, raw_events/ingest, statement import, Android app, budgets/goals/recurring, CronJobs.
- Spec §4 lists `telegram_chat_id` and `default_group_id` on users and the full transaction column set; all are created now so M2+ only add tables. `raw_event_id` has no FK until `raw_events` exists (M2).
