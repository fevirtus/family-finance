import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["family"] = "family"


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    currency: str
    role: str


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    avatar_url: str | None
    role: str


class GroupDetail(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    currency: str
    members: list[MemberOut]


class InviteOut(BaseModel):
    url: str
    expires_at: datetime


class InvitePreview(BaseModel):
    group_id: uuid.UUID
    group_name: str
    expires_at: datetime
    valid: bool
    already_member: bool
