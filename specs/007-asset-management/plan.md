# Implementation Plan: Asset Management

**Branch**: `007-asset-management` | **Date**: 2026-03-10 | **Spec**: `specs/007-asset-management/spec.md`
**Input**: Feature specification from `/specs/007-asset-management/spec.md`

## Summary

Add asset management to the scheduler platform — a unified `asset` table (with `asset_type` discriminator) for both apparatus (vehicles/units) and gear (PPE, SCBA, radios, etc.), plus `asset_inspection` and `asset_audit_log` tables. Features include CRUD for assets, gear assignment to staff/apparatus, inspection logging with scheduling, expiration tracking, and a complete audit trail. A new `manage-assets` RBAC permission gates write operations; all org members get read access.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode, `verbatimModuleSyntax: true`)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
**Storage**: Cloudflare D1 (SQLite, binding `DB`) — 3 new tables: `asset`, `asset_inspection`, `asset_audit_log`
**Testing**: Vitest (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Full-stack web application (SSR via TanStack Start on Cloudflare Workers)
**Performance Goals**: Standard CRUD latency; D1 SQLite queries should complete within single Worker invocation
**Constraints**: Workers runtime (no Node built-ins), D1 row size limits, bundle size < 1 MB compressed
**Scale/Scope**: Organization-level asset inventory; hundreds to low thousands of assets per org typical for fire/EMS departments

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Component-First Architecture — PASS

- Asset management UI will be self-contained route components under `_protected/orgs.$orgSlug/assets/`
- No cross-module state mutation — asset state flows through server functions and route loaders
- Components will have clearly defined props; shared org context accessed via `useRouteContext`

### Principle II: Type Safety (NON-NEGOTIABLE) — PASS

- All asset types defined in `src/lib/asset.types.ts` with discriminated unions for `AssetType`
- Server function inputs/outputs will carry explicit TypeScript types (following `staff.types.ts` pattern)
- No `any` usage; `asset_type` discriminator enables type-safe narrowing
- New `'manage-assets'` added to the `Permission` union type in `rbac.types.ts`

### Principle III: Server-First Data Fetching — PASS

- All data fetching via `createServerFn` (following existing `staff.ts`, `platoons.ts` patterns)
- Route loaders will pre-load asset lists and detail data for SSR
- Client-side calls only for mutations (create, update, assign, inspect)

### Principle IV: Edge-Runtime Compatibility — PASS

- No Node.js built-ins required; UUID generation via `crypto.randomUUID()` (Workers-native)
- D1 binding accessed via `ctx.context as unknown as Cloudflare.Env` (established pattern)
- JSON validation for `custom_fields` uses standard `JSON.parse` + type checks (no external deps)
- No new runtime dependencies introduced

### Principle V: Simplicity & YAGNI — PASS

- Unified `asset` table avoids duplicating CRUD for apparatus and gear
- Simple pass/fail inspections now; `checklist_json` column reserved for future without overbuilding
- Expiration enforcement at query time rather than building a scheduled worker
- No new abstractions beyond what's needed — follows existing `staff.ts` + `staff.types.ts` pattern
- Route files will follow existing patterns; split as needed to stay under 200 lines

## Project Structure

### Documentation (this feature)

```text
specs/007-asset-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output — full DDL
├── quickstart.md        # Phase 1 output — developer onboarding
├── contracts/           # Phase 1 output — server function contracts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── asset.types.ts          # TypeScript types: Asset, AssetInspection, AssetAuditLog, server I/O types
│   └── rbac.types.ts           # Updated: add 'manage-assets' to Permission union
├── server/
│   └── assets.ts               # Server functions: CRUD, assignment, inspection, audit queries
├── routes/_protected/orgs.$orgSlug/
│   ├── assets.tsx              # Layout route for asset management section
│   └── assets/
│       ├── index.tsx           # Unified asset list (filterable by type, status, category)
│       ├── $assetId.tsx        # Asset detail + inspection history
│       ├── new.tsx             # Create asset form (apparatus or gear)
│       └── my-gear.tsx         # Current user's assigned gear
├── db/
│   └── schema.sql              # Updated: add asset, asset_inspection, asset_audit_log tables
└── lib/
    └── rbac.ts                 # Updated: add 'manage-assets' to owner, admin, manager role sets
```

**Structure Decision**: Follows existing patterns — single server function file per feature (`assets.ts`), types file in `lib/`, route files under the org layout. No new structural patterns introduced.

## Complexity Tracking

> No constitution violations identified. Table left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | | |

## Constitution Check — Post-Design Re-evaluation

*Re-checked after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md) are complete.*

### Principle I: Component-First Architecture — PASS
Routes are self-contained under `assets/`. No cross-module state mutation. Asset data flows through server functions → route loaders → component props/context.

### Principle II: Type Safety (NON-NEGOTIABLE) — PASS
All types defined in `asset.types.ts` with discriminated unions (`AssetType`, category/status enums). Server I/O types are explicit per contract. `Permission` union extended with `'manage-assets'`. No `any` usage.

### Principle III: Server-First Data Fetching — PASS
All 15 server functions use `createServerFn`. Route loaders pre-load asset lists and detail data for SSR. Client-side calls only for mutations.

### Principle IV: Edge-Runtime Compatibility — PASS
No Node built-ins required. UUID via `crypto.randomUUID()`. JSON validation via standard `JSON.parse` + type checks. D1 via established binding pattern. No new runtime dependencies.

### Principle V: Simplicity & YAGNI — PASS
Single server file (`assets.ts`), minimal abstractions. `checklist_json` reserved but not overbuilt. Query-time expiration instead of scheduled worker. Route files will stay under 200 lines.

**Result**: All gates pass. No violations. Implementation may proceed.
