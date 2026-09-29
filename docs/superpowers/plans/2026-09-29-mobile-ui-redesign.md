# Mobile-first UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M1 web UI with a mobile-first app shell (bottom tabs + floating “+”), a fast quick-add sheet, an overview page, a day-grouped transaction list, and polished accounts/categories/group pages — plus two read-only API endpoints that feed them.

**Architecture:** API gains `GET /groups/{id}/summary` and `GET /groups/{id}/suggestions` (FastAPI, same patterns as M1). Web keeps server components + server actions; a client `AppShell` in the group layout owns navigation and a single `TransactionSheet` (create/edit) opened through React context from any page. UI primitives come from shadcn/ui (Radix + Tailwind v4); bottom sheets use vaul Drawer on phones and Dialog on desktop.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest; Next.js 16 (App Router, `proxy.ts`), React 19, next-auth 4, Tailwind v4, shadcn/ui (new-york, lucide), vaul, sonner, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-mobile-ui-redesign-design.md` (parent: `docs/superpowers/specs/2026-09-29-family-finance-design.md`).

## Global Constraints

- Scope is UI only: no budgets, goals or other M5 features; tab 4 is **Tài khoản**.
- Layout: bottom tab bar `Tổng quan · Giao dịch · [ + ] · Tài khoản · Thêm` below `md`; left sidebar at `md` and above.
- Money is integer VND (negative = expense). Month and day boundaries use `Asia/Ho_Chi_Minh`.
- Internal transfers are excluded from every total, count and day total.
- Colors: accent emerald; expense `text-red-600`, income `text-emerald-600`, internal transfer gray. Dark mode follows the OS (`prefers-color-scheme`).
- Touch targets ≥ 44px (`min-h-11`); amounts use `tabular-nums`; must work at 375px wide with no horizontal scroll.
- Quick amount chips: 20k, 50k, 100k, 200k, 500k. Category grid shows up to 8 suggested categories + “Khác…”.
- Edits send only changed fields. Deleting asks for confirmation. Errors from actions are shown in place (sheet) or as a toast, never as the generic error page.
- PWA: `name` “Family Finance”, `short_name` “Chi tiêu”, `display: standalone`, icons 192/512 + apple-touch-icon. No service worker.
- Dev-only scripts (`api/scripts/dev_session.py`, `web/scripts/dev-session.mjs`) refuse to run against non-local targets and are excluded from images by `.dockerignore`.
- UI copy is Vietnamese.

## Review Focus

1. A transaction at 23:30 VN on the last day of a month (16:30 UTC) is counted in that month's summary and grouped under that day in the list, not the next. (Task 1, Task 4)
2. Editing a rule/AI-classified transaction's note only must not send `category_id` (so `classified_by` survives). (Task 4 `changedFields`)
3. Suggestions for a brand-new group (no transactions) still return 8 expense categories in default order, and never include archived ones. (Task 2)
4. The quick-add sheet with zero accounts must not submit and must tell the user to add an account. (Task 5)
5. Session expiry on a deep link returns the user to that page after login (`callbackUrl`), and never to an external URL. (Task 3)

---

## File Structure

```
api/app/ledger/common.py        + sum_where(condition) helper (moved from transactions.py)
api/app/ledger/summary.py       GET /groups/{gid}/summary, GET /groups/{gid}/suggestions
api/app/ledger/schemas.py       + CategoryAmount, SummaryOut, SuggestionsOut
api/tests/test_summary.py, api/tests/test_suggestions.py
api/scripts/dev_session.py      dev-only: seed local DB + print API JWT

