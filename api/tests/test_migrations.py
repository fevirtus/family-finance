from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.db import Base, engine


async def test_migrations_match_models():
    async with engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(MigrationContext.configure(sync_conn), Base.metadata)
        )
    assert diff == []
