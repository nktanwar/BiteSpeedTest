# Bitespeed Identity Reconciliation

This repository contains an implementation of the Bitespeed Backend Task: Identity Reconciliation.
It provides a single API endpoint to reconcile customer identity across multiple orders (by email and/or phone).

Repository layout
-----------------
- `src/` — application source code (`app.ts`, `index.ts`, route handlers).
- `prisma/` — Prisma schema and migrations.
- `tests/` — integration tests using Jest + Supertest.
- `Dockerfile`, `render.yaml`, `Procfile` — deployment artifacts for Render (Docker-based deployment).

# Bitespeed — Identity Reconciliation (Submission)

This repository contains my implementation for the Bitespeed Backend Task: Identity Reconciliation.
The service exposes a single HTTP endpoint that consolidates customer contact information (email and/or phoneNumber)
and maintains a linked set of `Contact` records so purchases made with different contact details can be attributed
to the same customer.

## What I implemented

- POST `/identify` endpoint that accepts JSON `{ "email"?: string, "phoneNumber"?: string }`.
- `Contact` table and Prisma schema with fields: `id`, `email`, `phoneNumber`, `linkedId`, `linkPrecedence`, `createdAt`, `updatedAt`, `deletedAt`.
- Reconciliation rules per the task: link by email OR phone, oldest `createdAt` is primary, others secondary.
- Merging logic where two primaries become one (oldest remains primary).
- Ignore contacts with `deletedAt != null` during matching.
- Transactional updates using Prisma to avoid partial state.
- Integration tests covering the task examples and edge cases (deleted contacts, concurrency, transaction failure).
- Deployment artifacts: `Dockerfile`, `render.yaml`, `Procfile` and a basic GitHub Actions CI workflow.

## Repository structure

- `src/` — TypeScript source (`app.ts`, `index.ts`, `routes/identify.ts`).
- `prisma/` — Prisma schema and migrations.
- `tests/` — Jest + Supertest integration tests.
- `Dockerfile`, `render.yaml`, `Procfile` — deployment files.

## API

### POST /identify

Request (JSON):

```json
{ "email": "string?", "phoneNumber": "string?" }
```

Response (200):

```json
{
  "contact": {
    "primaryContactId": number,
    "emails": ["primary@example.com", "other@example.com"],
    "phoneNumbers": ["123456", "987654"],
    "secondaryContactIds": [2,3]
  }
}
```

Notes:
- Emails are normalized to lower-case for matching.
- Either `email` or `phoneNumber` will be present in requests.

## Local development

Prerequisites: Node.js 20+, npm

```bash
cd bitespeed-server
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

The service starts on port `3333` by default. Example requests:

```bash
curl -X POST http://localhost:3333/identify \
  -H 'Content-Type: application/json' \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'
```

```bash
curl -X POST http://localhost:3333/identify \
  -H 'Content-Type: application/json' \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}'
```

## Tests

Integration tests are provided and exercise the main examples and edge cases (deletedAt handling, concurrent requests, transaction failures).

Run tests:

```bash
cd bitespeed-server
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm test
```

## Using Postgres

For production, use Postgres. Set `DATABASE_URL` in `bitespeed-server/.env` or as an environment variable, for example:

```
DATABASE_URL="postgresql://user:password@localhost:5432/bitespeed?schema=public"
```

Run migrations:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

In production/deploy, use `npx prisma migrate deploy` to apply migrations.

## Deployment (Render)

I included a `Dockerfile` and a `render.yaml` so this service can be deployed to Render with a Postgres database.

High-level steps:

1. Push this repository to GitHub.
2. In Render, create a new Web Service and connect your GitHub repo (or use `render.yaml`).
3. Provision a PostgreSQL database in Render (or attach an external one) and ensure `DATABASE_URL` is set for the service.
4. Deploy. The container executes `npx prisma migrate deploy` and starts the server.

If you prefer, I can provide a step-by-step Render UI checklist and exact values to paste in.

## CI

A basic GitHub Actions workflow is included at `.github/workflows/ci.yml`. It runs tests on push/PR.

## Notes and recommendations

- The implementation focuses on correctness and clarity for the task requirements. For production readiness I recommend:
  - Using Postgres as the persistent database.
  - Adding structured logging and observability (metrics/alerts).
  - Hardening input validation and rate limiting.
  - Considering unique constraints or more explicit locking if your traffic pattern produces frequent concurrent link operations.