web/components/ui/*             shadcn generated (button, input, label, textarea, drawer, dialog, alert-dialog, badge)
web/components/responsive-sheet.tsx   Drawer (<md) / Dialog (≥md)
web/components/transaction-form.tsx (+ .test.tsx)   quick-add/edit form body
web/components/app-shell.tsx    shell + TransactionSheet context + toasts
web/components/nav.tsx          BottomNav, SideNav
web/components/transaction-row.tsx    client row → opens edit sheet
web/components/month-switcher.tsx
web/lib/use-media-query.ts
web/lib/money.ts                + shortVnd
web/lib/days.ts (+test)         vnDateKey, groupByVnDay, vnDayLabel
web/lib/diff.ts (+test)         changedFields
web/lib/types.ts                + Summary, Suggestions, TransactionPatch; ActionResult gains id
web/lib/api.ts                  redirect to /login?callbackUrl=<x-pathname>
web/proxy.ts                    sets x-pathname request header
web/app/manifest.ts, web/public/icons/*.png, web/scripts/make_icons.py
web/app/layout.tsx              viewport (themeColor, viewportFit), apple icon
web/app/page.tsx                → /g/<id>/overview
web/app/login/*, web/app/onboarding/*   restyled; onboarding creates chosen accounts
web/app/g/[groupId]/layout.tsx  loads me/accounts/categories/suggestions → AppShell
web/app/g/[groupId]/actions.ts  transaction create/update/delete (shared)
web/app/g/[groupId]/overview/{page.tsx,category-breakdown.tsx}
web/app/g/[groupId]/transactions/{page.tsx,filters.tsx}
web/app/g/[groupId]/accounts/{page.tsx,accounts-view.tsx,actions.ts}
web/app/g/[groupId]/more/page.tsx
web/app/g/[groupId]/more/categories/{page.tsx,categories-view.tsx,actions.ts}
web/app/g/[groupId]/more/group/{page.tsx,invite-link.tsx,actions.ts}
web/scripts/dev-session.mjs     dev-only: mint local next-auth cookie
DELETE: web/lib/ui.ts, web/app/g/[groupId]/{categories,settings}/*, web/app/g/[groupId]/transactions/{actions.ts,transaction-form.tsx,transaction-form.test.tsx}
```

---

### Task 1: API — monthly summary endpoint

**Files:**
- Modify: `api/app/ledger/common.py`, `api/app/ledger/transactions.py`, `api/app/ledger/schemas.py`, `api/app/main.py`
- Create: `api/app/ledger/summary.py`
- Test: `api/tests/test_summary.py`

**Interfaces:**
- Consumes: `month_range(month) -> (start, end)` (UTC), `get_membership`, `Transaction`, `Category`.
- Produces: `app.ledger.common.sum_where(condition) -> ColumnElement` (COALESCE(SUM(CASE WHEN condition THEN amount ELSE 0), 0)); `app.ledger.summary.router`; `GET /groups/{gid}/summary?month=YYYY-MM` → `SummaryOut{month, total_expense, total_income, prev_total_expense, prev_total_income, transaction_count, uncategorized_count, expense_by_category: CategoryAmount[], income_by_category: CategoryAmount[]}`, `CategoryAmount{category_id: UUID|null, amount: int, count: int}`.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_summary.py`:

```python
import pytest

from tests.helpers import create_group, login


@pytest.fixture
async def s(client):
    me = await login(client)
    gid = await create_group(client, me)
    account = (
        await client.post(
            f"/groups/{gid}/accounts", json={"name": "TPBank", "kind": "bank"}, headers=me
        )
    ).json()
    cats = {c["name"]: c for c in (await client.get(f"/groups/{gid}/categories", headers=me)).json()}
    return {"me": me, "gid": gid, "account": account, "cats": cats}


async def add(client, s, amount, when, category=None, transfer=False):
    body = {
        "account_id": s["account"]["id"],
        "amount": amount,
        "occurred_at": when,
        "category_id": s["cats"][category]["id"] if category else None,
        "is_internal_transfer": transfer,
    }
    r = await client.post(f"/groups/{s['gid']}/transactions", json=body, headers=s["me"])
    assert r.status_code == 201, r.text


async def summary(client, s, month):
    r = await client.get(f"/groups/{s['gid']}/summary?month={month}", headers=s["me"])
    assert r.status_code == 200, r.text
    return r.json()


async def test_totals_use_vietnam_month_and_skip_transfers(client, s):
    await add(client, s, -45000, "2026-09-30T23:30:00+07:00", "Ăn uống")
    await add(client, s, -10000, "2026-10-01T00:10:00+07:00", "Ăn uống")
    await add(client, s, 25000000, "2026-09-05T09:00:00+07:00", "Lương")
    await add(client, s, -2000000, "2026-09-06T09:00:00+07:00", transfer=True)
    body = await summary(client, s, "2026-09")
    assert body["month"] == "2026-09"
    assert body["total_expense"] == -45000
    assert body["total_income"] == 25000000
    assert body["transaction_count"] == 2
    assert body["uncategorized_count"] == 0


async def test_previous_month_totals(client, s):
    await add(client, s, -300000, "2026-08-10T12:00:00+07:00", "Đi chợ")
    await add(client, s, 1000000, "2026-08-11T12:00:00+07:00", "Thưởng")
    await add(client, s, -50000, "2026-09-10T12:00:00+07:00", "Đi chợ")
    body = await summary(client, s, "2026-09")
    assert body["prev_total_expense"] == -300000
    assert body["prev_total_income"] == 1000000


async def test_previous_month_of_january_is_december(client, s):
    await add(client, s, -70000, "2025-12-31T23:00:00+07:00", "Ăn uống")
    body = await summary(client, s, "2026-01")
    assert body["prev_total_expense"] == -70000


async def test_by_category_sorted_with_uncategorized_bucket(client, s):
    await add(client, s, -100000, "2026-09-10T12:00:00+07:00", "Ăn uống")
    await add(client, s, -50000, "2026-09-11T12:00:00+07:00", "Ăn uống")
    await add(client, s, -400000, "2026-09-12T12:00:00+07:00", "Đi chợ")
    await add(client, s, -20000, "2026-09-13T12:00:00+07:00")
    body = await summary(client, s, "2026-09")
    rows = body["expense_by_category"]
    assert [r["amount"] for r in rows] == [-400000, -150000, -20000]
    assert rows[0]["category_id"] == s["cats"]["Đi chợ"]["id"]
    assert rows[1]["count"] == 2
    assert rows[2]["category_id"] is None
    assert body["uncategorized_count"] == 1
    assert body["income_by_category"] == []


async def test_bad_month_and_non_member(client, s):
    assert (
        await client.get(f"/groups/{s['gid']}/summary?month=2026-13", headers=s["me"])
    ).status_code == 422
    wife = await login(client, "wife@example.com", "Wife")
    assert (
        await client.get(f"/groups/{s['gid']}/summary?month=2026-09", headers=wife)
    ).status_code == 404
```

Run: `cd api && uv run pytest tests/test_summary.py -q`
Expected: FAIL — 404 on `/summary` (route missing) in the first tests.

- [ ] **Step 2: Move the sum helper to `common.py`**

Append to `api/app/ledger/common.py`:

```python
from sqlalchemy import case, func
from sqlalchemy.sql.elements import ColumnElement

from app.models import Transaction


def sum_where(condition: ColumnElement[bool]) -> ColumnElement[int]:
    """SUM(amount) over rows matching `condition`, 0 when there are none."""
    return func.coalesce(func.sum(case((condition, Transaction.amount), else_=0)), 0)
```

(Merge the new imports into the file's import block so ruff's isort passes.)

In `api/app/ledger/transactions.py`: delete the local `_signed_sum` function, import `sum_where` from `app.ledger.common`, replace both `_signed_sum(` calls with `sum_where(`, and drop `case` and `func`… keep `func` (still used for `count`), drop `case` from the sqlalchemy import.

Run: `uv run pytest tests/test_transactions.py -q && uv run ruff check .`
Expected: all transaction tests PASS; ruff clean.

- [ ] **Step 3: Schemas**

Append to `api/app/ledger/schemas.py`:

```python
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
```

- [ ] **Step 4: Implement the router**

`api/app/ledger/summary.py`:

```python
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.groups.service import get_membership
from app.ledger.common import sum_where
from app.ledger.schemas import CategoryAmount, SummaryOut
from app.ledger.timeutil import month_range
from app.models import GroupMember, Transaction

router = APIRouter(prefix="/groups/{group_id}", tags=["summary"])


def previous_month(month: str) -> str:
    year, mon = (int(part) for part in month.split("-"))
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def _in_range(group_id: uuid.UUID, start: datetime, end: datetime) -> list:
    return [
        Transaction.group_id == group_id,
        Transaction.is_internal_transfer.is_(False),
        Transaction.occurred_at >= start,
        Transaction.occurred_at < end,
    ]


async def _by_category(
    session: AsyncSession, conditions: list, expense: bool
) -> list[CategoryAmount]:
    total = func.sum(Transaction.amount)
    rows = await session.execute(
        select(Transaction.category_id, total, func.count())
        .where(*conditions, Transaction.amount < 0 if expense else Transaction.amount > 0)
        .group_by(Transaction.category_id)
        .order_by(total.asc() if expense else total.desc())
    )
    return [
        CategoryAmount(category_id=category_id, amount=int(amount), count=int(count))
        for category_id, amount, count in rows
    ]


@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    group_id: uuid.UUID,
    month: str,
    _member: GroupMember = Depends(get_membership),
    session: AsyncSession = Depends(get_session),
) -> SummaryOut:
    try:
        start, end = month_range(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM") from exc
    prev_start, prev_end = month_range(previous_month(month))

    current = _in_range(group_id, start, end)
    expense, income, count, uncategorized = (
        await session.execute(
            select(
                sum_where(Transaction.amount < 0),
                sum_where(Transaction.amount > 0),
                func.count(),
                func.count().filter(Transaction.category_id.is_(None)),
            ).where(*current)
        )
    ).one()
    prev_expense, prev_income = (
        await session.execute(
            select(sum_where(Transaction.amount < 0), sum_where(Transaction.amount > 0)).where(
                *_in_range(group_id, prev_start, prev_end)
            )
        )
    ).one()

    return SummaryOut(
        month=month,
        total_expense=int(expense),
        total_income=int(income),
        prev_total_expense=int(prev_expense),
        prev_total_income=int(prev_income),
        transaction_count=int(count),
        uncategorized_count=int(uncategorized),
        expense_by_category=await _by_category(session, current, expense=True),
        income_by_category=await _by_category(session, current, expense=False),
    )
```

In `api/app/main.py` import `summary` alongside the other ledger routers (`from app.ledger import accounts, categories, summary, transactions`) and add `app.include_router(summary.router)` after the transactions router.

- [ ] **Step 5: Run the suite**

Run: `cd api && uv run pytest -q && uv run ruff check .`
Expected: all PASS; ruff clean.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): monthly summary endpoint with category breakdown"
```

---

### Task 2: API — quick-add suggestions endpoint

**Files:**
- Modify: `api/app/ledger/summary.py`, `api/app/ledger/schemas.py`
- Test: `api/tests/test_suggestions.py`

**Interfaces:**
- Consumes: `get_membership`, `get_current_user`, `DEFAULT_CATEGORIES`, models.
- Produces: `GET /groups/{gid}/suggestions` → `SuggestionsOut{expense_category_ids: UUID[] (≤8), income_category_ids: UUID[] (≤8), last_account_id: UUID|null}`. Ranking: transaction count in the last 90 days (desc), ties broken by position in `DEFAULT_CATEGORIES` (custom categories after defaults, then by `created_at`). Archived categories excluded. `last_account_id` = most recently *created* transaction by the caller whose account is not archived.

- [ ] **Step 1: Write the failing tests**

`api/tests/test_suggestions.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest

from app.groups.default_categories import DEFAULT_CATEGORIES
from tests.helpers import create_group, login


@pytest.fixture
async def s(client):
    me = await login(client)
    gid = await create_group(client, me)
    accounts = {}
    for name in ("TPBank", "MoMo"):
        accounts[name] = (
            await client.post(
                f"/groups/{gid}/accounts", json={"name": name, "kind": "bank"}, headers=me
            )
        ).json()
    cats = {c["name"]: c for c in (await client.get(f"/groups/{gid}/categories", headers=me)).json()}
    return {"me": me, "gid": gid, "accounts": accounts, "cats": cats}


async def add(client, s, category, account="TPBank", days_ago=1, headers=None, amount=-10000):
    when = (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()
    body = {
        "account_id": s["accounts"][account]["id"],
        "amount": amount,
        "occurred_at": when,
        "category_id": s["cats"][category]["id"],
    }
    r = await client.post(
        f"/groups/{s['gid']}/transactions", json=body, headers=headers or s["me"]
    )
    assert r.status_code == 201, r.text


async def suggestions(client, s, headers=None):
    r = await client.get(f"/groups/{s['gid']}/suggestions", headers=headers or s["me"])
    assert r.status_code == 200, r.text
    return r.json()


def names(s, ids):
    by_id = {c["id"]: name for name, c in s["cats"].items()}
    return [by_id[i] for i in ids]


DEFAULT_EXPENSE = [n for n, kind, _ in DEFAULT_CATEGORIES if kind == "expense"]
DEFAULT_INCOME = [n for n, kind, _ in DEFAULT_CATEGORIES if kind == "income"]


async def test_new_group_gets_defaults_in_order(client, s):
    body = await suggestions(client, s)
    assert names(s, body["expense_category_ids"]) == DEFAULT_EXPENSE[:8]
    assert names(s, body["income_category_ids"]) == DEFAULT_INCOME
    assert body["last_account_id"] is None


async def test_usage_ranks_first_within_90_days(client, s):
    for _ in range(3):
        await add(client, s, "Đi chợ")
    await add(client, s, "Di chuyển")
    for _ in range(5):
        await add(client, s, "Du lịch", days_ago=100)  # outside the window
    body = await suggestions(client, s)
    got = names(s, body["expense_category_ids"])
    assert got[:2] == ["Đi chợ", "Di chuyển"]
    assert got[2:] == [n for n in DEFAULT_EXPENSE if n not in ("Đi chợ", "Di chuyển")][:6]
    assert "Du lịch" not in got


async def test_archived_categories_are_excluded(client, s):
    food = s["cats"]["Ăn uống"]["id"]
    await client.patch(f"/groups/{s['gid']}/categories/{food}", json={"archived": True}, headers=s["me"])
    body = await suggestions(client, s)
    assert food not in body["expense_category_ids"]
    assert len(body["expense_category_ids"]) == 8


async def test_last_account_is_callers_latest_non_archived(client, s):
    await add(client, s, "Ăn uống", account="TPBank")
    await add(client, s, "Ăn uống", account="MoMo")
    assert (await suggestions(client, s))["last_account_id"] == s["accounts"]["MoMo"]["id"]

    momo = s["accounts"]["MoMo"]["id"]
    await client.patch(f"/groups/{s['gid']}/accounts/{momo}", json={"archived": True}, headers=s["me"])
    assert (await suggestions(client, s))["last_account_id"] == s["accounts"]["TPBank"]["id"]


async def test_last_account_ignores_other_members(client, s):
    token = (await client.post(f"/groups/{s['gid']}/invites", headers=s["me"])).json()["url"]
    wife = await login(client, "wife@example.com", "Wife")
    await client.post(f"/invites/{token.rsplit('/', 1)[1]}/accept", headers=wife)
    await add(client, s, "Ăn uống", account="MoMo", headers=wife)
    assert (await suggestions(client, s))["last_account_id"] is None


async def test_non_member_gets_404(client, s):
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.get(f"/groups/{s['gid']}/suggestions", headers=wife)).status_code == 404
```

Run: `cd api && uv run pytest tests/test_suggestions.py -q`
Expected: FAIL — 404 on `/suggestions`.

- [ ] **Step 2: Schema**

Append to `api/app/ledger/schemas.py`:

```python
class SuggestionsOut(BaseModel):
    expense_category_ids: list[uuid.UUID]
    income_category_ids: list[uuid.UUID]
    last_account_id: uuid.UUID | None
```

- [ ] **Step 3: Implement**

Append to `api/app/ledger/summary.py` (merge imports into the top block: `from datetime import UTC, datetime, timedelta`, `from app.auth.deps import get_current_user`, `from app.groups.default_categories import DEFAULT_CATEGORIES`, `from app.ledger.schemas import CategoryAmount, SuggestionsOut, SummaryOut`, `from app.models import Account, Category, GroupMember, Transaction, User`):

```python
SUGGESTION_LIMIT = 8
SUGGESTION_WINDOW = timedelta(days=90)
DEFAULT_RANK = {name: i for i, (name, _kind, _icon) in enumerate(DEFAULT_CATEGORIES)}


@router.get("/suggestions", response_model=SuggestionsOut)
async def get_suggestions(
    group_id: uuid.UUID,
    _member: GroupMember = Depends(get_membership),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SuggestionsOut:
    categories = list(
        await session.scalars(
            select(Category).where(Category.group_id == group_id, Category.archived.is_(False))
        )
    )
    usage = dict(
        (
            await session.execute(
                select(Transaction.category_id, func.count())
                .where(
                    Transaction.group_id == group_id,
                    Transaction.category_id.is_not(None),
                    Transaction.occurred_at >= datetime.now(UTC) - SUGGESTION_WINDOW,
                )
                .group_by(Transaction.category_id)
            )
        ).all()
    )

    def top(kind: str) -> list[uuid.UUID]:
        ranked = sorted(
            (c for c in categories if c.kind == kind),
            key=lambda c: (-usage.get(c.id, 0), DEFAULT_RANK.get(c.name, len(DEFAULT_RANK)), c.created_at),
        )
        return [c.id for c in ranked[:SUGGESTION_LIMIT]]

    last_account_id = await session.scalar(
        select(Transaction.account_id)
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Transaction.group_id == group_id,
            Transaction.user_id == user.id,
            Account.archived.is_(False),
        )
        .order_by(Transaction.created_at.desc())
        .limit(1)
    )
    return SuggestionsOut(
        expense_category_ids=top("expense"),
        income_category_ids=top("income"),
        last_account_id=last_account_id,
    )
```

Wrap the long `key=lambda` line if ruff flags E501.

- [ ] **Step 4: Run the suite**

Run: `cd api && uv run pytest -q && uv run ruff check .`
Expected: all PASS; ruff clean.

- [ ] **Step 5: Commit**

```bash
git add api
git commit -m "feat(api): quick-add suggestions (top categories, last account)"
```

---

### Task 3: Web foundation — shadcn/ui, theme, PWA, proxy + callbackUrl, types

**Files:**
- Create (generated): `web/components.json`, `web/lib/utils.ts`, `web/components/ui/{button,input,label,textarea,drawer,dialog,alert-dialog,badge}.tsx`
- Create: `web/app/manifest.ts`, `web/scripts/make_icons.py`, `web/public/icons/{icon-192.png,icon-512.png,apple-touch-icon.png}`, `web/proxy.ts`
- Modify: `web/app/globals.css`, `web/app/layout.tsx`, `web/lib/api.ts`, `web/lib/types.ts`, `web/.dockerignore`

**Interfaces:**
- Produces: shadcn components at `@/components/ui/*` and `cn()` in `@/lib/utils`; `sonner` package; request header `x-pathname` on every page request; `apiFetch` redirects to `/login?callbackUrl=<path>`; types `Summary`, `CategoryAmount`, `Suggestions`, `TransactionPatch = Partial<TransactionInput>`, `ActionResult = { error?: string; id?: string }`.

- [ ] **Step 1: Install shadcn/ui and components**

Run:
```bash
cd web && pnpm dlx shadcn@latest init --base-color neutral --yes && \
pnpm dlx shadcn@latest add button input label textarea drawer dialog alert-dialog badge --yes && \
pnpm add sonner
```
Expected: `components.json`, `lib/utils.ts`, `components/ui/*.tsx` created; `globals.css` rewritten with shadcn tokens (`:root { --primary: … }`, `.dark { … }`, `@custom-variant dark …`). If `init` asks for a style, choose **new-york**; icon library **lucide**.

- [ ] **Step 2: Emerald accent + OS-driven dark mode in `web/app/globals.css`**

Edit the generated file:
1. Replace the `@custom-variant dark (...)` line with:
   ```css
   @custom-variant dark (@media (prefers-color-scheme: dark));
   ```
2. In the `:root { … }` block set:
   ```css
   --primary: oklch(0.596 0.145 163.225);
   --primary-foreground: oklch(0.985 0 0);
   --ring: oklch(0.696 0.17 162.48);
   ```
3. Change the `.dark {` selector line to `@media (prefers-color-scheme: dark) { :root {` and add one extra `}` after that block's closing brace, then inside it set:
   ```css
   --primary: oklch(0.696 0.17 162.48);
   --primary-foreground: oklch(0.145 0 0);
   --ring: oklch(0.596 0.145 163.225);
   ```
4. Append:
   ```css
   @layer base {
     html { -webkit-tap-highlight-color: transparent; }
     .tabular-nums { font-variant-numeric: tabular-nums; }
   }
   ```

- [ ] **Step 3: PWA icons, manifest, viewport**

`web/scripts/make_icons.py`:

```python
"""Generate PWA icons. Run: uv run --with pillow python web/scripts/make_icons.py"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
EMERALD = (5, 150, 105)
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def icon(size: int, radius_ratio: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size, size), radius=int(size * radius_ratio), fill=EMERALD)
    font = ImageFont.truetype(FONT, int(size * 0.62))
    draw.text((size / 2, size / 2), "đ", font=font, fill="white", anchor="mm")
    return img


OUT.mkdir(parents=True, exist_ok=True)
icon(192, 0.22).save(OUT / "icon-192.png")
icon(512, 0.22).save(OUT / "icon-512.png")
icon(180, 0).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
```

Run: `cd .. && uv run --with pillow python web/scripts/make_icons.py`
Expected: `icons written to …/web/public/icons`; three PNGs exist.

`web/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Finance",
    short_name: "Chi tiêu",
    description: "Theo dõi chi tiêu gia đình",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#059669",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Replace `web/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Finance",
  description: "Theo dõi chi tiêu gia đình",
  appleWebApp: { capable: true, title: "Chi tiêu", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: `proxy.ts` and callbackUrl**

`web/proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";

/** Expose the requested path to server components so auth redirects can come back to it. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|manifest.webmanifest|favicon.ico).*)"],
};
```

In `web/lib/api.ts`: change `import { cookies } from "next/headers";` to `import { cookies, headers } from "next/headers";` and add below `getApiToken`:

```ts
/** Login URL that returns to the current page (same-origin paths only). */
export async function loginUrl(): Promise<string> {
  const path = (await headers()).get("x-pathname") ?? "/";
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `/login?callbackUrl=${encodeURIComponent(safe)}`;
}
```

Replace both `redirect("/login")` calls in `apiFetch` with `redirect(await loginUrl())`.

- [ ] **Step 5: Types**

In `web/lib/types.ts` replace `export type ActionResult = { error?: string };` with:

```ts
export type ActionResult = { error?: string; id?: string };

