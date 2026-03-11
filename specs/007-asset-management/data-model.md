# Data Model: Asset Management

**Feature**: 007-asset-management | **Date**: 2026-03-10

## Entity Relationship Diagram

```text
organization (1) ──── (N) asset
                              │
                              ├── asset_type: 'apparatus' | 'gear'
                              │
                              ├── (gear only) assigned_to_staff_id ──→ staff_member
                              ├── (gear only) assigned_to_apparatus_id ──→ asset (self-ref)
                              │
                              ├── (1) ──── (N) asset_inspection
                              │                    └── inspector_staff_id ──→ staff_member
                              │
                              └── (1) ──── (N) asset_audit_log
                                                   └── actor_staff_id ──→ staff_member
```

## Tables

### `asset` — Unified Asset Table

Stores all organizational assets (apparatus and gear) in a single table with an `asset_type` discriminator.

```sql
CREATE TABLE IF NOT EXISTS asset (
  id                        TEXT NOT NULL PRIMARY KEY,   -- crypto.randomUUID()
  org_id                    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_type                TEXT NOT NULL,               -- 'apparatus' | 'gear'
  name                      TEXT NOT NULL,               -- display name, 1-200 chars
  category                  TEXT NOT NULL,               -- type-scoped values (see enums below)
  status                    TEXT NOT NULL,               -- type-scoped values (see enums below)
  serial_number             TEXT,                        -- VIN for apparatus, serial for gear; unique per org
  make                      TEXT,                        -- manufacturer name
  model                     TEXT,                        -- model name
  notes                     TEXT,                        -- free-text notes

  -- Lifecycle dates (common to all types, per NFPA 1851/1911)
  manufacture_date          TEXT,                        -- ISO 8601 date
  purchased_date            TEXT,                        -- ISO 8601 date
  in_service_date           TEXT,                        -- ISO 8601 date
  expiration_date           TEXT,                        -- ISO 8601 date
  warranty_expiration_date  TEXT,                        -- ISO 8601 date

  -- Inspection scheduling
  inspection_interval_days  INTEGER,                     -- cadence in days (NULL = no schedule)
  next_inspection_due       TEXT,                        -- ISO 8601 date

  -- Extensibility
  custom_fields             TEXT,                        -- flat JSON object, max 10 KB, NULL default

  -- Apparatus-specific (NULL for gear)
  unit_number               TEXT,                        -- operational callsign, e.g. "E-1"

  -- Gear-specific (NULL for apparatus)
  assigned_to_staff_id      TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
  assigned_to_apparatus_id  TEXT REFERENCES asset(id) ON DELETE SET NULL,

  -- Timestamps
  created_at                TEXT NOT NULL,               -- ISO 8601
  updated_at                TEXT NOT NULL,               -- ISO 8601

  -- Integrity constraints
  CHECK (asset_type IN ('apparatus', 'gear')),
  CHECK (asset_type != 'apparatus' OR unit_number IS NOT NULL),
  CHECK (asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)),
  CHECK (NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL))
);

-- Partial unique: unit_number unique per org (apparatus only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_unit
  ON asset(org_id, unit_number) WHERE unit_number IS NOT NULL;

-- Partial unique: serial_number unique per org (all types)
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_serial
  ON asset(org_id, serial_number) WHERE serial_number IS NOT NULL;

-- Filtered inventory queries
CREATE INDEX IF NOT EXISTS idx_asset_org_type
  ON asset(org_id, asset_type, status);

-- Gear assigned to staff member
CREATE INDEX IF NOT EXISTS idx_asset_staff_assignment
  ON asset(assigned_to_staff_id) WHERE assigned_to_staff_id IS NOT NULL;

-- Gear assigned to apparatus
CREATE INDEX IF NOT EXISTS idx_asset_apparatus_assignment
  ON asset(assigned_to_apparatus_id) WHERE assigned_to_apparatus_id IS NOT NULL;

-- Expiration tracking
CREATE INDEX IF NOT EXISTS idx_asset_expiration
  ON asset(org_id, expiration_date) WHERE expiration_date IS NOT NULL;

-- Inspection due tracking
CREATE INDEX IF NOT EXISTS idx_asset_inspection_due
  ON asset(org_id, next_inspection_due) WHERE next_inspection_due IS NOT NULL;
```

**CHECK Constraints Explained**:
1. `asset_type IN ('apparatus', 'gear')` — Only two valid asset types
2. `asset_type != 'apparatus' OR unit_number IS NOT NULL` — Apparatus must have unit_number
3. `asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)` — Apparatus cannot be assigned
4. `NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL)` — Gear can be assigned to staff OR apparatus, not both

### `asset_inspection` — Immutable Inspection Records

```sql
CREATE TABLE IF NOT EXISTS asset_inspection (
  id                  TEXT NOT NULL PRIMARY KEY,          -- crypto.randomUUID()
  org_id              TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_id            TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  inspector_staff_id  TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  result              TEXT NOT NULL,                      -- 'pass' | 'fail'
  notes               TEXT,                              -- free-text notes
  inspection_date     TEXT NOT NULL,                      -- ISO 8601 date
  checklist_json      TEXT,                              -- reserved for future checklist data
  created_at          TEXT NOT NULL,                      -- ISO 8601

  CHECK (result IN ('pass', 'fail'))
);

-- Efficient history queries (asset detail page)
CREATE INDEX IF NOT EXISTS idx_inspection_asset
  ON asset_inspection(org_id, asset_id, inspection_date DESC);

-- Inspector lookup
CREATE INDEX IF NOT EXISTS idx_inspection_inspector
  ON asset_inspection(inspector_staff_id);
```

