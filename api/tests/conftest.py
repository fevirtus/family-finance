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
