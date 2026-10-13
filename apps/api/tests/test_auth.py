import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import security
from app.models.user import User, UserRole, UserStatus
from app.main import app
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_argon2_hashing_and_verification():
    password = "MySecurePassword123!"
    hashed = security.hash_password(password)
    assert hashed != password
    assert security.verify_password(password, hashed) is True
    assert security.verify_password("WrongPassword!", hashed) is False


@pytest.mark.asyncio
async def test_login_and_refresh_rotation_flow():
    # 1. Seed test user
    async with TestingSessionLocal() as session:
        pwd_hash = security.hash_password("AdminPass123!")
        admin = User(
            email="testadmin@acme.demo",
            password_hash=pwd_hash,
            display_name="Test Admin",
            role=UserRole.MAIN_ADMIN,
            status=UserStatus.AVAILABLE,
            is_active=True,
            is_demo=False,
        )
        session.add(admin)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 2. Login with correct credentials
        login_res = await client.post(
            "/auth/login",
            json={"email": "testadmin@acme.demo", "password": "AdminPass123!"},
        )
        assert login_res.status_code == 200
        data = login_res.json()
        assert "access_token" in data
        assert data["user"]["email"] == "testadmin@acme.demo"
        assert data["user"]["role"] == "MAIN_ADMIN"
        
        # Verify refresh token cookie is set
        assert "refresh_token" in login_res.cookies
        cookie_token = login_res.cookies["refresh_token"]

        # 3. Rotate refresh token
        client.cookies.set("refresh_token", cookie_token)
        refresh_res = await client.post("/auth/refresh")
        assert refresh_res.status_code == 200
        refresh_data = refresh_res.json()
        assert "access_token" in refresh_data
        
        # Cookie must rotate to a new token
        new_cookie_token = refresh_res.cookies["refresh_token"]
        assert new_cookie_token != cookie_token

        # 4. REUSE DETECTION TEST: Attempt to reuse the OLD token!
        client.cookies.set("refresh_token", cookie_token)
        reuse_res = await client.post("/auth/refresh")
        assert reuse_res.status_code == 401
        assert "reuse detected" in reuse_res.json()["detail"].lower()

        # Entire family should now be revoked; even new_cookie_token fails
        client.cookies.set("refresh_token", new_cookie_token)
        revoked_res = await client.post("/auth/refresh")
        assert revoked_res.status_code == 401


@pytest.mark.asyncio
async def test_demo_login_endpoint():
    # Seed demo admin
    async with TestingSessionLocal() as session:
        pwd_hash = security.hash_password("Password123!")
        admin = User(
            email="admin@acme.demo",
            password_hash=pwd_hash,
            display_name="Alex Morgan",
            role=UserRole.MAIN_ADMIN,
            status=UserStatus.AVAILABLE,
            is_active=True,
            is_demo=True,
        )
        session.add(admin)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        demo_res = await client.post("/auth/demo-login", json={"target": "admin"})
        assert demo_res.status_code == 200
        data = demo_res.json()
        assert data["user"]["email"] == "admin@acme.demo"
        assert "refresh_token" in demo_res.cookies


@pytest.mark.asyncio
async def test_sudo_mode_step_up_for_admin_creation():
    # 1. Seed admin
    async with TestingSessionLocal() as session:
        pwd_hash = security.hash_password("SudoAdminPass123!")
        admin = User(
            email="superadmin@acme.demo",
            password_hash=pwd_hash,
            display_name="Super Admin",
            role=UserRole.MAIN_ADMIN,
            status=UserStatus.AVAILABLE,
            is_active=True,
        )
        session.add(admin)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post(
            "/auth/login",
            json={"email": "superadmin@acme.demo", "password": "SudoAdminPass123!"},
        )
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Creating normal employee does NOT require sudo
        emp_res = await client.post(
            "/users",
            headers=headers,
            json={
                "email": "newemp@acme.demo",
                "display_name": "New Employee",
                "role": "EMPLOYEE",
                "password": "TempPassword123!",
            },
        )
        assert emp_res.status_code == 201

        # 3. Creating another MAIN_ADMIN WITHOUT sudo MUST fail (HTTP 403)
        admin_fail = await client.post(
            "/users",
            headers=headers,
            json={
                "email": "secondadmin@acme.demo",
                "display_name": "Second Admin",
                "role": "MAIN_ADMIN",
                "password": "TempPassword123!",
            },
        )
        assert admin_fail.status_code == 403
        assert "sudo" in admin_fail.json()["detail"].lower()

        # 4. Request sudo token
        sudo_res = await client.post(
            "/auth/sudo",
            headers=headers,
            json={"password": "SudoAdminPass123!"},
        )
        assert sudo_res.status_code == 200
        sudo_token = sudo_res.json()["sudo_token"]

        # 5. Creating another MAIN_ADMIN WITH X-Sudo-Token MUST succeed (HTTP 201)
        headers_with_sudo = {
            "Authorization": f"Bearer {token}",
            "X-Sudo-Token": sudo_token,
        }
        admin_success = await client.post(
            "/users",
            headers=headers_with_sudo,
            json={
                "email": "secondadmin@acme.demo",
                "display_name": "Second Admin",
                "role": "MAIN_ADMIN",
                "password": "TempPassword123!",
            },
        )
        assert admin_success.status_code == 201
        assert admin_success.json()["role"] == "MAIN_ADMIN"
