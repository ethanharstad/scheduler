# Research: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-03-02
**Purpose**: Resolve all technical unknowns before Phase 1 design

---

## 1. Storage — Database for Users, Sessions, and Tokens

### Decision: Cloudflare D1 (only)

**Rationale**: D1 is SQLite at the edge, Cloudflare-native, and supports the relational schema
(user ↔ sessions ↔ tokens) this feature requires. It provides ACID transactions for correctness
on concurrent login attempts and is already part of the Cloudflare ecosystem — no external
dependency, no network hop to a third-party host. A KV-based session cache was considered but
rejected (Principle V — YAGNI): D1 with indexed lookups on `session_token` is fast enough for
authentication queries, and adding a second storage layer introduces consistency complexity without
a demonstrated need.

**Alternatives considered**:
- **D1 + KV hybrid** (D1 for users, KV for sessions): Faster session lookups but adds eventual-
  consistency risk and a second binding to manage. Rejected as over-engineered for this scope.
- **Cloudflare KV only**: No SQL joins, no uniqueness constraints, no transactions. Unsuitable
  for relational auth data.
- **External DB (Neon/Turso)**: Adds 50–300 ms network latency per request and an external
  dependency. Rejected in favour of Cloudflare-native solution.

**Workers constraints**:
- D1 bindings are only accessible in server-side code (server functions, `beforeLoad`).
- All D1 values are stored as TEXT for dates (ISO 8601) and booleans (INTEGER 0/1), since
  SQLite has no native date or boolean type.
- Queries must complete within the Workers 30-second CPU limit; indexed single-row lookups are
  well within this budget.

**wrangler.jsonc binding**:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "scheduler-auth",
    "database_id": "<id from: wrangler d1 create scheduler-auth>"
  }
]
```

After adding the binding, run `npm run cf-typegen` to update `worker-configuration.d.ts`.

---

## 2. Password Hashing — Web Crypto PBKDF2

### Decision: PBKDF2-SHA256 via `globalThis.crypto.subtle`

**Rationale**: `bcrypt` requires native C++ modules unavailable in the Cloudflare Workers runtime
(even with `nodejs_compat`). `scrypt` is not part of the Web Crypto API. PBKDF2-SHA256 is NIST-
approved, available natively in every Workers environment via `globalThis.crypto.subtle`, and
requires zero external packages.

**Parameters** (OWASP 2024 guidelines):
- Algorithm: PBKDF2 with SHA-256
- Iterations: 100,000
- Salt: 32 bytes, cryptographically random (generated fresh per password)
- Derived key length: 32 bytes
- Storage format: base64(salt ‖ derivedKey) — single field in the User row

**Performance**: ~50–200 ms per hash on Workers CPU. Acceptable for login/registration paths;
not on the per-request hot path.

**Alternatives considered**:
- **bcrypt**: Not available in Workers runtime. Rejected.
- **argon2**: Not in Web Crypto API. Would require a WASM polyfill (bundle size concern vs.
  Principle IV). Rejected.
- **SHA-256 (unsalted/single-round)**: Not suitable for passwords. Rejected on security grounds.

---

## 3. Rate Limiting — D1-Based Account Lockout

### Decision: `failed_attempts` counter + `lock_until` timestamp on the `user` table

**Rationale**: Spec FR-010 requires account-level lockout (10 failures → 15-minute lock) which
cannot be modelled with IP-level WAF rules alone. Durable Objects would provide sub-millisecond
atomicity but add per-request cost and complexity for a threshold that resets infrequently.
Storing the counter and lock expiry directly on the `user` row is the simplest approach that
satisfies the requirement with no additional infrastructure.

**Behaviour**:
1. On each failed login attempt, `failed_attempts` is incremented.
2. When `failed_attempts` reaches 10, `lock_until` is set to `now + 15 minutes`.
3. On any login attempt, `lock_until > now` short-circuits with a locked-account error.
4. On a successful login, both `failed_attempts` and `lock_until` are reset to 0 / NULL.

**Limitation**: Concurrent writes from two requests in the same millisecond could theoretically
allow 11 attempts before locking. This is an acceptable trade-off for application-layer rate
limiting; at high scale, WAF rules can complement this at the IP level.

**Alternatives considered**:
- **Cloudflare WAF rate limiting**: IP-level only — cannot target a specific account. Rejected as
  sole mechanism (but acceptable as a complementary layer).
- **Durable Objects**: Strong consistency guarantee but adds per-request billing and latency.
  Overkill for this use case. Rejected.

---

## 4. Secure Token Generation

### Decision: `globalThis.crypto.getRandomValues()` — 32 bytes → base64url encoding

**Rationale**: `globalThis.crypto` is natively available in Cloudflare Workers. 32 random bytes
(256 bits) provides sufficient entropy for unpredictable tokens. Base64url encoding keeps tokens
URL-safe and compact (43 chars vs. 64 hex chars).

`crypto.randomUUID()` is also available but produces only 122 bits of randomness in a structured
format. For verification and reset tokens, `getRandomValues(32)` → base64url is preferred.

**Token specs**:
- Email verification token: 32 bytes → base64url, expires 24 hours
- Password reset token: 32 bytes → base64url, expires 60 minutes (FR-006)
- Session token: 32 bytes → base64url, expires 24 hours idle (Clarification Q1)
- Entity PKs: `crypto.randomUUID()` (sufficient for primary keys)

**Timing-safe comparison**: Token validation MUST use constant-time comparison (XOR loop) to
prevent timing attacks that could allow an attacker to infer valid token prefixes.

---

## 5. Email Delivery

### Decision: Resend

**Rationale**: Resend exposes a pure HTTP JSON API — a single `fetch()` call from any Workers
environment. No SDK, no Node.js dependencies. Free tier covers 100 emails/day, sufficient for
development and low-volume production. MailChannels removed its free tier in 2024. Mailgun and
SendGrid are viable alternatives but require more configuration (Mailgun: DNS verification;
SendGrid: heavier onboarding).

**API shape** (POST `https://api.resend.com/emails`):
```json
{
  "from": "noreply@<your-domain>",
  "to": "<recipient>",
  "subject": "...",
  "html": "..."
}
```
Header: `Authorization: Bearer <RESEND_API_KEY>`

