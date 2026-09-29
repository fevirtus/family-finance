from tests.helpers import create_group, login


async def test_account_crud_and_archive(client):
    me = await login(client)
    gid = await create_group(client, me)
    created = await client.post(
        f"/groups/{gid}/accounts",
        json={"name": "TPBank", "kind": "bank", "provider": "tpbank"},
        headers=me,
    )
    assert created.status_code == 201
    account = created.json()
    assert account["archived"] is False

    patched = await client.patch(
        f"/groups/{gid}/accounts/{account['id']}", json={"archived": True}, headers=me
    )
    assert patched.status_code == 200
    assert (await client.get(f"/groups/{gid}/accounts", headers=me)).json() == []
    all_accounts = await client.get(f"/groups/{gid}/accounts?include_archived=true", headers=me)
    assert [a["id"] for a in all_accounts.json()] == [account["id"]]


async def test_account_validation(client):
    me = await login(client)
    gid = await create_group(client, me)
    bad_kind = await client.post(
        f"/groups/{gid}/accounts", json={"name": "X", "kind": "gold"}, headers=me
    )
    assert bad_kind.status_code == 422
    bad_provider = await client.post(
        f"/groups/{gid}/accounts", json={"name": "X", "kind": "bank", "provider": "TP Bank"},
        headers=me,
    )
    assert bad_provider.status_code == 422


async def test_account_owner_must_be_member(client):
    me = await login(client)
    gid = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    wife_id = (await client.get("/me", headers=wife)).json()["id"]
    response = await client.post(
        f"/groups/{gid}/accounts",
        json={"name": "Ví vợ", "kind": "ewallet", "owner_user_id": wife_id},
        headers=me,
    )
    assert response.status_code == 422


async def test_cannot_touch_other_groups_accounts(client):
    me = await login(client)
    mine = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    theirs = await create_group(client, wife, "Nhà vợ")
    their_account = (
        await client.post(
            f"/groups/{theirs}/accounts", json={"name": "MoMo", "kind": "ewallet"}, headers=wife
        )
    ).json()
    # Via their group path: I'm not a member.
    assert (await client.get(f"/groups/{theirs}/accounts", headers=me)).status_code == 404
    # Via my group path: the account is not in my group.
    response = await client.patch(
        f"/groups/{mine}/accounts/{their_account['id']}", json={"name": "hacked"}, headers=me
    )
    assert response.status_code == 404


async def test_default_categories_listed(client):
    me = await login(client)
    gid = await create_group(client, me)
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    assert len(categories) == 21
    assert {c["kind"] for c in categories} == {"expense", "income"}
    assert any(c["name"] == "Ăn uống" and c["icon"] == "🍜" for c in categories)


async def test_category_create_with_parent_and_archive(client):
    me = await login(client)
    gid = await create_group(client, me)
    categories = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    food = next(c for c in categories if c["name"] == "Ăn uống")
    salary = next(c for c in categories if c["name"] == "Lương")

    child = await client.post(
        f"/groups/{gid}/categories",
        json={"name": "Cà phê", "kind": "expense", "icon": "☕", "parent_id": food["id"]},
        headers=me,
    )
    assert child.status_code == 201
    assert child.json()["parent_id"] == food["id"]

    wrong_kind = await client.post(
        f"/groups/{gid}/categories",
        json={"name": "Sai", "kind": "expense", "parent_id": salary["id"]},
        headers=me,
    )
    assert wrong_kind.status_code == 422

    archived = await client.patch(
        f"/groups/{gid}/categories/{child.json()['id']}", json={"archived": True}, headers=me
    )
    assert archived.status_code == 200
    visible = (await client.get(f"/groups/{gid}/categories", headers=me)).json()
    assert all(c["id"] != child.json()["id"] for c in visible)
