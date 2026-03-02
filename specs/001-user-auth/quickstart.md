# Quickstart: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-03-02
**Purpose**: Step-by-step guide to get authentication running from a clean checkout

---

## Prerequisites

- Node.js ≥ 18 and npm
- Wrangler CLI (`npm install -g wrangler` or use `npx wrangler`)
- A Cloudflare account (free tier sufficient)
- A Resend account and API key (<https://resend.com>)
- Logged in to Cloudflare: `wrangler login`

---

## Step 1 — Create the D1 Database

```bash
# Create the D1 database (run once)
npx wrangler d1 create scheduler-auth
```

Note the `database_id` printed in the output — you will need it in Step 2.

---

## Step 2 — Update `wrangler.jsonc`

Add the D1 binding inside the `{}` of `wrangler.jsonc` (before the closing `}`):

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "scheduler-auth",
    "database_id": "<paste-id-from-step-1>"
  }
]
```

---

## Step 3 — Regenerate Cloudflare Binding Types

```bash
npm run cf-typegen
```

This updates `worker-configuration.d.ts` so TypeScript knows about `env.DB`.

---

## Step 4 — Apply the Database Schema

```bash
# Apply to local (dev) database
npx wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql

# Apply to remote (production) database
npx wrangler d1 execute scheduler-auth --file=src/db/schema.sql
```

---

## Step 5 — Add the Resend API Key Secret

```bash
# For production
npx wrangler secret put RESEND_API_KEY
# When prompted, paste your Resend API key

# For local development, create a .dev.vars file (gitignored):
echo "RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx" >> .dev.vars
```

---

## Step 6 — Start the Dev Server

```bash
npm run dev
```

The app runs at <http://localhost:3000>.

---

## Step 7 — Verify the Auth Flow

### Registration

1. Navigate to `http://localhost:3000/register`
2. Enter a valid email and a password meeting requirements (8+ chars, ≥1 letter, ≥1 digit)
3. Submit — you should see "Check your inbox"
4. Check the Resend dashboard (or `.dev.vars` email logs) for the verification email
5. Click the verification link — you should be redirected to `/login` with a success notice

### Login

1. Navigate to `http://localhost:3000/login`
2. Enter the verified credentials
3. Submit — you should be redirected to the protected home page
4. Confirm the session cookie is set (`HttpOnly; Secure; SameSite=Lax`)

### Protected route redirect

1. Log out (or clear cookies)
2. Navigate directly to a protected URL (e.g., `http://localhost:3000/dashboard`)
3. You should be redirected to `/login?from=/dashboard`
4. After login, you should land on `/dashboard`

### Forgot password

1. Navigate to `http://localhost:3000/forgot-password`
2. Enter the registered email
3. Check Resend for the reset email
4. Click the reset link — you should see the set-new-password form
5. Set a new password and submit — you should be redirected to `/login`
6. Log in with the new password

### Account lockout

1. Navigate to `/login`
2. Submit wrong credentials 10 times
3. On the 10th failure, the account should be locked with a message showing the unlock time
4. Wait 15 minutes (or update `lock_until` in D1 directly for testing)

---

## Inspecting D1 Data Locally

```bash
# Open D1 shell for local database
npx wrangler d1 execute scheduler-auth --local --command "SELECT * FROM user"
npx wrangler d1 execute scheduler-auth --local --command "SELECT * FROM session"
```

---

## Watching Logs

```bash
# Tail production Worker logs (including security event JSON)
npx wrangler tail
```

---

## Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `DB is not defined` | Binding types not regenerated | Run `npm run cf-typegen` |
| Emails not arriving | `.dev.vars` missing key | Check `RESEND_API_KEY` in `.dev.vars` |
| `session cookie not set` | Running on HTTP locally | Use `http://localhost` (Secure flag skipped on localhost) |
| D1 query errors | Schema not applied | Re-run Step 4 |
