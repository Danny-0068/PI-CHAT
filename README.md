# Relay — Internal Team Chat (Public Demo Edition)

> A modern, self-hosted-style team chat platform built for **Acme Labs** featuring role-based access, team tags, membership-window history scoping, realtime chat, and file sharing.

---

## Tech Stack

| Layer | Choice |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS v3, Zustand |
| **Backend** | FastAPI (Python 3.11+), SQLAlchemy 2.x, Alembic, Pydantic v2 |
| **Realtime** | Socket.IO (python-socketio ASGI, socket.io-client) |
| **Database** | PostgreSQL 16 |
| **Package Managers** | `npm` (Frontend), `uv` (Backend) |
| **Containerization** | Docker Compose |

---

## Architecture Overview

Relay is built as a pure SPA frontend communicating with a modular FastAPI backend via environment-configured REST and Socket.IO endpoints. This structure allows seamless wrapping into Electron without architectural refactoring.

- **Design System:** "Monochrome professional" with a 3-step surface depth ladder (Floor, Panel, Elevated), dual dark/light themes, and a functional Muted Navy accent (`--accent`).
- **Security Baseline:** HttpOnly rotating refresh tokens, in-memory short-lived access tokens, strict CORS allowlist, and server-side authorization on all routes.

---

## Local Development (Quick Start)

### 1. Using Docker Compose (Full Stack)
```bash
docker compose up --build
```
- Web App: `http://localhost:5173`
- API & Docs: `http://localhost:8000/docs`
- Health Probe: `http://localhost:8000/health`

### 2. Running Locally Outside Docker

#### Backend (`apps/api`)
```bash
cd apps/api
uv venv
uv pip install -e .
uv run uvicorn app.main:app --reload --port 8000
```

#### Frontend (`apps/web`)
```bash
cd apps/web
npm install
npm run dev
```

---

## Development Log

All architectural decisions, schema changes, and implementation steps are documented in real-time in the living change log:
👉 **[`changes.md`](./changes.md)**