export type TransactionPatch = Partial<TransactionInput>;

export type CategoryAmount = { category_id: string | null; amount: number; count: number };

export type Summary = {
  month: string;
  total_expense: number;
  total_income: number;
  prev_total_expense: number;
  prev_total_income: number;
  transaction_count: number;
  uncategorized_count: number;
  expense_by_category: CategoryAmount[];
  income_by_category: CategoryAmount[];
};

export type Suggestions = {
  expense_category_ids: string[];
  income_category_ids: string[];
  last_account_id: string | null;
};
```

Append `scripts` to `web/.dockerignore`.

- [ ] **Step 6: Verify**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green; build route list includes `/manifest.webmanifest` and shows `ƒ Proxy (Middleware)` (or similar proxy line).

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): shadcn/ui foundation, emerald theme, PWA manifest and login callbackUrl"
```

---

### Task 4: Web pure helpers — shortVnd, day grouping, changedFields

**Files:**
- Modify: `web/lib/money.ts`, `web/lib/money.test.ts`
- Create: `web/lib/days.ts`, `web/lib/days.test.ts`, `web/lib/diff.ts`, `web/lib/diff.test.ts`

**Interfaces:**
- Produces:
  - `shortVnd(amount: number): string` — `45000→"45k"`, `-320000→"-320k"`, `4200000→"4,2tr"`, `25000000→"25tr"`, `12450000→"12,5tr"`, `500→"500đ"`, `999600→"1tr"`.
  - `vnDateKey(iso: string): string` (`"YYYY-MM-DD"` in VN); `groupByVnDay<T extends {occurred_at: string; amount: number; is_internal_transfer: boolean}>(items: T[]): {key: string; items: T[]; total: number}[]` (keeps input order; total excludes transfers); `vnDayLabel(key: string, now?: Date): string` (`"Hôm nay · T3 29/09"`, `"Hôm qua · T2 28/09"`, `"T5 24/09"`).
  - `changedFields(initial: Transaction, next: TransactionInput): TransactionPatch`.

- [ ] **Step 1: Write failing tests**

Append to `web/lib/money.test.ts` (and add `shortVnd` to its import):

```ts
describe("shortVnd", () => {
  it.each([
    [45_000, "45k"],
    [-320_000, "-320k"],
    [4_200_000, "4,2tr"],
    [25_000_000, "25tr"],
    [12_450_000, "12,5tr"],
    [500, "500đ"],
    [999_600, "1tr"],
  ])("formats %d as %s", (amount, expected) => {
    expect(shortVnd(amount)).toBe(expected);
  });
});
```

`web/lib/days.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupByVnDay, vnDateKey, vnDayLabel } from "./days";

const tx = (occurred_at: string, amount: number, is_internal_transfer = false) => ({
  occurred_at,
  amount,
  is_internal_transfer,
});

describe("vnDateKey", () => {
  it("uses the Vietnam calendar day", () => {
    expect(vnDateKey("2026-09-30T16:30:00Z")).toBe("2026-09-30");
    expect(vnDateKey("2026-09-30T17:10:00Z")).toBe("2026-10-01");
  });
});

describe("groupByVnDay", () => {
  it("groups consecutive items by VN day, keeping order, excluding transfers from totals", () => {
    const items = [
      tx("2026-09-30T17:10:00Z", -10_000),
      tx("2026-09-30T16:30:00Z", -45_000),
      tx("2026-09-30T02:00:00Z", -2_000_000, true),
      tx("2026-09-29T05:00:00Z", 25_000_000),
    ];
    const groups = groupByVnDay(items);
    expect(groups.map((g) => [g.key, g.items.length, g.total])).toEqual([
      ["2026-10-01", 1, -10_000],
      ["2026-09-30", 2, -45_000],
      ["2026-09-29", 1, 25_000_000],
    ]);
  });
});

describe("vnDayLabel", () => {
  const now = new Date("2026-09-29T03:00:00Z"); // 10:00 Tue 29/09 in VN
  it("labels today and yesterday", () => {
    expect(vnDayLabel("2026-09-29", now)).toBe("Hôm nay · T3 29/09");
    expect(vnDayLabel("2026-09-28", now)).toBe("Hôm qua · T2 28/09");
  });
  it("labels other days with weekday", () => {
    expect(vnDayLabel("2026-09-24", now)).toBe("T5 24/09");
    expect(vnDayLabel("2026-09-27", now)).toBe("CN 27/09");
  });
});
```

`web/lib/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Transaction, TransactionInput } from "./types";
import { changedFields } from "./diff";

const initial: Transaction = {
  id: "t1",
  account_id: "a1",
  user_id: "u1",
  amount: -45_000,
  occurred_at: "2026-09-29T05:30:00Z",
  description: "Phở",
  merchant: null,
  counterparty: null,
  category_id: "c1",
  source: "telegram",
  status: "confirmed",
  classified_by: "llm",
  is_internal_transfer: false,
  reconciled: false,
  note: null,
  created_at: "2026-09-29T05:30:00Z",
  updated_at: "2026-09-29T05:30:00Z",
};

const same: TransactionInput = {
  account_id: "a1",
  amount: -45_000,
  occurred_at: "2026-09-29T12:30:00+07:00",
  description: "Phở",
  category_id: "c1",
  note: null,
};

describe("changedFields", () => {
  it("returns nothing when only the timezone representation differs", () => {
    expect(changedFields(initial, same)).toEqual({});
  });

  it("returns only the note when only the note changed (keeps classifier)", () => {
    expect(changedFields(initial, { ...same, note: "ăn sáng" })).toEqual({ note: "ăn sáng" });
  });

  it("returns every changed field", () => {
    expect(
      changedFields(initial, { ...same, amount: -50_000, category_id: null, account_id: "a2" }),
    ).toEqual({ amount: -50_000, category_id: null, account_id: "a2" });
  });

  it("treats empty and null notes as equal", () => {
    expect(changedFields({ ...initial, note: "" }, same)).toEqual({});
  });
});
```

Run: `cd web && pnpm test`
Expected: FAIL — `shortVnd` not exported; `./days` and `./diff` unresolved.

- [ ] **Step 2: Implement**

Append to `web/lib/money.ts`:

```ts
/** Compact VND label for charts and chips: 45k, 4,2tr, 500đ. */
export function shortVnd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 999_500) {
    const tenths = Math.round(abs / 100_000);
    const text = tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10}`;
    return `${sign}${text}tr`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}đ`;
}
```

`web/lib/days.ts`:

```ts
import { toVnLocalInput } from "./time";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function vnDateKey(iso: string): string {
  return toVnLocalInput(iso).slice(0, 10);
}

export type DayGroup<T> = { key: string; items: T[]; total: number };

export function groupByVnDay<
  T extends { occurred_at: string; amount: number; is_internal_transfer: boolean },
>(items: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = vnDateKey(item.occurred_at);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, items: [], total: 0 };
      groups.push(group);
    }
    group.items.push(item);
    if (!item.is_internal_transfer) group.total += item.amount;
  }
  return groups;
}

export function vnDayLabel(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const short = `${weekday} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const today = vnDateKey(now.toISOString());
  const yesterday = vnDateKey(new Date(now.getTime() - DAY_MS).toISOString());
  if (key === today) return `Hôm nay · ${short}`;
  if (key === yesterday) return `Hôm qua · ${short}`;
  return short;
}
```

`web/lib/diff.ts`:

```ts
import type { Transaction, TransactionInput, TransactionPatch } from "./types";

/** Only the fields the user actually changed, so untouched fields keep their server state. */
export function changedFields(initial: Transaction, next: TransactionInput): TransactionPatch {
  const patch: TransactionPatch = {};
  if (next.account_id !== initial.account_id) patch.account_id = next.account_id;
  if (next.amount !== initial.amount) patch.amount = next.amount;
  if (Date.parse(next.occurred_at) !== Date.parse(initial.occurred_at)) {
    patch.occurred_at = next.occurred_at;
  }
  if (next.description !== initial.description) patch.description = next.description;
  if (next.category_id !== initial.category_id) patch.category_id = next.category_id;
  if ((next.note || null) !== (initial.note || null)) patch.note = next.note;
  return patch;
}
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/lib
git commit -m "feat(web): VN day grouping, compact VND labels and changed-field diff"
```

---

### Task 5: Web — ResponsiveSheet and TransactionForm (quick-add / edit)

**Files:**
- Create: `web/lib/use-media-query.ts`, `web/components/responsive-sheet.tsx`, `web/components/transaction-form.tsx`
- Test: `web/components/transaction-form.test.tsx`
- Delete: `web/app/g/[groupId]/transactions/transaction-form.tsx`, `web/app/g/[groupId]/transactions/transaction-form.test.tsx`

**Interfaces:**
- Consumes: shadcn `Button`, `Input`, `Label`, `Textarea`, `Drawer*`, `Dialog*`, `AlertDialog*`; `parseVnd`, `formatVnd`, time helpers; types.
- Produces:
  - `useMediaQuery(query: string): boolean` (false on server).
  - `ResponsiveSheet({ open, onOpenChange, title, children })`.
  - `TransactionForm({ accounts, categories, suggestions, defaultAccountId, initial?, onSubmit(input: TransactionInput): Promise<ActionResult>, onDelete?(): Promise<ActionResult>, onNeedAccount?(): void })`.
  - Accessible names used by tests and later tasks: buttons “Chi”, “Thu”, amount chips “20k”…“500k”, category tiles named by category name, “Khác…”, “Quay lại”, account pill `aria-label="Tài khoản"`, labels “Số tiền”, “Thời gian”, “Mô tả”, “Ghi chú” (edit only), submit “Lưu” (create) / “Lưu thay đổi” (edit), “Xoá giao dịch”, confirm button “Xoá”.

- [ ] **Step 1: Write the failing tests**

`web/components/transaction-form.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account, Category, Suggestions, Transaction } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

const accounts: Account[] = [
  { id: "a1", name: "TPBank", kind: "bank", provider: "tpbank", owner_user_id: null, archived: false },
  { id: "a2", name: "MoMo", kind: "ewallet", provider: "momo", owner_user_id: null, archived: false },
  { id: "a3", name: "Ví cũ", kind: "cash", provider: null, owner_user_id: null, archived: true },
];
const categories: Category[] = [
  { id: "c1", name: "Ăn uống", kind: "expense", icon: "🍜", parent_id: null, archived: false },
  { id: "c2", name: "Đi chợ", kind: "expense", icon: "🛒", parent_id: null, archived: false },
  { id: "c3", name: "Du lịch", kind: "expense", icon: "✈️", parent_id: null, archived: false },
  { id: "c9", name: "Lương", kind: "income", icon: "💼", parent_id: null, archived: false },
];
const suggestions: Suggestions = {
  expense_category_ids: ["c1", "c2"],
  income_category_ids: ["c9"],
  last_account_id: "a2",
};

