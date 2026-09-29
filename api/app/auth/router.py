from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.google import GoogleVerifier, get_google_verifier
from app.auth.schemas import GoogleLoginIn, GroupSummary, LoginOut, MeOut, MePatch
from app.auth.tokens import create_access_token
from app.config import settings
from app.db import get_session
from app.models import Group, GroupMember, User

router = APIRouter(tags=["auth"])


async def build_me(session: AsyncSession, user: User) -> MeOut:
    rows = (
        await session.execute(
            select(Group, GroupMember.role)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user.id)
            .order_by(Group.created_at)
        )
    ).all()
    groups = [GroupSummary(id=g.id, name=g.name, type=g.type, role=role) for g, role in rows]
    member_ids = {g.id for g in groups}
    default_group_id = user.default_group_id if user.default_group_id in member_ids else None
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        default_group_id=default_group_id,
        groups=groups,
    )


@router.post("/auth/google", response_model=LoginOut)
async def google_login(
    body: GoogleLoginIn,
    session: AsyncSession = Depends(get_session),
    verify: GoogleVerifier = Depends(get_google_verifier),
) -> LoginOut:
    identity = await run_in_threadpool(verify, body.id_token)
    email = identity.email.strip().lower()
    if email not in settings.allowed_email_set:
        raise HTTPException(status_code=403, detail="Email not allowed")

    user = await session.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = User(
            google_sub=identity.sub, email=email, name=identity.name, avatar_url=identity.picture
        )
        session.add(user)
    else:
        user.email = email
        user.name = identity.name
        user.avatar_url = identity.picture
    await session.commit()

    token, expires_at = create_access_token(user.id)
    return LoginOut(access_token=token, expires_at=expires_at, user=await build_me(session, user))


@router.get("/me", response_model=MeOut)
async def get_me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> MeOut:
    return await build_me(session, user)


@router.patch("/me", response_model=MeOut)
async def patch_me(
    body: MePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    if await session.get(GroupMember, (body.default_group_id, user.id)) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    user.default_group_id = body.default_group_id
    await session.commit()
    return await build_me(session, user)
