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
    cats = {
        c["name"]: c for c in (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    }
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
