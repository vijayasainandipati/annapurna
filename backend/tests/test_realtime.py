import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.outbox import OutboxEvent, OutboxStatusEnum
from app.core.realtime import sio, OutboxPublisher

@pytest.mark.asyncio
async def test_realtime_outbox_processing_and_endpoints(client: AsyncClient):
    # 1. Log in admin and supervisor
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Check initial stats
    stats_res = await client.get("/api/v1/realtime/stats", headers=admin_headers)
    assert stats_res.status_code == 200
    assert "active_socket_connections" in stats_res.json()

    # 3. Create a material purchase to generate a stock ledger and outbox event
    mat_res = await client.get("/api/v1/masters/materials", headers=admin_headers)
    materials = {m["code"]: m for m in mat_res.json()}
    flour_id = materials["MAT-FLOUR-01"]["id"]

    purchase_res = await client.post(
        "/api/v1/inventory/purchases",
        json={"material_id": flour_id, "quantity": "25.0000", "purchase_rate": "44.0000"},
        headers=admin_headers
    )
    assert purchase_res.status_code == 201

    # 4. Inspect outbox events: at least 1 pending event should exist
    events_res = await client.get("/api/v1/realtime/events?status=PENDING", headers=admin_headers)
    assert events_res.status_code == 200
    pending_events = events_res.json()
    assert len(pending_events) >= 1
    assert any(e["channel"] in ["inventory", "stock"] for e in pending_events)

    # 5. Trigger outbox processing
    process_res = await client.post("/api/v1/realtime/process-outbox", headers=admin_headers)
    assert process_res.status_code == 200
    res_data = process_res.json()
    assert res_data["status"] == "success"
    assert res_data["published_events_count"] >= 1

    # 6. Verify event status updated to PUBLISHED
    events_published = await client.get("/api/v1/realtime/events?status=PUBLISHED", headers=admin_headers)
    assert events_published.status_code == 200
    published_events = events_published.json()
    assert len(published_events) >= 1
    assert published_events[0]["status"] == "PUBLISHED"
    assert published_events[0]["published_at"] is not None

@pytest.mark.asyncio
async def test_socketio_connection_handshake(client: AsyncClient):
    admin_login = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "Admin123!"})
    admin_token = admin_login.json()["access_token"]

    # Test connect handler directly with valid token
    environ = {"REMOTE_ADDR": "127.0.0.1"}
    auth_data = {"token": admin_token}

    # Simulate connect
    from app.core.realtime import connect, disconnect
    test_sid = "test-session-sid-001"
    await connect(test_sid, environ, auth_data)

    # Verify session recorded
    from app.core.realtime import connected_users
    assert test_sid in connected_users
    assert connected_users[test_sid]["username"] == "admin"
    assert connected_users[test_sid]["role"] == "ADMIN"

    # Cleanup
    await disconnect(test_sid)
    assert test_sid not in connected_users

@pytest.mark.asyncio
async def test_socketio_connection_rejected_without_token():
    from app.core.realtime import connect
    import socketio

    test_sid = "test-session-invalid"
    environ = {"REMOTE_ADDR": "127.0.0.1"}

    with pytest.raises(socketio.exceptions.ConnectionRefusedError):
        await connect(test_sid, environ, {})
