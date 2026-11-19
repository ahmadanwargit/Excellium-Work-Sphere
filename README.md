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
├── shared/access-control.mjs       # Shared base-role permission policy
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

## Deploy to Vercel

Import the **repository root**, not the `client/` directory. The committed `vercel.json` configures the Vite build (`npm ci`, `npm run build`, output `client/dist`), a Node function at `api/index.js` for `/api/*`, and a fallback to `index.html` for frontend routes. All browser API calls remain same-origin; no separately hosted backend or localhost URL is needed.

Before deploying:

1. Apply all migrations listed below, including `202611170002_add_portal_workflows.sql`, **before deploying this API version**. The workflow migration adds roles, departments, leave requests, invoice items and profile fields; an older database schema cannot serve the new API.
2. Set these **server-only** Vercel environment variables for the environments you deploy:
   - `PERSISTENCE_PROVIDER=supabase`
   - `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` (mark the key **Sensitive**)
   - `SUPABASE_STORAGE_BUCKET=excellium-uploads`
   - `CLIENT_ORIGIN=https://<your-production-domain>`
3. Choose the intended source branch in Vercel. For ongoing production deployments, also select that branch under **Project Settings → Environments → Production → Branch Tracking**. A one-off production deployment from another branch does not change this setting.
4. Deploy, then check `/api/health`, sign-in, authenticated requests, and sign-out.

The Vercel handler never opens a listening port or writes a JSON store to the read-only filesystem. Every invocation loads a fresh Supabase workspace snapshot. Sessions are shared in the RLS-protected `excellium_auth_sessions` table, so sign-in survives cold starts and sign-out revokes the session across instances. Only SHA-256 token hashes are stored. Secure HttpOnly cookies are used in production; no Supabase key belongs in a `VITE_` variable or in Git.

The default authentication rate limit is per function instance. For higher-traffic deployments, use a distributed rate-limit store and periodically remove expired rows from `excellium_auth_sessions` through a reviewed database maintenance job. Vercel's function request-size limit also applies to multipart uploads even if `SUPABASE_UPLOAD_MAX_BYTES` is configured higher.

## Portal workflows

The existing visual language, invoice editor/PDFs, activity tracking, directory and read-only rankings remain in place. Workspaces now have distinct role-specific navigation, dashboards and action controls.

### Role-specific workspaces

| Capability | Employee | Trainer | Management | Administrator |
| --- | --- | --- | --- | --- |
| Own attendance, leave, invoices and equipment requests | Yes | Yes | No | No |
| Invited meetings and own profile | Yes | Yes | Yes | Yes |
| Request training sessions | No | Yes, pending confirmation | Schedule / confirm | Schedule / confirm |
| Review staff leave, invoices and equipment requests | No | No | Employee / trainer requests | All managed requests |
| Create and manage profiles | No | No | Employee / trainer roles only | All roles |
| Departments, team attendance, inventory and workforce reports | No | No | Yes | Yes |
| Role creation, privileged assignments, organization settings and audit trail | No | No | No | Yes |

Management and administrators see grouped **People & access**, **Review & approvals**, **Operations** and **Insights & administration** sidebar sections rather than employee self-service controls. Daniel's Management account can review both employee and trainer leave and can create employee profiles; Sara's Administrator account additionally has **Roles & permissions**, **Organization settings** and **Audit trail**.

`shared/access-control.mjs` is the permission policy used by React navigation and Express guards. The stored base role, not a browser-selected category or custom display name, determines access. Individual record ownership/scope is also checked on the server. Managers cannot administer peers or administrators, and nobody can approve their own historical requests.

`GET /api/portal` returns one role-scoped workspace snapshot. The client refreshes on navigation, focus/visibility return and every 30 seconds while visible; the shell also has **Refresh**, pending-review badges and a persistent synchronization-error notice. A newly submitted request appears in a manager's already-open queue without signing out. A stored role change replaces both the visible navigation and data on the next refresh. Privileged deep links fall back to the user's own overview. No new database migration is needed for this authorization/UI correction; the previously deployed workflow migration remains required on a fresh installation.

### Invoice preparation

Employees and trainers can open **My invoices → Prepare invoice**, add up to 50 line items (description, quantity and unit rate), choose USD/PKR/GBP/EUR/AED, and set tax, payment details, notes and an optional due date. Totals are recalculated on the server; a submitted client total cannot override the calculation. A supporting PDF upload is optional.

**Save draft** keeps the invoice private to its owner and editable. **Submit for approval** moves it to Pending; management/admin can then approve or reject it. Only the owner can edit or submit a Draft, and only Pending invoices can be decided. **View**, **PDF** and existing signed attachment access are available according to the same record permissions. PDFs are generated from saved data, including for legacy amount-only invoices.

### Leave applications

