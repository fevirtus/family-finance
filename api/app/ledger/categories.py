import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import get_in_group
from app.ledger.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.models import Category, GroupMember

router = APIRouter(prefix="/groups/{group_id}/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    group_id: uuid.UUID,
    include_archived: bool = False,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> list[Category]:
    stmt = select(Category).where(Category.group_id == group_id)
    if not include_archived:
        stmt = stmt.where(Category.archived.is_(False))
    return list(await session.scalars(stmt.order_by(Category.kind, Category.created_at)))


@router.post("", status_code=201, response_model=CategoryOut)
async def create_category(
    group_id: uuid.UUID,
    body: CategoryCreate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Category:
    if body.parent_id is not None:
        parent = await get_in_group(
            session, Category, body.parent_id, group_id, "Parent category", status_code=422
        )
        if parent.kind != body.kind:
            raise HTTPException(status_code=422, detail="Parent category kind differs")
    category = Category(group_id=group_id, **body.model_dump())
    session.add(category)
    await session.commit()
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    group_id: uuid.UUID,
    category_id: uuid.UUID,
    body: CategoryUpdate,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> Category:
    category = await get_in_group(session, Category, category_id, group_id, "Category")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await session.commit()
    return category
