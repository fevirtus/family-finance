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
    cats = {
        c["name"]: c for c in (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    }
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
    await client.patch(
        f"/groups/{s['gid']}/categories/{food}", json={"archived": True}, headers=s["me"]
    )
    body = await suggestions(client, s)
    assert food not in body["expense_category_ids"]
    assert len(body["expense_category_ids"]) == 8


async def test_last_account_is_callers_latest_non_archived(client, s):
    await add(client, s, "Ăn uống", account="TPBank")
    await add(client, s, "Ăn uống", account="MoMo")
    assert (await suggestions(client, s))["last_account_id"] == s["accounts"]["MoMo"]["id"]

    momo = s["accounts"]["MoMo"]["id"]
    await client.patch(
        f"/groups/{s['gid']}/accounts/{momo}", json={"archived": True}, headers=s["me"]
    )
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
