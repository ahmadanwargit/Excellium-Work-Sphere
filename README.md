# Excellium Work Sphere

A production-style monorepo for the Excellium Global Services workspace. The visual language and workflow of the original portal have been preserved while the implementation is now a maintainable **React + Tailwind CSS** frontend and a modular **Express** backend.

## Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Lucide icons |
| Backend | Express 4, Zod validation, Helmet, CORS, rate limiting |
| Authentication | HttpOnly SameSite session cookie, Node `scrypt` password hashing |
| Local persistence | Atomic JSON adapter behind a data-store interface |
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
- Invoices: scoped listing, submission, management approval/rejection
- Meetings: scoped listing and scheduling
- Equipment: assets, requests, and management approvals
- Workspace: dashboard, directory, reports, notifications, profile, organization settings, audit log

All routes validate request data with Zod. Protected routes enforce role-based access on the server—not only in the React UI.

## Local data

On its first start, Express creates `server/data/store.json` from the committed seed data. It is ignored by Git because it contains mutable demo records and password hashes.

Reset the demo state by stopping the API and deleting:

```bash
rm server/data/store.json
```

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
```

## Production notes

The JSON data adapter is deliberately simple for a local demo. For deployment, replace it through the same store/service boundary with a transactional database, persist sessions in a secure shared session store, set HTTPS cookies, add CSRF protection, implement file storage with scanning for uploads, and add operational backups and migrations.
