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
