import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import security
from app.models.user import User, UserRole
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.models.conversation import Conversation, ConversationType
from app.models.message import Message
from app.services import chat_service
from app.main import app
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_list_conversations_and_scoping():
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin_chat@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Admin Alex",
            role=UserRole.MAIN_ADMIN,
        )
        emp1 = User(
            email="emp1_chat@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Emp Sam",
            role=UserRole.EMPLOYEE,
        )
        emp2 = User(
            email="emp2_chat@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Emp Jordan",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([admin, emp1, emp2])
        await session.commit()

        team_ai = (await session.execute(select(Team).where(Team.name == "team_ai"))).scalar_one()
        
        # emp1 is member of team_ai
        mem1 = TeamMembership(user_id=emp1.id, team_id=team_ai.id)
        session.add(mem1)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # emp1 login
        emp1_login = await client.post("/auth/login", json={"email": "emp1_chat@acme.demo", "password": "Pass123!"})
        emp1_token = emp1_login.json()["access_token"]
        emp1_headers = {"Authorization": f"Bearer {emp1_token}"}

        # emp1 lists conversations
        res = await client.get("/conversations", headers=emp1_headers)
        assert res.status_code == 200
        convs = res.json()
        conv_titles = [c["title"] for c in convs]
        # emp1 should see #updates and #AI Research, but NOT other unjoined teams
        assert "#updates" in conv_titles
        assert "#AI Research" in conv_titles
        assert "#Legal & Compliance" not in conv_titles

        # admin login
        admin_login = await client.post("/auth/login", json={"email": "admin_chat@acme.demo", "password": "Pass123!"})
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # admin lists conversations
        admin_res = await client.get("/conversations", headers=admin_headers)
        assert admin_res.status_code == 200
        admin_convs = admin_res.json()
        admin_titles = [c["title"] for c in admin_convs]
        # Admin sees all teams
        assert "#updates" in admin_titles
        assert "#AI Research" in admin_titles
        assert "#Legal & Compliance" in admin_titles


@pytest.mark.asyncio
async def test_message_deduplication():
    async with TestingSessionLocal() as session:
        user = User(
            email="dedup_user@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Dedup User",
            role=UserRole.EMPLOYEE,
        )
        session.add(user)
        await session.commit()
        user_id = user.id

        updates_conv = await chat_service.get_or_create_updates_channel(session)
        conv_id = updates_conv.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/auth/login", json={"email": "dedup_user@acme.demo", "password": "Pass123!"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        client_id = f"client-id-{uuid.uuid4()}"
        # 1st Send
        res1 = await client.post(
            f"/conversations/{conv_id}/messages",
            headers=headers,
            json={"content": "Hello deduplicated world", "client_id": client_id},
        )
        assert res1.status_code == 201
        msg1 = res1.json()
        assert msg1["content"] == "Hello deduplicated world"
        assert msg1["client_id"] == client_id

        # 2nd Send with exact same client_id (e.g. network retry)
        res2 = await client.post(
            f"/conversations/{conv_id}/messages",
            headers=headers,
            json={"content": "Hello deduplicated world retry", "client_id": client_id},
        )
        assert res2.status_code == 201
        msg2 = res2.json()
        # Must return the SAME message ID without creating a duplicate
        assert msg2["id"] == msg1["id"]
        assert msg2["content"] == "Hello deduplicated world"


@pytest.mark.asyncio
async def test_message_edit_and_tombstone_delete():
    async with TestingSessionLocal() as session:
        user = User(
            email="author@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Author",
            role=UserRole.EMPLOYEE,
        )
        session.add(user)
        await session.commit()

        updates = await chat_service.get_or_create_updates_channel(session)
        conv_id = updates.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/auth/login", json={"email": "author@acme.demo", "password": "Pass123!"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Send
        create_res = await client.post(
            f"/conversations/{conv_id}/messages",
            headers=headers,
            json={"content": "Initial message", "client_id": f"msg-{uuid.uuid4()}"},
        )
        assert create_res.status_code == 201
        msg_id = create_res.json()["id"]

        # Edit
        edit_res = await client.patch(
            f"/conversations/messages/{msg_id}",
            headers=headers,
            json={"content": "Updated message"},
        )
        assert edit_res.status_code == 200
        assert edit_res.json()["content"] == "Updated message"
        assert edit_res.json()["is_edited"] is True

        # Delete (tombstone)
        del_res = await client.delete(
            f"/conversations/messages/{msg_id}",
            headers=headers,
        )
        assert del_res.status_code == 200
        deleted_data = del_res.json()
        assert deleted_data["is_deleted"] is True
        assert deleted_data["content"] == "This message was deleted"


@pytest.mark.asyncio
async def test_whatsapp_style_history_window():
    """
    Messages sent in a team BEFORE a user joins must NOT be visible to that user.
    Main-Admin sees all messages.
    """
    now = datetime.now(timezone.utc)
    past_time = now - timedelta(hours=2)
    join_time = now - timedelta(hours=1)
    future_time = now - timedelta(minutes=30)

    async with TestingSessionLocal() as session:
        admin = User(
            email="admin_window@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Admin Window",
            role=UserRole.MAIN_ADMIN,
        )
        new_emp = User(
            email="new_emp@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="New Emp",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([admin, new_emp])
        await session.commit()

        team_ai = (await session.execute(select(Team).where(Team.name == "team_ai"))).scalar_one()
        team_conv = await chat_service.get_or_create_team_conversation(session, team_ai.id)

        # Message 1 sent 2 hours ago (BEFORE new_emp joined)
        msg_old = Message(
            conversation_id=team_conv.id,
            sender_id=admin.id,
            client_id="msg-historical-1",
            content="Old confidential discussion before join",
            created_at=past_time,
            updated_at=past_time,
        )
        # Message 2 sent 30 mins ago (AFTER new_emp joined)
        msg_new = Message(
            conversation_id=team_conv.id,
            sender_id=admin.id,
            client_id="msg-historical-2",
            content="New discussion after join",
            created_at=future_time,
            updated_at=future_time,
        )
        session.add_all([msg_old, msg_new])
        await session.commit()

        # new_emp joined 1 hour ago
        membership = TeamMembership(
            user_id=new_emp.id,
            team_id=team_ai.id,
            joined_at=join_time,
        )
        session.add(membership)
        await session.commit()
        conv_id = team_conv.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Check as new_emp
        emp_login = await client.post("/auth/login", json={"email": "new_emp@acme.demo", "password": "Pass123!"})
        emp_token = emp_login.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        emp_msgs_res = await client.get(f"/conversations/{conv_id}/messages", headers=emp_headers)
        assert emp_msgs_res.status_code == 200
        emp_msgs = emp_msgs_res.json()
        emp_contents = [m["content"] for m in emp_msgs]
        # Should see message 2, but NOT message 1
        assert "New discussion after join" in emp_contents
        assert "Old confidential discussion before join" not in emp_contents

        # 2. Check as admin
        admin_login = await client.post("/auth/login", json={"email": "admin_window@acme.demo", "password": "Pass123!"})
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        admin_msgs_res = await client.get(f"/conversations/{conv_id}/messages", headers=admin_headers)
        assert admin_msgs_res.status_code == 200
        admin_msgs = admin_msgs_res.json()
        admin_contents = [m["content"] for m in admin_msgs]
        # Admin sees both!
        assert "New discussion after join" in admin_contents
        assert "Old confidential discussion before join" in admin_contents


@pytest.mark.asyncio
async def test_direct_message_initialization():
    async with TestingSessionLocal() as session:
        user_a = User(
            email="dm_a@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="User A",
            role=UserRole.EMPLOYEE,
        )
        user_b = User(
            email="dm_b@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="User B",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([user_a, user_b])
        await session.commit()
        user_b_id = user_b.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/auth/login", json={"email": "dm_a@acme.demo", "password": "Pass123!"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Start DM with user_b
        dm_res = await client.post(
            "/conversations/dm",
            headers=headers,
            json={"target_user_id": str(user_b_id)},
        )
        assert dm_res.status_code == 200
        dm_data = dm_res.json()
        assert dm_data["type"] == "DM"
        assert dm_data["title"] == "User B"
        assert dm_data["other_user"]["display_name"] == "User B"
