# Excellium Work Sphere

A self-contained full-stack demo for the Excellium Global Services portal. The original single-page interface remains in `Excellium Global Services frontend.html`; `server.mjs` now serves it and provides a session-protected REST API for its core workflows.

## Run locally

**Requires Node.js 20+** (Node 22 is supported). There are no third-party runtime dependencies.

```bash
npm start
# Open http://localhost:3000
```

For automatic restarts during backend work:

```bash
npm run dev
```

The server listens on `0.0.0.0` by default and honours `PORT` and `HOST` environment variables:

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

## Demo accounts

All seeded demo accounts use password **`password123`**.

| Role | Email |
| --- | --- |
| Employee | `john@excellium.com` |
| Trainer | `priya@excellium.com` |
| Management | `daniel@excellium.com` |
| Finance / Admin | `sara@excellium.com` |

The role selector in the UI fills these accounts automatically. Authentication uses a session cookie and the selected role must match the account's real role.

## Backend design

### Runtime components

- **Static UI:** `Excellium Global Services frontend.html` is served at `/`.
- **HTTP API:** `server.mjs` uses Node's standard `http`, `crypto`, and `fs` modules. This keeps the demo portable and avoids a build step.
- **Data store:** `backend/seed.mjs` defines the committed seed data. On the first start, the server creates `data/store.json` and performs atomic writes after every mutation.
- **Authentication:** passwords are checked with Node's `scrypt` and `timingSafeEqual`; successful sign-ins receive an 8-hour, HttpOnly, SameSite=Lax session cookie. Sessions stay in server memory by design, so restarting the server ends active sessions.
- **Authorization:** employee/trainer records are scoped to the signed-in account. Management and finance/admin roles can see team records and make invoice/equipment decisions. Organization settings and audit logs are admin-only.
- **Auditability:** approval, attendance, meeting, equipment, and profile events are appended to an audit log. Relevant people are notified through the notification feed.

> `data/store.json` is intentionally ignored: it contains local mutable demo data and password hashes. Delete it to reset the application to the committed seed.

### API summary

All endpoints except health and login require the session cookie (or an `Authorization: Bearer <session>` header for API clients). Request and response payloads are JSON.

| Area | Routes |
| --- | --- |
| Health and auth | `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` |
| Dashboard | `GET /api/dashboard` |
| Attendance | `GET /api/attendance`, `GET /api/attendance/team`, `POST /api/attendance/clock-in`, `POST /api/attendance/clock-out`, `POST /api/attendance/break`, `POST /api/attendance/activity`, `POST /api/attendance/corrections` |
| Invoices | `GET/POST /api/invoices`, `PATCH /api/invoices/:id` |
| Meetings | `GET/POST /api/meetings` |
| Equipment | `GET /api/equipment`, `GET/POST /api/equipment/requests`, `PATCH /api/equipment/requests/:id` |
| People and reports | `GET /api/directory`, `GET /api/reports?type=Attendance` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/read` |
| Settings and audit | `GET /api/settings`, `PATCH /api/settings/profile`, `PATCH /api/settings/organization`, `GET /api/audit-log` |

### Example sign-in request

```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"john@excellium.com","password":"password123","role":"employee"}'
```

### Example approval request

Use the `Set-Cookie` value returned at login:

```bash
curl -X PATCH http://localhost:3000/api/invoices/INV-1050 \
  -H 'Content-Type: application/json' \
  -H 'Cookie: excellium_session=YOUR_SESSION_TOKEN' \
  -d '{"status":"Approved"}'
```

## Frontend integration

The frontend sign-in, hydration, attendance clock controls, attendance-correction modal, invoice submission/approval, meetings, equipment requests/approval, notifications, and sign-out now call the API. Existing dashboard visualizations that use seed/demo metrics remain intentionally lightweight, while workflow records are persisted by the backend.

## Validation

```bash
npm test
```

The test suite starts isolated instances against temporary data stores. It verifies static delivery, sign-in, role enforcement, clock-in, invoice submission, approval, and persistence of that workflow.

## Production hardening notes

This is a demo backend, not a production deployment template. Before production, move the JSON adapter to a transactional database, persist/rotate session state in a secure shared store, add CSRF protection and rate limiting, send cookies with `Secure` behind HTTPS, add file storage plus malware scanning for uploads, centralize authorization policy, and run database migrations/backups under operational controls.
