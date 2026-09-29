from fastapi import FastAPI

from app import health
from app.auth import router as auth_router


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    app.include_router(auth_router.router)
    return app


app = create_app()
