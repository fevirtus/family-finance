from httpx import AsyncClient


async def login(client: AsyncClient, email: str = "me@example.com", name: str = "Me") -> dict:
    response = await client.post("/auth/google", json={"id_token": f"sub-{email}|{email}|{name}"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def create_group(client: AsyncClient, headers: dict, name: str = "Nhà mình") -> str:
    response = await client.post("/groups", json={"name": name}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]
