import uuid

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db import get_session
from app.groups.default_categories import DEFAULT_CATEGORIES
from app.models import Category, Group, GroupMember, User


async def get_membership(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupMember:
    member = await session.get(GroupMember, (group_id, user.id))
    if member is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return member


async def create_group(session: AsyncSession, user: User, name: str, type_: str) -> Group:
    group = Group(name=name, type=type_, created_by=user.id)
    session.add(group)
    await session.flush()
    session.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    session.add_all(
        Category(group_id=group.id, name=name_, kind=kind, icon=icon)
        for name_, kind, icon in DEFAULT_CATEGORIES
    )
    if user.default_group_id is None:
        user.default_group_id = group.id
    await session.commit()
    return group