function setup(props: Partial<React.ComponentProps<typeof TransactionForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({});
  render(
    <TransactionForm
      accounts={accounts}
      categories={categories}
      suggestions={suggestions}
      defaultAccountId="a2"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, user: userEvent.setup({ pointerEventsCheck: 0 }) };
}

describe("TransactionForm (create)", () => {
  it("submits an expense with the default account and chosen category", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "45k");
    expect(screen.getByText("= 45.000 đ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ăn uống/ }));
    fireEvent.change(screen.getByLabelText("Thời gian"), { target: { value: "2026-09-29T12:30" } });
    await user.type(screen.getByLabelText("Mô tả"), "Phở");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        account_id: "a2",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        description: "Phở",
        category_id: "c1",
        note: null,
      }),
    );
  });

  it("amount chips set the amount", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "50k" }));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].amount).toBe(-50_000));
  });

  it("income mode shows only income categories and submits a positive amount", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Thu" }));
    expect(screen.queryByRole("button", { name: /Ăn uống/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lương/ }));
    await user.type(screen.getByLabelText("Số tiền"), "20tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 20_000_000, category_id: "c9" }),
    );
  });

  it("'Khác…' lists all categories of the kind and picking one selects it", async () => {
    const { onSubmit, user } = setup();
    expect(screen.queryByRole("button", { name: /Du lịch/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Khác…" }));
    await user.click(screen.getByRole("button", { name: /Du lịch/ }));
    await user.type(screen.getByLabelText("Số tiền"), "1tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].category_id).toBe("c3"));
  });

  it("account pill switches account and hides archived ones", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Tài khoản" }));
    expect(screen.queryByRole("button", { name: /Ví cũ/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /TPBank/ }));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].account_id).toBe("a1"));
  });

  it("rejects an invalid amount and shows API errors in place", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Category kind does not match amount sign" });
    const { user } = setup({ onSubmit });
    await user.type(screen.getByLabelText("Số tiền"), "abc");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Số tiền không hợp lệ")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Số tiền"));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Category kind does not match amount sign")).toBeInTheDocument();
  });

  it("with no usable account it asks to add one instead of submitting", async () => {
    const onNeedAccount = vi.fn();
    const { onSubmit, user } = setup({ accounts: [accounts[2]], defaultAccountId: null, onNeedAccount });
    expect(screen.getByText("Bạn cần thêm tài khoản trước")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
    expect(onNeedAccount).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("TransactionForm (edit)", () => {
  const initial: Transaction = {
    id: "t1", account_id: "a1", user_id: "u1", amount: -45_000,
    occurred_at: "2026-09-29T05:30:00Z", description: "Phở", merchant: null, counterparty: null,
    category_id: "c3", source: "web", status: "confirmed", classified_by: "user",
    is_internal_transfer: false, reconciled: false, note: null,
    created_at: "2026-09-29T05:30:00Z", updated_at: "2026-09-29T05:30:00Z",
  };

  it("prefills values, keeps a non-suggested category visible, and saves", async () => {
    const { onSubmit, user } = setup({ initial });
    expect(screen.getByLabelText("Số tiền")).toHaveValue("45000");
    expect(screen.getByRole("button", { name: /Du lịch/ })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Ghi chú"), "ăn sáng");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        account_id: "a1",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        category_id: "c3",
        note: "ăn sáng",
      }),
    );
  });

  it("asks for confirmation before deleting", async () => {
    const onDelete = vi.fn().mockResolvedValue({});
    const { user } = setup({ initial, onDelete });
    await user.click(screen.getByRole("button", { name: "Xoá giao dịch" }));
    expect(await screen.findByText("Xoá giao dịch -45.000 đ?")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });
});
```

Run: `cd web && pnpm test`
Expected: FAIL — cannot resolve `./transaction-form`.

- [ ] **Step 2: Media query hook and responsive sheet**

`web/lib/use-media-query.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

`web/components/responsive-sheet.tsx`:

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "@/lib/use-media-query";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
};

/** Bottom sheet on phones, centered dialog on desktop. */
export function ResponsiveSheet({ open, onOpenChange, title, children }: Props) {
  const desktop = useMediaQuery("(min-width: 768px)");
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
```

(If the generated Drawer does not accept `repositionInputs`, remove that prop.)

- [ ] **Step 3: Implement the form**

`web/components/transaction-form.tsx`:

```tsx
"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatVnd, parseVnd } from "@/lib/money";
import { nowVnLocalInput, toVnLocalInput, vnLocalInputToIso } from "@/lib/time";
import type {
  Account,
  ActionResult,
  Category,
  Suggestions,
  Transaction,
  TransactionInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "expense" | "income";

export const AMOUNT_CHIPS: [string, number][] = [
  ["20k", 20_000],
  ["50k", 50_000],
  ["100k", 100_000],
  ["200k", 200_000],
  ["500k", 500_000],
];

const ACCOUNT_ICON: Record<Account["kind"], string> = {
  bank: "🏦",
  ewallet: "👛",
  cash: "💵",
  credit: "💳",
};

type Props = {
  accounts: Account[];
  categories: Category[];
  suggestions: Suggestions;
  defaultAccountId: string | null;
  initial?: Transaction;
  onSubmit: (input: TransactionInput) => Promise<ActionResult>;
  onDelete?: () => Promise<ActionResult>;
  onNeedAccount?: () => void;
};

export function TransactionForm({
  accounts,
  categories,
  suggestions,
  defaultAccountId,
  initial,
  onSubmit,
  onDelete,
  onNeedAccount,
}: Props) {
  const id = useId();
  const usableAccounts = accounts.filter((a) => !a.archived || a.id === initial?.account_id);
  const firstAccount =
    usableAccounts.find((a) => a.id === (initial?.account_id ?? defaultAccountId)) ??
    usableAccounts[0];

  const [kind, setKind] = useState<Kind>(initial && initial.amount > 0 ? "income" : "expense");
  const [amountText, setAmountText] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [occurredLocal, setOccurredLocal] = useState(
    initial ? toVnLocalInput(initial.occurred_at) : nowVnLocalInput(),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [panel, setPanel] = useState<"grid" | "categories" | "accounts">("grid");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const kindCategories = categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === initial?.category_id),
  );
  const gridCategories = useMemo(() => {
    const byId = new Map(kindCategories.map((c) => [c.id, c]));
    const ids = kind === "expense" ? suggestions.expense_category_ids : suggestions.income_category_ids;
    const grid = ids.map((cid) => byId.get(cid)).filter((c): c is Category => Boolean(c)).slice(0, 8);
    const selected = categoryId ? byId.get(categoryId) : undefined;
    if (selected && !grid.some((c) => c.id === selected.id)) {
      grid.splice(Math.min(grid.length, 7), grid.length, selected);
    }
    return grid;
  }, [kindCategories, suggestions, kind, categoryId]);

  const parsed = parseVnd(amountText);
  const account = usableAccounts.find((a) => a.id === accountId);

  if (usableAccounts.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Bạn cần thêm tài khoản trước</p>
        <Button onClick={onNeedAccount}>Thêm tài khoản</Button>
      </div>
    );
  }

  function switchKind(next: Kind) {
    setKind(next);
    const current = categories.find((c) => c.id === categoryId);
    if (current && current.kind !== next) setCategoryId(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed || parsed <= 0) {
      setError("Số tiền không hợp lệ");
      return;
    }
    let occurredAt: string;
    try {
      occurredAt = vnLocalInputToIso(occurredLocal);
    } catch {
      setError("Thời gian không hợp lệ");
      return;
    }
    const input: TransactionInput = {
      account_id: accountId,
      amount: kind === "expense" ? -parsed : parsed,
      occurred_at: occurredAt,
      description: description.trim(),
      category_id: categoryId,
      note: note.trim() || null,
    };
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(input);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    startTransition(async () => {
      const result = await onDelete();
      if (result.error) setError(result.error);
      setConfirmOpen(false);
    });
  }

  const tile = (c: Category) => (
    <button
      key={c.id}
      type="button"
      aria-pressed={categoryId === c.id}
      onClick={() => {
        setCategoryId(categoryId === c.id ? null : c.id);
        setPanel("grid");
      }}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted px-1 py-2 text-xs",
        categoryId === c.id && "bg-primary/15 ring-2 ring-primary",
      )}
    >
      <span className="text-xl leading-none">{c.icon ?? "🏷️"}</span>
      <span className="line-clamp-1">{c.name}</span>
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => switchKind(k)}
            className={cn(
              "min-h-10 rounded-md text-sm font-medium",
              kind === k && "bg-background shadow-sm",
              kind === k && (k === "expense" ? "text-red-600" : "text-emerald-600"),
            )}
          >
            {k === "expense" ? "Chi" : "Thu"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-amount`}>Số tiền</Label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!initial}
          placeholder="45k, 1tr2, 1.200.000"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className={cn(
            "h-14 text-2xl font-semibold tabular-nums",
            kind === "expense" ? "text-red-600" : "text-emerald-600",
          )}
        />
        {parsed ? (
          <p className="text-sm text-muted-foreground tabular-nums">= {formatVnd(parsed)}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {AMOUNT_CHIPS.map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setAmountText(String(value))}
              className="min-h-9 rounded-full border px-3 text-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {panel === "categories" ? (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPanel("grid")}>
            <ChevronLeft /> Quay lại
          </Button>
          <div className="grid grid-cols-4 gap-2">{kindCategories.map(tile)}</div>
        </div>
      ) : panel === "accounts" ? (
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPanel("grid")}>
            <ChevronLeft /> Quay lại
          </Button>
          <div className="grid gap-2">
            {usableAccounts.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={a.id === accountId}
                onClick={() => {
                  setAccountId(a.id);
                  setPanel("grid");
                }}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl bg-muted px-3 text-left text-sm",
                  a.id === accountId && "ring-2 ring-primary",
                )}
              >
                <span className="text-lg">{ACCOUNT_ICON[a.kind]}</span>
                {a.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {gridCategories.map(tile)}
          <button
            type="button"
            aria-label="Khác…"
            onClick={() => setPanel("categories")}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs"
          >
            <span className="text-xl leading-none">⋯</span>
            Khác…
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>Mô tả</Label>
        <Input
          id={`${id}-description`}
          maxLength={500}
          placeholder="VD: phở bò"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          aria-label="Tài khoản"
          onClick={() => setPanel(panel === "accounts" ? "grid" : "accounts")}
          className="flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm"
        >
          {account ? `${ACCOUNT_ICON[account.kind]} ${account.name}` : "Chọn tài khoản"}
          <ChevronDown className="size-4" />
        </button>
        <div className="space-y-1">
          <Label htmlFor={`${id}-time`} className="sr-only">
            Thời gian
          </Label>
          <Input
            id={`${id}-time`}
            type="datetime-local"
            value={occurredLocal}
            onChange={(e) => setOccurredLocal(e.target.value)}
            suppressHydrationWarning
            className="min-h-11 rounded-full"
          />
        </div>
      </div>

      {initial && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-note`}>Ghi chú</Label>
          <Textarea
            id={`${id}-note`}
            maxLength={2000}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {initial ? "Lưu thay đổi" : "Lưu"}
      </Button>

      {initial && onDelete && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            Xoá giao dịch
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá giao dịch {formatVnd(initial.amount)}?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={pending}>
                  Xoá
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </form>
  );
}
```

Spec deviation (ledger it as a ruling): the “Khác…” picker has no search box — a group has ~20 categories, which fit on one screen; add search later if lists grow.

Delete the old form and its test: `git rm "web/app/g/[groupId]/transactions/transaction-form.tsx" "web/app/g/[groupId]/transactions/transaction-form.test.tsx"`. The old `transactions/page.tsx` imports it — temporarily it will fail typecheck; Task 8 rewrites that page. To keep the tree building between tasks, in this task replace the old page's import and the two `<TransactionForm …/>` usages with the placeholder `<p className="text-sm">Đang cập nhật…</p>` (Task 8 replaces the whole file).

Run: `cd web && pnpm test`
Expected: all PASS.

- [ ] **Step 4: Verify & commit**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

```bash
git add -A web
git commit -m "feat(web): quick-add/edit transaction form with category grid and responsive sheet"
```

---

### Task 6: Web — shared actions, AppShell with bottom/side nav, group layout

**Files:**
- Create: `web/app/g/[groupId]/actions.ts`, `web/components/nav.tsx`, `web/components/app-shell.tsx`
- Modify: `web/app/g/[groupId]/layout.tsx`, `web/app/page.tsx`
- Delete: `web/app/g/[groupId]/transactions/actions.ts`, `web/lib/ui.ts` (after Tasks 8–10 stop importing it — in this task, keep `lib/ui.ts`)

**Interfaces:**
- Consumes: `TransactionForm`, `ResponsiveSheet`, `changedFields`, `apiFetch`, `ApiError`, `formatVnd`, types.
- Produces:
  - Server actions (in `app/g/[groupId]/actions.ts`): `createTransaction(groupId, input) → ActionResult{id}`, `updateTransaction(groupId, id, patch: TransactionPatch) → ActionResult`, `deleteTransaction(groupId, id) → ActionResult`. All call `revalidatePath(\`/g/${groupId}\`, "layout")` on success.
  - `AppShell({ groupId, groupName, accounts, categories, suggestions, children })` and hook `useTransactionSheet(): { openCreate(): void; openEdit(t: Transaction): void }`.
  - `BottomNav({ groupId, onAdd })`, `SideNav({ groupId, groupName, onAdd })`.

- [ ] **Step 1: Shared transaction actions**

`web/app/g/[groupId]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, Transaction, TransactionInput, TransactionPatch } from "@/lib/types";

async function run<T>(groupId: string, call: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    const value = await call();
    revalidatePath(`/g/${groupId}`, "layout");
    return { value };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e; // includes Next.js redirects
  }
}

export async function createTransaction(groupId: string, input: TransactionInput): Promise<ActionResult> {
  const { value, error } = await run(groupId, () =>
    apiFetch<Transaction>(`/groups/${groupId}/transactions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return error ? { error } : { id: value?.id };
}

