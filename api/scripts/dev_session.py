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
