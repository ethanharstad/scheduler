# Quickstart: Asset Management

**Feature**: 007-asset-management | **Date**: 2026-03-10

## Prerequisites

- Node.js 18+, npm
- Wrangler CLI (for D1 local dev)
- Existing auth, org, RBAC, and staff management features implemented (001-005)

## Setup

### 1. Apply Schema

```bash
# Add asset tables to src/db/schema.sql (append the DDL from data-model.md)
# Then apply locally:
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
```

### 2. Add RBAC Permission

**`src/lib/rbac.types.ts`** — Add to Permission union:
```typescript
export type Permission =
  | 'view-org-settings'
  // ... existing permissions ...
  | 'manage-assets'     // ← NEW
```

**`src/lib/rbac.ts`** — Add to owner, admin, manager sets:
```typescript
owner: new Set<Permission>([
  // ... existing ...
  'manage-assets',
]),
admin: new Set<Permission>([
  // ... existing ...
  'manage-assets',
]),
manager: new Set<Permission>([
  // ... existing ...
  'manage-assets',
]),
```

### 3. Create Type Definitions

Create `src/lib/asset.types.ts` with:
- `AssetType`, `ApparatusCategory`, `GearCategory`, `ApparatusStatus`, `GearStatus` union types
- `AssetView`, `AssetDetailView`, `InspectionView`, `AssetAuditEntry` view types
- All server function input/output types (see `contracts/server-functions.md`)

### 4. Create Server Functions

Create `src/server/assets.ts` following the patterns in `src/server/staff.ts`:
- Import `requireOrgMembership` from `@/server/_helpers`
- Import `canDo` from `@/lib/rbac`
- Implement functions per `contracts/server-functions.md`

### 5. Create Routes

```text
src/routes/_protected/orgs.$orgSlug/
├── assets.tsx            # Layout route
└── assets/
    ├── index.tsx         # Asset list (filterable)
    ├── $assetId.tsx      # Asset detail + inspection history
    ├── new.tsx           # Create asset form
    └── my-gear.tsx       # Current user's assigned gear
```

After creating route files, run `npm run dev` to regenerate `src/routeTree.gen.ts`.

## Development

```bash
npm run dev              # Start dev server (regenerates route tree)
npm run test             # Run Vitest tests
npm run build            # Production build
```

## Key Patterns to Follow

| Pattern | Reference |
|---------|-----------|
| Server function structure | `src/server/staff.ts` |
| Type definition pattern | `src/lib/staff.types.ts` |
| Route loader + context | `src/routes/_protected/orgs.$orgSlug/staff.tsx` |
| Pagination | `getStaffAuditLogServerFn` in `src/server/staff.ts` |
| Audit logging | `writeAuditLog` helper in `src/server/staff.ts` |
| Form handling | `StaffPage` component in staff route |
| Permission gating (server) | `canDo(membership.role, 'manage-assets')` |
| Permission gating (UI) | `canDo(userRole, 'manage-assets') && <button>` |

## Testing Approach

1. **Unit tests**: Validation logic (category/status enums, custom_fields validation, date parsing)
2. **Integration tests**: Server functions with D1 local (create → read → update → assign → inspect flow)
3. **Permission tests**: Verify `manage-assets` permission enforcement and staff self-inspection
