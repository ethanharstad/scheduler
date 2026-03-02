# Implementation Plan: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-user-auth/spec.md`

## Summary

Implement a self-service user authentication system on TanStack Start v1 + Cloudflare Workers,
covering email/password login, registration with email verification, forgot-password flow, and
logout. All auth operations run as server functions (`createServerFn`) against a Cloudflare D1
database. Password hashing uses PBKDF2-SHA256 via the Web Crypto API. Emails are sent via the
Resend HTTP API. Protected routes are guarded via `beforeLoad` hooks in a `_protected` route group.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode — Principle II)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
**New Dependencies**: none (Resend via raw `fetch()`; D1 via Cloudflare binding)
**Storage**: Cloudflare D1 (SQLite) — binding name `DB`; see `data-model.md` for schema
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge, stateless per invocation)
**Project Type**: Full-stack SSR web application
**Performance Goals**: Auth operations complete within Workers 30-second CPU budget; PBKDF2 at 100k iterations ~50–200 ms (acceptable for auth path)
**Constraints**: No Node.js built-ins (`fs`, `path`, Node `crypto`); Web Crypto API only; bundle < 1 MB; stateless per request
**Scale/Scope**: Single-tenant scheduler app; no explicit concurrent-user target; D1 sufficient

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I — Component-First Architecture | ✅ PASS | Each auth page is a standalone route file; shared UI extracted only when used in ≥2 places |
| II — Type Safety | ✅ PASS | All server function I/O explicitly typed; `any` prohibited; D1 results typed via `src/lib/auth.types.ts` |
| III — Server-First Data Fetching | ✅ PASS | All auth operations use `createServerFn`; `beforeLoad` validates session server-side before render |
| IV — Edge-Runtime Compatibility | ✅ PASS | PBKDF2 via `globalThis.crypto.subtle`; tokens via `globalThis.crypto.getRandomValues()`; Resend via `fetch()`; D1 native binding; no Node built-ins |
| V — Simplicity & YAGNI | ✅ PASS | D1 only (no KV); no admin role; no OAuth; 5 route files + 1 layout + shared util; no ORM |

**No constitution violations.** Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── server-functions.md  # Phase 1 output
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.sql                        # D1 schema (all 4 tables)
├── lib/
│   ├── auth.ts                           # getSessionServerFn + security event logger
│   └── auth.types.ts                     # TypeScript interfaces for DB rows + SessionContext
├── server/
│   └── auth.ts                           # loginServerFn, registerServerFn, logoutServerFn,
│                                         # verifyEmailServerFn, resendVerificationServerFn,
│                                         # forgotPasswordServerFn, resetPasswordServerFn
└── routes/
    ├── login.tsx                         # Public — login form (beforeLoad: redirect if authed)
    ├── register.tsx                      # Public — registration form
    ├── forgot-password.tsx               # Public — forgot-password form
    ├── reset-password.$token.tsx         # Public — new-password form (token from URL)
    ├── verify-email.$token.tsx           # Public — email verification handler
    └── _protected/
        ├── __layout.tsx (or index route) # beforeLoad: check session → redirect to /login
        └── index.tsx                     # Protected home page

wrangler.jsonc                            # Add d1_databases binding (DB)
worker-configuration.d.ts                # Regenerated: npm run cf-typegen
.dev.vars                                 # Local secrets: RESEND_API_KEY (gitignored)
```

**Structure Decision**: Single-project web app (Option 2 equivalent but using TanStack Start
file-based routing). No separate backend/frontend directories — TanStack Start collocates server
functions with routes. `src/server/auth.ts` groups all auth server functions; `src/lib/auth.ts`
holds the shared session helper used in `beforeLoad` across all routes.

## Phase 0: Research Summary

All NEEDS CLARIFICATION items resolved. See `research.md` for full rationale.

| Unknown | Decision |
|---|---|
| Database | Cloudflare D1 (SQLite) — Cloudflare-native, relational, ACID |
| Password hashing | PBKDF2-SHA256 via Web Crypto API (100k iterations, 32-byte salt) |
| Rate limiting | D1 counter: `failed_attempts` + `lock_until` on `user` table |
| Token generation | `globalThis.crypto.getRandomValues(32)` → base64url |
| Email delivery | Resend — HTTP API via `fetch()`, 100 emails/day free tier |
| Protected routes | `_protected` group with `beforeLoad` + `getSessionServerFn` |
| Security logging | `console.log(JSON.stringify(event))` → Cloudflare Workers logs |

## Phase 1: Design Summary

### Data Model

Four D1 tables: `user`, `session`, `email_verification_token`, `password_reset_token`.
See `data-model.md` for full schema, indexes, state transitions, and TypeScript types.

Key design decisions:
- All datetimes stored as ISO 8601 TEXT (SQLite has no native datetime type)
- Session expiry is idle-based: `expires_at` = `last_activity_at + 24h`, updated per request
- Account lockout stored on `user` row (no separate table needed — YAGNI)
- All token rows use `used INTEGER DEFAULT 0` flag; old tokens invalidated on re-issue

### Server Function Contracts

Seven server functions + `beforeLoad` guards. See `contracts/server-functions.md` for full I/O types.

| Function | Method | Purpose |
|---|---|---|
| `getSessionServerFn` | GET | Validate session cookie; return `SessionContext` or null |
| `loginServerFn` | POST | Authenticate; create session; set cookie |
| `registerServerFn` | POST | Create account; send verification email |
| `verifyEmailServerFn` | POST | Consume verification token; mark user verified |
| `resendVerificationServerFn` | POST | Issue new verification email (60s cooldown) |
| `forgotPasswordServerFn` | POST | Issue password-reset email (60s cooldown) |
| `resetPasswordServerFn` | POST | Consume reset token; update password; kill sessions |
| `logoutServerFn` | POST | Delete session; clear cookie |

### Quickstart

See `quickstart.md` for step-by-step setup: create D1 database, add binding, apply schema,
configure Resend secret, start dev server, validate all flows end-to-end.

## Constitution Check (Post-Design Re-evaluation)

All five principles re-confirmed after Phase 1 design:

- **Principle I**: Route files are single-responsibility; `src/lib/auth.ts` is shared (≥2 uses in `beforeLoad` across all routes) ✅
- **Principle II**: `auth.types.ts` provides types for all D1 row shapes; server functions use discriminated union return types ✅
- **Principle III**: `getSessionServerFn` called in `beforeLoad` (server-side during SSR) — no client-side session polling ✅
- **Principle IV**: `globalThis.crypto.subtle.deriveBits` (PBKDF2), `globalThis.crypto.getRandomValues`, `fetch()` to Resend — all Workers-native ✅
- **Principle V**: No ORM, no KV, no admin role, no OAuth, no "remember me" — minimum viable auth ✅
