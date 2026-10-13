import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from app.core.config import Settings
from app.main import app


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["app"] == "Relay"
        assert "version" in data


@pytest.mark.asyncio
async def test_request_id_middleware():
    transport = ASGITransport(app=app)
    custom_req_id = "test-custom-request-id-12345"
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Pass custom ID
        response = await client.get("/health", headers={"X-Request-ID": custom_req_id})
        assert response.headers.get("X-Request-ID") == custom_req_id
        assert "X-Response-Time" in response.headers

        # Auto-generate when omitted
        response_auto = await client.get("/health")
        assert "X-Request-ID" in response_auto.headers
        assert len(response_auto.headers["X-Request-ID"]) > 0


def test_production_weak_secret_rejection():
    # In production with default secret -> must fail
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENV="production",
            SECRET_KEY="demo_dev_secret_key_change_in_production_min_32_chars",
        )
    assert "Production boot refused" in str(exc_info.value)

    # In production with too-short secret -> must fail
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENV="production",
            SECRET_KEY="too_short_secret",
        )
    assert "Production boot refused" in str(exc_info.value)

    # In production with strong secret >= 32 chars -> must pass
    valid = Settings(
        ENV="production",
        SECRET_KEY="strong_production_secret_key_with_proper_entropy_and_length",
    )
    assert valid.is_production is True
