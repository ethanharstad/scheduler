# Research: Asset Management

**Feature**: 007-asset-management | **Date**: 2026-03-10

## R-001: Unified `asset` Table vs. Separate Tables

**Decision**: Single `asset` table with `asset_type` discriminator column.

**Rationale**: Apparatus and gear share ~90% of columns and have nearly identical lifecycles (create → in-service → inspect → decommission). A unified table:
- Enables real FKs from `asset_inspection` and `asset_audit_log` (no polymorphic `target_type`/`target_id`)
- Halves the CRUD server function surface area (one set of functions, type-aware)
- Makes unified inventory views trivial (single query, filter by `asset_type`)
- Reduces TypeScript type definitions via discriminated unions

**Alternatives considered**:
- Separate `apparatus` + `gear` tables: Rejected — would require duplicated CRUD, polymorphic FKs on inspections/audit logs (unenforceable by SQLite), and parallel TypeScript types.
- EAV (Entity-Attribute-Value): Rejected — trades away typed columns, CHECK constraints, unique indexes, and simple queries. Asset fields are well-known (NFPA/OSHA standards).

## R-002: Column Harmonization

**Decision**: Maximize shared columns; minimize type-specific columns.

**Rationale**:
- `serial_number` replaces both `vin` (apparatus) and `serial_number` (gear) — a VIN is a vehicle serial number
- `category` replaces both `apparatus_subtype` and `gear_category` — values scoped by `asset_type` via application logic
- `manufacture_date` (TEXT ISO 8601) replaces `year` (INTEGER) — NFPA 1851 requires actual date for PPE 10-year service life
- `expiration_date` common to both types — gear expires (SCBA, PPE), apparatus certifications expire

**Result**: 1 apparatus-specific column (`unit_number`), 2 gear-specific columns (`assigned_to_staff_id`, `assigned_to_apparatus_id`).

## R-003: D1/SQLite Compatibility for Schema Features

**Decision**: All planned schema features are compatible with Cloudflare D1.

**Findings**:
1. **Partial unique indexes** (`CREATE UNIQUE INDEX ... WHERE ...`): Fully supported. Used for `(org_id, unit_number) WHERE unit_number IS NOT NULL` and `(org_id, serial_number) WHERE serial_number IS NOT NULL`.
2. **CHECK constraints**: Supported at table creation time. Cannot be added via ALTER TABLE (SQLite limitation). Since these are new tables, no issue.
3. **Self-referential FK** (`assigned_to_apparatus_id REFERENCES asset(id)`): Supported for queries. Migration caveat: D1 enforces `PRAGMA foreign_keys = ON` permanently; dropping/recreating tables with self-referential FKs requires data copy pattern. Not a concern for initial creation.
4. **Row/TEXT size limits**: ~2 MB per row, ~2 MB per TEXT value, 100 KB per SQL statement. Custom fields 10 KB limit is well within bounds.
5. **ON DELETE CASCADE / SET NULL**: Fully supported. Used for `assigned_to_staff_id` (SET NULL on staff deletion) and `assigned_to_apparatus_id` (SET NULL on apparatus decommission is handled in application logic, CASCADE for actual deletion).

## R-004: RBAC Extension for `manage-assets`

**Decision**: Add `'manage-assets'` to the `Permission` union type and grant to `owner`, `admin`, `manager` by default.

**Rationale**: Follows the established `canDo(role, permission)` pattern in `src/lib/rbac.ts`. The existing permission matrix is a `Record<OrgRole, ReadonlySet<Permission>>` — adding a new permission string is a one-line addition per role.

**Implementation**:
1. Add `'manage-assets'` to the `Permission` type union in `src/lib/rbac.types.ts`
2. Add `'manage-assets'` to the `owner`, `admin`, and `manager` sets in `src/lib/rbac.ts`
3. Server functions check `canDo(membership.role, 'manage-assets')` for write operations

## R-005: Expiration Enforcement Strategy

**Decision**: Query-time enforcement, not scheduled worker.

**Rationale**: Cloudflare Workers don't have built-in cron support without Cron Triggers (added complexity). Query-time enforcement is simpler:
- Asset list queries check `expiration_date < current_date` and surface expired items
- UI marks expired items with visual indicators
- Optional: a server function can batch-update `status = 'expired'` when called (e.g., from an admin action or periodic trigger)

**Alternatives considered**:
- Cron Trigger worker: Adds operational complexity (separate worker, scheduling config). Deferred to future iteration if needed.

## R-006: Pagination Pattern

**Decision**: Offset-based pagination with default limit 50, max 200.

**Rationale**: Follows established pattern in `getStaffAuditLogServerFn`. Asset lists will support:
- `limit` (default 50, capped at 200)
- `offset` (default 0)
- Returns `total` count for UI pagination indicators

**Alternatives considered**:
- Cursor-based pagination: Better for large datasets but added complexity. Fire/EMS departments typically have hundreds (not millions) of assets. Offset pagination is sufficient.

## R-007: Audit Log Design

**Decision**: Separate `asset_audit_log` table (not reusing `staff_audit_log`).

**Rationale**: Asset audit actions (`asset.created`, `asset.updated`, `asset.status_changed`, `asset.inspected`, `asset.assigned`, `asset.unassigned`) are semantically distinct from staff audit actions. The `asset_audit_log` table uses a real FK to `asset.id` (vs. `staff_member_id` in `staff_audit_log`). Following the existing audit log pattern:
- Denormalized `org_id` survives org deletion
- `actor_staff_id` references the staff member who performed the action
- `detail_json` TEXT column for flexible old/new values
- Indexed on `(org_id, asset_id, created_at)` for efficient trail queries

## R-008: Custom Fields Validation

**Decision**: Flat JSON object, string/number/boolean values only, 10 KB max.

**Rationale**: Prevents abuse (deeply nested objects, massive payloads) while keeping the escape hatch flexible. Validation implemented in the server function before INSERT/UPDATE:
1. `JSON.parse()` the value
2. Verify it's a plain object (not array, not null)
3. Verify all values are string, number, or boolean (no nested objects/arrays)
4. Verify `JSON.stringify()` length ≤ 10,240 bytes

## R-009: Server Function File Organization

**Decision**: Single `src/server/assets.ts` file for all asset operations.

**Rationale**: Follows the one-file-per-feature pattern (`staff.ts`, `platoons.ts`, `schedule.ts`). Estimated ~15 server functions:
- CRUD: `createAsset`, `updateAsset`, `getAsset`, `listAssets`
- Status: `changeAssetStatus`
- Assignment: `assignGear`, `unassignGear`
- Inspections: `logInspection`, `getInspectionHistory`
- Scheduling: `setInspectionInterval`
- Queries: `getExpiringAssets`, `getOverdueInspections`, `getMyGear`, `getApparatusGear`
- Audit: `getAssetAuditLog`

File may be 400-600 lines — acceptable given it's a single cohesive feature module.

## R-010: Route Structure

**Decision**: Asset routes under `_protected/orgs.$orgSlug/assets/` with layout route.

**Rationale**: Follows the existing pattern. Routes:
- `assets.tsx` — layout route (nav, permission check for write UI)
- `assets/index.tsx` — unified list with type/status/category filters
- `assets/$assetId.tsx` — detail view + inspection history
- `assets/new.tsx` — create form (apparatus or gear selector)
- `assets/my-gear.tsx` — current user's assigned gear

No route guard on read routes (all org members can read). Write UI conditionally rendered via `canDo()` check on the client.
