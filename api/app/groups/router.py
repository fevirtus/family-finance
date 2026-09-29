import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.config import settings
from app.db import get_session
from app.groups.schemas import (
    GroupCreate,
    GroupDetail,
    GroupOut,
    InviteOut,
    InvitePreview,
    MemberOut,
)
from app.groups.service import create_group, get_membership
from app.models import Group, GroupInvite, GroupMember, User

router = APIRouter(tags=["groups"])

INVITE_TTL = timedelta(days=7)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _group_out(group: Group, role: str) -> GroupOut:
    return GroupOut(
        id=group.id, name=group.name, type=group.type, currency=group.currency, role=role
    )


async def _find_invite(session: AsyncSession, token: str, lock: bool = False) -> GroupInvite:
    stmt = select(GroupInvite).where(GroupInvite.token_hash == hash_token(token))
    if lock:
        stmt = stmt.with_for_update()
    invite = await session.scalar(stmt)
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    return invite


def _invite_usable(invite: GroupInvite) -> bool:
    return invite.used_by is None and invite.expires_at > datetime.now(UTC)


@router.post("/groups", status_code=201, response_model=GroupOut)
async def create(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    group = await create_group(session, user, body.name.strip(), body.type)
    return _group_out(group, "owner")


@router.get("/groups/{group_id}", response_model=GroupDetail)
async def get_group(
    group_id: uuid.UUID,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> GroupDetail:
    group = await session.get(Group, group_id)
    rows = (
        await session.execute(
            select(User, GroupMember.role)
            .join(GroupMember, GroupMember.user_id == User.id)
            .where(GroupMember.group_id == group_id)
            .order_by(GroupMember.joined_at)
        )
    ).all()
    members = [
        MemberOut(user_id=u.id, name=u.name, email=u.email, avatar_url=u.avatar_url, role=role)
        for u, role in rows
    ]
    return GroupDetail(
        id=group.id, name=group.name, type=group.type, currency=group.currency, members=members
    )


@router.post("/groups/{group_id}/invites", status_code=201, response_model=InviteOut)
async def create_invite(
    group_id: uuid.UUID,
    member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> InviteOut:
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can invite")
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(UTC) + INVITE_TTL
    session.add(
        GroupInvite(
            group_id=group_id,
            token_hash=hash_token(token),
            created_by=member.user_id,
            expires_at=expires_at,
        )
    )
    await session.commit()
    return InviteOut(
        url=f"{settings.public_web_url.rstrip('/')}/invite/{token}", expires_at=expires_at
    )


@router.get("/invites/{token}", response_model=InvitePreview)
async def preview_invite(
    token: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> InvitePreview:
    invite = await _find_invite(session, token)
    group = await session.get(Group, invite.group_id)
    already_member = await session.get(GroupMember, (invite.group_id, user.id)) is not None
    return InvitePreview(
        group_id=group.id,
        group_name=group.name,
        expires_at=invite.expires_at,
        valid=already_member or _invite_usable(invite),
        already_member=already_member,
    )


@router.post("/invites/{token}/accept", response_model=GroupOut)
async def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    invite = await _find_invite(session, token, lock=True)
    group = await session.get(Group, invite.group_id)
    existing = await session.get(GroupMember, (invite.group_id, user.id))
    if existing is not None:
        return _group_out(group, existing.role)
    if invite.used_by is not None:
        raise HTTPException(status_code=410, detail="Invite already used")
    if invite.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=410, detail="Invite expired")

    session.add(GroupMember(group_id=group.id, user_id=user.id, role="member"))
    invite.used_by = user.id
    invite.used_at = datetime.now(UTC)
    if user.default_group_id is None:
        user.default_group_id = group.id
    await session.commit()
    return _group_out(group, "member")