Employees and trainers can open **My leave → Apply for leave**, choose Annual/Sick/Casual/Unpaid, select inclusive dates and enter a reason. Requests cover 1–366 calendar days; overlapping Pending or Approved requests are rejected. An employee can withdraw their own Pending request.

Management and administrators open **Leave approvals** to review employee and trainer applications. This is an approval queue, not a personal application form; it defaults to Pending with searchable reasons and a status filter for history. Rejection requires a reason. Staff see only their own applications and receive portal notifications for decisions. Approved leave contributes to live team attendance and the dashboard's current on-leave count. This workflow does not calculate statutory leave balances, eligibility or payroll deductions.

### Management-created employee profiles, roles and departments

Sign in through **Admin / Management** and open **Employee profiles**. Management can provision employee / trainer accounts; an administrator can provision all base roles:

1. Use **Departments → Create department** if needed. Full administrators can also open **Roles & permissions → Create role** for a named permission preset.
2. Use **Create employee profile** to enter name, work email, job title, role, department, optional phone/start date and an initial password of at least 10 characters.
3. Share that password securely with the employee; credentials are hashed with a random salt and are never returned by the API or sent by email.
4. The employee can immediately sign in using **Employee / Trainer** or **Admin / Management**, as shown in the creation form for the selected role.
5. Use **Edit profile** to update assignments/profile details, set a new password or deactivate an account. Deactivation blocks both new logins and authenticated requests from existing sessions. Administrators cannot deactivate/demote their own account, and the last active administrator is protected.

A custom role is a named preset inheriting one of the existing `employee`, `trainer`, `manager` or `admin` permission levels—not an arbitrary new permission system. Custom names appear in profiles and the directory; server authorization and the two sign-in categories continue to use the assigned base permission level. Creating a role cannot bypass the shared base-role permission policy, including management restrictions on privileged assignments.

## Demo accounts

All demo accounts use password **`password123`**.

| Sign-in category | Demo accounts |
| --- | --- |
| Employee / Trainer | `john@excellium.com` (Employee), `priya@excellium.com` (Trainer) |
| Admin / Management | `daniel@excellium.com` (Management), `sara@excellium.com` (Finance / Admin) |

The selected sign-in category must match the account's saved role. The two category cards do not grant access. Demo-role buttons prefill John, Priya, Daniel or Sara; the management category defaults to Sara for full administrator access.

## Quality checks

```bash
npm run build   # Production React build
npm test        # Express integration + embedded PostgreSQL migration/persistence tests
npm run lint    # Client ESLint and server syntax checks
```

Optional browser workflow checks:

```bash
npm exec --workspace client -- playwright install --with-deps chromium
npm run test:e2e --workspace client
```

The browser suite builds the client and starts Express on port 4173 with a disposable local JSON store; it never writes to a configured Supabase project. It covers invoice draft/edit/submit/PDF/approval, all four role-specific sidebars, responsive/mobile navigation, deep-link access guards, employee/trainer leave decisions by Daniel and Sara, focus and 30-second queue refresh, role/department/profile creation by authorized management, new-user sign-in/category rejection, trainer session confirmation, profile editing and deactivation. The backend tests run without a remote database; PGlite executes the real SQL migrations and normalized-store reads/writes in embedded PostgreSQL. To use a preinstalled browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (and optionally `PLAYWRIGHT_CHROMIUM_ARGS` as a JSON array).

## API areas

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- Attendance: clock-in/out, breaks, activity events, corrections, team status
- Invoices: `GET/POST /api/invoices`, `PUT /api/invoices/:id/draft`, `POST /api/invoices/:id/submit`, `GET /api/invoices/:id/pdf`, existing `PATCH /api/invoices/:id` decisions and `GET /api/invoices/:id/document` signed attachment URLs
- Leave: `GET/POST /api/leaves`, management-scoped `PATCH /api/leaves/:id` decisions, own Pending withdrawal with `POST /api/leaves/:id/cancel`; creation/withdrawal are employee/trainer-only
- Profile administration: `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/departments`; managers receive only manageable staff profiles and assignable employee/trainer role presets. `POST /api/admin/users/roles` and privileged role assignments require an administrator.
- Meetings: scoped listing, trainer training-session requests and management scheduling/confirmation with `PATCH /api/meetings/:id`
- Equipment: assets, multipart requests, management approvals, and signed attachment URLs
- Workspace: consolidated `GET /api/portal`, dashboard, directory, reports, notifications, profile, administrator-only organization settings and audit log

All routes validate request data with Zod. Protected routes enforce role-based access on the server—not only in the React UI.

### Two-category sign-in and authorization

Sign-in accepts exactly one access category: `employee` for Employees and Trainers, or `management` for Managers and Admins. Express derives that category from the authenticated account's stored internal role; selecting **Admin / Management** never upgrades an Employee or Trainer. The returned user includes the category for presentation, while the internal `employee`, `trainer`, `manager`, and `admin` roles remain the server-side authorization source for scoped records, management reports, and administrator-only settings.

