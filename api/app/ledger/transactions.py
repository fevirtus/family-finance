import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group, sum_where
from app.ledger.schemas import (
    TransactionCreate,
    TransactionList,
    TransactionOut,
    TransactionUpdate,
)
from app.ledger.timeutil import month_range
from app.models import Account, Category, GroupMember, Transaction, User

router = APIRouter(prefix="/groups/{group_id}/transactions", tags=["transactions"])


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _validate_refs(
    session: AsyncSession,
    group_id: uuid.UUID,
    account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    amount: int,
) -> None:
    if account_id is not None:
        await get_in_group(session, Account, account_id, group_id, "Account", status_code=422)
    if category_id is not None:
        category = await get_in_group(
            session, Category, category_id, group_id, "Category", status_code=422
        )
        if (category.kind == "expense") != (amount < 0):
            raise HTTPException(status_code=422, detail="Category kind does not match amount sign")


@router.get("", response_model=TransactionList)
async def list_transactions(
    group_id: uuid.UUID,
    month: str | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    uncategorized: bool = False,
    status: Literal["confirmed", "needs_review"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> TransactionList:
    conditions = [Transaction.group_id == group_id]
    if month is not None:
        try:
            start, end = month_range(month)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="month must be YYYY-MM") from exc
        conditions += [Transaction.occurred_at >= start, Transaction.occurred_at < end]
    if account_id is not None:
        conditions.append(Transaction.account_id == account_id)
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if uncategorized:
        conditions.append(Transaction.category_id.is_(None))
    if status is not None:
        conditions.append(Transaction.status == status)
    if q:
        pattern = _like_pattern(q.strip())
        columns = (
            Transaction.description,
            Transaction.merchant,
            Transaction.counterparty,
            Transaction.note,
        )
        conditions.append(or_(*(column.ilike(pattern, escape="\\") for column in columns)))

    not_transfer = Transaction.is_internal_transfer.is_(False)
    totals = (
        await session.execute(
            select(
                func.count(),
                sum_where(and_(Transaction.amount < 0, not_transfer)),
                sum_where(and_(Transaction.amount > 0, not_transfer)),
            ).where(*conditions)
        )
    ).one()
    items = await session.scalars(
        select(Transaction)
        .where(*conditions)
        .order_by(Transaction.occurred_at.desc(), Transaction.created_at.desc(), Transaction.id)
        .limit(limit)
        .offset(offset)
    )
    return TransactionList(
        items=[TransactionOut.model_validate(t) for t in items],
        total_count=int(totals[0]),
        sum_expense=int(totals[1]),
        sum_income=int(totals[2]),
    )


@router.post("", status_code=201, response_model=TransactionOut)
async def create_transaction(
    group_id: uuid.UUID,
    body: TransactionCreate,
    _member: GroupMember = Depends(get_membership),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    await _validate_refs(session, group_id, body.account_id, body.category_id, body.amount)
    txn = Transaction(
        group_id=group_id,
        user_id=user.id,
        source="web",
        status="confirmed",
        classified_by="user" if body.category_id else None,
        **body.model_dump(),
    )
    session.add(txn)
    await session.commit()
    await session.refresh(txn)
    return txn


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    group_id: uuid.UUID,
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Transaction:
    txn = await get_in_group(session, Transaction, transaction_id, group_id, "Transaction")
    changes = body.model_dump(exclude_unset=True)
    new_amount = changes.get("amount", txn.amount)
    new_category = changes["category_id"] if "category_id" in changes else txn.category_id
    await _validate_refs(session, group_id, changes.get("account_id"), new_category, new_amount)
    if "category_id" in changes:
        txn.classified_by = "user" if new_category else None
        txn.status = "confirmed"
    for field, value in changes.items():
        setattr(txn, field, value)
    await session.commit()
    await session.refresh(txn)
    return txn


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    group_id: uuid.UUID,
    transaction_id: uuid.UUID,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Response:
    txn = await get_in_group(session, Transaction, transaction_id, group_id, "Transaction")
    await session.delete(txn)
    await session.commit()
    return Response(status_code=204)