export async function updateTransaction(
  groupId: string,
  transactionId: string,
  patch: TransactionPatch,
): Promise<ActionResult> {
  const { error } = await run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );
  return error ? { error } : {};
}

export async function deleteTransaction(groupId: string, transactionId: string): Promise<ActionResult> {
  const { error } = await run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, { method: "DELETE" }),
  );
  return error ? { error } : {};
}
```

Delete `web/app/g/[groupId]/transactions/actions.ts`; in the old transactions page (placeholder from Task 5) remove its import of `./actions` and the delete form (Task 8 rewrites the page).

- [ ] **Step 2: Navigation**

`web/components/nav.tsx`:

```tsx
"use client";

import { Home, List, LogOut, MoreHorizontal, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { segment: "overview", label: "Tổng quan", icon: Home },
  { segment: "transactions", label: "Giao dịch", icon: List },
  { segment: "accounts", label: "Tài khoản", icon: Wallet },
  { segment: "more", label: "Thêm", icon: MoreHorizontal },
] as const;

function useActive(groupId: string) {
  const pathname = usePathname();
  return (segment: string) => pathname.startsWith(`/g/${groupId}/${segment}`);
}

export function BottomNav({ groupId, onAdd }: { groupId: string; onAdd: () => void }) {
  const isActive = useActive(groupId);
  const link = (item: (typeof ITEMS)[number]) => (
    <Link
      key={item.segment}
      href={`/g/${groupId}/${item.segment}`}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
        isActive(item.segment) ? "text-primary" : "text-muted-foreground",
      )}
    >
      <item.icon className="size-5" />
      {item.label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg items-end">
        {link(ITEMS[0])}
        {link(ITEMS[1])}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Thêm giao dịch"
            onClick={onAdd}
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
          >
            <Plus className="size-7" />
          </button>
        </div>
        {link(ITEMS[2])}
        {link(ITEMS[3])}
      </div>
    </nav>
  );
}

