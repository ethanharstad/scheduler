# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev             # Start dev server on port 3000
npm run build           # Build for production
npm run preview         # Build and preview production version
npm run test            # Run tests with Vitest
npm run deploy:dev      # Build and deploy to Cloudflare Workers (dev)
npm run deploy:prod     # Build and deploy to Cloudflare Workers (prod)
npm run cf-typegen      # Regenerate Cloudflare Worker binding types
npm run migrate:local   # Apply unapplied D1 migrations to local DB
npm run migrate:dev     # Apply unapplied D1 migrations to remote dev DB
npm run migrate:prod    # Apply unapplied D1 migrations to remote prod DB
```

## Architecture

This is a full-stack React SaaS application using **TanStack Start** (SSR meta-framework), deployed to **Cloudflare Workers**. It's an emergency services workforce management tool (fire, EMS, law enforcement) with a multi-tenant org → department → station hierarchy and tiered plans (Free / Basic / Pro).

**Key libraries:**
- TanStack Start v1 + TanStack Router — file-based routing, SSR, server functions
- React 19 + TypeScript 5.7 (strict mode, `verbatimModuleSyntax: true`)
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no config file)
- Lucide React for icons
- Cloudflare D1 (SQLite, binding: `DB`) — cross-org auth/routing tables only
- Cloudflare R2 (binding: `PROFILE_PHOTOS`) — avatar image storage
- Cloudflare Durable Objects (binding: `ORG_DO`) — per-org data isolation

**Routing:** Routes live in `src/routes/`. `src/routeTree.gen.ts` is auto-generated — never edit it manually (regenerated on `dev`/`build`). The root layout is `src/routes/__root.tsx`.

**SSR + Cloudflare:** Vite builds two bundles — client (`dist/client/`) and server (`dist/server/`). The server bundle runs on Cloudflare Workers via `src/server.ts` (custom entry; `wrangler.jsonc` `"main"` points here). This passes `env` as request context so server functions can access Cloudflare bindings.

**Path alias:** `@/*` maps to `./src/*`.

### Multi-Tenant Durable Object Architecture

Each organization gets a dedicated Cloudflare Durable Object instance (`OrgDurableObject`) with its own SQLite database. This provides per-org data isolation.

- **D1** holds only cross-org tables: auth (user, session, tokens), org routing (`organization`, `org_membership`), invitation token index, and system form templates.
- **Durable Objects** hold all org-scoped data: staff, schedules, platoons, assets, qualifications, stations, constraints, forms, and org settings.
- **Schema files:** D1 schema in `src/db/schema.sql`; DO schema in `src/do/schema.sql`.
- **DO entry point:** `src/do/org-durable-object.ts` — exports `OrgDurableObject` class re-exported from `src/server.ts`.

Server functions interact with the DO via the `ORG_DO` binding. The DO exposes RPC methods like `.query()`, `.queryOne()`, etc. for SQL operations against the per-org SQLite.

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

**Pathless layout:** `_protected.tsx` at the routes root guards auth and renders the app shell (sidebar + topbar with breadcrumb navigation and org switcher). Child routes in `_protected/` appear at their URL without the `/_protected` prefix (e.g., `_protected/home.tsx` → `/home`).

**Admin routes:** `_protected/_admin.tsx` guards system-admin access. Children: `admin.tsx` (dashboard), `admin_.orgs.tsx` (manage orgs), `admin_.users.tsx` (manage users).

**Nested org workspace:** `orgs.$orgSlug.tsx` is a layout; its `beforeLoad` fetches org + user role and returns `{ org, userRole }`. Child routes in `orgs.$orgSlug/` read context via:
```typescript
useRouteContext({ from: '/_protected/orgs/$orgSlug' })
```

**Org workspace route groups:**
- `index.tsx` — Org dashboard
- `staff.*` — Staff management (list, detail, audit log)
- `members.tsx` — Org membership & role management
- `schedules.*` — Schedules, platoons, requirements
- `qualifications.*` — Certifications, positions
- `availability.tsx` — Staff time-off/constraint management
- `assets/*` — Equipment & apparatus (list, detail, new, my-gear)
- `forms/*` — Form templates, submissions, builder, renderer
- `stations.tsx` — Station/location management
- `settings.*` — Org settings (qualifications, scheduling, ranks, cert types, positions, requirements)

**Public routes** (outside `_protected`): landing page, login, register, forgot/reset password, verify-email, join (staff invitation acceptance).

## Database

### D1 Schema (Cross-Org)

D1 SQLite — binding `DB`. Tables:
- `user`, `session`, `email_verification_token`, `password_reset_token` (auth)
- `user_profile` (1:1 with user; lazy INSERT OR IGNORE on first access)
- `organization` (id, slug UNIQUE, name, plan, status, created_at) — routing index only
- `org_membership` (org_id, user_id UNIQUE pair, role: `owner|admin|manager|employee|payroll_hr`, status)
- `invitation_token_index` (token PK, org_id FK) — public token → org lookup for unauthenticated join flow
- `form_template`, `form_template_version` — system-level form templates (org_id = NULL)

Full D1 schema in `src/db/schema.sql`.

### Durable Object Schema (Per-Org)

Each org's DO has its own SQLite with these table groups:
- **org_settings** — org config including `schedule_day_start` (HH:MM, default '00:00')
- **Membership** — `org_membership` (source of truth for org roles)
- **Stations** — `station` (name, code, address, status, sort_order)
- **Qualifications** — `rank`, `cert_type`, `cert_level`, `position`, `position_cert_requirement`
- **Staff** — `staff_member`, `staff_invitation` (token UNIQUE, 7-day expiry), `staff_audit_log`, `staff_certification`
- **Scheduling** — `schedule`, `shift_assignment`
- **Platoons** — `platoon` (with `rrules` JSON for recurrence), `platoon_membership` (unique staff_member_id — one platoon per staff)
- **Constraints** — `staff_constraint` (time_off, unavailable, preferred, not_preferred)
- **Requirements** — `schedule_requirement` (with rrule, position requirements, time windows)
- **Assets** — `asset` (apparatus vs gear types), `asset_location`, `asset_inspection_schedule`, `asset_audit_log`
- **Forms** — `form_template`, `form_template_version`, `form_submission`, `form_response_value`

Full DO schema in `src/do/schema.sql`. Feature specs and data models in `specs/`.

### Migrations

Schema changes for D1 are managed via Wrangler D1's built-in migration system. DO schema changes are handled within the Durable Object initialization.

**Dual-file convention:**
- `migrations/` — wrangler-managed incremental migration files (source of truth for applying changes). Applied in order; each file is recorded once.
- `src/db/schema.sql` — full D1 schema reference snapshot. Must be kept in sync with every new migration.

**To add a new D1 schema change:**
```bash
wrangler d1 migrations create scheduler-auth <description>
# Edit the generated migrations/NNNN_<description>.sql
# ALSO update src/db/schema.sql to reflect the final cumulative schema
npm run migrate:local
npm run migrate:dev   # or migrate:prod
```

## Configurable Start of Day

`org_settings.schedule_day_start` (HH:MM, default `'00:00'`) in the Durable Object defines when the org's calendar day rolls over — **not necessarily midnight**. Fire stations commonly set this to `'07:00'` so that a 24-hour shift starting at 7am belongs entirely to one "day".

**This affects any feature that computes "today", "this week", date ranges, overdue checks, or expiration comparisons.** Never use `new Date()` or `new Date().toISOString().slice(0, 10)` as a stand-in for "today". Always derive the current date relative to the org's day start.

`org.scheduleDayStart` is available on `OrgView` and in the org route context (`useRouteContext({ from: '/_protected/orgs/$orgSlug' })`). Server functions must fetch it from the DO's `org_settings` table.

**Reference implementation** (copy this pattern into any feature that needs "today"):

```typescript
// Works on both server and client. scheduleDayStart is HH:MM (e.g. "07:00").
function orgToday(scheduleDayStart: string): string {
  const now = new Date()
  const [h, m] = scheduleDayStart.split(':').map(Number)
  const dayStartMs = ((h ?? 0) * 60 + (m ?? 0)) * 60 * 1000
  const utcMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000
  const effectiveDate = utcMs < dayStartMs ? new Date(now.getTime() - 86400000) : now
  return effectiveDate.toISOString().slice(0, 10)
}
```

**Date arithmetic:** When computing days between two ISO date strings, always append `T00:00:00Z` before constructing a `Date` to avoid DST/timezone ambiguity:
```typescript
const ms = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(orgToday(dayStart) + 'T00:00:00Z').getTime()
const days = Math.ceil(ms / 86400000)
```

## Visual Style

**Branding guide:** `specs/branding.md` — reference this for all visual style decisions including colors, typography, spacing, component patterns, and tone. All UI work should align with the brand identity defined there.

**Layout:** App pages (inside `_protected`) use full available width — do not add `max-w-*` or `mx-auto` to page-level containers. Auth pages and the landing page may use centered, narrow containers.

## Code Organization

- `src/server/` — Server functions grouped by feature (16 files): `auth.ts`, `org.ts`, `members.ts`, `profile.ts`, `staff.ts`, `qualifications.ts`, `stations.ts`, `schedules.ts`, `platoons.ts`, `schedule-requirements.ts`, `constraints.ts`, `assets.ts`, `forms.ts`, `admin.ts`, `_helpers.ts` (shared auth/error utilities), `_do-helpers.ts` (DO interaction helpers)
- `src/lib/` — Shared types and utilities (24 files): `auth.ts` (PBKDF2-SHA256), `rbac.ts` (permission matrix with `canDo(role, action)`), `date-utils.ts`, `rrule.ts` (recurrence rule helpers), `org-context.tsx` (React context for selected org), `*.types.ts` (per-feature type definitions for each domain)
- `src/routes/` — File-based routes (TanStack Router, ~60 files)
- `src/do/` — Durable Object: `org-durable-object.ts` (class), `schema.sql` (per-org schema)
- `src/components/` — Shared React components: `Header.tsx`, `ScheduleCalendar.tsx`, `form-builder/FieldBuilder.tsx`, `form-renderer/FormRenderer.tsx`
- `src/types/` — TypeScript type definitions (e.g., `env.d.ts` for Cloudflare env)
- `src/db/` — D1 database schema reference
- `specs/` — Feature specs, plans, data models, and task checklists (001–007)

## Feature Tracking

Two root-level markdown files track feature status:

- **`FEATURES.md`** — All implemented features with descriptions and spec references.
- **`ROADMAP.md`** — Planned features not yet implemented.

**Maintenance rules (follow these whenever completing a feature):**
1. When a feature from `ROADMAP.md` is fully implemented, **remove it from `ROADMAP.md`** and **add a corresponding entry to `FEATURES.md`** with a brief description and a link to its spec directory (if one exists).
2. When starting a new feature that isn't on the roadmap, add it to `ROADMAP.md` first. Move it to `FEATURES.md` upon completion.
3. Keep entries concise — a heading, spec reference, and 2–4 sentence summary.
4. `FEATURES.md` also has an "Additional Implemented Capabilities" section for features built without a numbered spec. Add to this section when appropriate.
5. `specs/roadmap.md` is the original strategic roadmap document (read-only reference). `ROADMAP.md` is the living working copy that gets updated as features ship.

## Key Domain Concepts

- **Staff vs Members:** `org_membership` tracks platform users' roles within an org. `staff_member` tracks personnel on the roster (may or may not be linked to a platform user via `user_id`). Staff with `roster_only` status exist only on paper; `pending` have been invited; `active` have accepted.
- **Platoons:** Rotating shift groups using recurrence rules (`rrules` JSON field — see `src/lib/rrule.ts`). Each staff member belongs to at most one platoon.
- **Assets:** Two types — `apparatus` (vehicles with `unit_number`) and `gear` (personal equipment). Assets can be assigned to staff, other apparatus, or locations. Support inspection schedules with recurrence rules.
- **Forms:** Template → versioned fields → submissions → response values. Can be linked to asset inspection schedules or arbitrary entities. System templates (D1, org_id = NULL) vs org templates (DO).
- **Qualifications:** Ranks (ordered), certification types (optionally leveled via `cert_level`), and positions (with rank + cert requirements). Staff members hold certifications tracked in `staff_certification`.
