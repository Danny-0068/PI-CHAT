import uuid
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import security
from app.models.user import User, UserRole, UserStatus
from app.models.conversation import Conversation, ConversationType
from app.main import app
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_read_receipts_and_unread_counts():
    async with TestingSessionLocal() as session:
        user_a = User(
            email="receipt_a@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Receipt Alice",
            role=UserRole.EMPLOYEE,
        )
        user_b = User(
            email="receipt_b@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Receipt Bob",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([user_a, user_b])
        await session.commit()
        await session.refresh(user_a)
        await session.refresh(user_b)
        user_a_id = user_a.id
        user_b_id = user_b.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login Alice and Bob
        login_a = await client.post("/auth/login", json={"email": "receipt_a@acme.demo", "password": "Pass123!"})
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        login_b = await client.post("/auth/login", json={"email": "receipt_b@acme.demo", "password": "Pass123!"})
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Alice creates DM with Bob
        dm_res = await client.post("/conversations/dm", json={"target_user_id": str(user_b_id)}, headers=headers_a)
        assert dm_res.status_code == 200
        conv_id = dm_res.json()["id"]

        # Alice sends 2 messages
        msg1_res = await client.post(
            f"/conversations/{conv_id}/messages",
            json={"client_id": str(uuid.uuid4()), "content": "Hello Bob!"},
            headers=headers_a,
        )
        assert msg1_res.status_code == 201
        msg1 = msg1_res.json()

        msg2_res = await client.post(
            f"/conversations/{conv_id}/messages",
            json={"client_id": str(uuid.uuid4()), "content": "Are you there?"},
            headers=headers_a,
        )
        assert msg2_res.status_code == 201
        msg2 = msg2_res.json()

        # Bob checks conversations list -> unread_count should be 2
        bob_convs = await client.get("/conversations", headers=headers_b)
        assert bob_convs.status_code == 200
        bob_dm = next(c for c in bob_convs.json() if c["id"] == conv_id)
        assert bob_dm["unread_count"] == 2
        assert bob_dm["my_last_read_at"] is None

        # Alice checks conversations list -> unread_count should be 0, Bob hasn't read yet
        alice_convs = await client.get("/conversations", headers=headers_a)
        alice_dm = next(c for c in alice_convs.json() if c["id"] == conv_id)
        assert alice_dm["unread_count"] == 0
        assert alice_dm["other_user_last_read_at"] is None

        # Bob marks conversation as read
        read_res = await client.post(f"/conversations/{conv_id}/read", headers=headers_b)
        assert read_res.status_code == 200
        read_data = read_res.json()
        assert read_data["conversation_id"] == conv_id
        assert read_data["user_id"] == str(user_b_id)
        assert read_data["last_read_at"] is not None

        # Bob re-checks conversations list -> unread_count is now 0
        bob_convs_after = await client.get("/conversations", headers=headers_b)
        bob_dm_after = next(c for c in bob_convs_after.json() if c["id"] == conv_id)
        assert bob_dm_after["unread_count"] == 0
        assert bob_dm_after["my_last_read_at"] is not None

        # Alice checks conversations list -> Bob's last_read_at is now visible
        alice_convs_after = await client.get("/conversations", headers=headers_a)
        alice_dm_after = next(c for c in alice_convs_after.json() if c["id"] == conv_id)
        assert alice_dm_after["other_user_last_read_at"] is not None
        # Bob's last_read_at should be >= created_at of msg2
        bob_read_ts = datetime.fromisoformat(alice_dm_after["other_user_last_read_at"])
        msg2_ts = datetime.fromisoformat(msg2["created_at"])
        assert bob_read_ts >= msg2_ts


@pytest.mark.asyncio
async def test_user_presence_status_and_custom_text():
    async with TestingSessionLocal() as session:
        status_user_a = User(
            email="status_a@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Status Alice",
            role=UserRole.EMPLOYEE,
        )
        status_user_b = User(
            email="status_b@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Status Bob",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([status_user_a, status_user_b])
        await session.commit()
        await session.refresh(status_user_a)
        await session.refresh(status_user_b)
        user_a_id = status_user_a.id
        user_b_id = status_user_b.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_a = await client.post("/auth/login", json={"email": "status_a@acme.demo", "password": "Pass123!"})
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        login_b = await client.post("/auth/login", json={"email": "status_b@acme.demo", "password": "Pass123!"})
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Alice creates DM with Bob
        dm_res = await client.post("/conversations/dm", json={"target_user_id": str(user_b_id)}, headers=headers_a)
        conv_id = dm_res.json()["id"]

        # Alice updates status to AWAY with status_text
        update_res = await client.patch(
            "/users/me/status",
            json={"status": "AWAY", "status_text": "Deep focus mode until 2pm"},
            headers=headers_a,
        )
        assert update_res.status_code == 200
        assert update_res.json()["status"] == "AWAY"
        assert update_res.json()["status_text"] == "Deep focus mode until 2pm"

        # Bob queries conversation list -> Alice's presence mode and status text are populated
        bob_convs = await client.get("/conversations", headers=headers_b)
        bob_dm = next(c for c in bob_convs.json() if c["id"] == conv_id)
        assert bob_dm["other_user"]["status"] == "AWAY"
        assert bob_dm["other_user"]["status_text"] == "Deep focus mode until 2pm"
