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
