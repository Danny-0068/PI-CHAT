# ANTIGRAVITY MASTER PROMPT — "Relay" (Team Chat, Public Demo Edition)

> Paste this whole file into Antigravity as the project brief. Work **phase by phase**. After each phase: run it, summarize what changed, **update `changes.md`**, and **stop for my approval** before the next phase. Show only changed files when updating existing work.

---

## 0. What we're building

A self-hosted-style internal team chat (Slack-lite) with **admin-only user provisioning**, **team tags**, **role-based access**, **realtime text chat**, **file sharing**, and a **clean dual-panel UI**. This is a **portfolio demo** (resume project), publicly deployed, with **fictional seed data only**.

- Fictional company: **"Acme Labs"**. No real company names, people, logos, domains, or data anywhere.
- App name placeholder: **Relay** (I may rename it; keep it in one config constant).
- Fresh codebase, written from scratch. Generic naming throughout.

### Demo-first requirements (this is NOT a private VPS deployment)
1. **One-click demo login**: landing/login page has "Try as Admin" and "Try as Employee" buttons that log in with seeded demo accounts (no typing credentials). Normal email/password login still exists below it.
2. **Seed script** creates a realistic fictional org (see §6) and can **reset the demo DB** on a schedule (nightly) or via a protected endpoint.
3. **Demo guardrails**: small upload limit (5 MB), rate limits, message length cap, profanity-safe seed, banner "Demo environment — data resets daily".
4. **Public-safe**: no secrets in repo, `.env.example` only, no real SMTP/third-party keys required.
5. Must run locally with **one command** (`docker compose up`) and deploy to **free-tier hosting** (see §9).

---

## 1. Tech stack (locked)

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript, Tailwind CSS, Zustand (state), React Router |
| Backend | FastAPI (Python 3.11+), SQLAlchemy 2.x, Alembic migrations, Pydantic v2 |
| Realtime | Socket.IO (python-socketio ASGI, `socket.io-client` on frontend) |
| DB | PostgreSQL |
| Auth | Access token (short-lived, 15 min) + refresh token (rotating, httpOnly cookie, revocable, stored hashed in DB) |
| Passwords | argon2 or bcrypt hashing; reset-only (never retrievable) |
| Files | Storage abstraction (`LocalStorage` + `S3Storage`, S3-compatible e.g. Cloudflare R2) |
| Desktop (later phase) | Electron wrapper, packaged to Windows `.exe` |
| Tests | pytest (backend), Vitest + Playwright smoke (frontend) |
| CI | GitHub Actions: lint + test + build |

Architecture rule: **keep the frontend a pure SPA talking to the API/Socket.IO via env-configured base URL**, so wrapping it in Electron later needs zero refactor.

---

## 2. Roles & access model (keep it simple)

Two **system roles** only:
- **Main-Admin** (the top account): creates users, resets passwords, assigns team tags/leads, manages teams, overrides limits. Also chats like a normal user (appears in sidebars, can DM, can read **every** team group chat regardless of own team).
- **Employee**: normal user.

Rules:
- **No self-registration.** Only Main-Admin creates accounts.
- Multiple Main-Admins allowed (backup access). Creating another Main-Admin or resetting a Main-Admin's password requires **sudo-mode step-up**: re-enter the acting admin's password.
- **Teams are tags, not roles.** Seed teams: `team_ai`, `team_legal`, `hr_admin`, `seo`, `coordination`. (`hr_admin` is just a team tag.) Empty by default; admin assigns.
- Each employee belongs to **one team or none**.
- **Team Lead** is a per-team flag (multiple leads per team allowed). Leads can raise **their own team's** file-size limit; Main-Admin can override any team's limit. Main-Admin can assign/change lead status via edit-user.
- Password reset flow: Main-Admin generates a **brand-new** password for the user (shown once). Original is never retrievable. Force change on next login (optional toggle).

---

## 3. Core features

