from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from app.db import SessionLocal
from app.models import Category, GroupInvite
from tests.helpers import create_group, login


async def test_create_group_makes_owner_seeds_categories_and_sets_default(client):
    me = await login(client)
    response = await client.post("/groups", json={"name": "Nhà mình"}, headers=me)
    assert response.status_code == 201
    group = response.json()
    assert group["role"] == "owner"
    assert group["type"] == "family"
    assert group["currency"] == "VND"

    profile = (await client.get("/me", headers=me)).json()
    assert profile["default_group_id"] == group["id"]
    assert [g["id"] for g in profile["groups"]] == [group["id"]]

    async with SessionLocal() as session:
        count = await session.scalar(
            select(func.count()).select_from(Category).where(Category.group_id == group["id"])
        )
    assert count == 21


async def test_second_group_does_not_change_default(client):
    me = await login(client)
    first = await create_group(client, me, "A")
    await create_group(client, me, "B")
    assert (await client.get("/me", headers=me)).json()["default_group_id"] == first


async def test_non_member_gets_404_for_group(client):
    me = await login(client)
    group_id = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.get(f"/groups/{group_id}", headers=wife)).status_code == 404


async def test_invite_flow_adds_member(client):
    me = await login(client)
    group_id = await create_group(client, me)
    invite = await client.post(f"/groups/{group_id}/invites", headers=me)
    assert invite.status_code == 201
    url = invite.json()["url"]
    assert url.startswith("http://web.test/invite/")
    token = url.rsplit("/", 1)[1]

    wife = await login(client, "wife@example.com", "Wife")
    preview = (await client.get(f"/invites/{token}", headers=wife)).json()
    assert preview["group_name"] == "Nhà mình"
    assert preview["valid"] is True
    assert preview["already_member"] is False

    accepted = await client.post(f"/invites/{token}/accept", headers=wife)
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "member"

    detail = (await client.get(f"/groups/{group_id}", headers=wife)).json()
    assert sorted(m["email"] for m in detail["members"]) == ["me@example.com", "wife@example.com"]
    assert (await client.get("/me", headers=wife)).json()["default_group_id"] == group_id


async def test_accepting_twice_is_a_no_op(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.post(f"/invites/{token}/accept", headers=wife)).status_code == 200
    again = await client.post(f"/invites/{token}/accept", headers=wife)
    assert again.status_code == 200
    assert again.json()["id"] == group_id


async def test_used_invite_rejects_another_person(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    wife = await login(client, "wife@example.com", "Wife")
    await client.post(f"/invites/{token}/accept", headers=wife)
    friend = await login(client, "friend@example.com", "Friend")
    assert (await client.post(f"/invites/{token}/accept", headers=friend)).status_code == 410
    preview = (await client.get(f"/invites/{token}", headers=friend)).json()
    assert preview["valid"] is False


async def test_expired_invite_is_gone(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    token = token.rsplit("/", 1)[1]
    async with SessionLocal() as session:
        await session.execute(
            update(GroupInvite).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await session.commit()
    wife = await login(client, "wife@example.com", "Wife")
    assert (await client.post(f"/invites/{token}/accept", headers=wife)).status_code == 410


async def test_unknown_invite_is_404(client):
    me = await login(client)
    assert (await client.get("/invites/nope", headers=me)).status_code == 404
    assert (await client.post("/invites/nope/accept", headers=me)).status_code == 404


async def test_only_owner_can_create_invites(client):
    me = await login(client)
    group_id = await create_group(client, me)
    token = (await client.post(f"/groups/{group_id}/invites", headers=me)).json()["url"]
    wife = await login(client, "wife@example.com", "Wife")
    await client.post(f"/invites/{token.rsplit('/', 1)[1]}/accept", headers=wife)
    assert (await client.post(f"/groups/{group_id}/invites", headers=wife)).status_code == 403


async def test_patch_me_default_group_requires_membership(client):
    me = await login(client)
    mine = await create_group(client, me)
    wife = await login(client, "wife@example.com", "Wife")
    theirs = await create_group(client, wife, "Nhà vợ")
    bad = await client.patch("/me", json={"default_group_id": theirs}, headers=me)
    assert bad.status_code == 404
    ok = await client.patch("/me", json={"default_group_id": mine}, headers=me)
    assert ok.status_code == 200
    assert ok.json()["default_group_id"] == mine
