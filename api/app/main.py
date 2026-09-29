from fastapi import FastAPI

from app import health


def create_app() -> FastAPI:
    app = FastAPI(title="Family Finance API")
    app.include_router(health.router)
    return app


app = create_app()
