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
