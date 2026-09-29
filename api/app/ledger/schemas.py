import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

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


MAX_AMOUNT = 10**12


def _check_amount(value: int | None) -> int | None:
    if value is None:
        return value
    if value == 0:
        raise ValueError("amount must not be 0")
    if abs(value) > MAX_AMOUNT:
        raise ValueError("amount is too large")
    return value


class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    amount: int
    occurred_at: AwareDatetime
    description: str = Field(default="", max_length=500)
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    is_internal_transfer: bool = False

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: int) -> int:
        return _check_amount(value)


class TransactionUpdate(BaseModel):
    account_id: uuid.UUID | None = None
    amount: int | None = None
    occurred_at: AwareDatetime | None = None
    description: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    is_internal_transfer: bool | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: int | None) -> int | None:
        return _check_amount(value)

    @model_validator(mode="after")
    def required_fields_not_null(self) -> "TransactionUpdate":
        for name in ("account_id", "amount", "occurred_at", "description", "is_internal_transfer"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID | None
    amount: int
    occurred_at: datetime
    description: str
    merchant: str | None
    counterparty: str | None
    category_id: uuid.UUID | None
    source: str
    status: str
    classified_by: str | None
    is_internal_transfer: bool
    reconciled: bool
    note: str | None
    created_at: datetime
    updated_at: datetime


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total_count: int
    sum_expense: int
    sum_income: int


class CategoryAmount(BaseModel):
    category_id: uuid.UUID | None
    amount: int
    count: int


class SummaryOut(BaseModel):
    month: str
    total_expense: int
    total_income: int
    prev_total_expense: int
    prev_total_income: int
    transaction_count: int
    uncategorized_count: int
    expense_by_category: list[CategoryAmount]
    income_by_category: list[CategoryAmount]