export function SideNav({
  groupId,
  groupName,
  onAdd,
}: {
  groupId: string;
  groupName: string;
  onAdd: () => void;
}) {
  const isActive = useActive(groupId);
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-2 border-r p-4 md:flex">
      <div className="px-2 pb-2 text-lg font-semibold">{groupName}</div>
      <Button onClick={onAdd} className="mb-2 justify-start">
        <Plus /> Thêm giao dịch
      </Button>
      {ITEMS.map((item) => (
        <Link
          key={item.segment}
          href={`/g/${groupId}/${item.segment}`}
          className={cn(
            "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm",
            isActive(item.segment) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-auto flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <LogOut className="size-4" /> Đăng xuất
      </button>
    </aside>
  );
}
```

- [ ] **Step 3: AppShell with sheet context and toasts**

`web/components/app-shell.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { createTransaction, deleteTransaction, updateTransaction } from "@/app/g/[groupId]/actions";
import { BottomNav, SideNav } from "@/components/nav";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { TransactionForm } from "@/components/transaction-form";
import { changedFields } from "@/lib/diff";
import { formatVnd } from "@/lib/money";
import type { Account, ActionResult, Category, Suggestions, Transaction, TransactionInput } from "@/lib/types";

type SheetApi = { openCreate: () => void; openEdit: (t: Transaction) => void };

const SheetContext = createContext<SheetApi | null>(null);

export function useTransactionSheet(): SheetApi {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useTransactionSheet must be used inside AppShell");
  return ctx;
}

type Props = {
  groupId: string;
  groupName: string;
  accounts: Account[];
  categories: Category[];
  suggestions: Suggestions;
  children: React.ReactNode;
};

type SheetState = { mode: "create"; key: number } | { mode: "edit"; key: number; transaction: Transaction };

export function AppShell({ groupId, groupName, accounts, categories, suggestions, children }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const openCreate = useCallback(() => setSheet({ mode: "create", key: Date.now() }), []);
  const openEdit = useCallback(
    (transaction: Transaction) => setSheet({ mode: "edit", key: Date.now(), transaction }),
    [],
  );
  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  function label(input: TransactionInput): string {
    const category = categories.find((c) => c.id === input.category_id);
    return category ? `${formatVnd(input.amount)} · ${category.icon ?? ""} ${category.name}` : formatVnd(input.amount);
  }

  async function handleSubmit(input: TransactionInput): Promise<ActionResult> {
    if (sheet?.mode === "edit") {
      const patch = changedFields(sheet.transaction, input);
      if (Object.keys(patch).length === 0) {
        setSheet(null);
        return {};
      }
      const result = await updateTransaction(groupId, sheet.transaction.id, patch);
      if (!result.error) {
        setSheet(null);
        toast.success("Đã cập nhật");
      }
      return result;
    }
    const result = await createTransaction(groupId, input);
    if (!result.error) {
      setSheet(null);
      const createdId = result.id;
      toast.success(`Đã lưu ${label(input)}`, {
        action: createdId
          ? {
              label: "Hoàn tác",
              onClick: async () => {
                const undo = await deleteTransaction(groupId, createdId);
                if (undo.error) toast.error(undo.error);
                else toast("Đã hoàn tác");
              },
            }
          : undefined,
      });
    }
    return result;
  }

  async function handleDelete(): Promise<ActionResult> {
    if (sheet?.mode !== "edit") return {};
    const result = await deleteTransaction(groupId, sheet.transaction.id);
    if (!result.error) {
      setSheet(null);
      toast.success("Đã xoá giao dịch");
    }
    return result;
  }

  return (
    <SheetContext.Provider value={api}>
      <div className="md:flex">
        <SideNav groupId={groupId} groupName={groupName} onAdd={openCreate} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-background/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <div className="text-sm font-semibold">{groupName}</div>
          </header>
          <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-8">{children}</main>
        </div>
      </div>
      <BottomNav groupId={groupId} onAdd={openCreate} />
      <ResponsiveSheet
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        title={sheet?.mode === "edit" ? "Sửa giao dịch" : "Thêm giao dịch"}
      >
        {sheet && (
          <TransactionForm
            key={sheet.key}
            accounts={accounts}
            categories={categories}
            suggestions={suggestions}
            defaultAccountId={suggestions.last_account_id}
            initial={sheet.mode === "edit" ? sheet.transaction : undefined}
            onSubmit={handleSubmit}
            onDelete={sheet.mode === "edit" ? handleDelete : undefined}
            onNeedAccount={() => {
              setSheet(null);
              router.push(`/g/${groupId}/accounts`);
            }}
          />
        )}
      </ResponsiveSheet>
      <Toaster position="top-center" richColors theme="system" />
    </SheetContext.Provider>
  );
}
```

- [ ] **Step 4: Group layout and root redirect**

Replace `web/app/g/[groupId]/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import type { Account, Category, Me, Suggestions } from "@/lib/types";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await apiFetch<Me>("/me");
  const group = me.groups.find((g) => g.id === groupId);
  if (!group) notFound();

  const [accounts, categories, suggestions] = await Promise.all([
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
    apiFetch<Suggestions>(`/groups/${groupId}/suggestions`),
  ]);

  return (
    <AppShell
      groupId={groupId}
      groupName={group.name}
      accounts={accounts}
      categories={categories}
      suggestions={suggestions}
    >
      {children}
    </AppShell>
  );
}
```

In `web/app/page.tsx` change the redirect target from `/transactions` to `/overview`:

```tsx
  redirect(target ? `/g/${target}/overview` : "/onboarding");
```

- [ ] **Step 5: Verify & commit**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green.

```bash
git add -A web
git commit -m "feat(web): app shell with bottom/side navigation and global transaction sheet"
```

---

### Task 7: Web — Overview page

**Files:**
- Create: `web/components/month-switcher.tsx`, `web/components/transaction-row.tsx`, `web/app/g/[groupId]/overview/page.tsx`, `web/app/g/[groupId]/overview/category-breakdown.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `Summary`, `TransactionList`, `formatVnd`, `shortVnd`, `currentVnMonth`, `formatVnDateTime`, `useTransactionSheet`.
- Produces:
  - `MonthSwitcher({ month, basePath, extraParams? })` — server-safe links `‹ Tháng M/YYYY ›`; `shiftMonth(month, delta): string` exported.
  - `TransactionRow({ transaction, categoryName, categoryIcon, accountName, showTime? })` — client; click opens edit sheet.
  - `CategoryBreakdown({ groupId, month, rows, total, categories })` — client (expand toggle).

- [ ] **Step 1: Month switcher**

`web/components/month-switcher.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function href(basePath: string, month: string, extra: Record<string, string>) {
  const qs = new URLSearchParams({ ...extra, month });
  return `${basePath}?${qs}`;
}

export function MonthSwitcher({
  month,
  basePath,
  extraParams = {},
}: {
  month: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const [y, m] = month.split("-");
  return (
    <div className="flex items-center justify-between">
      <Link
        href={href(basePath, shiftMonth(month, -1), extraParams)}
        aria-label="Tháng trước"
        className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
      >
        <ChevronLeft />
      </Link>
      <div className="text-base font-semibold">
        Tháng {Number(m)}/{y}
      </div>
      <Link
        href={href(basePath, shiftMonth(month, 1), extraParams)}
        aria-label="Tháng sau"
        className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
      >
        <ChevronRight />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Transaction row**

`web/components/transaction-row.tsx`:

```tsx
"use client";

import { useTransactionSheet } from "@/components/app-shell";
import { formatVnd } from "@/lib/money";
import { formatVnDateTime } from "@/lib/time";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  transaction: Transaction;
  categoryName: string | null;
  categoryIcon: string | null;
  accountName: string;
  showDate?: boolean;
};

export function TransactionRow({ transaction: t, categoryName, categoryIcon, accountName, showDate }: Props) {
  const { openEdit } = useTransactionSheet();
  const time = formatVnDateTime(t.occurred_at);
  return (
    <button
      type="button"
      onClick={() => openEdit(t)}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
        {t.is_internal_transfer ? "🔁" : (categoryIcon ?? "❔")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {t.description || categoryName || "Chưa phân loại"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {t.is_internal_transfer ? "Chuyển nội bộ" : (categoryName ?? "Chưa phân loại")} · {accountName} ·{" "}
          {showDate ? time : time.slice(6)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          t.is_internal_transfer ? "text-muted-foreground" : t.amount < 0 ? "text-red-600" : "text-emerald-600",
        )}
      >
        {formatVnd(t.amount)}
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Category breakdown**

`web/app/g/[groupId]/overview/category-breakdown.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { shortVnd } from "@/lib/money";
import type { Category, CategoryAmount } from "@/lib/types";

const COLLAPSED = 6;

export function CategoryBreakdown({
  groupId,
  month,
  rows,
  total,
  categories,
}: {
  groupId: string;
  month: string;
  rows: CategoryAmount[];
  total: number;
  categories: Category[];
}) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map((row) => {
        const category = row.category_id ? byId.get(row.category_id) : undefined;
        const filter = row.category_id ? `category_id=${row.category_id}` : "uncategorized=1";
        const pct = total === 0 ? 0 : Math.round((Math.abs(row.amount) / Math.abs(total)) * 100);
        return (
          <Link
            key={row.category_id ?? "none"}
            href={`/g/${groupId}/transactions?month=${month}&${filter}`}
            className="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-muted/60"
          >
            <span className="w-6 text-center text-lg">{category?.icon ?? "❔"}</span>
            <span className="w-24 shrink-0 truncate text-sm">{category?.name ?? "Chưa phân loại"}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-14 text-right text-sm tabular-nums">{shortVnd(Math.abs(row.amount))}</span>
          </Link>
        );
      })}
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-h-10 w-full text-sm text-primary"
        >
          {expanded ? "Thu gọn" : `Xem tất cả (${rows.length})`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Overview page**

`web/app/g/[groupId]/overview/page.tsx`:

```tsx
import Link from "next/link";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionRow } from "@/components/transaction-row";
import { apiFetch } from "@/lib/api";
import { formatVnd } from "@/lib/money";
import { currentVnMonth } from "@/lib/time";
import type { Account, Category, Summary, TransactionList } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryBreakdown } from "./category-breakdown";

function changeLabel(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((Math.abs(current) - Math.abs(previous)) / Math.abs(previous)) * 100);
  if (pct === 0) return "Bằng tháng trước";
  return `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% so với tháng trước`;
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { groupId } = await params;
  const month = (await searchParams).month || currentVnMonth();
  const [summary, recent, accounts, categories] = await Promise.all([
    apiFetch<Summary>(`/groups/${groupId}/summary?month=${month}`),
    apiFetch<TransactionList>(`/groups/${groupId}/transactions?month=${month}&limit=5`),
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const net = summary.total_income + summary.total_expense;
  const change = changeLabel(summary.total_expense, summary.prev_total_expense);

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} basePath={`/g/${groupId}/overview`} />

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Đã chi</div>
        <div className="text-3xl font-bold tabular-nums text-red-600">
          {formatVnd(Math.abs(summary.total_expense))}
        </div>
        {change && <div className="mt-1 text-xs text-muted-foreground">{change}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Đã thu</div>
            <div className="font-semibold tabular-nums text-emerald-600">{formatVnd(summary.total_income)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Chênh lệch</div>
            <div className={cn("font-semibold tabular-nums", net < 0 ? "text-red-600" : "text-emerald-600")}>
              {formatVnd(net)}
            </div>
          </div>
        </div>
      </section>

      {summary.uncategorized_count > 0 && (
        <Link
          href={`/g/${groupId}/transactions?month=${month}&uncategorized=1`}
          className="flex min-h-11 items-center justify-between rounded-xl bg-amber-100 px-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>❔ {summary.uncategorized_count} giao dịch chưa phân loại</span>
          <span className="font-medium">Phân loại</span>
        </Link>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Chi theo danh mục</h2>
        {summary.expense_by_category.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có giao dịch tháng này — bấm + để thêm.
          </p>
        ) : (
          <CategoryBreakdown
            groupId={groupId}
            month={month}
            rows={summary.expense_by_category}
            total={summary.total_expense}
            categories={categories}
          />
        )}
      </section>

      {recent.items.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="font-semibold">Gần đây</h2>
            <Link href={`/g/${groupId}/transactions?month=${month}`} className="text-sm text-primary">
              Xem tất cả
            </Link>
          </div>
          <div className="divide-y py-1">
            {recent.items.map((t) => {
              const category = t.category_id ? categoryById.get(t.category_id) : undefined;
              return (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categoryName={category?.name ?? null}
                  categoryIcon={category?.icon ?? null}
                  accountName={accountName.get(t.account_id) ?? ""}
                  showDate
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify & commit**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: green; route `/g/[groupId]/overview` listed.

```bash
git add web
git commit -m "feat(web): overview page with KPIs, category breakdown and recent transactions"
```

---

### Task 8: Web — Transactions page (chips, day groups, load more)

**Files:**
- Replace: `web/app/g/[groupId]/transactions/page.tsx`
- Create: `web/app/g/[groupId]/transactions/filters.tsx`

**Interfaces:**
- Consumes: `MonthSwitcher`, `TransactionRow`, `groupByVnDay`, `vnDayLabel`, `ResponsiveSheet`, `formatVnd`, `shortVnd`.
- Produces: `TransactionFilters({ accounts, categories })` client component that edits `account_id`, `category_id`, `uncategorized`, `q` query params (keeps `month`, resets `limit`).

- [ ] **Step 1: Filters**

`web/app/g/[groupId]/transactions/filters.tsx`:

```tsx
"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Input } from "@/components/ui/input";
import type { Account, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

type Picker = "account" | "category" | null;

export function TransactionFilters({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [picker, setPicker] = useState<Picker>(null);
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("limit");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`${pathname}?${next}`);
  }

  const account = accounts.find((a) => a.id === params.get("account_id"));
  const category = categories.find((c) => c.id === params.get("category_id"));
  const uncategorized = params.get("uncategorized") === "1";

  const chip = (label: string, active: boolean, onClick: () => void, onClear?: () => void) => (
    <span
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center rounded-full border text-sm",
        active && "border-foreground bg-foreground text-background",
      )}
    >
      <button type="button" onClick={onClick} className="px-3 py-1.5">
        {label}
      </button>
      {active && onClear && (
        <button type="button" aria-label={`Bỏ lọc ${label}`} onClick={onClear} className="pr-2">
          <X className="size-4" />
        </button>
      )}
    </span>
  );

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm giao dịch…"
          maxLength={100}
          className="h-11 pl-9"
        />
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chip(account?.name ?? "Tài khoản", Boolean(account), () => setPicker("account"), () =>
          update({ account_id: null }),
        )}
        {chip(
          category ? `${category.icon ?? ""} ${category.name}` : "Danh mục",
          Boolean(category),
          () => setPicker("category"),
          () => update({ category_id: null }),
        )}
        {chip("Chưa phân loại", uncategorized, () => update({ uncategorized: uncategorized ? null : "1" }))}
      </div>

      <ResponsiveSheet
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        title={picker === "account" ? "Chọn tài khoản" : "Chọn danh mục"}
      >
        <div className="grid gap-1 pb-2">
          {(picker === "account" ? accounts : categories).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                update(picker === "account" ? { account_id: item.id } : { category_id: item.id, uncategorized: null });
                setPicker(null);
              }}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted"
            >
              {"icon" in item && <span className="text-lg">{item.icon ?? "🏷️"}</span>}
              <span className={cn(item.archived && "text-muted-foreground")}>{item.name}</span>
            </button>
          ))}
        </div>
      </ResponsiveSheet>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Replace `web/app/g/[groupId]/transactions/page.tsx`:

```tsx
import Link from "next/link";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionRow } from "@/components/transaction-row";
import { apiFetch } from "@/lib/api";
import { groupByVnDay, vnDayLabel } from "@/lib/days";
import { formatVnd, shortVnd } from "@/lib/money";
import { currentVnMonth } from "@/lib/time";
import type { Account, Category, TransactionList } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TransactionFilters } from "./filters";

type SearchParams = {
  month?: string;
  account_id?: string;
  category_id?: string;
  q?: string;
  uncategorized?: string;
  limit?: string;
};

const PAGE = 50;
const MAX = 200;

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { groupId } = await params;
  const sp = await searchParams;
  const month = sp.month || currentVnMonth();
  const limit = Math.min(MAX, Math.max(PAGE, Number(sp.limit) || PAGE));

  const query = new URLSearchParams({ month, limit: String(limit) });
  if (sp.account_id) query.set("account_id", sp.account_id);
  if (sp.category_id) query.set("category_id", sp.category_id);
  if (sp.q) query.set("q", sp.q);
  if (sp.uncategorized === "1") query.set("uncategorized", "true");

  const [accounts, categories, list] = await Promise.all([
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
    apiFetch<TransactionList>(`/groups/${groupId}/transactions?${query}`),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const days = groupByVnDay(list.items);

  const keep: Record<string, string> = {};
  for (const key of ["account_id", "category_id", "q", "uncategorized"] as const) {
    if (sp[key]) keep[key] = sp[key]!;
  }
  const more = new URLSearchParams({ ...keep, month, limit: String(Math.min(MAX, limit + PAGE)) });

  return (
    <div className="space-y-3">
      <MonthSwitcher month={month} basePath={`/g/${groupId}/transactions`} extraParams={keep} />
      <TransactionFilters accounts={accounts} categories={categories} />

      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-sm">
        <span>
          Chi <b className="tabular-nums text-red-600">{shortVnd(Math.abs(list.sum_expense))}</b>
        </span>
        <span>
          Thu <b className="tabular-nums text-emerald-600">{shortVnd(list.sum_income)}</b>
        </span>
        <span className="text-muted-foreground">{list.total_count} GD</span>
      </div>

      {days.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Không có giao dịch nào.</p>
      )}

      {days.map((day) => (
        <section key={day.key}>
          <div className="flex items-center justify-between px-1 pb-1 pt-2 text-xs text-muted-foreground">
            <span className="font-medium">{vnDayLabel(day.key)}</span>
            <span className={cn("tabular-nums", day.total > 0 && "text-emerald-600")}>
              {formatVnd(day.total)}
            </span>
          </div>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {day.items.map((t) => {
              const category = t.category_id ? categoryById.get(t.category_id) : undefined;
              return (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categoryName={category?.name ?? null}
                  categoryIcon={category?.icon ?? null}
                  accountName={accountName.get(t.account_id) ?? ""}
                />
              );
            })}
          </div>
        </section>
      ))}

      {list.total_count > list.items.length &&
        (limit < MAX ? (
          <Link
            href={`/g/${groupId}/transactions?${more}`}
            scroll={false}
            className="flex min-h-11 items-center justify-center rounded-xl border text-sm"
          >
            Xem thêm
          </Link>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Đang hiện {list.items.length}/{list.total_count}. Lọc hẹp hơn để xem thêm.
          </p>
        ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify & commit**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: green.

```bash
git add -A web
git commit -m "feat(web): day-grouped transaction list with filter chips and load more"
```

---

### Task 9: Web — Accounts, More, Categories, Group pages

**Files:**
- Replace: `web/app/g/[groupId]/accounts/page.tsx`, `web/app/g/[groupId]/accounts/actions.ts`
- Create: `web/app/g/[groupId]/accounts/accounts-view.tsx`, `web/app/g/[groupId]/more/page.tsx`, `web/app/g/[groupId]/more/categories/{page.tsx,categories-view.tsx,actions.ts}`, `web/app/g/[groupId]/more/group/{page.tsx,invite-link.tsx,actions.ts}`
- Delete: `web/app/g/[groupId]/categories/`, `web/app/g/[groupId]/settings/`, `web/app/g/[groupId]/error.tsx` (replaced by in-place errors; keep if still desired — decision: keep `error.tsx` but restyle with `Button`), `web/lib/ui.ts`, `web/components/sign-out-button.tsx`

**Interfaces:**
- Produces server actions returning `ActionResult`: `saveAccount(groupId, accountId | null, data: {name, kind, provider}) `, `setAccountArchived(groupId, accountId, archived)`, `saveCategory(groupId, categoryId | null, data: {name, kind, icon})`, `setCategoryArchived(groupId, categoryId, archived)`, `createInvite(groupId) → {url?, expires_at?, error?}`.

- [ ] **Step 1: Account actions and view**

`web/app/g/[groupId]/accounts/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { AccountKind, ActionResult } from "@/lib/types";

export type AccountData = { name: string; kind: AccountKind; provider: string | null };

async function run(groupId: string, call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
  revalidatePath(`/g/${groupId}`, "layout");
  return {};
}

export async function saveAccount(groupId: string, accountId: string | null, data: AccountData) {
  return run(groupId, () =>
    apiFetch(accountId ? `/groups/${groupId}/accounts/${accountId}` : `/groups/${groupId}/accounts`, {
      method: accountId ? "PATCH" : "POST",
      body: JSON.stringify(data),
    }),
  );
}

export async function setAccountArchived(groupId: string, accountId: string, archived: boolean) {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    }),
  );
}
```

`web/app/g/[groupId]/accounts/accounts-view.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account, AccountKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveAccount, setAccountArchived } from "./actions";

export const KINDS: { kind: AccountKind; label: string; icon: string }[] = [
  { kind: "bank", label: "Ngân hàng", icon: "🏦" },
  { kind: "ewallet", label: "Ví điện tử", icon: "👛" },
  { kind: "cash", label: "Tiền mặt", icon: "💵" },
  { kind: "credit", label: "Thẻ tín dụng", icon: "💳" },
];
const kindInfo = (kind: AccountKind) => KINDS.find((k) => k.kind === kind)!;

export function AccountsView({ groupId, accounts }: { groupId: string; accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const card = (a: Account) => (
    <button
      key={a.id}
      type="button"
      onClick={() => setEditing(a)}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-4 text-left shadow-sm",
        a.archived && "opacity-60",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xl">
        {kindInfo(a.kind).icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block text-xs text-muted-foreground">
          {kindInfo(a.kind).label}
          {a.provider ? ` · ${a.provider}` : ""}
        </span>
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tài khoản</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Thêm
        </Button>
      </div>
      {active.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Chưa có tài khoản — thêm TPBank, MoMo, Tiền mặt… để bắt đầu.
        </p>
      )}
      <div className="grid gap-2">{active.map(card)}</div>
      {archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="min-h-10 text-sm text-muted-foreground"
          >
            {showArchived ? "Ẩn" : "Hiện"} {archived.length} tài khoản đã lưu trữ
          </button>
          {showArchived && <div className="grid gap-2">{archived.map(card)}</div>}
        </div>
      )}
      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Thêm tài khoản" : "Sửa tài khoản"}
      >
        {editing !== null && (
          <AccountForm
            key={editing === "new" ? "new" : editing.id}
            groupId={groupId}
            account={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </ResponsiveSheet>
    </div>
  );
}

function AccountForm({ groupId, account, onDone }: { groupId: string; account: Account | null; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "bank");
  const [provider, setProvider] = useState(account?.provider ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAccount(groupId, account?.id ?? null, {
        name: name.trim(),
        kind,
        provider: provider.trim().toLowerCase() || null,
      });
      if (result.error) setError(result.error);
      else {
        toast.success(account ? "Đã lưu tài khoản" : "Đã thêm tài khoản");
        onDone();
      }
    });
  }

  function toggleArchive() {
    if (!account) return;
    startTransition(async () => {
      const result = await setAccountArchived(groupId, account.id, !account.archived);
      if (result.error) setError(result.error);
      else {
        toast.success(account.archived ? "Đã khôi phục" : "Đã lưu trữ");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2">
      <div className="space-y-2">
        <Label htmlFor="account-name">Tên</Label>
        <Input id="account-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: TPBank chính" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cn("flex min-h-11 items-center gap-2 rounded-xl bg-muted px-3 text-sm", kind === k.kind && "ring-2 ring-primary")}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-provider">Mã nhà cung cấp (tuỳ chọn)</Label>
        <Input id="account-provider" maxLength={32} pattern="[a-z0-9_]*" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="tpbank, momo, zalopay…" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        Lưu
      </Button>
      {account && (
        <Button type="button" variant="ghost" className="w-full" onClick={toggleArchive} disabled={pending}>
          {account.archived ? "Khôi phục" : "Lưu trữ"}
        </Button>
      )}
    </form>
  );
}
```

Replace `web/app/g/[groupId]/accounts/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { Account } from "@/lib/types";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const accounts = await apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`);
  return <AccountsView groupId={groupId} accounts={accounts} />;
}
```

- [ ] **Step 2: More page**

`web/app/g/[groupId]/more/page.tsx`:

```tsx
import { ChevronRight, Tags, Users } from "lucide-react";
import Link from "next/link";
import { SignOutRow } from "./sign-out-row";

export default async function MorePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const items = [
    { href: `/g/${groupId}/more/categories`, label: "Danh mục", icon: Tags },
    { href: `/g/${groupId}/more/group`, label: "Nhóm & thành viên", icon: Users },
  ];
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Thêm</h1>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted/60">
            <item.icon className="size-5 text-muted-foreground" />
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        <SignOutRow />
      </div>
    </div>
  );
}
```

`web/app/g/[groupId]/more/sign-out-row.tsx`:

```tsx
"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutRow() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-destructive hover:bg-muted/60"
    >
      <LogOut className="size-5" /> Đăng xuất
    </button>
  );
}
```

(Add `web/app/g/[groupId]/more/sign-out-row.tsx` to this task's files.)

- [ ] **Step 3: Categories**

`web/app/g/[groupId]/more/categories/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, Category } from "@/lib/types";

export type CategoryData = { name: string; kind: Category["kind"]; icon: string | null };

async function run(groupId: string, call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
  revalidatePath(`/g/${groupId}`, "layout");
  return {};
}

export async function saveCategory(groupId: string, categoryId: string | null, data: CategoryData) {
  return run(groupId, () =>
    categoryId
      ? apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: data.name, icon: data.icon }),
        })
      : apiFetch(`/groups/${groupId}/categories`, { method: "POST", body: JSON.stringify(data) }),
  );
}

export async function setCategoryArchived(groupId: string, categoryId: string, archived: boolean) {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    }),
  );
}
```

`web/app/g/[groupId]/more/categories/categories-view.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveCategory, setCategoryArchived } from "./actions";

