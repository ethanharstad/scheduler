# Implementation Plan: Organization Creation

**Branch**: `003-create-org` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-create-org/spec.md`

## Summary

An authenticated user creates an organization (the system's top-level tenant) by providing a name and a unique URL slug. The system writes both an `organization` row and an `org_membership` row (role: `owner`) in a single atomic batch, then redirects the user into the org workspace at `/orgs/[slug]`. All future data — departments, staff, schedules — is scoped to an organization via foreign key to `organization.id`. Implemented as two new D1 tables, three server functions, one new types module, and three new route files.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
**Storage**: Cloudflare D1 (SQLite) — binding name `DB`; two new tables: `organization`, `org_membership`
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Full-stack SSR web application (SaaS, multi-tenant)
**Performance Goals**: Org creation completes end-to-end in under 90 seconds (user flow); org workspace loads in under 1 second
**Constraints**: Workers runtime only — `globalThis.crypto.randomUUID()`, no Node.js APIs; bundle < 1 MB compressed
**Scale/Scope**: Multi-tenant SaaS; soft cap 10 orgs per user; expected initial scale: hundreds of orgs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all still pass.*

| Principle | Status | Notes |
|---|---|---|
| I. Component-First | ✅ Pass | `CreateOrgForm` is a standalone component; org workspace layout wraps child routes via `<Outlet />`; both have clear prop boundaries |
| II. Type Safety | ✅ Pass | `OrgView`, `CreateOrgInput`, `OrgMembershipView` defined in `org.types.ts`; all server fn inputs and outputs carry explicit types |
| III. Server-First | ✅ Pass | All D1 queries live inside `createServerFn` handlers; the `orgs.$orgSlug.tsx` loader pre-hydrates org data before first render |
| IV. Edge-Runtime | ✅ Pass | Uses only D1 (already in use) and `globalThis.crypto.randomUUID()`; no Node.js built-ins required |
| V. Simplicity/YAGNI | ✅ Pass | Three server functions, two tables, three route files, one types module — minimum necessary; no premature abstractions |

No violations — Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-create-org/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/
│   └── server-functions.md   # Phase 1 output
└── tasks.md                   # Phase 2 output (from /speckit.tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.sql                        # update: append organization + org_membership tables
├── lib/
│   └── org.types.ts                      # new: OrgRole, Organization, OrgMembership, view & input types
├── server/
│   └── org.ts                            # new: createOrgServerFn, getOrgServerFn, listUserOrgsServerFn
└── routes/
    └── _protected/
        ├── create-org.tsx                # new: /create-org — org creation form page
        ├── orgs.$orgSlug.tsx             # new: /orgs/$orgSlug — org workspace layout (loads org, verifies membership)
        └── orgs.$orgSlug/
            └── index.tsx                 # new: /orgs/$orgSlug — org dashboard placeholder
```

**Structure Decision**: Single-project web app (Option 1 baseline). All new source files are additive and follow the existing `src/lib/`, `src/server/`, `src/routes/_protected/` pattern established in 001-user-auth and 002-user-profile.