**Secret management**: Store as a Cloudflare Workers secret:
```bash
wrangler secret put RESEND_API_KEY
```
Access via `env.RESEND_API_KEY` in server functions.

**Delivery failure handling**: Per Clarification Q3, email delivery is best-effort. Account
creation and token issuance proceed regardless of delivery outcome. A delivery failure is logged
as a security event but does not return an error to the user; they see the standard
"check your inbox" message and can re-request via the cooldown mechanism.

**Alternatives considered**:
- **Mailgun**: Requires DNS record setup for custom domain. More friction for development. Viable
  alternative.
- **SendGrid**: Similar HTTP API, slightly heavier onboarding. Viable alternative.
- **Cloudflare Email Workers + MailChannels**: MailChannels removed free tier in 2024. Rejected.

---

## 6. Protected Route Pattern

### Decision: `_protected` route group with `beforeLoad` + `createServerFn` session check

**Rationale**: TanStack Router v1 supports layout route groups (prefixed with `_`) that apply
`beforeLoad` hooks to all child routes without adding a URL segment. `beforeLoad` runs server-
side during SSR, so the session check and redirect happen before any HTML is sent to the client —
preventing flash of unauthenticated content and satisfying Principle III (Server-First).

**Pattern**:
- All protected routes live under `src/routes/_protected/`
- `src/routes/_protected/__layout.tsx` (or the index file) defines `beforeLoad` which calls a
  `getSessionServerFn` and throws `redirect({ to: '/login', search: { from: location.pathname } })`
  if the session is absent or expired
- The `from` search param preserves the originally-requested URL for post-login redirect (FR-009)
- Public routes (login, register, forgot-password, reset-password, verify-email) use `beforeLoad`
  to redirect already-authenticated users to `/`

---

## 7. Security Event Logging

### Decision: Structured `console.log` to Cloudflare Workers logs

**Rationale**: Cloudflare Workers captures `console.log` output and surfaces it in the Workers
dashboard, Logpush, and the `wrangler tail` command. No external logging service is required.
Observability is enabled in `wrangler.jsonc` (`"observability": { "enabled": true }`).

Log entries are JSON objects written via `console.log(JSON.stringify(event))` where `event`
contains: `{ type, userId?, email?, timestamp, details }`.

**Events to log** (FR-014):
- `failed_login_attempt` (with reason: wrong_password | account_locked | unverified)
- `account_lockout_triggered`
- `account_lockout_lifted` (on successful login after lock expires)
- `password_changed` (via reset flow)
- `session_created` (successful login)
- `session_terminated` (explicit logout or expiry)

---

## 8. Auth Library Evaluation — better-auth

### Decision: Do NOT adopt better-auth at this time

**Evaluated**: `better-auth` v1.x + `better-auth-cloudflare` community package

**What better-auth provides**:
- Email/password login, registration, email verification, forgot/reset password — all first-class
- Cookie-based server-side session management
- PBKDF2/argon2 password hashing handled internally
- TypeScript types via `auth.$Infer.Session` / `auth.$Infer.User`
- Hooks system (`before` / `after`) usable for security event logging

**Why it was not adopted**:

1. **No official Cloudflare Workers support.** `better-auth` fails in Workers with a `createRequire`
   error (#1143, #4404, #6665 in the upstream repo). The fix is the community package
   `better-auth-cloudflare` (by zpg6) — which is not maintained by the better-auth team. Adopting
   a community shim as the foundation of a security-critical feature is a meaningful risk
   (Constitution Principle IV — Edge-Runtime Compatibility).

2. **Drizzle ORM becomes a mandatory dependency.** The library has no native D1 adapter — it uses
   `drizzle-orm` as the bridge to D1. This adds `drizzle-orm` + `drizzle-kit` to the dependency
   tree for schema management. Two more packages for a feature where raw D1 SQL is sufficient
   (Constitution Principle V — Simplicity & YAGNI).

3. **Account lockout (FR-010) must still be implemented manually.** better-auth's rate limiting is
   basic (3 req / 10 s per endpoint) — it does not support account-level lockout after N failed
   attempts with a configurable window. FR-010 is a spec requirement that cannot be delegated.

4. **Additional setup overhead.** Schema generation requires running `npx auth generate` +
   `npx drizzle-kit generate` + `wrangler d1 migrations apply`. The hand-rolled approach
   requires a single `schema.sql` applied with one command.

**When to reconsider**: If better-auth ships an official Cloudflare Workers adapter (tracked
upstream), or if the project grows to need features better-auth provides out-of-the-box
(OAuth providers, two-factor auth, organisations), it should be re-evaluated.

---

## Unresolved / Deferred Decisions

| Item | Decision | Notes |
|---|---|---|
| Email verification token expiry | 24 hours | Not specified in spec; industry standard |
| CSRF protection | SameSite=Lax cookie + server functions (POST only) | Workers server functions are not vulnerable to CSRF via `GET`; form submissions are `POST` |
| HTTPS enforcement | Cloudflare proxies all traffic over HTTPS | No app-level config needed |
| Session cookie flags | `HttpOnly; Secure; SameSite=Lax; Path=/` | `Secure` automatically satisfied by Cloudflare |
