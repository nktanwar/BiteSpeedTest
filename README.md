# Bitespeed Identity Reconciliation

This repository contains an implementation of the Bitespeed Backend Task: Identity Reconciliation.
It provides a single API endpoint to reconcile customer identity across multiple orders (by email and/or phone).

Repository layout
-----------------
- `src/` — application source code (`app.ts`, `index.ts`, route handlers).
- `prisma/` — Prisma schema and migrations.
- `tests/` — integration tests using Jest + Supertest.
- `Dockerfile`, `render.yaml`, `Procfile` — deployment artifacts for Render (Docker-based deployment).

API
---
POST /identify

Request body (JSON):

```json
{ "email": "string?", "phoneNumber": "string?" }
```

Either `email` or `phoneNumber` will be present.

Response (200):

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["primary@example.com", "other@example.com"],
    "phoneNumbers": ["123456", "987654"],
    "secondaryContactIds": [2,3]
  }
}
```

Behavior summary
----------------
- Contacts are linked when any email OR phone matches.
- The oldest `Contact` by `createdAt` becomes the `primary` for a connected group; others become `secondary` (their `linkedId` set to the primary).
- If incoming data contains new contact information, a new `secondary` contact row is created and linked to the primary.
- Contacts with `deletedAt != null` are ignored for matching.
- All reconciliation operations run inside a database transaction to avoid partial updates.

Local development (SQLite default)
---------------------------------
Prereqs: Node 20+, npm

```bash
cd bitespeed-server
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

The server will listen on port `3333` by default. Example requests:

```bash
curl -X POST http://localhost:3333/identify \
  -H 'Content-Type: application/json' \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'

curl -X POST http://localhost:3333/identify \
  -H 'Content-Type: application/json' \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}'
```

Testing
-------
Run the test suite (Jest + Supertest):

```bash
cd bitespeed-server
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm test
```

Using Postgres (development and production)
------------------------------------------
To use Postgres instead of SQLite, set `DATABASE_URL` in `bitespeed-server/.env` (or in your environment) to a Postgres connection string, for example:

```
DATABASE_URL="postgresql://user:password@localhost:5432/bitespeed?schema=public"
```

Then run:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

When deploying to a production Postgres instance (Render, Railway, etc.) run migrations with:

```bash
npx prisma migrate deploy
```

Render deployment (Docker)
--------------------------
This repo includes a `Dockerfile` and `render.yaml` to simplify deploying to Render.

Steps:
1. Push this repository to GitHub.
2. On Render, create a new **Web Service** and connect your GitHub repository.
3. Select **Docker** as the environment and confirm `Dockerfile` is used.
4. Add a PostgreSQL database via Render or provide an external Postgres instance; set the `DATABASE_URL` environment variable in the Render service (Render can also inject db connection strings from the DB add-on).
5. Deploy. The Docker container runs `npx prisma migrate deploy` at start and then `node dist/index.js`.

CI (GitHub Actions)
-------------------
A basic CI workflow is included at `.github/workflows/ci.yml`. It runs `npm test` on push/PR to `main` or `master`.

Notes & recommendations
-----------------------
- The current project uses SQLite by default for easy local testing; switch to Postgres for production.
- For high concurrency/production environments, consider stronger DB-level locking, unique constraints, or deduplication strategies to avoid race conditions at extreme scale.
- Add monitoring, structured logging, and environment-based configuration before production.

Files added for deployment
- `Dockerfile` — container build
- `render.yaml` — Render manifest (service + db)
- `Procfile` — optional start command
- `.github/workflows/ci.yml` — test CI

If you want, I can:
- Prepare a `docker-compose.yml` for local Postgres + migrations.
- Create a sample Render deploy checklist and environment variable list.
- Deploy the app to Render for you and provide the public `/identify` URL.

---

Happy to proceed with any of the above — tell me which next step you prefer.