type Kind = Category["kind"];

export function CategoriesView({ groupId, categories }: { groupId: string; categories: Category[] }) {
  const [kind, setKind] = useState<Kind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = categories.filter((c) => c.kind === kind);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Danh mục</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Thêm
        </Button>
      </div>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn("min-h-10 rounded-md text-sm font-medium", kind === k && "bg-background shadow-sm")}
          >
            {k === "expense" ? "Chi" : "Thu"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEditing(c)}
            className={cn(
              "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border bg-card p-2 text-sm shadow-sm",
              c.archived && "opacity-50",
            )}
          >
            <span className="text-2xl">{c.icon ?? "🏷️"}</span>
            <span className="line-clamp-1">{c.name}</span>
          </button>
        ))}
      </div>
      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Thêm danh mục" : "Sửa danh mục"}
      >
        {editing !== null && (
          <CategoryForm
            key={editing === "new" ? "new" : editing.id}
            groupId={groupId}
            category={editing === "new" ? null : editing}
            kind={kind}
            onDone={() => setEditing(null)}
          />
        )}
      </ResponsiveSheet>
    </div>
  );
}

function CategoryForm({
  groupId,
  category,
  kind,
  onDone,
}: {
  groupId: string;
  category: Category | null;
  kind: Kind;
  onDone: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCategory(groupId, category?.id ?? null, {
        name: name.trim(),
        kind: category?.kind ?? kind,
        icon: icon.trim() || null,
      });
      if (result.error) setError(result.error);
      else {
        toast.success("Đã lưu danh mục");
        onDone();
      }
    });
  }

  function toggleArchive() {
    if (!category) return;
    startTransition(async () => {
      const result = await setCategoryArchived(groupId, category.id, !category.archived);
      if (result.error) setError(result.error);
      else {
        toast.success(category.archived ? "Đã hiện lại" : "Đã ẩn");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2">
      <div className="flex gap-2">
        <div className="w-20 space-y-2">
          <Label htmlFor="category-icon">Icon</Label>
          <Input id="category-icon" maxLength={16} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="☕" className="text-center text-xl" />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="category-name">Tên</Label>
          <Input id="category-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        Lưu
      </Button>
      {category && (
        <Button type="button" variant="ghost" className="w-full" onClick={toggleArchive} disabled={pending}>
          {category.archived ? "Hiện lại" : "Ẩn danh mục"}
        </Button>
      )}
    </form>
  );
}
```

`web/app/g/[groupId]/more/categories/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { Category } from "@/lib/types";
import { CategoriesView } from "./categories-view";

export default async function CategoriesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const categories = await apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`);
  return <CategoriesView groupId={groupId} categories={categories} />;
}
```

- [ ] **Step 4: Group & invite**

`web/app/g/[groupId]/more/group/actions.ts`:

```ts
"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { InviteOut } from "@/lib/types";

export async function createInvite(groupId: string): Promise<Partial<InviteOut> & { error?: string }> {
  try {
    return await apiFetch<InviteOut>(`/groups/${groupId}/invites`, { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
}
```

`web/app/g/[groupId]/more/group/invite-link.tsx`:

```tsx
"use client";

import { Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnDateTime } from "@/lib/time";
import type { InviteOut } from "@/lib/types";
import { createInvite } from "./actions";

export function InviteLink({ groupId }: { groupId: string }) {
  const [invite, setInvite] = useState<InviteOut | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createInvite(groupId);
      if (result.error || !result.url || !result.expires_at) toast.error(result.error ?? "Không tạo được link");
      else setInvite({ url: result.url, expires_at: result.expires_at });
    });
  }

  async function copy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    toast.success("Đã sao chép link mời");
  }

  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={pending} variant={invite ? "outline" : "default"}>
        <Link2 /> {invite ? "Tạo link khác" : "Tạo link mời"}
      </Button>
      {invite && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Sao chép">
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dùng được 1 lần, hết hạn {formatVnDateTime(invite.expires_at)}. Email người được mời phải nằm trong danh
            sách cho phép.
          </p>
        </div>
      )}
    </div>
  );
}
```

`web/app/g/[groupId]/more/group/page.tsx`:

```tsx
import { apiFetch } from "@/lib/api";
import type { GroupDetail, Me } from "@/lib/types";
import { InviteLink } from "./invite-link";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [group, me] = await Promise.all([apiFetch<GroupDetail>(`/groups/${groupId}`), apiFetch<Me>("/me")]);
  const isOwner = group.members.some((m) => m.user_id === me.id && m.role === "owner");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <section className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {group.members.map((m) => (
          <div key={m.user_id} className="flex min-h-14 items-center gap-3 px-4">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {m.name.slice(0, 1).toUpperCase() || "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            <span className="text-xs text-muted-foreground">{m.role === "owner" ? "Chủ nhóm" : "Thành viên"}</span>
          </div>
        ))}
      </section>
      {isOwner && (
        <section className="space-y-2">
          <h2 className="font-semibold">Mời thành viên</h2>
          <InviteLink groupId={groupId} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Remove old routes and helpers**

Run: `git rm -r "web/app/g/[groupId]/categories" "web/app/g/[groupId]/settings" web/lib/ui.ts web/components/sign-out-button.tsx`

Replace `web/app/g/[groupId]/error.tsx` so it no longer imports `lib/ui`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export default function GroupError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p>Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <Button variant="outline" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
```

Any remaining importer of `@/lib/ui` or `sign-out-button` (login, onboarding, invite pages) is rewritten in Task 10; to keep this task green, in those three files replace `import { btnCls… } from "@/lib/ui"` usages with `buttonVariants()` from `@/components/ui/button` (`className={buttonVariants()}`) and inputs with `@/components/ui/input` `Input`.

- [ ] **Step 6: Verify & commit**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: green; routes `/accounts`, `/more`, `/more/categories`, `/more/group` listed; no `/categories` or `/settings`.

```bash
git add -A web
git commit -m "feat(web): accounts, categories and group pages with sheets; more tab"
```

---

### Task 10: Web — Login, onboarding with starter accounts, invite page

**Files:**
- Replace: `web/app/login/page.tsx`, `web/app/login/login-button.tsx`, `web/app/onboarding/page.tsx`, `web/app/onboarding/actions.ts`, `web/app/invite/[token]/page.tsx`
- Create: `web/app/onboarding/presets.ts`

**Interfaces:**
- Produces: `STARTER_ACCOUNTS: {key, name, kind, provider}[]` (cash, tpbank, momo, zalopay, shopeepay, hsbc); `createGroup(formData)` creates the group then each checked starter account (`formData.getAll("accounts")`), redirects to `/g/<id>/overview`.

- [ ] **Step 1: Starter presets and onboarding**

`web/app/onboarding/presets.ts`:

```ts
import type { AccountKind } from "@/lib/types";

export const STARTER_ACCOUNTS: { key: string; name: string; kind: AccountKind; provider: string | null; icon: string }[] = [
  { key: "cash", name: "Tiền mặt", kind: "cash", provider: null, icon: "💵" },
  { key: "tpbank", name: "TPBank", kind: "bank", provider: "tpbank", icon: "🏦" },
  { key: "momo", name: "MoMo", kind: "ewallet", provider: "momo", icon: "👛" },
  { key: "zalopay", name: "ZaloPay", kind: "ewallet", provider: "zalopay", icon: "👛" },
  { key: "shopeepay", name: "ShopeePay", kind: "ewallet", provider: "shopeepay", icon: "👛" },
  { key: "hsbc", name: "HSBC", kind: "bank", provider: "hsbc", icon: "🏦" },
];
```

`web/app/onboarding/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";
import { STARTER_ACCOUNTS } from "./presets";

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const chosen = new Set(formData.getAll("accounts").map(String));
  const group = await apiFetch<GroupSummary>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, type: "family" }),
  });
  for (const preset of STARTER_ACCOUNTS.filter((p) => chosen.has(p.key))) {
    await apiFetch(`/groups/${group.id}/accounts`, {
      method: "POST",
      body: JSON.stringify({ name: preset.name, kind: preset.kind, provider: preset.provider }),
    });
  }
  redirect(`/g/${group.id}/overview`);
}
```

`web/app/onboarding/page.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroup } from "./actions";
import { STARTER_ACCOUNTS } from "./presets";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tạo nhóm gia đình</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mời thành viên sau trong mục Thêm → Nhóm.</p>
      </div>
      <form action={createGroup} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="group-name">Tên nhóm</Label>
          <Input id="group-name" name="name" required maxLength={100} defaultValue="Nhà mình" className="h-12" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tài khoản hay dùng</legend>
          <div className="flex flex-wrap gap-2">
            {STARTER_ACCOUNTS.map((p) => (
              <label
                key={p.key}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <input type="checkbox" name="accounts" value={p.key} defaultChecked={p.key === "cash"} className="sr-only" />
                {p.icon} {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="h-12 w-full text-base">
          Bắt đầu
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Login**

`web/app/login/login-button.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <Button className="h-12 w-full text-base" onClick={() => signIn("google", { callbackUrl })}>
      Đăng nhập bằng Google
    </Button>
  );
}
```

`web/app/login/page.tsx`:

```tsx
import { LoginButton } from "./login-button";

