import uuid
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import security
from app.models.user import User, UserRole
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.models.audit_log import AuditLog
from app.services import team_service
from app.main import app
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_seed_teams_exist():
    async with TestingSessionLocal() as session:
        result = await session.execute(select(Team))
        teams = result.scalars().all()
        team_names = {t.name for t in teams}
        assert "team_ai" in team_names
        assert "team_legal" in team_names
        assert "hr_admin" in team_names
        assert "seo" in team_names
        assert "coordination" in team_names
        assert len(teams) >= 5


@pytest.mark.asyncio
async def test_team_assignment_and_history_scoping():
    # 1. Create admin and employee
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Alex Morgan",
            role=UserRole.MAIN_ADMIN,
        )
        emp = User(
            email="sam@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Sam Rivera",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([admin, emp])
        await session.commit()
        admin_id = admin.id
        emp_id = emp.id

        team_ai = (await session.execute(select(Team).where(Team.name == "team_ai"))).scalar_one()
        team_legal = (await session.execute(select(Team).where(Team.name == "team_legal"))).scalar_one()
        team_ai_id = team_ai.id
        team_legal_id = team_legal.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin login
        login_res = await client.post("/auth/login", json={"email": "admin@acme.demo", "password": "Pass123!"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 1: Assign Sam to team_ai
        assign_res = await client.patch(
            f"/admin/users/{emp_id}",
            headers=headers,
            json={"team_id": str(team_ai_id), "is_lead": True},
        )
        assert assign_res.status_code == 200
        data = assign_res.json()
        assert data["team"]["name"] == "team_ai"
        assert data["team"]["is_lead"] is True

        # Verify active interval in DB
        async with TestingSessionLocal() as session:
            active_tm = (await session.execute(
                select(TeamMembership).where(TeamMembership.user_id == emp_id).where(TeamMembership.left_at.is_(None))
            )).scalar_one()
            assert active_tm.team_id == team_ai_id
            assert active_tm.is_lead is True
            time_during_ai = active_tm.joined_at

            # Verify history check at time_during_ai
            assert await team_service.check_membership_at_time(session, emp_id, team_ai_id, time_during_ai) is True
            assert await team_service.check_membership_at_time(session, emp_id, team_legal_id, time_during_ai) is False

        # Step 2: Move Sam to team_legal
        move_res = await client.patch(
            f"/admin/users/{emp_id}",
            headers=headers,
            json={"team_id": str(team_legal_id), "is_lead": False},
        )
        assert move_res.status_code == 200
        assert move_res.json()["team"]["name"] == "team_legal"

        # Verify previous interval closed
        async with TestingSessionLocal() as session:
            old_tm = (await session.execute(
                select(TeamMembership).where(TeamMembership.user_id == emp_id).where(TeamMembership.team_id == team_ai_id)
            )).scalar_one()
            assert old_tm.left_at is not None  # Closed!

            new_tm = (await session.execute(
                select(TeamMembership).where(TeamMembership.user_id == emp_id).where(TeamMembership.left_at.is_(None))
            )).scalar_one()
            assert new_tm.team_id == team_legal_id
            assert new_tm.is_lead is False


@pytest.mark.asyncio
async def test_team_lead_file_limit_rules():
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Alex Morgan",
            role=UserRole.MAIN_ADMIN,
        )
        lead = User(
            email="lead@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="AI Lead",
            role=UserRole.EMPLOYEE,
        )
        member = User(
            email="member@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Regular Member",
            role=UserRole.EMPLOYEE,
        )
        session.add_all([admin, lead, member])
        await session.commit()

        team_ai = (await session.execute(select(Team).where(Team.name == "team_ai"))).scalar_one()
        team_id = team_ai.id

        # Assign lead and regular member
        tm_lead = TeamMembership(user_id=lead.id, team_id=team_id, is_lead=True)
        tm_member = TeamMembership(user_id=member.id, team_id=team_id, is_lead=False)
        session.add_all([tm_lead, tm_member])
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Lead login
        lead_tok = (await client.post("/auth/login", json={"email": "lead@acme.demo", "password": "Pass123!"})).json()["access_token"]
        member_tok = (await client.post("/auth/login", json={"email": "member@acme.demo", "password": "Pass123!"})).json()["access_token"]
        admin_tok = (await client.post("/auth/login", json={"email": "admin@acme.demo", "password": "Pass123!"})).json()["access_token"]

        # 1. Regular non-lead member attempting to change limit -> 403 Forbidden
        reg_res = await client.patch(
            f"/teams/{team_id}/limit",
            headers={"Authorization": f"Bearer {member_tok}"},
            json={"file_size_limit_bytes": 10 * 1024 * 1024},
        )
        assert reg_res.status_code == 403

        # 2. Team Lead raises to 15 MB (<= 25 MB demo cap) -> 200 OK
        lead_res = await client.patch(
            f"/teams/{team_id}/limit",
            headers={"Authorization": f"Bearer {lead_tok}"},
            json={"file_size_limit_bytes": 15 * 1024 * 1024},
        )
        assert lead_res.status_code == 200
        assert lead_res.json()["file_size_limit_bytes"] == 15 * 1024 * 1024

        # 3. Team Lead tries to raise to 40 MB (> 25 MB cap) -> 400 Bad Request
        lead_over = await client.patch(
            f"/teams/{team_id}/limit",
            headers={"Authorization": f"Bearer {lead_tok}"},
            json={"file_size_limit_bytes": 40 * 1024 * 1024},
        )
        assert lead_over.status_code == 400
        assert "demo cap" in lead_over.json()["detail"].lower()

        # 4. Main-Admin overrides to 100 MB -> 200 OK
        admin_res = await client.patch(
            f"/teams/{team_id}/limit",
            headers={"Authorization": f"Bearer {admin_tok}"},
            json={"file_size_limit_bytes": 100 * 1024 * 1024},
        )
        assert admin_res.status_code == 200
        assert admin_res.json()["file_size_limit_bytes"] == 100 * 1024 * 1024


@pytest.mark.asyncio
async def test_audit_log_endpoint():
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin@acme.demo",
            password_hash=security.hash_password("Pass123!"),
            display_name="Alex Morgan",
            role=UserRole.MAIN_ADMIN,
        )
        session.add(admin)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_tok = (await client.post("/auth/login", json={"email": "admin@acme.demo", "password": "Pass123!"})).json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_tok}"}

        # Create a team
        team_res = await client.post(
            "/admin/teams",
            headers=headers,
            json={"name": "new_unit", "display_name": "New Unit", "color": "#123456"},
        )
        assert team_res.status_code == 201

        # Check audit log
        audit_res = await client.get("/admin/audit-logs", headers=headers)
        assert audit_res.status_code == 200
        logs = audit_res.json()
        assert len(logs) > 0
        actions = [l["action"] for l in logs]
        assert "TEAM_CREATED" in actions
