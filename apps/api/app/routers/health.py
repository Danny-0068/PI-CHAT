import time
import logging
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.core.database import get_db

router = APIRouter(tags=["Health"])
logger = logging.getLogger("relay.health")
settings = get_settings()


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Liveness probe to confirm API server is running."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "env": settings.ENV,
        "version": "0.1.0",
    }


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness probe to check backend and database connectivity."""
    start_time = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "status": "ready",
            "app": settings.APP_NAME,
            "database": {
                "status": "connected",
                "latency_ms": latency_ms,
            },
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(f"Database readiness check failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "app": settings.APP_NAME,
                "database": {
                    "status": "disconnected",
                    "error": "Database connection failed",
                    "latency_ms": latency_ms,
                },
            },
        )