function safeCallback(url?: string): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
          đ
        </div>
        <h1 className="text-2xl font-semibold">Family Finance</h1>
        <p className="text-sm text-muted-foreground">Theo dõi chi tiêu gia đình — nhanh, gọn, trên mọi thiết bị.</p>
      </div>
      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-center text-sm text-destructive">
          Đăng nhập thất bại hoặc email chưa được cho phép.
        </p>
      )}
      <LoginButton callbackUrl={safeCallback(callbackUrl)} />
    </main>
  );
}
```

- [ ] **Step 3: Invite page**

Replace `web/app/invite/[token]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, getApiToken } from "@/lib/api";
import type { InvitePreview } from "@/lib/types";
import { acceptInvite } from "./actions";

function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {text}
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await getApiToken())) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let preview: InvitePreview;
  try {
    preview = await apiFetch<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return <Message text="Link mời không tồn tại." />;
    throw e;
  }
  if (preview.already_member) redirect(`/g/${preview.group_id}/overview`);
  if (!preview.valid) return <Message text="Link mời đã hết hạn hoặc đã được sử dụng." />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6 text-center">
      <h1 className="text-xl font-semibold">Tham gia nhóm “{preview.group_name}”</h1>
      <form action={acceptInvite.bind(null, token)}>
        <Button type="submit" className="h-12 w-full text-base">
          Tham gia
        </Button>
      </form>
    </main>
  );
}
```

In `web/app/invite/[token]/actions.ts` change the redirect target to `/g/${group.id}/overview`.

- [ ] **Step 4: Verify & commit**

Run: `cd web && pnpm test && pnpm lint && pnpm typecheck && pnpm build && grep -rn "lib/ui\|sign-out-button" app components lib || echo clean`
Expected: green and `clean`.

```bash
git add -A web
git commit -m "feat(web): polished login, onboarding with starter accounts, invite page"
```

---

### Task 11: Dev session scripts and visual verification

**Files:**
- Create: `api/scripts/dev_session.py`, `web/scripts/dev-session.mjs`, `.claude/launch.json`

**Interfaces:**
- Produces: `uv run python scripts/dev_session.py` (from `api/`) prints an API JWT for `dev@example.com` in the **local** DB (seeding group, 3 accounts, ~40 transactions on first run); `node scripts/dev-session.mjs <api-jwt>` (from `web/`) prints a next-auth session cookie value.

- [ ] **Step 1: API seeding script**

`api/scripts/dev_session.py`:

```python
"""Dev only: seed the LOCAL database with a demo user/group and print an API token.

Run from api/:  uv run python scripts/dev_session.py
"""

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.auth.tokens import create_access_token  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.groups.service import create_group  # noqa: E402
from app.models import Account, Category, Transaction, User  # noqa: E402

DEV_EMAIL = "dev@example.com"
SAMPLES = [
    ("Ăn uống", ["Phở bò", "Cơm tấm", "Highlands", "Bún chả"], (30_000, 120_000)),
    ("Đi chợ", ["Bách Hóa Xanh", "WinMart", "Chợ"], (150_000, 600_000)),
    ("Di chuyển", ["Grab", "Xăng", "Gửi xe"], (10_000, 150_000)),
    ("Hóa đơn", ["Tiền điện", "Internet", "Nước"], (200_000, 900_000)),
    ("Subscription", ["Netflix", "Spotify", "iCloud"], (59_000, 260_000)),
    ("Mua sắm", ["Shopee", "Tiki"], (100_000, 900_000)),
]


def assert_local() -> None:
    host = make_url(settings.database_url).host
    if host not in ("localhost", "127.0.0.1"):
        sys.exit(f"Refusing to run against non-local database host {host!r}")


async def seed(session, user: User) -> None:
    group = await create_group(session, user, "Nhà mình (dev)", "family")
    accounts = [
        Account(group_id=group.id, name="TPBank", kind="bank", provider="tpbank"),
        Account(group_id=group.id, name="MoMo", kind="ewallet", provider="momo"),
        Account(group_id=group.id, name="Tiền mặt", kind="cash"),
    ]
    session.add_all(accounts)
    await session.flush()
    cats = {
        c.name: c
        for c in await session.scalars(select(Category).where(Category.group_id == group.id))
    }
    rng = random.Random(42)
    now = datetime.now(UTC)

    def txn(amount, days_ago, description, category=None, account=None, transfer=False):
        return Transaction(
            group_id=group.id,
            account_id=(account or rng.choice(accounts)).id,
            user_id=user.id,
            amount=amount,
            occurred_at=now - timedelta(days=days_ago, hours=rng.randint(0, 12)),
            description=description,
            category_id=cats[category].id if category else None,
            source="web",
            classified_by="user" if category else None,
            is_internal_transfer=transfer,
        )

    rows = []
    for _ in range(36):
        name, descriptions, (low, high) = rng.choice(SAMPLES)
        amount = -rng.randrange(low, high, 1_000)
        rows.append(txn(amount, rng.randint(0, 45), rng.choice(descriptions), name))
    rows.append(txn(25_000_000, 3, "Lương", "Lương", accounts[0]))
    rows.append(txn(-100_000, 1, "CK NGUYEN VAN A", None, accounts[0]))
    rows.append(txn(-65_000, 2, "VNPAY 12345", None, accounts[1]))
    rows.append(txn(-2_000_000, 4, "Nạp MoMo", None, accounts[0], transfer=True))
    session.add_all(rows)
    await session.commit()


async def main() -> None:
    assert_local()
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            user = User(google_sub="dev-local", email=DEV_EMAIL, name="Dev")
            session.add(user)
            await session.commit()
            await seed(session, user)
        token, _ = create_access_token(user.id)
    print(token)


asyncio.run(main())
```

Run: `cd api && uv run alembic upgrade head && uv run python scripts/dev_session.py | cut -c1-20`
Expected: first 20 chars of a JWT (`eyJ…`). Running it twice prints a token both times and does not duplicate data.

- [ ] **Step 2: Web cookie script**

`web/scripts/dev-session.mjs`:

```js
// Dev only: mint a next-auth session cookie for the local web app.
// Usage (from web/): node --env-file=.env.local scripts/dev-session.mjs <api-jwt>
import { encode } from "next-auth/jwt";

const [apiToken] = process.argv.slice(2);
const secret = process.env.NEXTAUTH_SECRET;
const url = process.env.NEXTAUTH_URL ?? "";

if (!apiToken || !secret) {
  console.error("usage: node --env-file=.env.local scripts/dev-session.mjs <api-jwt>");
  process.exit(1);
}
if (!url.startsWith("http://localhost")) {
  console.error(`Refusing: NEXTAUTH_URL must be http://localhost…, got ${url}`);
  process.exit(1);
}

const maxAge = 7 * 24 * 60 * 60;
const cookie = await encode({
  token: {
    name: "Dev",
    email: "dev@example.com",
    apiToken,
    apiTokenExpires: Date.now() + maxAge * 1000,
  },
  secret,
  maxAge,
});
console.log(cookie);
```

- [ ] **Step 3: Local env + launch config**

Create `api/.env` (git-ignored) with local-only values: `DATABASE_URL` pointing at `localhost:55432/finance`, `JWT_SECRET` = output of `openssl rand -hex 32`, `GOOGLE_CLIENT_IDS=local-dev`, `ALLOWED_EMAILS=dev@example.com`, `PUBLIC_WEB_URL=http://localhost:3000`.

Create `web/.env.local` (git-ignored): `API_URL=http://localhost:8000`, `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET` = `openssl rand -hex 32`, `GOOGLE_CLIENT_ID=local-dev`, `GOOGLE_CLIENT_SECRET=local-dev`.

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "api",
      "runtimeExecutable": "uv",
      "runtimeArgs": ["run", "--directory", "api", "uvicorn", "app.main:app", "--port", "8000"],
      "port": 8000
    },
    {
      "name": "web",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["--dir", "web", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 4: Visual pass**

1. Start both servers (`preview_start` "api" then "web").
2. `API_JWT=$(cd api && uv run python scripts/dev_session.py)`; `COOKIE=$(cd web && node --env-file=.env.local scripts/dev-session.mjs "$API_JWT")`.
3. In the browser pane on `http://localhost:3000`, set `document.cookie = "next-auth.session-token=<COOKIE>; path=/"` and reload.
4. At 375×812 (mobile preset) screenshot: Tổng quan, Giao dịch, the “+” sheet (type 45k, pick a category, save → toast with Hoàn tác), tapping a row → edit sheet → Xoá confirm, Tài khoản (+ add sheet), Thêm → Danh mục, Nhóm. Check: no horizontal scroll (`document.documentElement.scrollWidth <= 375`), bottom nav not covering content, tap targets ≥ 44px.
5. Repeat key screens at desktop width and with `colorScheme: "dark"`.
6. Fix any defects found (each fix: reproduce, change, re-screenshot); commit fixes as `fix(web): …`.

- [ ] **Step 5: Commit**

```bash
git add api/scripts/dev_session.py web/scripts/dev-session.mjs .claude/launch.json
git commit -m "chore: dev-only local session scripts and launch config for visual checks"
```

---

### Task 12: Deploy

**Files:**
- Modify: `deploy/kustomization.yaml`

- [ ] **Step 1: Push and wait for CI**

Run: `git push origin main`, then `gh run list --limit 4`; wait for the `api` and `web` runs for the new HEAD with `gh run watch <id> --exit-status`.
Expected: both `completed success`.

- [ ] **Step 2: Pin tags and apply**

Set both `newTag` values in `deploy/kustomization.yaml` to `sha-<full HEAD sha>`, then:
```bash
KUBECONFIG=~/.kube/homelab kubectl apply -k deploy
KUBECONFIG=~/.kube/homelab kubectl -n finance rollout status deploy/finance-api deploy/finance-web
```
Expected: both rolled out.

- [ ] **Step 3: Smoke**

Run:
```bash
curl -s https://finance-api.fevirtus.dev/healthz
curl -s -o /dev/null -w "%{http_code}\n" https://finance.fevirtus.dev/login
curl -s -o /dev/null -w "%{http_code}\n" https://finance.fevirtus.dev/manifest.webmanifest
```
Expected: `{"status":"ok"}`, `200`, `200`.

- [ ] **Step 4: Commit and push the pinned tags**

```bash
git add deploy/kustomization.yaml
git commit -m "chore(deploy): pin images for mobile UI redesign"
git push origin main
```