### `asset_audit_log` — Immutable Audit Trail

```sql
CREATE TABLE IF NOT EXISTS asset_audit_log (
  id               TEXT NOT NULL PRIMARY KEY,             -- crypto.randomUUID()
  org_id           TEXT NOT NULL,                         -- denormalized; survives org deletion
  actor_staff_id   TEXT NOT NULL,                         -- staff member who performed action
  action           TEXT NOT NULL,                         -- enumerated action string
  asset_id         TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  detail_json      TEXT,                                  -- JSON: old/new values, context
  created_at       TEXT NOT NULL,                         -- ISO 8601

  CHECK (action IN (
    'asset.created',
    'asset.updated',
    'asset.status_changed',
    'asset.inspected',
    'asset.assigned',
    'asset.unassigned'
  ))
);

-- Efficient audit trail queries
CREATE INDEX IF NOT EXISTS idx_audit_asset
  ON asset_audit_log(org_id, asset_id, created_at DESC);

-- Actor lookup
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON asset_audit_log(actor_staff_id);
```

## Enumerated Values

### Apparatus Categories
`engine`, `ladder_truck`, `ambulance_medic`, `battalion_chief`, `rescue`, `brush_wildland`, `tanker_tender`, `boat`, `atv_utv`, `command_vehicle`, `utility`, `other`

### Gear Categories
`scba`, `ppe`, `radio`, `medical_equipment`, `tools`, `hose`, `nozzle`, `thermal_camera`, `gas_detector`, `lighting`, `extrication`, `rope_rescue`, `water_rescue`, `hazmat`, `other`

### Apparatus Statuses
`in_service`, `out_of_service`, `reserve`, `decommissioned`

### Gear Statuses
`available`, `assigned`, `out_of_service`, `decommissioned`, `expired`

### Audit Actions
`asset.created`, `asset.updated`, `asset.status_changed`, `asset.inspected`, `asset.assigned`, `asset.unassigned`

### Inspection Results
`pass`, `fail`

### Inspection Intervals (named → days)
| Name | Days |
|------|------|
| daily | 1 |
| weekly | 7 |
| monthly | 30 |
| quarterly | 90 |
| semi-annual | 182 |
| annual | 365 |

## State Transitions

### Asset Status Transitions

**Rule**: Free-form transitions — any status to any status, except `decommissioned` is terminal (no exit).

```text
Apparatus:  in_service ↔ out_of_service ↔ reserve → decommissioned (terminal)
Gear:       available ↔ assigned ↔ out_of_service → decommissioned (terminal)
                                                  → expired (terminal-ish, query-time)
```

**Side Effects**:
- **Apparatus → decommissioned**: All gear assigned to this apparatus is unassigned (status → `available`)
- **Gear → decommissioned**: Assignment cleared (both `assigned_to_*` set to NULL)
- **Gear assigned**: Status set to `assigned`
- **Gear unassigned**: Status set to `available` (unless `out_of_service` or `decommissioned`)

### Gear Assignment State

```text
                     ┌─────────────────────┐
                     │    Unassigned        │
                     │ (staff=NULL,         │
                     │  apparatus=NULL)     │
                     └─────┬──────┬────────┘
                    assign │      │ assign
                  to staff │      │ to apparatus
                           ▼      ▼
              ┌────────────┐      ┌────────────────┐
              │  Assigned   │      │   Assigned      │
              │  to Staff   │◄────►│   to Apparatus  │
              │ (staff=ID,  │      │  (staff=NULL,   │
              │  app=NULL)  │      │   app=ID)       │
              └────────────┘      └────────────────┘
```

Reassignment from one target to another is a single operation that clears the old assignment and sets the new one, recording both `asset.unassigned` and `asset.assigned` audit entries.

## Validation Rules

| Field | Rule |
|-------|------|
| `name` | Required, 1-200 characters |
| `asset_type` | Required, immutable, `'apparatus'` or `'gear'` |
| `category` | Required, must match `asset_type`-scoped enum |
| `status` | Required, must match `asset_type`-scoped enum |
| `unit_number` | Required for apparatus, unique per org |
| `serial_number` | Optional, unique per org when provided |
| `custom_fields` | Flat JSON object, string/number/boolean values, ≤ 10 KB |
| `manufacture_date` | ISO 8601 date format when provided |
| `purchased_date` | ISO 8601 date format when provided |
| `in_service_date` | ISO 8601 date format when provided |
| `expiration_date` | ISO 8601 date format when provided |
| `warranty_expiration_date` | ISO 8601 date format when provided |
| `inspection_interval_days` | Positive integer when provided |
| Decommissioned assets | Cannot be assigned, cannot change status |
| Expired gear | Cannot be assigned |
| Gear assignment | Mutually exclusive: staff OR apparatus, not both |
| Inspection `result` | `'pass'` or `'fail'` |
| Inspection records | Immutable once created |
| Audit log records | Immutable once created |

## Migration Notes

All three tables are new — no migration from existing tables needed. The DDL uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for idempotent application.

**RBAC Change**: Add `'manage-assets'` to `Permission` type and to `owner`, `admin`, `manager` role sets in `rbac.ts`. This is a non-breaking additive change.
