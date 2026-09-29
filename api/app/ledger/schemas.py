import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

AccountKind = Literal["bank", "ewallet", "cash", "credit"]
CategoryKind = Literal["expense", "income"]
Provider = Annotated[str | None, Field(max_length=32, pattern=r"^[a-z0-9_]+$")]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: AccountKind
    provider: Provider = None
    owner_user_id: uuid.UUID | None = None


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: AccountKind | None = None
    provider: Provider = None
    archived: bool | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    provider: str | None
    owner_user_id: uuid.UUID | None
    archived: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: CategoryKind
    icon: str | None = Field(default=None, max_length=16)
    parent_id: uuid.UUID | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    icon: str | None = Field(default=None, max_length=16)
    archived: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    icon: str | None
    parent_id: uuid.UUID | None
    archived: bool
