import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group
from app.ledger.schemas import AccountCreate, AccountOut, AccountUpdate
from app.models import Account, GroupMember

router = APIRouter(prefix="/groups/{group_id}/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    group_id: uuid.UUID,
    include_archived: bool = False,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> list[Account]:
    stmt = select(Account).where(Account.group_id == group_id)
    if not include_archived:
        stmt = stmt.where(Account.archived.is_(False))
    return list(await session.scalars(stmt.order_by(Account.archived, Account.name)))


@router.post("", status_code=201, response_model=AccountOut)
async def create_account(
    group_id: uuid.UUID,
    body: AccountCreate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Account:
    if body.owner_user_id is not None:
        if await session.get(GroupMember, (group_id, body.owner_user_id)) is None:
            raise HTTPException(status_code=422, detail="Owner is not a group member")
    account = Account(group_id=group_id, **body.model_dump())
    session.add(account)
    await session.commit()
    return account


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    group_id: uuid.UUID,
    account_id: uuid.UUID,
    body: AccountUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Account:
    account = await get_in_group(session, Account, account_id, group_id, "Account")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await session.commit()
    return account
