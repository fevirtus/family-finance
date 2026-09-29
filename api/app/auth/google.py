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
