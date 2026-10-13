import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import socketio
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.middleware import RequestContextMiddleware
from app.core.database import engine, Base, async_session_maker
from app.core.rate_limit import limiter
from app.routers import health, auth, users, teams, admin, conversations
from app.seed.initial_users import seed_initial_demo_users
from app.seed.seed_teams import seed_teams
from app.seed.seed_conversations import seed_conversations
from app.realtime.socket_manager import sio

settings = get_settings()
setup_logging(debug=settings.DEBUG)
logger = logging.getLogger("relay.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables in development if DB is connected
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        # Seed initial demo accounts, teams, and conversations
        async with async_session_maker() as session:
            await seed_teams(session)
            await seed_initial_demo_users(session)
            await seed_conversations(session)
    except Exception as exc:
        logger.warning(f"Database initialization/seed skipped on startup: {exc}")

    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Backend API for Relay team chat (Acme Labs demo)",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# Rate limiter setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Request context & tracing middleware
app.add_middleware(RequestContextMiddleware)

# Strict CORS Allowlist with exposed tracing headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(teams.router)
app.include_router(admin.router)
app.include_router(conversations.router)

# Mount Socket.IO realtime handler
socket_app = socketio.ASGIApp(sio, socketio_path="")
app.mount("/socket.io", socket_app)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "message": "Relay API is active",
        "docs": "/docs" if not settings.is_production else "disabled in production",
    }
