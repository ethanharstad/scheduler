# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on port 3000
npm run build      # Build for production
npm run preview    # Build and preview production version
npm run test       # Run tests with Vitest
npm run deploy     # Build and deploy to Cloudflare Workers
npm run cf-typegen # Regenerate Cloudflare Worker binding types
```

## Architecture

This is a full-stack React SaaS application using **TanStack Start** (SSR meta-framework), deployed to **Cloudflare Workers**. It's an emergency services workforce management tool (fire, EMS, law enforcement) with a multi-tenant org → department → station hierarchy and tiered plans (Free / Basic / Pro).

**Key libraries:**
- TanStack Start v1 + TanStack Router — file-based routing, SSR, server functions
- React 19 + TypeScript 5.7 (strict mode, `verbatimModuleSyntax: true`)
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no config file)
- Lucide React for icons
- Cloudflare D1 (SQLite, binding: `DB`) + Cloudflare R2 (binding: `PROFILE_PHOTOS`)

**Routing:** Routes live in `src/routes/`. `src/routeTree.gen.ts` is auto-generated — never edit it manually (regenerated on `dev`/`build`). The root layout is `src/routes/__root.tsx`.

**SSR + Cloudflare:** Vite builds two bundles — client (`dist/client/`) and server (`dist/server/`). The server bundle runs on Cloudflare Workers via `src/server.ts` (custom entry; `wrangler.jsonc` `"main"` points here). This passes `env` as request context so server functions can access Cloudflare bindings.

**Path alias:** `@/*` maps to `./src/*`.

## Critical API Patterns

### Cloudflare Env Access in Server Functions

Server functions access Cloudflare bindings via double-cast context:
```typescript
const env = ctx.context as unknown as Cloudflare.Env
```

**DO NOT** import from `@cloudflare/vite-plugin/worker` (subpath doesn't exist in v1.25.6) or from `vinxi/http` (not a direct dependency).

### Server Functions

```typescript
// POST with input
createServerFn({ method: 'POST' })
  .inputValidator((d: MyInput) => d)  // use inputValidator, NOT .validator()
  .handler(async (ctx) => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env
  })

// GET without input
createServerFn({ method: 'GET' }).handler(async (ctx) => { ... })

// Client call with input
await myFn({ data: inputData })
// Client call without input
await myFn()
```

### Cookie & Request Utilities

```typescript
import { getCookie, setCookie, getRequestUrl } from '@tanstack/react-start/server'
```
`getRequestUrl()` returns a `URL` object (not string) — use `.origin`, `.pathname`, etc.

### Token Generation (Workers-safe)

```typescript
const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
const token = btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
```

## Routing Patterns

**Pathless layout:** `_protected.tsx` at the routes root guards auth. Child routes in `_protected/` appear at their URL without the `/_protected` prefix (e.g., `_protected/home.tsx` → `/home`).

**Nested org workspace:** `orgs.$orgSlug.tsx` is a layout; its `beforeLoad` fetches org + user role and returns `{ org, userRole }`. Child routes in `orgs.$orgSlug/` read context via:
```typescript
useRouteContext({ from: '/_protected/orgs/$orgSlug' })
```

**Public routes** (outside `_protected`): landing page, login, register, forgot/reset password, verify-email, join (staff invitation acceptance).

## Database Schema

D1 SQLite — binding `DB`. Tables:
- `user`, `session`, `email_verification_token`, `password_reset_token` (auth)
- `organization` (slug UNIQUE), `org_membership` (role: `owner|admin|manager|employee|payroll_hr`) (orgs)
- `user_profile` (1:1 with user; lazy INSERT OR IGNORE on first access) (profiles)
- `staff_member`, `staff_invitation` (token UNIQUE, 7-day expiry), `staff_audit_log` (staff management)

Full schema in `src/db/schema.sql`. Feature specs and data models in `specs/`.

## Visual Style

**Branding guide:** `specs/branding.md` — reference this for all visual style decisions including colors, typography, spacing, component patterns, and tone. All UI work should align with the brand identity defined there.

**Layout:** App pages (inside `_protected`) use full available width — do not add `max-w-*` or `mx-auto` to page-level containers. Auth pages and the landing page may use centered, narrow containers.

## Code Organization

- `src/lib/` — Shared types and utilities: `auth.ts` (PBKDF2, session validation), `rbac.ts` (permission matrix), `*.types.ts` (per-feature type definitions)
- `src/server/` — Server functions grouped by feature: `auth.ts`, `org.ts`, `members.ts`, `profile.ts`, `staff.ts`
- `src/routes/` — File-based routes (TanStack Router)
- `specs/` — Feature specs, plans, data models, and task checklists per feature

## Active Technologies
- TypeScript 5.7 (strict mode — Principle II) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React (001-user-auth)
- Cloudflare D1 (SQLite) — binding name `DB`; see `data-model.md` for schema (001-user-auth)
- TypeScript 5.7 (strict mode) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (existing), Cloudflare R2 (new `PROFILE_PHOTOS` binding) (002-user-profile)
- Cloudflare D1 — new `user_profile` table; Cloudflare R2 — `scheduler-profile-photos` bucket for avatar images (002-user-profile)
- Cloudflare D1 (SQLite) — binding name `DB`; two new tables: `organization`, `org_membership` (003-create-org)
- TypeScript 5.7 (strict mode) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (existing `org_membership` + `session` tables) (004-org-rbac)
- Cloudflare D1 — no schema changes required; `org_membership.role` column is the source of truth (004-org-rbac)
- TypeScript 5.7 (strict mode, `verbatimModuleSyntax: true`) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (006-platoon-management)

## Recent Changes
- 001-user-auth: Added TypeScript 5.7 (strict mode — Principle II) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
