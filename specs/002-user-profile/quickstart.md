# Quickstart: User Profile

**Branch**: `002-user-profile` | **Date**: 2026-03-02

---

## Prerequisites

- Feature 001 (`001-user-auth`) fully deployed — `user`, `session`, and token tables exist in D1.
- `wrangler` CLI authenticated (`wrangler login`).
- Existing D1 database: `scheduler-auth` (binding `DB`).

---

## Step 1 — Create the R2 Bucket

```bash
# Production bucket
wrangler r2 bucket create scheduler-profile-photos

# The local dev bucket is created automatically by wrangler dev
```

---

## Step 2 — Add R2 Binding to `wrangler.jsonc`

In `wrangler.jsonc`, add the `r2_buckets` array alongside the existing `d1_databases`:

```jsonc
"r2_buckets": [
  {
    "binding": "PROFILE_PHOTOS",
    "bucket_name": "scheduler-profile-photos"
  }
]
```

---

## Step 3 — Regenerate Cloudflare Binding Types

```bash
npm run cf-typegen
```

This updates `worker-configuration.d.ts`. Then add `PROFILE_PHOTOS` to the manual type extension:

```typescript
// src/types/env.d.ts
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    RESEND_API_KEY: string
    PROFILE_PHOTOS: R2Bucket  // ← add this
  }
}
```

---

## Step 4 — Apply the Schema Migration

```bash
# Local dev
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql

# Production
wrangler d1 execute scheduler-auth --file=src/db/schema.sql
```

The migration adds the `user_profile` table. Existing rows are unaffected.

---

## Step 5 — Start Dev Server

```bash
npm run dev
```

Navigate to `http://localhost:3000`, log in, then visit `/profile`.

---

## Step 6 — Test the Feature

| Scenario | Steps |
|---|---|
| View profile | Log in → navigate to `/profile` → verify name and email displayed |
| Edit profile | Change display name → Save → verify updated value persists on refresh |
| Validate phone | Enter `abc` as phone number → Save → verify validation error shown |
| Change password | Enter current + new password → submit → log out → log in with new password |
| Session invalidation | Open two tabs → change password in tab 1 → refresh tab 2 → verify redirected to login |
| Upload photo | Upload a JPEG under 5 MB → verify avatar displayed |
| Upload invalid | Upload a `.pdf` or file > 5 MB → verify error message shown |
| Remove photo | Remove existing photo → verify default avatar shown |

---

## Deployment

```bash
npm run deploy
```

No secrets need to be added for this feature (R2 is accessed via binding, not API key).