The normalized `excellium_users.access_group` generated column provides a queryable Employee/Management organization area without duplicating user records or treating database tables as folders. New private objects are similarly segregated under `employee/{invoice|equipment}/{ownerId}/…` or `management/{invoice|equipment}/{ownerId}/…`. Buckets remain private; Express still validates files, checks ownership/management authorization, and issues the only five-minute signed URLs.

## Workspace persistence

With `PERSISTENCE_PROVIDER=supabase`, every domain workflow is stored in normalized Supabase Postgres tables with typed columns: users/profiles (including a generated access group), role presets, departments, leave requests, attendance, work sessions, break logs, activity heartbeats, coordinate samples, review flags, invoices and line items, meetings, equipment requests, assets, notification audiences/reads, settings, and audit entries. The first connected server start seeds an empty schema with the demo workspace; subsequent actions update the relevant typed rows. An existing legacy JSONB workspace is upgraded into these typed tables by the third migration before the server starts. The workflow migration backfills role/department assignments and invoice totals without replacing existing users, password hashes, attachments or historical invoices.

`PERSISTENCE_PROVIDER=json` remains available only as a local/test fallback. It writes `server/data/store.json`, which is ignored by Git.

## Session and activity tracking

The employee control bar has four explicit states: `CLOCKED_OUT`, `ACTIVE`, `IDLE`, and `ON_BREAK`. Tracking listeners exist only while the session is active or idle. A 5- or 15-minute break immediately clears those listeners and idle timers, shows a live countdown, and resumes automatically when it reaches zero. The browser samples only trusted portal-tab events and lightweight coordinates; it does not collect typed characters, screen captures, or page content.

Management can open **Workforce reports** for the end-of-day activity table, chronological employee timeline, suspicious-pattern review count, and CSV export. Jiggler heuristics are review signals—not automatic disciplinary decisions—and cover repeated coordinate loops, fixed-interval tiny nudges, and 30 minutes of pointer motion without clicks or keypresses.

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

# Trusted portal interaction becomes idle after this many minutes. Activity
# heartbeats batch at this interval; neither setting enables content capture.
ACTIVITY_IDLE_MINUTES=5
ACTIVITY_HEARTBEAT_SECONDS=30

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
   - `supabase/migrations/202611160004_create_activity_tracking_schema.sql`
   - `supabase/migrations/202611160005_close_stale_work_sessions.sql`
   - `supabase/migrations/202611160006_allow_multiple_daily_work_sessions.sql`
   - `supabase/migrations/202611160007_add_access_group_organization.sql`
   - `supabase/migrations/202611170001_create_shared_auth_sessions.sql`
   - `supabase/migrations/202611170002_add_portal_workflows.sql`
5. Copy `server/.env.example` to `server/.env`, fill in the values, and restart the Express server. On Vercel, apply the workflow migration before deploying the matching branch; committing the SQL file alone does not update the database.

The first migration creates the locked-down, normalized Postgres tables that persist every portal workflow. The second creates the private `excellium-uploads` bucket. The third is safe on new installations; on older installations, it copies the retired JSONB workspace document into typed tables and deletes that document table. The fourth adds relational work sessions, 5/15-minute break logs, heartbeats, typed coordinate samples, anomaly flags, and typed audit-log links. The fifth marks prior-day sessions as clocked out without inventing an unknown clock-out timestamp. The sixth permits a legitimate second work session after an employee clocks out on the same day. The seventh adds a generated Employee/Management access-group column and index. The eighth adds shared, server-only authentication sessions for independent Vercel instances. The ninth adds RLS-protected role/department catalogs, admin-managed profile fields, leave applications and invoice line items/drafts. New workflow tables grant access only to the server service role, while existing generated access groups remain unchanged. The application never sends the secret key to React. Express validates uploads in memory, stores valid files in category- and owner-scoped private paths, writes file metadata alongside the invoice/request record, and creates five-minute signed URLs only for the record owner or management.

| Upload | Accepted format | Default maximum |
| --- | --- | --- |
| Invoice document | PDF | 10 MB |
| Equipment attachment | PNG, JPEG, WebP | 10 MB |

`SUPABASE_UPLOAD_MAX_BYTES` and `SUPABASE_SIGNED_URL_TTL_SECONDS` can be adjusted as needed. In `PERSISTENCE_PROVIDER=supabase` mode, Express fails fast if the Supabase credentials or database migration are missing; it will not silently save work records locally.

> The migration files are idempotent where practical, but production deployments should run them through your normal reviewed migration pipeline rather than making manual schema changes.

## Production notes

The application persists operational data and shared authentication sessions in Supabase Postgres while keeping the existing domain API stable. Production uses Secure HttpOnly cookies. For a larger deployment, add distributed rate limiting, CSRF protection, database backup/restore drills, and automated migration deployment. Replace the documented demo credentials before using the portal for real employee data.
