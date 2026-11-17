# Excellium Work Sphere

A production-style monorepo for the Excellium Global Services workspace. The visual language and workflow of the original portal have been preserved while the implementation is now a maintainable **React + Tailwind CSS** frontend and a modular **Express** backend.

## Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Lucide icons |
| Backend | Express 4, Zod validation, Helmet, CORS, rate limiting |
| Authentication | HttpOnly SameSite session cookie, Node `scrypt` password hashing |
| Workspace persistence | Normalized Supabase Postgres tables with typed entity columns |
| File storage | Private Supabase Storage bucket via server-only credentials |
| Local/test fallback | Atomic JSON adapter behind the same data-store interface |
| Tooling | npm workspaces, ESLint, Node test runner, Concurrently, Nodemon |

## Project structure

```text
.
├── client/                         # React single-page application
│   ├── src/
│   │   ├── api/                    # Typed-ish fetch client and API errors
│   │   ├── components/             # Feature and reusable UI components
│   │   ├── hooks/                  # Portal data/session orchestration
│   │   ├── styles/                 # Tailwind entry point + design tokens
│   │   └── utils/                  # View-model helpers and static UI data
│   ├── tailwind.config.js
│   └── vite.config.js              # Vite proxy for /api → Express
├── server/                         # Express REST API
│   ├── src/
│   │   ├── config/                 # Environment configuration
│   │   ├── data/                   # Seed and JSON store adapter
│   │   ├── middleware/             # Auth, validation, and error handling
│   │   ├── routes/                 # Domain-oriented API routes
│   │   ├── services/               # Sessions, auth, formatters, records
│   │   └── utils/                  # IDs and HTTP errors
│   └── test/                       # Isolated backend integration tests
├── supabase/migrations/            # Normalized Postgres schema + private bucket SQL
├── package.json                    # Workspace scripts
└── package-lock.json
```

## Prerequisites

- Node.js **20+**
- npm **10+**

## Install and run

```bash
npm install
npm run dev
```

This starts both applications:

| Service | URL |
| --- | --- |
| React + Vite frontend | http://localhost:5173 |
| Express API | http://localhost:4000 |

The Vite development server proxies browser requests from `/api/*` to Express, so the browser never calls `localhost:4000` directly.

### Individual services

```bash
# Express API only
npm start

# React frontend only
npm run dev --workspace client

# Express with automatic restarts
npm run dev --workspace server
```

For a production-style local run, build the React app first, then let Express serve the compiled SPA and API from one port:

```bash
npm run build
NODE_ENV=production npm start
# http://localhost:4000
```

## Demo accounts

All demo accounts use password **`password123`**.

| Role | Email |
| --- | --- |
| Employee | `john@excellium.com` |
| Trainer | `priya@excellium.com` |
| Management | `daniel@excellium.com` |
| Finance / Admin | `sara@excellium.com` |

The selected role must match the email address used to sign in.

## Quality checks

```bash
npm run build   # Production React build
npm test        # Express integration tests
npm run lint    # Client ESLint and server syntax checks
```

## API areas

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- Attendance: clock-in/out, breaks, activity events, corrections, team status
- Invoices: scoped listing, multipart submission, management approval/rejection, signed document URLs
- Meetings: scoped listing and scheduling
- Equipment: assets, multipart requests, management approvals, and signed attachment URLs
- Workspace: dashboard, directory, reports, notifications, profile, organization settings, audit log

All routes validate request data with Zod. Protected routes enforce role-based access on the server—not only in the React UI.

## Workspace persistence

With `PERSISTENCE_PROVIDER=supabase`, every domain workflow is stored in normalized Supabase Postgres tables with typed columns: users, attendance clock events and breaks, invoice amounts/statuses, meeting participants, equipment requests, assets, notification audiences/reads, settings, and audit entries. The first connected server start seeds an empty schema with the demo workspace; subsequent actions update the relevant typed rows. An existing legacy JSONB workspace is upgraded into these typed tables by the third migration before the server starts.

`PERSISTENCE_PROVIDER=json` remains available only as a local/test fallback. It writes `server/data/store.json`, which is ignored by Git.

## Environment configuration

Copy the example if you need to customise ports or origins:

```bash
cp server/.env.example server/.env
```

```env
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
SESSION_TTL_HOURS=8

# Use Supabase Postgres for all workspace records.
PERSISTENCE_PROVIDER=supabase

# Keep this server-only. Never expose it as a VITE_ variable.
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_replace_with_your_secret_key
SUPABASE_STORAGE_BUCKET=excellium-uploads
SUPABASE_UPLOAD_MAX_BYTES=10485760
SUPABASE_SIGNED_URL_TTL_SECONDS=300
```

## Supabase database and Storage setup

1. In Supabase, open the intended project and go to **Settings → API**.
2. Copy the **Project URL** into `SUPABASE_URL`.
3. Create or copy a **secret/server key** and set it as `SUPABASE_SECRET_KEY`. Legacy projects may instead use `SUPABASE_SERVICE_ROLE_KEY`; the server accepts either name.
4. In the Supabase **SQL Editor**, run these repository migrations in order:
   - `supabase/migrations/202611160001_create_excellium_workspace_schema.sql`
   - `supabase/migrations/202611160002_create_private_upload_bucket.sql`
   - `supabase/migrations/202611160003_migrate_legacy_jsonb_workspace.sql`
5. Copy `server/.env.example` to `server/.env`, fill in the values, and restart the Express server.

The first migration creates the locked-down, normalized Postgres tables that persist every portal workflow. The second creates the private `excellium-uploads` bucket. The third is safe on new installations; on older installations, it copies the retired JSONB workspace document into typed tables and deletes that document table. The application never sends the secret key to React. Express validates uploads in memory, stores valid files in owner-scoped paths, writes file metadata alongside the invoice/request record, and creates five-minute signed URLs only for the record owner or management.

| Upload | Accepted format | Default maximum |
| --- | --- | --- |
| Invoice document | PDF | 10 MB |
| Equipment attachment | PNG, JPEG, WebP | 10 MB |

`SUPABASE_UPLOAD_MAX_BYTES` and `SUPABASE_SIGNED_URL_TTL_SECONDS` can be adjusted as needed. In `PERSISTENCE_PROVIDER=supabase` mode, Express fails fast if the Supabase credentials or database migration are missing; it will not silently save work records locally.

> The migration files are idempotent where practical, but production deployments should run them through your normal reviewed migration pipeline rather than making manual schema changes.

## Production notes

The application persists operational data in normalized Supabase Postgres tables while keeping the existing domain API stable. For a larger deployment, add a shared session store, HTTPS cookies, CSRF protection, database backup/restore drills, and automated migration deployment.
