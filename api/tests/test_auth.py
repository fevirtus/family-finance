async def test_login_creates_user_and_returns_token(client):
    response = await client.post("/auth/google", json={"id_token": "s1|me@example.com|Me"})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "me@example.com"
    assert body["user"]["groups"] == []
    assert body["user"]["default_group_id"] is None

    me = await client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]


async def test_login_again_updates_profile_and_keeps_user(client):
    first = await client.post("/auth/google", json={"id_token": "s1|me@example.com|Old"})
    second = await client.post("/auth/google", json={"id_token": "s1|me@example.com|New"})
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert second.json()["user"]["name"] == "New"


async def test_email_not_in_allowlist_is_forbidden(client):
    response = await client.post("/auth/google", json={"id_token": "s2|stranger@example.com|X"})
    assert response.status_code == 403


async def test_allowlist_match_ignores_case(client):
    response = await client.post("/auth/google", json={"id_token": "s3|ME@Example.COM|Me"})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "me@example.com"


async def test_invalid_google_token_is_unauthorized(client):
    response = await client.post("/auth/google", json={"id_token": "bad"})
    assert response.status_code == 401


async def test_me_requires_valid_bearer(client):
    assert (await client.get("/me")).status_code == 401
    garbage = {"Authorization": "Bearer not-a-jwt"}
    assert (await client.get("/me", headers=garbage)).status_code == 401
