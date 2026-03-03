# Quickstart: Organization Creation

**Branch**: `003-create-org` | **Date**: 2026-03-02

---

## Prerequisites

- Node.js (LTS) and npm installed
- Wrangler CLI installed (`npm install -g wrangler` or use `npx wrangler`)
- Local D1 database previously initialised by 001-user-auth (`.wrangler/state/` directory exists)

---

## 1. Apply the Schema Migration

The two new tables (`organization`, `org_membership`) are appended to `src/db/schema.sql`.
Run against the local D1 instance:

```bash
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
```

Verify the tables were created:

```bash
wrangler d1 execute scheduler-auth --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected output includes `organization` and `org_membership` alongside the existing auth tables.

---

## 2. Start the Dev Server

```bash
npm run dev
```

The dev server starts at `http://localhost:3000`.

---

## 3. Smoke Test the Feature

1. **Log in** at `http://localhost:3000/login` with an existing verified account.
2. Navigate to `http://localhost:3000/create-org`.
3. Fill in:
   - **Organization name**: e.g., `Springfield Fire Department`
   - **URL slug**: auto-suggested as `springfield-fire-department` (edit as desired)
   - **Type**: `Fire`
4. Submit. You should land at `http://localhost:3000/orgs/springfield-fire-department`.
5. Verify the org name appears in the workspace header.

---

## 4. Run Tests

```bash
npm run test
```

All tests must pass before opening a pull request.

---

## 5. Deploy to Production (after PR merge)

```bash
# Apply schema to remote D1
wrangler d1 execute scheduler-auth --file=src/db/schema.sql

# Deploy Worker
npm run deploy
```
