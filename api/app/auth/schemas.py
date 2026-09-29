import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GoogleLoginIn(BaseModel):
    id_token: str = Field(min_length=1)


class GroupSummary(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    role: str


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None
    default_group_id: uuid.UUID | None
    groups: list[GroupSummary]


class LoginOut(BaseModel):
    access_token: str
    expires_at: datetime
    user: MeOut


class MePatch(BaseModel):
    default_group_id: uuid.UUID
