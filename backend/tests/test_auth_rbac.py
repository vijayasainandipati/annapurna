import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "postgresql"
    assert data["precision"] == "NUMERIC"

@pytest.mark.asyncio
@pytest.mark.parametrize("username,password,expected_role", [
    ("admin", "Admin123!", "ADMIN"),
    ("salesman_a", "Salesman123!", "SALESMAN"),
    ("salesman_b", "Salesman123!", "SALESMAN"),
    ("supervisor", "Supervisor123!", "PRODUCTION_SUPERVISOR"),
    ("owner", "Owner123!", "OWNER"),
    ("accountant", "Accountant123!", "ACCOUNTANT"),
])
async def test_login_all_demo_roles(client: AsyncClient, username, password, expected_role):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    assert response.status_code == 200, f"Login failed for {username}: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == username
    assert data["user"]["role"] == expected_role

@pytest.mark.asyncio
async def test_invalid_password(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "WrongPassword!"}
    )
    assert response.status_code == 401
    assert "Incorrect username or password" in response.json()["detail"]

@pytest.mark.asyncio
async def test_invalid_username(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "non_existent_user", "password": "AnyPassword123!"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_me_authenticated(client: AsyncClient):
    # 1. Login as Salesman A
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"username": "salesman_a", "password": "Salesman123!"}
    )
    token = login_res.json()["access_token"]

    # 2. Access /me with token
    me_res = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 200
    user_data = me_res.json()
    assert user_data["username"] == "salesman_a"
    assert user_data["role"] == "SALESMAN"
    assert user_data["is_active"] is True

@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_invalid_token(client: AsyncClient):
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.fake.token"}
    )
    assert response.status_code == 401