### 3.1 Chat
- **Text only.** No voice/video.
- **1:1 DMs** and **one group chat per team tag**, plus an **#updates** channel (see 3.6).
- Edit and delete **own** messages (show "edited" label; deleted = tombstone).
- **Reply-to** (quoted preview, click to jump + highlight original) and **emoji reactions** on every message (own and others', in DMs, teams, channels), WhatsApp-style hover/long-press actions.
- **Unread badges** + **"Seen" indicator** on DMs (not just unread counts).
- Typing indicator, online/offline presence.
- **Team history scoping (WhatsApp-style)**: a member added to a team can only see messages sent **during their membership window**. Removed/reassigned members lose access to messages after removal and keep only what was sent while they were members. Store `joined_at` / `left_at` membership periods and enforce in queries (not just UI).
- Message pagination (infinite scroll upward), optimistic send, resend on reconnect, no duplicates (client-generated message IDs).

### 3.2 Sidebar / navigation (dual-panel, Slack-style)
- **Panel 1 — Icon rail** (neutral, non-colored icons): Home/DMs, Teams, Updates, Files, Settings, profile avatar with status.
- **Panel 2 — List panel**: 
  - **Teams directory as accordion**: all teams listed; expand a team to see members; clicking a member's name opens/starts a DM.
  - **DM list**: every other user (not self), ordered by **most recent interaction**, with unread/seen indicators.
  - Search box filters people/teams.
- Main-Admin sees all teams' group chats in the sidebar.

### 3.3 Status mode
Each user sets status: **green = available, yellow = busy/away, red = do-not-disturb**. Shown on avatars everywhere. Red suppresses notifications (except @mentions from admin, configurable). Optional custom text.

### 3.4 File sharing
- Any file type. Per-file limit: **demo default 5 MB** (configurable via env; "production" default 500 MB documented in README).
- Team-level limit overrides (lead raises own team's; Main-Admin overrides any).
- Scanning: define a `FileScanner` interface. Implement `NoopScanner` (demo default) and `ClamAVScanner` (docker compose profile `scan`, optional). Quarantine state: `pending → clean/infected`; infected files are never downloadable.
- Block path traversal, sanitize filenames, store by random ID, serve via authenticated download endpoint with membership check (same history-window rules as messages).
- Image preview, file card with icon/size.

### 3.5 Admin panel (Main-Admin only)
- User management: create, edit, deactivate/reactivate, assign team, toggle lead, reset password (with sudo-mode where required), force logout all sessions.
- Team management: create/rename teams, set team file limit, set team color.
- Native-looking in-app dialogs/modals everywhere (**no** `window.alert/confirm/prompt`).
- Audit log (who did what, when) viewable in admin panel.

### 3.6 #updates channel + Team Updates panel
- **#updates** channel where team members/leads post daily updates.
- **Scheduled reminder**: Main-Admin sets a time (e.g. 6:00 PM) via an alarm-clock-style time picker; at that time **all users** (not just leads) get a reminder notification. Store timezone with the schedule.
- **Team Updates panel** (Main-Admin only, left side): a **manual** (non-auto-rotating) carousel, **one card per team**, including teams with no update yet (placeholder "No updates").
  - Card: light team-tinted background, header = author name + team, relative timestamp (today/yesterday formatting matching message dates), body clamped to **2 lines** with Show more / Show less.
  - Click-through jumps to and highlights the source message in #updates.
  - Persistent counter **"X/Y teams posted"** + dot indicators (filled = posted, hollow = missing).

### 3.7 Notifications
- In-app toasts + unread counts.
- Browser Notification API for web demo.
- Electron phase upgrades this to **native desktop notifications with inline reply**.

### 3.8 Always-on quick widget (Electron phase only)
Small bottom-right widget living in the **system tray**, persistent after main window closes until logout. Shows group chats, DMs, announcements; top search bar to find an employee and send a quick message.

### 3.9 Session behavior
- Web: refresh-token cookie keeps session; auto-refresh on 401; explicit logout revokes refresh token.
- Desktop: persistent auto-login (secure storage), logs out **only** on manual logout.

---

## 4. Security baseline (implement from phase 1, not as an afterthought)

- Access token 15 min; refresh token 7 days, **rotating, hashed in DB, revocable**; reuse detection revokes the family.
- Tokens: access in memory, refresh in `httpOnly; Secure; SameSite` cookie. **No tokens in localStorage.**
- **CORS**: explicit allowlist from env. No `*` with credentials.
- CSRF protection for cookie-auth endpoints (double-submit or SameSite+origin check).
- Rate limiting on login, refresh, upload, message send (slowapi or Redis-less in-memory fine for demo).
- Input validation everywhere (Pydantic), output escaping (no `dangerouslySetInnerHTML`), message length caps.
- Authorization checks **server-side** on every REST route and every Socket.IO event/room join.
- Security headers (CSP, HSTS in prod, X-Content-Type-Options, frame-ancestors).
- Startup validation: refuse to boot in prod mode with default/weak `SECRET_KEY`.
- Structured logging (JSON), request IDs, `/health` and `/ready` endpoints.
- Alembic migrations from day one; no `create_all` in prod.

---

## 5. Design system (fresh — do NOT reuse any earlier design)

**Direction: "monochrome professional."** Clean, restrained, tech-company feel.

- **Base**: pure grayscale (black/white/neutral grays). Dark and light themes are **equally first-class**, toggle in settings + respect `prefers-color-scheme`.
- **One muted accent** (choose **navy** or **burgundy**, expose as a single CSS variable `--accent`), used **only** for functional states: unread badge, active item, links, focus ring. Not for decoration.
- **Surfaces**: 3-step depth ladder (floor / panel / elevated) so backgrounds never look flat or pale.
- **Icon rail**: neutral, uncolored icons.
- **Typography**: clean sans-serif (Inter or system UI stack). **No serif / law-firm lettering.** Monospace only for code/file names.
- **Messages**: compact Slack-style rows (avatar, name, time, text), grouped consecutive messages, hover action bar (react / reply / edit / delete).
- **Status colors** (red/yellow/green) are the only saturated colors in the UI; keep them consistent and accessible (not color-only: add shape/tooltip).
- **Team identity**: subtle per-team tint used sparingly (cards, small tag chips), never as primary UI color.
- Implement as **design tokens** (CSS variables + Tailwind theme extension) in one file; no hardcoded colors in components.
- Accessibility: WCAG AA contrast, visible focus states, keyboard navigation, reduced-motion support.
- Responsive: desktop-first, usable on tablet/mobile (list panel becomes drawer).

---

## 6. Seed data (fictional "Acme Labs")

- 1 Main-Admin: `admin@acme.demo` (display name "Alex Morgan")
- 2 more users flagged as demo logins: `employee@acme.demo` ("Sam Rivera", team_ai)
- ~12 additional fictional employees across the 5 teams, a couple marked team leads, a few with no team
- Pre-generated conversations: several DMs, each team group chat with realistic back-and-forth, reactions, replies, an edited message, a deleted message, a couple of file attachments (tiny generated sample files)
- #updates with posts from most teams (leave 1–2 teams missing so the "X/Y teams posted" counter looks real)
- Mixed statuses (green/yellow/red), some unread, some "seen"
- Seed must be **idempotent** and re-runnable (`python -m app.seed --reset`)
- Demo passwords documented in README only for demo accounts

---

## 7. Repo structure

```
relay/
├── apps/
│   ├── api/            # FastAPI
│   │   ├── app/{core,models,schemas,routers,services,realtime,storage,seed}/
│   │   ├── alembic/
│   │   └── tests/
│   ├── web/            # React + Vite + TS
│   │   └── src/{app,components,features,hooks,lib,store,styles}/
│   └── desktop/        # Electron (phase 9)
├── docker-compose.yml
├── .github/workflows/ci.yml
├── .env.example
├── changes.md          # living change log (see §11) — updated on EVERY change
├── docs/{architecture.md, api.md, screenshots/}
├── LICENSE (MIT)
└── README.md
```

---

## 8. Phased build plan (stop after each phase for my approval)

1. **Foundation** — monorepo scaffold, create `changes.md` (see §11), docker compose (api + web + postgres), Alembic setup, config/env validation, health endpoints, CI skeleton, design tokens + theme toggle shell.
2. **Auth & users** — models, argon2, access+refresh rotation, login/logout, admin-created users, roles, sudo-mode step-up, rate limiting, one-click demo login.
3. **Teams & membership** — teams, tags, leads, membership windows (`joined_at/left_at`), admin panel for users/teams, audit log.
4. **Realtime chat core** — Socket.IO auth, rooms, DMs + team groups, send/edit/delete, pagination, optimistic UI, dedupe by client ID, reconnect handling, history-window enforcement.
5. **UI shell** — dual-panel layout, teams accordion, DM ordering by recent interaction, presence, status mode, unread + seen indicators, search.
6. **Replies & reactions** — hover action bar, quoted reply w/ jump-and-highlight, emoji reactions.
7. **Files** — storage abstraction, limits (global/team/lead/admin override), scanner interface, previews, authenticated downloads.
8. **#updates + Team Updates panel + scheduled reminders** — alarm-clock picker, scheduler (APScheduler), carousel, X/Y counter.
9. **Notifications & polish** — browser notifications, reminders, empty states, loading skeletons, error boundaries, a11y pass, responsive pass.
10. **Hardening & tests** — security checklist verification, pytest coverage on auth/permissions/history-window, Playwright smoke (login → send → react → reply → upload), `SECURITY.md`.
11. **Public deploy** — see §9. Seed, nightly reset, demo banner.
12. **Electron desktop (stretch)** — wrap web build, tray, persistent auto-login, native notifications with inline reply, quick widget, installer via electron-builder, attach `.exe` to a GitHub Release pointing at the hosted demo API.
13. **Resume polish** — README, architecture diagram, screenshots/GIF, demo link, docs.

---

## 9. Deployment (public demo, free-tier friendly)

- **API + Socket.IO**: Render / Railway / Fly.io (must support long-lived WebSockets; document cold-start behavior and add a "waking up server…" UI state).
- **Frontend**: Vercel / Netlify / Cloudflare Pages (env `VITE_API_URL`).
- **Postgres**: Neon or Supabase free tier.
- **File storage**: Cloudflare R2 (S3-compatible) or ephemeral local disk (acceptable since demo resets).
- Provide `render.yaml` (or equivalent), `docker-compose.yml` for local, and a step-by-step `docs/deploy.md`.
- Cross-site cookie config must be correct (SameSite/Secure + CORS allowlist) — document it.
- Nightly demo reset via scheduler or cron-hit endpoint protected by a secret.

---

## 10. README requirements (this is what recruiters read)

- One-line pitch + **live demo link** + demo credentials/one-click login note
- Screenshots / short GIF (light + dark)
- Feature list (grouped)
- **Architecture diagram** (Mermaid) + key design decisions:
  - why Socket.IO + FastAPI
  - membership-window history scoping
  - refresh-token rotation w/ reuse detection
  - storage + scanner abstractions
  - Electron-ready SPA design
- Tech stack table
- Local setup in ≤5 commands
- Security notes, testing instructions, roadmap
- Honest "Demo limitations" section
- "Development log" section linking to `changes.md`

---

## 11. Change log — `changes.md` (mandatory, living document)

Create `changes.md` at the repo root in **Phase 1** and keep it updated for **every** change you make: feature, fix, refactor, dependency, config, schema/migration, design/token tweak, doc edit, deletion. **No change is complete until its `changes.md` entry is written.** Update it in the same commit as the change.

**Rules**
- **Newest entry on top** (reverse-chronological). Never delete or rewrite old entries; if something is reversed, add a new entry that references the old one.
- Every entry has a **date and timestamp** in ISO 8601 with timezone, e.g. `2026-10-13 14:32 IST (UTC+05:30)`. Use the real current time from the system clock, never invented or rounded placeholder times.
- Every entry explains **what** changed, **why** it was done, and **which files** were touched. The "why" is required, not optional.
- Group entries under their phase heading. Entries made outside a phase (hotfixes, my ad-hoc requests) go under `## Ad-hoc`.
- Keep entries concise and factual. No marketing language.
- If a change affects the DB, record the Alembic migration ID. If it adds a dependency, record the package, version, and reason.
- If something was attempted and **rejected or rolled back**, log it too, with the reason.
- If I asked for the change, quote my request in one short line under `Requested by`. If you decided it yourself, write `Requested by: Antigravity (self-initiated)` and justify it. Anything self-initiated beyond this brief needs my approval first (see §12).

**Entry template**

```
### [YYYY-MM-DD HH:MM TZ] <type>: <short title>
- **Type:** feat | fix | refactor | security | design | db | deps | config | docs | test | chore | revert
- **Phase:** <phase number and name, or Ad-hoc>
- **What:** <what was added/changed/removed, in 1-3 lines>
- **Why:** <the reason or problem this solves>
- **Files:** <paths added / modified / deleted>
- **DB / deps:** <migration ID, package@version, or "none">
- **Requested by:** <my request in one line, or Antigravity (self-initiated)>
- **How to verify:** <what to run or click to confirm it works>
- **Known gaps / follow-ups:** <anything incomplete, or "none">
```

**File layout**
```
# Changes

## Summary (updated at end of every phase)
- Current phase, last updated timestamp, total entries, open follow-ups

## Phase N — <name>
### [timestamp] type: title
...

## Ad-hoc
...
```

**Phase-end checklist** (do this before asking for my approval): changes.md has an entry for every change in the phase, timestamps are real, the Summary block is refreshed, and open follow-ups are listed.

**README link:** the README must link to `changes.md` in a "Development log" section so recruiters can see the build history and decision trail.

---

## 12. Rules for you (Antigravity)

- Ask me before adding libraries not listed here.
- No placeholder/fake implementations passed off as done; mark TODOs explicitly.
- Every phase ends with: how to run it, what to click to verify, known gaps, **and an up-to-date `changes.md`**.
- **Never make a change without logging it in `changes.md` (what, why, files, real date + timestamp).**
- Enforce permissions **server-side**; never trust the client.
- Don't add features not in this brief without asking.
- Keep commits small with conventional messages (`feat:`, `fix:`, `chore:`).
- Never commit secrets, real company names, or real personal data.
- `changes.md` must also never contain secrets, real company names, or real personal data.

**Start with Phase 1 only.**