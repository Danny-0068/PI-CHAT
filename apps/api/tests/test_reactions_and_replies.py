import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.core import security
from app.models.user import User, UserRole
from app.main import app
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_quoted_replies_and_reaction_toggles():
    async with TestingSessionLocal() as session:
        user_a = User(
            email="react_alice@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="React Alice",
            role=UserRole.EMPLOYEE,
        )
        user_b = User(
            email="react_bob@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="React Bob",
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
        # 1. Login Alice & Bob
        login_a = await client.post("/auth/login", json={"email": "react_alice@acme.demo", "password": "Pass123!"})
        token_a = login_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        login_b = await client.post("/auth/login", json={"email": "react_bob@acme.demo", "password": "Pass123!"})
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 2. Alice creates DM with Bob
        dm_res = await client.post("/conversations/dm", json={"target_user_id": str(user_b_id)}, headers=headers_a)
        assert dm_res.status_code == 200
        conv_id = dm_res.json()["id"]

        # 3. Alice sends original message
        msg1_res = await client.post(
            f"/conversations/{conv_id}/messages",
            json={"client_id": str(uuid.uuid4()), "content": "What is the status of Phase 6?"},
            headers=headers_a,
        )
        assert msg1_res.status_code == 201
        msg1_id = msg1_res.json()["id"]

        # 4. Bob replies with quoted snippet
        msg2_res = await client.post(
            f"/conversations/{conv_id}/messages",
            json={
                "client_id": str(uuid.uuid4()),
                "content": "Phase 6 replies and reactions are coming along nicely!",
                "reply_to_id": msg1_id,
            },
            headers=headers_b,
        )
        assert msg2_res.status_code == 201
        msg2_data = msg2_res.json()
        assert msg2_data["reply_to"] is not None
        assert msg2_data["reply_to"]["id"] == msg1_id
        assert msg2_data["reply_to"]["sender_name"] == "React Alice"
        assert "Phase 6" in msg2_data["reply_to"]["content"]

        # 5. Alice reacts to Bob's reply with '🚀'
        react1_res = await client.post(
            f"/conversations/messages/{msg2_data['id']}/reactions",
            json={"emoji": "🚀"},
            headers=headers_a,
        )
        assert react1_res.status_code == 200
        react1_data = react1_res.json()
        assert react1_data["action"] == "added"
        assert len(react1_data["reactions"]) == 1
        assert react1_data["reactions"][0]["emoji"] == "🚀"
        assert react1_data["reactions"][0]["count"] == 1
        assert str(user_a_id) in react1_data["reactions"][0]["user_ids"]

        # 6. Bob also reacts with '🚀'
        react2_res = await client.post(
            f"/conversations/messages/{msg2_data['id']}/reactions",
            json={"emoji": "🚀"},
            headers=headers_b,
        )
        assert react2_res.status_code == 200
        react2_data = react2_res.json()
        assert react2_data["action"] == "added"
        assert react2_data["reactions"][0]["count"] == 2
        assert str(user_a_id) in react2_data["reactions"][0]["user_ids"]
        assert str(user_b_id) in react2_data["reactions"][0]["user_ids"]

        # 7. Bob adds another reaction '❤️'
        react3_res = await client.post(
            f"/conversations/messages/{msg2_data['id']}/reactions",
            json={"emoji": "❤️"},
            headers=headers_b,
        )
        assert react3_res.status_code == 200
        react3_data = react3_res.json()
        assert len(react3_data["reactions"]) == 2

        # 8. Alice toggles '🚀' off
        react4_res = await client.post(
            f"/conversations/messages/{msg2_data['id']}/reactions",
            json={"emoji": "🚀"},
            headers=headers_a,
        )
        assert react4_res.status_code == 200
        react4_data = react4_res.json()
        assert react4_data["action"] == "removed"
        rocket_reaction = next(r for r in react4_data["reactions"] if r["emoji"] == "🚀")
        assert rocket_reaction["count"] == 1
        assert str(user_a_id) not in rocket_reaction["user_ids"]
        assert str(user_b_id) in rocket_reaction["user_ids"]

        # 9. Messages list includes reactions
        messages_res = await client.get(f"/conversations/{conv_id}/messages", headers=headers_a)
        assert messages_res.status_code == 200
        fetched_msgs = messages_res.json()
        fetched_msg2 = next(m for m in fetched_msgs if m["id"] == msg2_data["id"])
        assert len(fetched_msg2["reactions"]) == 2
