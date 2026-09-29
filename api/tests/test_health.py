async def test_healthz_reports_ok_when_db_reachable(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
