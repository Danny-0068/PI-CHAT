# Changes

## Summary (updated at end of every phase)
- **Current phase:** Phase 4 — Realtime Chat Core (Completed, pushed to GitHub)
- **Last updated:** 2026-10-13 09:56 IST (UTC+05:30)
- **Total entries:** 7
- **Open follow-ups:** Await user review & approval to begin Phase 5 (UI shell: dual-panel polish, DM ordering by recent interaction, presence, status mode, unread + seen indicators, search).

---

## Phase 4 — Realtime Chat Core

### [2026-10-13 09:42 IST (UTC+05:30)] feat: implement Socket.IO realtime chat core, WhatsApp-style history scoping, message deduplication, optimistic UI, and dual-panel workspace
- **Type:** feat
- **Phase:** Phase 4 — Realtime Chat Core
- **What:** Implemented the full realtime chat system across backend and frontend:
  - Backend models & migration: Added `Conversation` (types `DM`, `TEAM_GROUP`, `UPDATES`), `ConversationParticipant` (with `last_read_at`), and `Message` (with unique `client_id` deduplication index, `is_edited`, `is_deleted`, and self-referential `reply_to_id`), registered in migration `2026_10_13_0003_create_conversations_and_messages.py`.
  - WhatsApp-style historical window scoping: Implemented in `chat_service.py` where team members can only read messages sent during their active membership periods `[joined_at, left_at]`; Main-Admins retain global oversight across all team chats.
  - Realtime Socket.IO gateway & rooms: ASGI Socket.IO mounted at `/socket.io` with token decoding, active session tracking, conversation rooms (`conv_{id}`), direct user rooms (`user_{id}`), presence broadcasting (`user_presence`), and typing indicators (`typing_start` / `typing_stop`).
  - REST fallback & sync endpoints: `GET /conversations`, `POST /conversations/dm`, `GET /conversations/{id}/messages` (with limit/pagination), `POST /conversations/{id}/messages` (client_id deduplication), `PATCH /conversations/messages/{id}` (edit with `is_edited=True`), and `DELETE /conversations/messages/{id}` (tombstone with `is_deleted=True`).
  - Conversation seed data: Seeded `#updates` welcome announcements, team channels for all 5 departments, and 1:1 DM conversation between Alex Morgan and Sam Rivera.
  - Test suite: 5 comprehensive automated tests in `tests/test_chat_and_realtime.py` covering scoping, client_id network deduplication, editing, tombstone deletion, history windowing, and DM initialization (16 total tests passing).
  - Frontend client & store: Built `socket.ts` manager with automatic reconnection and room rejoining, plus Zustand `chatStore.ts` with optimistic UI sending, retry states, and real-time event listeners.
  - Dual-panel UI components:
    - `SidebarConversationsList.tsx`: Search bar, Channels list with department colors, DMs list with online dots, and "New DM" button.
    - `ChatArea.tsx` & `ChatHeader.tsx`: Channel badge, online status, broadcast/admin tags.
    - `MessageList.tsx` & `MessageItem.tsx`: Slack-style rows with avatars, names, timestamps, quoted replies, editing, tombstone deletions, and hover action bar.
    - `MessageInput.tsx`: Auto-resizing textarea, Enter to send / Shift+Enter for new line, reply banner, and typing indicator emission.
    - `NewDMModal.tsx`: Searchable teammate directory for starting 1:1 direct messages.
    - `DashboardShell.tsx`: Embedded dual-panel chat layout as the primary active view, with seamless switching to Teams directory and Security lab.
    - `TeamsAccordion.tsx`: Enabled clicking any team member to start a 1:1 DM.
