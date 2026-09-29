from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://finance:finance@localhost:55432/finance"
    # Required, no default: the API is public, so a guessable secret would let anyone mint tokens.
    jwt_secret: str
    jwt_ttl_seconds: int = 7 * 24 * 60 * 60
    google_client_ids: str = ""
    allowed_emails: str = ""
    public_web_url: str = "http://localhost:3000"

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_must_be_strong(cls, value: str) -> str:
        if len(value) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters")
        return value

    @property
    def google_client_id_list(self) -> list[str]:
        return [x.strip() for x in self.google_client_ids.split(",") if x.strip()]

    @property
    def allowed_email_set(self) -> set[str]:
        return {x.strip().lower() for x in self.allowed_emails.split(",") if x.strip()}


settings = Settings()
