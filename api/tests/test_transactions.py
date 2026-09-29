import pytest

from tests.helpers import create_group, login


@pytest.fixture
async def setup(client):
    me = await login(client)
    gid = await create_group(client, me)
    account = (
        await client.post(
            f"/groups/{gid}/accounts", json={"name": "TPBank", "kind": "bank"}, headers=me
        )
    ).json()
    cash = (
        await client.post(
            f"/groups/{gid}/accounts", json={"name": "Tiền mặt", "kind": "cash"}, headers=me
        )
    ).json()
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    food = next(c for c in categories if c["name"] == "Ăn uống")
    salary = next(c for c in categories if c["name"] == "Lương")
    return {"me": me, "gid": gid, "account": account, "cash": cash, "food": food, "salary": salary}


async def add(client, s, **overrides):
    body = {
        "account_id": s["account"]["id"],
        "amount": -45000,
        "occurred_at": "2026-09-15T12:00:00+07:00",
        "description": "Phở",
    }
    body.update(overrides)
    return await client.post(f"/groups/{s['gid']}/transactions", json=body, headers=s["me"])


async def test_create_expense_with_category(client, setup):
    response = await add(client, setup, category_id=setup["food"]["id"])
    assert response.status_code == 201
    txn = response.json()
    assert txn["amount"] == -45000
    assert txn["source"] == "web"
    assert txn["status"] == "confirmed"
    assert txn["classified_by"] == "user"


async def test_create_without_category_has_no_classifier(client, setup):
    txn = (await add(client, setup)).json()
    assert txn["category_id"] is None
    assert txn["classified_by"] is None


async def test_category_kind_must_match_sign(client, setup):
    response = await add(client, setup, category_id=setup["salary"]["id"])
    assert response.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [{"amount": 0}, {"occurred_at": "2026-09-15T12:00:00"}, {"description": "x" * 501}],
)
async def test_invalid_bodies_rejected(client, setup, overrides):
    assert (await add(client, setup, **overrides)).status_code == 422


async def test_refs_from_another_group_rejected(client, setup):
    wife = await login(client, "wife@example.com", "Wife")
    other = await create_group(client, wife, "Nhà vợ")
    other_account = (
        await client.post(
            f"/groups/{other}/accounts", json={"name": "MoMo", "kind": "ewallet"}, headers=wife
        )
    ).json()
    other_food = next(
        c
        for c in (await client.get(f"/groups/{other}/categories", headers=wife)).json()
        if c["name"] == "Ăn uống"
    )
    assert (await add(client, setup, account_id=other_account["id"])).status_code == 422
    assert (await add(client, setup, category_id=other_food["id"])).status_code == 422


async def test_month_filter_uses_vietnam_time(client, setup):
    await add(client, setup, occurred_at="2026-09-30T23:30:00+07:00", description="late sept")
    await add(client, setup, occurred_at="2026-10-01T00:10:00+07:00", description="early oct")
    gid, me = setup["gid"], setup["me"]
    sept = (await client.get(f"/groups/{gid}/transactions?month=2026-09", headers=me)).json()
    octo = (await client.get(f"/groups/{gid}/transactions?month=2026-10", headers=me)).json()
    assert [t["description"] for t in sept["items"]] == ["late sept"]
    assert [t["description"] for t in octo["items"]] == ["early oct"]


async def test_invalid_month_rejected(client, setup):
    url = f"/groups/{setup['gid']}/transactions?month=2026-13"
    assert (await client.get(url, headers=setup["me"])).status_code == 422


async def test_totals_exclude_internal_transfers_and_ignore_pagination(client, setup):
    await add(client, setup, amount=-100000)
    await add(client, setup, amount=5000000, description="Lương")
    await add(client, setup, amount=-2000000, is_internal_transfer=True, description="Nạp MoMo")
    url = f"/groups/{setup['gid']}/transactions?month=2026-09&limit=1"
    body = (await client.get(url, headers=setup["me"])).json()
    assert body["total_count"] == 3
    assert len(body["items"]) == 1
    assert body["sum_expense"] == -100000
    assert body["sum_income"] == 5000000


async def test_filters(client, setup):
    await add(client, setup, description="Phở bò", category_id=setup["food"]["id"])
    await add(client, setup, description="Grab", account_id=setup["cash"]["id"])
    await add(client, setup, description="Giảm 50% phí")
    gid, me = setup["gid"], setup["me"]

    async def descriptions(query: str) -> list[str]:
        body = (await client.get(f"/groups/{gid}/transactions?{query}", headers=me)).json()
        return sorted(t["description"] for t in body["items"])

    assert await descriptions(f"account_id={setup['cash']['id']}") == ["Grab"]
    assert await descriptions(f"category_id={setup['food']['id']}") == ["Phở bò"]
    assert await descriptions("uncategorized=true") == ["Giảm 50% phí", "Grab"]
    assert await descriptions("q=ph%E1%BB%9F") == ["Phở bò"]  # "phở", case-insensitive
    assert await descriptions("q=50%25") == ["Giảm 50% phí"]  # literal "50%"
    assert await descriptions("q=_") == []  # "_" is not a wildcard


async def test_patch_category_and_sign_rules(client, setup):
    txn = (await add(client, setup)).json()
    url = f"/groups/{setup['gid']}/transactions/{txn['id']}"
    me = setup["me"]

    patched = await client.patch(url, json={"category_id": setup["food"]["id"]}, headers=me)
    assert patched.status_code == 200
    assert patched.json()["classified_by"] == "user"

    flipped = await client.patch(url, json={"amount": 45000}, headers=me)
    assert flipped.status_code == 422  # income amount with an expense category

    null_amount = await client.patch(url, json={"amount": None}, headers=me)
    assert null_amount.status_code == 422

    cleared = await client.patch(url, json={"category_id": None}, headers=me)
    assert cleared.json()["category_id"] is None
    assert cleared.json()["classified_by"] is None


async def test_delete(client, setup):
    txn = (await add(client, setup)).json()
    url = f"/groups/{setup['gid']}/transactions/{txn['id']}"
    assert (await client.delete(url, headers=setup["me"])).status_code == 204
    assert (await client.patch(url, json={"note": "x"}, headers=setup["me"])).status_code == 404


async def test_non_member_cannot_list(client, setup):
    wife = await login(client, "wife@example.com", "Wife")
    url = f"/groups/{setup['gid']}/transactions"
    assert (await client.get(url, headers=wife)).status_code == 404


async def test_uncategorized_filter_skips_internal_transfers(client, setup):
    await add(client, setup, description="CK lạ")
    await add(client, setup, description="Nạp MoMo", is_internal_transfer=True)
    url = f"/groups/{setup['gid']}/transactions?uncategorized=true"
    body = (await client.get(url, headers=setup["me"])).json()
    assert [t["description"] for t in body["items"]] == ["CK lạ"]
    assert body["total_count"] == 1
