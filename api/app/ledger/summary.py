import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import sum_where
from app.ledger.schemas import CategoryAmount, SummaryOut
from app.ledger.timeutil import month_range
from app.models import GroupMember, Transaction

router = APIRouter(prefix="/groups/{group_id}", tags=["summary"])


def previous_month(month: str) -> str:
    year, mon = (int(part) for part in month.split("-"))
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def _in_range(group_id: uuid.UUID, start: datetime, end: datetime) -> list:
    return [
        Transaction.group_id == group_id,
        Transaction.is_internal_transfer.is_(False),
        Transaction.occurred_at >= start,
        Transaction.occurred_at < end,
    ]


async def _by_category(
    session: AsyncSession, conditions: list, expense: bool
) -> list[CategoryAmount]:
    total = func.sum(Transaction.amount)
    rows = await session.execute(
        select(Transaction.category_id, total, func.count())
        .where(*conditions, Transaction.amount < 0 if expense else Transaction.amount > 0)
        .group_by(Transaction.category_id)
        .order_by(total.asc() if expense else total.desc())
    )
    return [
        CategoryAmount(category_id=category_id, amount=int(amount), count=int(count))
        for category_id, amount, count in rows
    ]


@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    group_id: uuid.UUID,
    month: str,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> SummaryOut:
    try:
        start, end = month_range(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM") from exc
    prev_start, prev_end = month_range(previous_month(month))

    current = _in_range(group_id, start, end)
    expense, income, count, uncategorized = (
        await session.execute(
            select(
                sum_where(Transaction.amount < 0),
                sum_where(Transaction.amount > 0),
                func.count(),
                func.count().filter(Transaction.category_id.is_(None)),
            ).where(*current)
        )
    ).one()
    prev_expense, prev_income = (
        await session.execute(
            select(sum_where(Transaction.amount < 0), sum_where(Transaction.amount > 0)).where(
                *_in_range(group_id, prev_start, prev_end)
            )
        )
    ).one()

    return SummaryOut(
        month=month,
        total_expense=int(expense),
        total_income=int(income),
        prev_total_expense=int(prev_expense),
        prev_total_income=int(prev_income),
        transaction_count=int(count),
        uncategorized_count=int(uncategorized),
        expense_by_category=await _by_category(session, current, expense=True),
        income_by_category=await _by_category(session, current, expense=False),
    )
