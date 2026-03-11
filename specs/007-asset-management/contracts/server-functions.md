# Server Function Contracts: Asset Management

**Feature**: 007-asset-management | **Date**: 2026-03-10
**File**: `src/server/assets.ts`

All server functions follow the established pattern:
- `createServerFn({ method })` with `.inputValidator()` and `.handler()`
- Return discriminated unions: `{ success: true; ... } | { success: false; error: string }`
- Access Cloudflare env: `ctx.context as unknown as Cloudflare.Env`
- Permission check: `requireOrgMembership()` + `canDo(role, 'manage-assets')`

---

## Asset CRUD

### `createAssetServerFn` — POST

Creates an apparatus or gear asset.

**Input**:
```typescript
interface CreateAssetInput {
  orgSlug: string
  assetType: 'apparatus' | 'gear'
  name: string                           // 1-200 chars
  category: string                       // type-scoped enum value
  status?: string                        // defaults: apparatus='in_service', gear='available'
  serialNumber?: string
  make?: string
  model?: string
  notes?: string
  manufactureDate?: string               // ISO 8601
  purchasedDate?: string
  inServiceDate?: string
  expirationDate?: string
  warrantyExpirationDate?: string
  customFields?: Record<string, string | number | boolean>
  // Apparatus-specific
  unitNumber?: string                    // required when assetType='apparatus'
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE_UNIT_NUMBER' | 'DUPLICATE_SERIAL_NUMBER' | 'INVALID_CATEGORY' | 'INVALID_INPUT' }
```

**Permission**: `manage-assets`
**Side effects**: Writes `asset.created` audit log entry.

---

### `updateAssetServerFn` — POST

Updates mutable fields on an existing asset. Cannot change `asset_type`.

**Input**:
```typescript
interface UpdateAssetInput {
  orgSlug: string
  assetId: string
  name?: string
  category?: string
  serialNumber?: string | null           // null to clear
  make?: string | null
  model?: string | null
  notes?: string | null
  manufactureDate?: string | null
  purchasedDate?: string | null
  inServiceDate?: string | null
  expirationDate?: string | null
  warrantyExpirationDate?: string | null
  customFields?: Record<string, string | number | boolean> | null
  unitNumber?: string                    // apparatus only
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_UNIT_NUMBER' | 'DUPLICATE_SERIAL_NUMBER' | 'INVALID_CATEGORY' | 'DECOMMISSIONED' | 'INVALID_INPUT' }
```

**Permission**: `manage-assets`
**Side effects**: Writes `asset.updated` audit log entry with changed fields in `detail_json`.

---

### `getAssetServerFn` — POST

Retrieves a single asset by ID with full detail.

**Input**:
```typescript
interface GetAssetInput {
  orgSlug: string
  assetId: string
}
```

**Output**:
```typescript
{ success: true; asset: AssetDetailView }
| { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
```

**Permission**: Any org member (read access).

---

### `listAssetsServerFn` — POST

Paginated, filterable asset list.

**Input**:
```typescript
interface ListAssetsInput {
  orgSlug: string
  assetType?: 'apparatus' | 'gear'      // filter by type
  status?: string                        // filter by status
  category?: string                      // filter by category
  assignedToStaffId?: string             // filter gear by staff assignment
  assignedToApparatusId?: string         // filter gear by apparatus assignment
  search?: string                        // search name, unit_number, serial_number
  limit?: number                         // default 50, max 200
  offset?: number                        // default 0
}
```

**Output**:
```typescript
{ success: true; assets: AssetView[]; total: number }
| { success: false; error: 'UNAUTHORIZED' }
```

**Permission**: Any org member (read access).

---

## Status Management

### `changeAssetStatusServerFn` — POST

Changes an asset's status. Handles side effects (unassigning gear on decommission).

**Input**:
```typescript
interface ChangeAssetStatusInput {
  orgSlug: string
  assetId: string
  newStatus: string                      // must be valid for asset's type
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_STATUS' | 'DECOMMISSIONED' }
```

**Permission**: `manage-assets`
**Side effects**:
- Writes `asset.status_changed` audit log with old/new status
- If apparatus → decommissioned: unassigns all gear, writes `asset.unassigned` for each
- If gear → decommissioned: clears assignment, writes `asset.unassigned` if was assigned

---

## Gear Assignment

### `assignGearServerFn` — POST

Assigns a gear asset to a staff member or apparatus.

**Input**:
```typescript
interface AssignGearInput {
  orgSlug: string
  assetId: string                        // must be a gear asset
  assignToStaffId?: string               // exactly one of these must be provided
  assignToApparatusId?: string
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_GEAR' | 'DECOMMISSIONED' | 'EXPIRED' | 'INVALID_TARGET' | 'INVALID_INPUT' }
```

**Permission**: `manage-assets`
**Side effects**:
- If previously assigned: writes `asset.unassigned` audit entry
- Writes `asset.assigned` audit entry with target info
- Sets gear status to `assigned`

---

### `unassignGearServerFn` — POST

Removes gear assignment.

**Input**:
```typescript
interface UnassignGearInput {
  orgSlug: string
  assetId: string
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_ASSIGNED' }
```

