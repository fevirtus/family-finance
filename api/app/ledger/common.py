import uuid
from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import Transaction

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


def sum_where(condition: ColumnElement[bool]) -> ColumnElement[int]:
    """SUM(amount) over rows matching `condition`, 0 when there are none."""
    return func.coalesce(func.sum(case((condition, Transaction.amount), else_=0)), 0)
