# Implementation Plan: Platoon Management

**Branch**: `006-platoon-management` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-platoon-management/spec.md`

## Summary

Add org-level platoon management to the scheduler. Platoons are named shift groups (e.g., "A Shift", "B Shift") that follow recurring iCalendar RRULE-based rotation schedules (24/48, 24/72, etc.) and have assigned staff members. Two new D1 tables (`platoon`, `platoon_membership`), seven server functions in `src/server/platoons.ts`, types in `src/lib/platoon.types.ts`, and two routes under the org workspace. Permissions gate on existing `create-edit-schedules` (write) and `view-schedules` (read) RBAC permissions — no new permissions required.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode, `verbatimModuleSyntax: true`)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1
**Storage**: Cloudflare D1 (SQLite, binding: `DB`)
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Web application (SSR + client hydration)
**Performance Goals**: Page loads arrive hydrated; mutations respond within standard edge latency
**Constraints**: No Node.js built-ins; bundle size within Workers 1 MB compressed limit; D1 batch for atomic multi-statement operations
**Scale/Scope**: Org-level platoon management; typically 2–6 platoons per org; dozens of members per platoon

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Component-First | ✅ PASS | Platoon list and detail are self-contained route components; no cross-boundary state mutation |
| II. Type Safety | ✅ PASS | All server fn I/O in `platoon.types.ts`; no `any` permitted |
| III. Server-First | ✅ PASS | All data via `createServerFn`; route loaders pre-load all data; no client-side fetch |
| IV. Edge-Runtime | ✅ PASS | RRULE validation uses pure-JS regex (no Node APIs); no in-memory state across requests |
| V. Simplicity & YAGNI | ✅ PASS | No new abstractions; `requireOrgMembership` pattern inlined in `platoons.ts` (only used in one new file); 7 server fns cover all 13 FRs; routes stay under 200 lines |

## Project Structure

### Documentation (this feature)

```text
specs/006-platoon-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── platoons.md      # Server function I/O contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.sql                         # MODIFY: add platoon + platoon_membership tables
├── lib/
│   └── platoon.types.ts                   # NEW: TypeScript types for platoon feature
├── server/
│   └── platoons.ts                        # NEW: 7 server functions
└── routes/
    └── _protected/
        └── orgs.$orgSlug/
            ├── platoons.tsx               # NEW: platoon list page
            └── platoons.$platoonId.tsx    # NEW: platoon detail page

```

**Structure Decision**: Single-project web application matching existing feature layout. Mirrors `members.ts` / `members.tsx` pattern exactly.

## Phase 0: Research

See [research.md](./research.md) for full findings.

**Key decisions**:
- RRULE validation: Pure-JS regex validator (no npm package); checks `FREQ=` property + `KEY=VALUE;` grammar — Workers-safe, zero bundle impact
- Case-insensitive name uniqueness: `LOWER(name)` in D1 unique index (`idx_platoon_org_name`)
- `requireOrgMembership` helper: Inline copy in `platoons.ts` — single new file use does not justify extracting a shared module (Principle V)
- Predefined shortcuts (24/48 → `FREQ=DAILY;INTERVAL=3`, 24/72 → `FREQ=DAILY;INTERVAL=4`, 48/96 → `FREQ=DAILY;INTERVAL=6`): Client-side JS only; not stored

## Phase 1: Design

See [data-model.md](./data-model.md) and [contracts/platoons.md](./contracts/platoons.md).

### Server Functions (`src/server/platoons.ts`)

| Function | Method | Permission | Description |
|---|---|---|---|
| `listPlatoonsServerFn` | GET | `view-schedules` | Returns all platoons for org, sorted by name, with member count |
| `getPlatoonServerFn` | GET | `view-schedules` | Returns platoon detail + member names |
| `createPlatoonServerFn` | POST | `create-edit-schedules` | Creates platoon; validates RRULE; enforces unique name |
| `updatePlatoonServerFn` | POST | `create-edit-schedules` | Updates platoon fields; validates RRULE |
| `deletePlatoonServerFn` | POST | `create-edit-schedules` | Deletes platoon; CASCADE removes memberships |
| `assignMemberServerFn` | POST | `create-edit-schedules` | Upserts platoon_membership (replaces prior assignment — last-write-wins) |
| `removeMemberFromPlatoonServerFn` | POST | `create-edit-schedules` | Removes staff member from a platoon |

### Routes

| Route file | URL | Access | Loader |
|---|---|---|---|
| `orgs.$orgSlug/platoons.tsx` | `/orgs/:slug/platoons` | All members (`view-schedules`) | `listPlatoonsServerFn` |
| `orgs.$orgSlug/platoons.$platoonId.tsx` | `/orgs/:slug/platoons/:id` | All members (`view-schedules`) | `getPlatoonServerFn` |

Both routes: no `beforeLoad` redirect — all members may view. Write controls rendered conditionally via `canDo(userRole, 'create-edit-schedules')`.

### Nav Integration

Add "Platoons" link to the org sidebar in `src/routes/_protected/orgs.$orgSlug.tsx` (visible to all members since `view-schedules` is granted to every role including `employee`).

## Verification

1. `npm run dev` — dev server starts without type errors or route conflicts
2. Log in as **employee** → navigate to `/orgs/:slug/platoons` → see platoon list; no create/edit/delete buttons visible
3. Log in as **manager** → create platoon "A Platoon" with shift label "A Shift", 24/48 RRULE (`FREQ=DAILY;INTERVAL=3`), start date 2026-01-01 → platoon appears in list
4. Submit with invalid RRULE → validation error surfaced, no platoon created
5. Attempt duplicate name → duplicate-name error returned
6. Open platoon detail → assign two staff members → member count = 2
7. Assign one of those members to a second platoon → confirmation prompt → confirm → member moves
8. Remove the other member → member count decrements; staff roster unaffected
9. Delete platoon → confirmation prompt → platoon removed; formerly assigned members still appear in staff roster
10. `npm run test` — all tests pass