**Permission**: `manage-assets`
**Side effects**: Writes `asset.unassigned` audit entry. Sets status to `available` (unless `out_of_service`).

---

## Inspections

### `logInspectionServerFn` — POST

Logs an inspection on an asset.

**Input**:
```typescript
interface LogInspectionInput {
  orgSlug: string
  assetId: string
  result: 'pass' | 'fail'
  notes?: string
  inspectionDate?: string                // ISO 8601; defaults to today
}
```

**Output**:
```typescript
{ success: true; inspection: InspectionView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' }
```

**Permission**: `manage-assets` OR assigned staff member (for gear assigned to them).
**Side effects**:
- Writes `asset.inspected` audit entry
- If asset has `inspection_interval_days`: recalculates `next_inspection_due`

---

### `getInspectionHistoryServerFn` — POST

Paginated inspection history for an asset.

**Input**:
```typescript
interface GetInspectionHistoryInput {
  orgSlug: string
  assetId: string
  limit?: number                         // default 50, max 200
  offset?: number
}
```

**Output**:
```typescript
{ success: true; inspections: InspectionView[]; total: number }
| { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
```

**Permission**: Any org member (read access).

---

## Inspection Scheduling

### `setInspectionIntervalServerFn` — POST

Sets or clears the inspection interval on an asset.

**Input**:
```typescript
interface SetInspectionIntervalInput {
  orgSlug: string
  assetId: string
  intervalDays: number | null            // null to clear; positive integer to set
}
```

**Output**:
```typescript
{ success: true; asset: AssetView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' }
```

**Permission**: `manage-assets`
**Side effects**: Recalculates `next_inspection_due` from last inspection or today.

---

## Queries / Alerts

### `getExpiringAssetsServerFn` — POST

Returns assets expiring within a lookahead window.

**Input**:
```typescript
interface GetExpiringAssetsInput {
  orgSlug: string
  lookaheadDays?: number                 // default 90
}
```

**Output**:
```typescript
{ success: true; assets: AssetView[] }
| { success: false; error: 'UNAUTHORIZED' }
```

**Permission**: Any org member (read access).

---

### `getOverdueInspectionsServerFn` — POST

Returns assets with overdue or upcoming inspections.

**Input**:
```typescript
interface GetOverdueInspectionsInput {
  orgSlug: string
  lookaheadDays?: number                 // default 7
}
```

**Output**:
```typescript
{ success: true; assets: AssetView[] }
| { success: false; error: 'UNAUTHORIZED' }
```

**Permission**: Any org member (read access).

---

### `getMyGearServerFn` — POST

Returns all gear assigned to the current user's staff member record.

**Input**:
```typescript
interface GetMyGearInput {
  orgSlug: string
}
```

**Output**:
```typescript
{ success: true; assets: AssetView[] }
| { success: false; error: 'UNAUTHORIZED' | 'NO_STAFF_RECORD' }
```

**Permission**: Any org member (personal gear only).

---

### `getApparatusGearServerFn` — POST

Returns all gear assigned to a specific apparatus.

**Input**:
```typescript
interface GetApparatusGearInput {
  orgSlug: string
  apparatusId: string
}
```

**Output**:
```typescript
{ success: true; assets: AssetView[] }
| { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
```

**Permission**: Any org member (read access).

---

## Audit

### `getAssetAuditLogServerFn` — POST

Paginated audit trail for an asset.

**Input**:
```typescript
interface GetAssetAuditLogInput {
  orgSlug: string
  assetId: string
  limit?: number                         // default 50, max 200
  offset?: number
}
```

**Output**:
```typescript
{ success: true; entries: AssetAuditEntry[]; total: number }
| { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }
```

**Permission**: Any org member (read access).

---

## View Types

### `AssetView` (list item)

```typescript
interface AssetView {
  id: string
  orgId: string
  assetType: 'apparatus' | 'gear'
  name: string
  category: string
  status: string
  serialNumber: string | null
  make: string | null
  model: string | null
  unitNumber: string | null              // apparatus only
  assignedToStaffId: string | null       // gear only
  assignedToStaffName: string | null     // denormalized for display
  assignedToApparatusId: string | null   // gear only
  assignedToApparatusName: string | null // denormalized for display
  expirationDate: string | null
  nextInspectionDue: string | null
  createdAt: string
  updatedAt: string
}
```

### `AssetDetailView` (single asset detail)

```typescript
interface AssetDetailView extends AssetView {
  notes: string | null
  manufactureDate: string | null
  purchasedDate: string | null
  inServiceDate: string | null
  warrantyExpirationDate: string | null
  inspectionIntervalDays: number | null
  customFields: Record<string, string | number | boolean> | null
}
```

### `InspectionView`

```typescript
interface InspectionView {
  id: string
  assetId: string
  inspectorStaffId: string
  inspectorName: string                  // denormalized
  result: 'pass' | 'fail'
  notes: string | null
  inspectionDate: string
  createdAt: string
}
```

### `AssetAuditEntry`

```typescript
interface AssetAuditEntry {
  id: string
  actorStaffId: string
  actorName: string | null               // denormalized
  action: string
  assetId: string
  detailJson: Record<string, unknown> | null
  createdAt: string
}
```
