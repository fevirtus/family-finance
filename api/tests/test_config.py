import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.mark.parametrize("secret", ["dev-secret-change-me", "short", "x" * 31])
def test_weak_jwt_secret_is_rejected(secret):
    with pytest.raises(ValidationError):
        Settings(jwt_secret=secret, _env_file=None)


def test_missing_jwt_secret_is_rejected(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_strong_jwt_secret_is_accepted():
    assert Settings(jwt_secret="x" * 32, _env_file=None).jwt_secret == "x" * 32