- **Why:** Delivers §3.1 (text chat, editing, tombstone deletion, replies, history scoping, client-id deduplication, optimistic send), §3.2 (dual-panel Slack-style navigation), and §8 Phase 4 brief.
- **Files:**
  - `apps/api/app/models/conversation.py`
  - `apps/api/app/models/message.py`
  - `apps/api/app/models/__init__.py`
  - `apps/api/alembic/versions/2026_10_13_0003_create_conversations_and_messages.py`
  - `apps/api/app/schemas/chat.py`
  - `apps/api/app/services/chat_service.py`
  - `apps/api/app/routers/conversations.py`
  - `apps/api/app/realtime/socket_manager.py`
  - `apps/api/app/seed/seed_conversations.py`
  - `apps/api/app/seed/__main__.py`
  - `apps/api/app/main.py`
  - `apps/api/tests/test_chat_and_realtime.py`
  - `apps/web/src/lib/socket.ts`
  - `apps/web/src/store/chatStore.ts`
  - `apps/web/src/features/chat/ChatArea.tsx`
  - `apps/web/src/features/chat/ChatHeader.tsx`
  - `apps/web/src/features/chat/MessageList.tsx`
  - `apps/web/src/features/chat/MessageItem.tsx`
  - `apps/web/src/features/chat/MessageInput.tsx`
  - `apps/web/src/features/chat/SidebarConversationsList.tsx`
  - `apps/web/src/features/chat/NewDMModal.tsx`
  - `apps/web/src/features/dashboard/DashboardShell.tsx`
  - `apps/web/src/components/TeamsAccordion.tsx`
  - `apps/web/src/App.tsx`
  - `changes.md`
- **DB / deps:** Migration `2026_10_13_0003`. Tables: `conversations`, `conversation_participants`, `messages`. Python package: `python-socketio`. Frontend: `socket.io-client@4.8.1`.
- **Requested by:** Danny (via Masterprompt.md §8 Phase 4)
- **How to verify:**
  - Backend tests: `cd apps/api && uv run pytest` (16 passed in 10.6s).
  - Frontend build: `cd apps/web && npm run build` (built cleanly in 31.5s).
  - Seed CLI: `cd apps/api && uv run python -m app.seed --reset` (seeds teams, demo accounts, and conversations).
  - Web UI: Log in as "Try as Admin" or "Try as Employee", click channels (#updates, department channels) or DMs, send/edit/delete messages, and start new DMs.
- **Known gaps / follow-ups:** Phase 5 will implement UI shell polish (DM ordering by recent interaction, unread & seen indicators, status mode picker integrations, and global search).

---

## Phase 3 — Teams & Membership

### [2026-10-13 08:48 IST (UTC+05:30)] feat: implement teams, membership intervals, lead permissions, audit logging, and 3-tab admin drawer
- **Type:** feat
- **Phase:** Phase 3 — Teams & Membership
- **What:** Implemented complete team and membership system with historical windowing and admin controls:
  - Backend models & migration: Added `Team`, `TeamMembership` (with `joined_at` / `left_at` intervals where `left_at IS NULL` represents active membership, and `check_membership_at_time` helper for scoping message history), and `AuditLog` models, registered in migration `2026_10_13_0002_create_teams_and_audit_logs.py`.
  - Department seeds & CLI: Seeded the 5 required departments with distinctive colors (`team_ai` #6366F1, `team_legal` #10B981, `hr_admin` #8B5CF6, `seo` #F59E0B, `coordination` #06B6D4) and built `python -m app.seed --reset` CLI.
  - Team & Admin routers:
    - `GET /teams` & `GET /teams/{id}`: Team summaries with active member counts and lead names, plus detailed member rosters.
    - `PATCH /teams/{id}/limit`: Team Leads can adjust file size limits up to the 25 MB demo cap; Main-Admins have uncapped overrides.
    - `GET /admin/users`: User directory with active department tags and lead status.
    - `PATCH /admin/users/{id}`: Assign users to teams and toggle team lead status.
    - `POST /admin/users/{id}/force-logout`: Revoke all sessions for a user across devices.
    - `POST /admin/teams` & `PATCH /admin/teams/{id}`: Create and configure department tags.
    - `GET /admin/audit-logs`: Chronological log with filtering by action type.
  - Test suite resilience: Resolved in-memory SQLite connection isolation in `tests/conftest.py` using shared-cache URI `sqlite+aiosqlite:///file:testmemdb?mode=memory&cache=shared&uri=true`, ensuring 100% green test execution across all 11 backend tests.
  - Frontend UI components:
    - `teamStore.ts`: Zustand store for teams, details, active selections, and limit updates.
    - `TeamsAccordion.tsx`: Collapsible department list displaying color tags, member counts, lead badges, inline file limit slider (for leads/admins), and active member rosters.
    - `AdminDrawer.tsx`: Slide-over drawer with 3 tabs (Users, Teams, Audit Log), ESC key listener, and modal backdrop.
    - `UserManagementTab.tsx`: Roster table with team dropdown, lead toggle, force logout, and sudo-step-up password reset.
    - `TeamManagementTab.tsx`: Department cards with storage limit sliders and "New Team Tag" creation form.
    - `AuditLogTab.tsx`: Filterable event stream displaying actor, target, formatted JSON payload, and timestamps.
    - `DashboardShell.tsx`: Connected Admin Console trigger to navigation rail and top session bar.
- **Why:** Delivers core multi-team architecture (§3), WhatsApp-style historical scoping (§3.1), audit trail (§3.6), and storage controls (§3.4).
- **Files:**
  - `apps/api/app/models/team.py`
  - `apps/api/app/models/team_membership.py`
  - `apps/api/app/models/audit_log.py`
  - `apps/api/app/models/__init__.py`
  - `apps/api/alembic/versions/2026_10_13_0002_create_teams_and_audit_logs.py`
  - `apps/api/app/schemas/team.py`
  - `apps/api/app/schemas/admin.py`
  - `apps/api/app/services/team_service.py`
  - `apps/api/app/services/audit_service.py`
  - `apps/api/app/routers/teams.py`
  - `apps/api/app/routers/admin.py`
  - `apps/api/app/seed/seed_teams.py`
  - `apps/api/app/seed/__main__.py`
  - `apps/api/app/main.py`
  - `apps/api/tests/conftest.py`
  - `apps/api/tests/test_teams_and_admin.py`
  - `apps/web/src/store/teamStore.ts`
  - `apps/web/src/components/TeamsAccordion.tsx`
  - `apps/web/src/features/admin/UserManagementTab.tsx`
  - `apps/web/src/features/admin/TeamManagementTab.tsx`
  - `apps/web/src/features/admin/AuditLogTab.tsx`
  - `apps/web/src/features/admin/AdminDrawer.tsx`
  - `apps/web/src/features/dashboard/DashboardShell.tsx`
- **DB / deps:** Migration `2026_10_13_0002`. Tables: `teams`, `team_memberships`, `audit_logs`.
- **Requested by:** Danny (via Masterprompt.md §8 Phase 3)
- **How to verify:**
  - Backend tests: `cd apps/api && uv run pytest` (11 passed in 6.5s).
  - Frontend build: `cd apps/web && npm run build` (built cleanly in 6.9s).
  - Seed CLI: `cd apps/api && uv run python -m app.seed --reset` (seeds all 5 departments and demo accounts).
  - Admin Drawer: In the UI (`http://localhost:5173`), click "Admin Console" in the session bar or navigation rail to manage teams, users, and inspect audit logs.
- **Known gaps / follow-ups:** Phase 4 will implement realtime chat core (WebSocket gateway, heartbeat, Redis pub/sub, message persistence).

---

## Phase 2 — Auth & Users

### [2026-10-13 08:24 IST (UTC+05:30)] feat: implement Argon2 auth, rotating refresh tokens with reuse detection, sudo step-up, and demo login UI
- **Type:** feat
- **Phase:** Phase 2 — Auth & Users
- **What:** Implemented the full authentication and user management stack across backend and frontend:
  - Backend models & migration: Added `User` and `RefreshToken` SQLAlchemy models and Alembic migration `2026_10_13_0001` with family tracking, token hash indexing, and status/role enums.
  - Security & token rotation: Configured Argon2id hashing via `argon2-cffi`, 15-minute JWT access tokens (held strictly in memory), and 7-day rotating `httpOnly; Secure; SameSite` refresh cookies with token family reuse detection (revoking all sessions upon replay attack).
  - Sudo-mode step-up: Created `POST /auth/sudo` endpoint issuing short-lived (5 min) `sudo_token`s. Protected sensitive admin actions (creating another `MAIN_ADMIN` or resetting an admin's password) requiring valid `X-Sudo-Token`.
  - Rate limiting & seed: Added `slowapi` in-memory rate limiting to auth routes (`10/min` login, `20/min` demo login, `5/min` sudo) and automatic startup seeding for `admin@acme.demo` (*Alex Morgan*) and `employee@acme.demo` (*Sam Rivera*).
  - User management endpoints: `GET /users/me`, `PATCH /users/me/status`, `POST /users`, and `POST /users/{id}/reset-password` (generating temporary 12-char passwords and revoking active sessions).
  - Frontend auth UI: Built Zustand `authStore.ts` (in-memory token), `api.ts` with transparent refresh recovery on 401, `LoginPage.tsx` (with one-click "Try as Admin" and "Try as Employee" demo buttons, credential form, and demo banner), `SudoModal.tsx` in-app password confirmation, and `DashboardShell.tsx` featuring active user identity, presence status picker, and sudo step-up testing.
- **Why:** Delivers strict security baseline (§4), access model (§2), and demo-first one-click access (§0) without storing tokens in localStorage or using browser alerts.
- **Files:**
  - `apps/api/pyproject.toml`
  - `apps/api/app/models/user.py`
  - `apps/api/app/models/refresh_token.py`
  - `apps/api/app/models/__init__.py`
  - `apps/api/alembic/versions/2026_10_13_0001_create_users_and_refresh_tokens.py`
  - `apps/api/app/core/security.py`
  - `apps/api/app/core/rate_limit.py`
  - `apps/api/app/core/dependencies.py`
  - `apps/api/app/schemas/auth.py`
  - `apps/api/app/schemas/user.py`
  - `apps/api/app/services/auth_service.py`
  - `apps/api/app/routers/auth.py`
  - `apps/api/app/routers/users.py`
  - `apps/api/app/seed/initial_users.py`
  - `apps/api/app/main.py`
  - `apps/api/tests/test_auth.py`
  - `apps/web/src/store/authStore.ts`
  - `apps/web/src/lib/api.ts`
  - `apps/web/src/features/auth/LoginPage.tsx`
  - `apps/web/src/features/auth/SudoModal.tsx`
  - `apps/web/src/features/dashboard/DashboardShell.tsx`
  - `apps/web/src/App.tsx`
- **DB / deps:** Migration `2026_10_13_0001`. Python packages: `argon2-cffi@25.1.0`, `pyjwt@2.15.1`, `slowapi@0.1.10`, `email-validator@2.3.0`, `aiosqlite@0.22.1`.
- **Requested by:** Danny (via Masterprompt.md §8 Phase 2)
- **How to verify:**
  - Backend tests: `cd apps/api && uv run pytest` (7 passed in 4.7s).
  - Frontend build: `cd apps/web && npm run build` (built cleanly in 7.6s).
  - One-click demo login: click "Try as Admin" on `http://localhost:5173` to sign in instantly as Alex Morgan without typing credentials.
- **Known gaps / follow-ups:** Teams, channels, and membership windows will be introduced in Phase 3.

---

## Phase 1 — Foundation

### [2026-10-13 08:11 IST (UTC+05:30)] feat: scaffold monorepo, FastAPI backend, Vite React shell, design tokens, and Docker Compose
- **Type:** feat
- **Phase:** Phase 1 — Foundation
- **What:** Completed the foundational monorepo scaffold across backend, frontend, infrastructure, and CI:
  - Created root orchestration: `docker-compose.yml` (PostgreSQL 16, FastAPI backend, Vite/Nginx frontend), `.env.example`, `.env`, `.gitignore`, `README.md`, and `.github/workflows/ci.yml`.
  - Implemented FastAPI backend (`apps/api`): Pydantic v2 settings with production secret validation, structured JSON logging, `X-Request-ID` and timing middleware, SQLAlchemy 2.x async engine & sessionmaker, async Alembic migrations setup, `/health` and `/ready` probes, Dockerfile, and pytest suite.
  - Implemented React frontend (`apps/web`): Vite + React 18 + TypeScript, Tailwind CSS v3 with CSS variable design tokens implementing the 3-step surface depth ladder (Floor, Panel, Elevated), Muted Navy functional accent (`--accent`), status mode dots, dual first-class dark/light theme store (`themeStore.ts`), `ThemeToggle`, `HealthBadge`, foundation preview shell, Dockerfile, and Nginx SPA config.
- **Why:** Delivers the required Phase 1 infrastructure, security baseline, and design system without placeholder code, satisfying all architectural requirements from Masterprompt.md §1, §4, §5, §7, and §8.
- **Files:** `docker-compose.yml`, `.env.example`, `.env`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`, `apps/api/*`, `apps/web/*`
- **DB / deps:** Backend: `fastapi>=0.115`, `uvicorn>=0.32`, `pydantic>=2.9`, `pydantic-settings>=2.5`, `sqlalchemy>=2.0`, `asyncpg>=0.29`, `alembic>=1.13`, `httpx`, `pytest`. Frontend: `react@18.3.1`, `react-dom@18.3.1`, `zustand@5.0.3`, `lucide-react@0.475.0`, `tailwindcss@3.4.17`.
- **Requested by:** Danny (via Masterprompt.md §8 Phase 1)
- **How to verify:** Run `uv run pytest` in `apps/api` and `npm run build` in `apps/web`.
- **Known gaps / follow-ups:** Realtime Socket.IO and User models will be implemented in Phases 2 and 4.

### [2026-10-13 08:01 IST (UTC+05:30)] chore: initialize living changelog and repository baseline
- **Type:** chore
- **Phase:** Phase 1 — Foundation
- **What:** Created `changes.md` following Section 11 specifications to serve as the mandatory audit and decision trail for the project.
- **Why:** Every project change must be logged in reverse chronological order with exact timestamps, rationale, and touched files per Masterprompt guidelines.
- **Files:** `changes.md`
- **DB / deps:** none
- **Requested by:** Danny (via Masterprompt.md §11)
- **How to verify:** Inspect `changes.md` to confirm correct reverse-chronological template and metadata.
- **Known gaps / follow-ups:** Add implementation entries as monorepo, Docker, backend, and frontend are scaffolded.

---

## Ad-hoc

### [2026-10-13 09:56 IST (UTC+05:30)] chore: initialize remote and push codebase through Phase 4 to GitHub
- **Type:** chore
- **Phase:** Ad-hoc
- **What:** Configured remote `origin` pointing to `https://github.com/Danny-0068/PI-CHAT.git`, updated `.gitignore` with SQLite database patterns (`*.db`, `*.sqlite`, `*.sqlite3`), committed all tracked project assets spanning Phases 1 through 4, and pushed branch `main` to `origin/main`.
- **Why:** Secure remote backup and repository synchronization as requested by user.
- **Files:** `.gitignore`, `changes.md`
- **DB / deps:** none
- **Requested by:** Danny ("now add this project till phase-4 in github https://github.com/Danny-0068/PI-CHAT.git this is the link")
- **How to verify:** Inspect repository at `https://github.com/Danny-0068/PI-CHAT` to confirm branch `main` is published with all project code and changes.md.
- **Known gaps / follow-ups:** none

### [2026-10-13 09:44 IST (UTC+05:30)] feat: add one-click Windows batch launchers (start.bat and run.bat)
- **Type:** feat
- **Phase:** Ad-hoc
- **What:** Added `start.bat` and `run.bat` at the repository root to launch both the FastAPI backend (`uv run uvicorn app.main:app --reload --port 8000`) and the Vite React frontend (`npm run dev`) in separate titled command windows in one click, and automatically open `http://localhost:5173` in the default browser after a 3-second startup delay.
- **Why:** Eliminates the need to open separate terminal tabs and manually paste commands during local testing and development.
- **Files:** `start.bat`, `run.bat`
- **DB / deps:** none
- **Requested by:** Danny ("create bat file which runs both front and backend in one click so i dont have to keep opening terminal and paste commands understood ?")
- **How to verify:** Double-click `start.bat` or `run.bat` from File Explorer; confirm that the backend and frontend command windows launch and `http://localhost:5173` opens in the browser.
- **Known gaps / follow-ups:** none

