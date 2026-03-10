# Feature Specification: Asset Management

**Feature Branch**: `007-asset-management`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Asset management for apparatus (vehicles/units) and gear (PPE, SCBA, radios, medical equipment, etc.). Track assignment of gear to staff members or apparatus, record inspections, track expiration dates, and maintain audit trail of all asset lifecycle events."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register an Apparatus (Priority: P1)

An org member with the `manage-assets` permission registers a new apparatus (engine, ladder, ambulance, etc.) in the system so the organization has a central inventory of all vehicles and units.

**Why this priority**: Apparatus are the foundational assets in emergency services. Without a registry, assignments, inspections, and maintenance cannot be tracked.

**Independent Test**: A user with `manage-assets` can create an apparatus and see it listed in the apparatus inventory.

**Acceptance Scenarios**:

1. **Given** I am an authenticated org member with `manage-assets` permission, **When** I navigate to the asset management section and submit the "Add Apparatus" form with name "Engine 1", unit number "E-1", category "Engine", status "In-Service", and serial number (VIN) "1HGCM82633A004352", **Then** the apparatus is created with a unique ID, appears in the apparatus list, and an audit log entry of type `asset.created` is recorded.
2. **Given** an apparatus with unit number "E-1" already exists in the organization, **When** I attempt to create another apparatus with unit number "E-1", **Then** the system rejects the request with a validation error indicating the unit number is already in use.
3. **Given** I am an authenticated org member without `manage-assets` permission, **When** I attempt to create an apparatus, **Then** the system returns a 403 Forbidden response.

---

### User Story 2 — Register Gear / Equipment (Priority: P1)

An org member with the `manage-assets` permission registers a piece of gear (SCBA, PPE set, radio, etc.) in the system so all equipment is inventoried with serial numbers, categories, and expiration dates.

**Why this priority**: Gear tracking is critical for compliance, safety, and accountability. Expiration-sensitive items like SCBA cylinders and PPE must be monitored.

**Independent Test**: A user with `manage-assets` can create a gear item and see it in the gear inventory.

**Acceptance Scenarios**:

1. **Given** I am an authenticated org member with `manage-assets` permission, **When** I submit the "Add Gear" form with name "SCBA Pack #12", serial number "SCB-2024-0012", category "SCBA", manufacture date "2024-03-15", and expiration date "2028-06-15", **Then** the gear item is created, appears in the gear list, and an audit log entry of type `asset.created` is recorded.
2. **Given** I am an authenticated org member with `manage-assets` permission, **When** I create a gear item with category "Radio" and no expiration date, **Then** the gear item is created successfully with a NULL expiration date.
3. **Given** a gear item with serial number "SCB-2024-0012" already exists in the organization, **When** I attempt to create another gear item with the same serial number, **Then** the system rejects the request with a validation error.

---

### User Story 3 — Assign Gear to a Staff Member or Apparatus (Priority: P1)

An org member with the `manage-assets` permission assigns a gear item to a specific staff member or to an apparatus so the organization knows who has what equipment and what is on each vehicle.

**Why this priority**: Accountability for gear is a core operational need. Assignment tracking supports compliance audits and loss prevention.

**Independent Test**: A user with `manage-assets` can assign gear to a staff member, then reassign it to an apparatus, verifying that only one assignment exists at a time.

**Acceptance Scenarios**:

1. **Given** a gear item "SCBA Pack #12" exists with status "Available" and staff member "Jane Doe" exists, **When** I assign the gear to Jane Doe, **Then** the gear's `assigned_to_staff_id` is set to Jane Doe's ID, `assigned_to_apparatus_id` is NULL, status becomes "Assigned", and an audit log entry of type `asset.assigned` is recorded.
2. **Given** a gear item "Thermal Camera #3" exists with status "Available" and apparatus "Engine 1" exists, **When** I assign the gear to Engine 1, **Then** the gear's `assigned_to_apparatus_id` is set to Engine 1's ID, `assigned_to_staff_id` is NULL, status becomes "Assigned", and an audit log entry of type `asset.assigned` is recorded.
3. **Given** gear "Radio #7" is currently assigned to staff member "John Smith", **When** I reassign the gear to apparatus "Ladder 1", **Then** `assigned_to_staff_id` becomes NULL, `assigned_to_apparatus_id` is set to Ladder 1's ID, and audit log entries for both `asset.unassigned` and `asset.assigned` are recorded.
4. **Given** gear "Old SCBA #1" has status "Decommissioned", **When** I attempt to assign it to a staff member, **Then** the system rejects the request with a validation error.

---

### User Story 4 — Unassign Gear (Priority: P2)

An org member with the `manage-assets` permission unassigns gear from its current holder (staff member or apparatus) so returned or recovered equipment is properly tracked as unassigned.

**Why this priority**: When staff rotate, leave the organization, or apparatus are taken out of service, gear must be returned to the available pool.

**Independent Test**: A user with `manage-assets` can unassign gear and confirm it returns to "Available" status.

**Acceptance Scenarios**:

1. **Given** gear "PPE Set #5" is assigned to staff member "Jane Doe", **When** I unassign the gear, **Then** `assigned_to_staff_id` becomes NULL, status becomes "Available", and an audit log entry of type `asset.unassigned` is recorded.

---

### User Story 5 — Log an Inspection on an Apparatus (Priority: P1)

An org member with `manage-assets` permission logs an inspection result (pass/fail) with optional notes on an apparatus so there is a verifiable record of apparatus checks for compliance and safety.

**Why this priority**: Emergency apparatus require regular inspections. A digital log replaces paper checklists and ensures accountability.

**Independent Test**: An authorized user can create an inspection record for an apparatus and see it in the inspection history.

**Acceptance Scenarios**:

1. **Given** apparatus "Engine 1" exists and I have `manage-assets` permission, **When** I submit an inspection with result "Pass" and notes "All lights, sirens, and pump operational", **Then** an inspection record is created with `result = 'pass'`, my staff member ID as inspector, the current date as inspection date, and an audit log entry of type `asset.inspected` is recorded.
2. **Given** apparatus "Ambulance 2" exists and I have `manage-assets` permission, **When** I submit an inspection with result "Fail" and notes "Oxygen regulator not functioning", **Then** an inspection record is created with `result = 'fail'` and the notes are stored.
3. **Given** I am a staff member without `manage-assets` permission and apparatus "Engine 1" is not assigned to me, **When** I attempt to log an inspection on Engine 1, **Then** the system returns a 403 Forbidden response.

---

### User Story 6 — Log an Inspection on Gear (Priority: P1)

An org member with `manage-assets` permission, or the staff member to whom the gear is assigned, logs an inspection result (pass/fail) with optional notes on a gear item so gear condition is tracked over time and failures are documented.

**Why this priority**: Gear like SCBA, PPE, and medical equipment must be regularly inspected. Failures may require immediate replacement.

**Independent Test**: An authorized user can create an inspection record for a gear item and view it in the inspection history.

**Acceptance Scenarios**:

1. **Given** gear "SCBA Pack #12" exists and I have `manage-assets` permission, **When** I submit an inspection with result "Pass" and notes "Cylinder pressure nominal, mask seal intact", **Then** an inspection record is created linked to the gear item.
2. **Given** I am staff member "Jane Doe" and gear "Radio #7" is assigned to me, **When** I log an inspection with result "Pass", **Then** the inspection is accepted and recorded with my staff member ID as inspector.

---

### User Story 7 — Set Inspection Schedule for an Asset (Priority: P2)

An org member with the `manage-assets` permission configures an inspection interval (daily, weekly, monthly, quarterly, semi-annual, annual) for an apparatus or gear item so the system can track when inspections are due or overdue.

**Why this priority**: Different assets have different inspection cadences mandated by regulation or department policy.

**Independent Test**: A user sets a monthly inspection interval on an apparatus, and the system correctly calculates the next due date after an inspection is logged.

**Acceptance Scenarios**:

1. **Given** apparatus "Engine 1" exists and I have `manage-assets` permission, **When** I set the inspection interval to "daily", **Then** the apparatus record is updated with `inspection_interval_days = 1` and `next_inspection_due` is calculated as today + 1 day (or from the last inspection date if one exists).
2. **Given** apparatus "Engine 1" has `inspection_interval_days = 30` and `next_inspection_due = '2026-03-07'`, **When** I log a passing inspection today (2026-03-07), **Then** `next_inspection_due` is updated to '2026-04-06' (today + 30 days).

---

### User Story 8 — View Expiring and Overdue Assets (Priority: P2)

An org member with the `manage-assets` permission views a list of gear approaching expiration and assets with overdue inspections so they can proactively address compliance gaps before they become safety issues.

**Why this priority**: Expiration and inspection compliance is non-negotiable in emergency services. Proactive alerts prevent regulatory violations and safety incidents.

**Independent Test**: The system correctly surfaces gear expiring within 90 days and assets with overdue inspections.

**Acceptance Scenarios**:

1. **Given** gear "SCBA Cylinder #4" has `expiration_date = '2026-05-15'` and today is 2026-03-07, **When** I view the expiration alerts dashboard, **Then** the gear item appears in the "Expiring Soon" list with the number of days until expiration (69 days).
2. **Given** apparatus "Engine 1" has `next_inspection_due = '2026-03-01'` and today is 2026-03-07, **When** I view the inspection alerts dashboard, **Then** the apparatus appears in the "Overdue Inspections" list marked as 6 days overdue.

---

### User Story 9 — Update Apparatus Status (Priority: P2)

An org member with the `manage-assets` permission changes the status of an apparatus (In-Service, Out-of-Service, Reserve, Decommissioned) so the current operational state of all apparatus is accurately reflected.

**Why this priority**: Apparatus status directly impacts resource availability and dispatch readiness.

**Independent Test**: A user transitions an apparatus from "In-Service" to "Out-of-Service" and the change is reflected in the inventory and audit log.

**Acceptance Scenarios**:

1. **Given** apparatus "Engine 1" has status "In-Service", **When** I change its status to "Out-of-Service", **Then** the status is updated and an audit log entry of type `asset.status_changed` is recorded with the old and new status values.
2. **Given** apparatus "Engine 1" has status "In-Service" and 5 gear items assigned to it, **When** I change its status to "Decommissioned", **Then** all 5 gear items are unassigned (status returns to "Available"), the apparatus status becomes "Decommissioned", and audit log entries are recorded for the apparatus status change and each gear unassignment.

---

### User Story 10 — Update Gear Status (Priority: P2)

An org member with the `manage-assets` permission changes the status of a gear item (Available, Assigned, Out-of-Service, Decommissioned, Expired) so gear lifecycle is properly managed.

**Why this priority**: Gear moves through a defined lifecycle. Tracking status ensures only serviceable gear is in circulation.

**Independent Test**: A user transitions gear from "Available" to "Out-of-Service" and the change is reflected in the inventory.

**Acceptance Scenarios**:

1. **Given** gear "Radio #7" is assigned to staff member "John Smith", **When** I change its status to "Decommissioned", **Then** the assignment is cleared, status becomes "Decommissioned", and audit log entries for unassignment and status change are recorded.

---

### User Story 11 — View Asset Inventory (Priority: P1)

An org member (any role) views the full inventory of apparatus and gear for their organization so they have visibility into what assets exist and their current status.

**Why this priority**: Read access to asset inventory is needed by all org members for day-to-day operations.

**Independent Test**: Any authenticated org member can view the apparatus list and gear list.

**Acceptance Scenarios**:

1. **Given** I am an authenticated org member (any role), **When** I navigate to the asset management section, **Then** I see a list of all apparatus with their name, unit number, type, and status.
2. **Given** I am an authenticated org member, **When** I view the gear inventory and filter by category "SCBA", **Then** I see only gear items in the SCBA category.
3. **Given** I am staff member "Jane Doe" with 3 gear items assigned to me, **When** I view my assigned gear, **Then** I see exactly those 3 items with their details and inspection status.

---

### User Story 12 — View Asset Detail and Inspection History (Priority: P2)

An org member (any role) views the full detail of an apparatus or gear item including its inspection history so they can see the complete record for any asset.

**Why this priority**: Detailed asset views support operational decisions, compliance audits, and incident investigations.

**Independent Test**: An org member can view an apparatus detail page showing all fields and a chronological inspection history.

**Acceptance Scenarios**:

1. **Given** apparatus "Engine 1" has 15 inspection records, **When** I view the apparatus detail page, **Then** I see all asset fields (name, unit number, category, status, serial number, make, model, manufacture date, in-service date, expiration date, inspection interval, next inspection due) and the 15 inspection records in reverse chronological order.

---

## Functional Requirements

### Asset Management (Unified Model)

All assets — apparatus and gear — are stored in a single `asset` table with an `asset_type` discriminator column. This eliminates duplicate CRUD logic, enables real foreign keys on inspections and audit logs, and makes unified inventory views trivial. Columns are harmonized wherever the same concept exists across types (e.g., both VINs and gear serial numbers are manufacturer-assigned identifiers → single `serial_number` column). The only gear-specific columns are the two assignment FKs.

**FR-001:** The system MUST allow users with `manage-assets` permission to create an asset. Common fields shared by all types: name (required), asset_type (required, immutable), category (required, values scoped by type), status (required), serial_number (optional, unique per org if provided), make (optional), model (optional), manufacture_date (optional), purchased_date (optional), in_service_date (optional), expiration_date (optional), warranty_expiration_date (optional), notes (optional).

**FR-002:** For apparatus assets (`asset_type = 'apparatus'`): `unit_number` (required, unique per org) is additionally required. Status defaults to `in_service`. The `serial_number` field holds the VIN.

**FR-003:** For gear assets (`asset_type = 'gear'`): status defaults to `available`. Assignment fields (`assigned_to_staff_id`, `assigned_to_apparatus_id`) are available.

**FR-004:** The system MUST enforce that `unit_number` is unique within an organization (for apparatus assets).

**FR-005:** The system MUST enforce that non-NULL `serial_number` values are unique within an organization (across all asset types — no two assets in the same org may share a serial number, whether apparatus or gear).

**FR-006:** The system MUST support the following apparatus categories: `engine`, `ladder_truck`, `ambulance_medic`, `battalion_chief`, `rescue`, `brush_wildland`, `tanker_tender`, `boat`, `atv_utv`, `command_vehicle`, `utility`, `other`.

**FR-007:** The system MUST support the following gear categories: `scba`, `ppe`, `radio`, `medical_equipment`, `tools`, `hose`, `nozzle`, `thermal_camera`, `gas_detector`, `lighting`, `extrication`, `rope_rescue`, `water_rescue`, `hazmat`, `other`.

**FR-008:** The system MUST support the following statuses for apparatus: `in_service`, `out_of_service`, `reserve`, `decommissioned`. For gear: `available`, `assigned`, `out_of_service`, `decommissioned`, `expired`.

**FR-009:** The system MUST NOT allow status transitions from `decommissioned` to any other status. Decommissioning is a terminal state for both apparatus and gear.

**FR-010:** When an apparatus is decommissioned, the system MUST automatically unassign all gear currently assigned to that apparatus.

**FR-011:** When gear is decommissioned, the system MUST automatically clear any existing assignment.

**FR-012:** The system MUST allow users with `manage-assets` permission to update any mutable asset field appropriate for that asset's type.

**FR-013:** The `asset_type` column MUST be immutable after creation. An asset's type cannot be changed.

**FR-014:** Assets MUST NOT be deletable. Decommissioning is the only mechanism for removing an asset from active use. This preserves audit trail integrity and NFPA record-keeping compliance. Mistaken entries should be decommissioned immediately with an explanatory note.

### Gear Assignment

**FR-015:** The system MUST allow users with `manage-assets` permission to assign a gear asset to exactly one target: either a `staff_member` or an `apparatus` asset, but not both simultaneously. Assignment MUST clear any previous assignment.

**FR-016:** The system MUST set gear status to `assigned` when gear is assigned and to `available` when gear is unassigned (unless the gear is `out_of_service` or `decommissioned`).

**FR-017:** The system MUST NOT allow assignment of gear with status `decommissioned` or `expired`.

**FR-018:** Only assets with `asset_type = 'gear'` may have assignment fields set. Apparatus assets MUST have NULL `assigned_to_staff_id` and `assigned_to_apparatus_id`.

### Inspections

**FR-019:** The system MUST allow users with `manage-assets` permission to log an inspection on any asset (apparatus or gear).

**FR-020:** The system MUST allow a staff member to log an inspection on a gear asset that is assigned to them, even without `manage-assets` permission.

**FR-021:** An inspection record MUST contain: the target asset (`asset_id` as a real FK), result (`pass` or `fail`), inspector (`staff_member_id`), inspection_date (ISO 8601 TEXT), and notes (optional text).

**FR-022:** Inspection records MUST be immutable once created. They cannot be updated or deleted.

**FR-023:** The system MUST support an optional `checklist_json` TEXT column on inspection records, defaulting to NULL, to enable future checklist-based inspections without schema migration.

**FR-024:** When an inspection is logged on an asset that has an `inspection_interval_days` set, the system MUST recalculate `next_inspection_due` as `inspection_date + inspection_interval_days`.

### Inspection Scheduling

**FR-025:** The system MUST allow users with `manage-assets` permission to set an `inspection_interval_days` value on any asset. Supported named intervals: daily (1), weekly (7), monthly (30), quarterly (90), semi-annual (182), annual (365).

**FR-026:** The system MUST store a `next_inspection_due` date (ISO 8601 TEXT) on asset records, computed from the last inspection date plus the interval, or from the date the interval was set if no inspection exists.

**FR-027:** The system MUST provide a query that returns all assets where `next_inspection_due` is in the past (overdue) or within a configurable lookahead window (default 7 days).

### Expiration Tracking

**FR-028:** The system MUST provide a query that returns all assets where `expiration_date` is within a configurable lookahead window (default 90 days) or already past. This applies to both apparatus (e.g., certification expiry) and gear (e.g., SCBA cylinder hydrostatic test expiry, PPE 10-year retirement).

**FR-029:** The system SHOULD automatically set gear status to `expired` when `expiration_date` is in the past. This MAY be enforced at query time rather than via a scheduled job (given Cloudflare Workers constraints).

### NFPA Lifecycle Compliance

**FR-030:** The system MUST store `manufacture_date` (ISO 8601 TEXT, optional) to support NFPA 1851 10-year service life calculations for PPE and NFPA 1911 apparatus lifecycle tracking. The UI SHOULD display a computed "service life remaining" when `manufacture_date` is set and the asset category has a known maximum service life (e.g., 10 years for structural PPE per NFPA 1851).

**FR-031:** The system MUST store `in_service_date` (ISO 8601 TEXT, optional) to track when an asset was placed into active service. This is required by NFPA 1851 for PPE record-keeping and useful for apparatus maintenance scheduling per NFPA 1911.

**FR-032:** The system MUST store `purchased_date` (ISO 8601 TEXT, optional) to track procurement date for both apparatus and gear. This supports warranty tracking and budget/lifecycle planning.

### Audit Logging

**FR-033:** The system MUST record an immutable audit log entry for every state-changing operation on an asset. The audit log MUST include: `id` (UUID), `org_id`, `actor_staff_id`, `action` (enumerated string), `asset_id` (real FK → asset.id), `detail_json` (JSON text containing old/new values or contextual data), and `created_at` (ISO 8601).

**FR-034:** The following actions MUST be audited: `asset.created`, `asset.updated`, `asset.status_changed`, `asset.inspected`, `asset.assigned`, `asset.unassigned`.

**FR-035:** Audit log records MUST be immutable. They cannot be updated or deleted.

### Extensibility

**FR-036:** The `asset` table MUST include an optional `custom_fields` TEXT column (JSON object, default NULL) to support ad-hoc metadata that does not warrant a schema column. Known fields MUST use dedicated columns, not `custom_fields`.

### Permissions

**FR-037:** The system MUST add a `manage-assets` permission to the RBAC permission matrix in `src/lib/rbac.ts`.

**FR-038:** By default, `owner` and `admin` roles MUST have `manage-assets` permission. Other roles MUST NOT have it by default.

**FR-039:** All authenticated org members (any role) MUST have read access to the asset inventory (asset list, asset detail, inspection history).

**FR-040:** Staff members MUST be able to log inspections on gear assets assigned to them without `manage-assets` permission.

### Viewing and Filtering

**FR-041:** The system MUST provide a paginated asset list endpoint, filterable by `asset_type`, `status`, `category`, `assigned_to_staff_id`, and `assigned_to_apparatus_id`.

**FR-042:** The system MUST provide an endpoint to retrieve all gear assets assigned to the currently authenticated staff member.

**FR-043:** The system MUST provide an endpoint to retrieve all gear assets assigned to a specific apparatus asset.

---

## Key Entities

### Asset (Unified Table)

A single table storing all organizational assets — both apparatus (vehicles/units) and gear (equipment/PPE). An `asset_type` discriminator column distinguishes the two. Columns are maximally harmonized: wherever apparatus and gear share the same concept under different names, they use a single column (e.g., VIN and gear serial number → `serial_number`; model year and manufacture date → `manufacture_date`). The only gear-specific columns are the two assignment FKs. The only apparatus-specific column is `unit_number` (operational callsign with no gear equivalent).

**Design rationale — column harmonization:** A VIN *is* a manufacturer-assigned serial number for vehicles. Tracking it in a separate `vin` column from `serial_number` creates a false distinction. Similarly, apparatus "model year" and gear "manufacture date" serve the same purpose — dating the asset for lifecycle management. NFPA 1851 requires actual manufacture dates (not just year) for PPE 10-year service life calculations, so `manufacture_date` (ISO 8601 TEXT) replaces `year` (INTEGER) and serves both types. `expiration_date` also applies to both types: gear expires (SCBA cylinders, PPE service life), and apparatus certifications/registrations expire. This harmonization reduces the type-specific column count from ~5 per type to just 1 apparatus-specific and 2 gear-specific columns.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `asset_type` | TEXT | NOT NULL, immutable | `apparatus` or `gear` |
| `name` | TEXT | NOT NULL | Display name (e.g., "Engine 1", "SCBA Pack #12") |
| `category` | TEXT | NOT NULL | Apparatus: `engine`, `ladder_truck`, `ambulance_medic`, `battalion_chief`, `rescue`, `brush_wildland`, `tanker_tender`, `boat`, `atv_utv`, `command_vehicle`, `utility`, `other`. Gear: `scba`, `ppe`, `radio`, `medical_equipment`, `tools`, `hose`, `nozzle`, `thermal_camera`, `gas_detector`, `lighting`, `extrication`, `rope_rescue`, `water_rescue`, `hazmat`, `other`. |
| `status` | TEXT | NOT NULL | Apparatus: `in_service`, `out_of_service`, `reserve`, `decommissioned`. Gear: `available`, `assigned`, `out_of_service`, `decommissioned`, `expired`. |
| `serial_number` | TEXT | UNIQUE per org (when not NULL) | Manufacturer-assigned identifier. Holds VIN for apparatus, serial number for gear. Single column — a VIN *is* a vehicle serial number. |
| `make` | TEXT | | Manufacturer (e.g., "Pierce", "Scott Safety", "Motorola") |
| `model` | TEXT | | Model name (e.g., "Enforcer", "Air-Pak X3", "APX 8000") |
| `notes` | TEXT | | Free-text notes |
| — | — | — | **Lifecycle dates** (common to all asset types, per NFPA 1851/1911) |
| `manufacture_date` | TEXT | | ISO 8601 date. Replaces `year` — NFPA 1851 requires actual date for PPE 10-year service life. For apparatus, use January 1 of model year if exact date unknown. |
| `purchased_date` | TEXT | | ISO 8601 date of acquisition. Supports warranty tracking and budget planning. |
| `in_service_date` | TEXT | | ISO 8601 date placed into active service. Required by NFPA 1851 for PPE; useful for apparatus per NFPA 1911. |
| `expiration_date` | TEXT | | ISO 8601 date when this asset expires or must be retired. Gear: SCBA hydrostatic test, PPE 10-year retirement. Apparatus: certification/registration expiry. |
| `warranty_expiration_date` | TEXT | | ISO 8601 date when manufacturer warranty expires. |
| — | — | — | **Inspection scheduling** |
| `inspection_interval_days` | INTEGER | | Inspection cadence in days (NULL = no schedule) |
| `next_inspection_due` | TEXT | | ISO 8601 date of next required inspection |
| — | — | — | **Extensibility** |
| `custom_fields` | TEXT | | JSON object for ad-hoc metadata. NULL by default. Known fields MUST use dedicated columns. |
| — | — | — | **Apparatus-specific** (NULL for gear) |
| `unit_number` | TEXT | UNIQUE per org (when apparatus) | Operational unit number / callsign (e.g., "E-1"). No gear equivalent — gear is identified by name + serial_number. |
| — | — | — | **Gear-specific** (NULL for apparatus) |
| `assigned_to_staff_id` | TEXT | FK → staff_member.id, nullable | Staff member currently holding this gear |
| `assigned_to_apparatus_id` | TEXT | FK → asset.id, nullable | Apparatus asset this gear is mounted on (self-referential FK) |
| — | — | — | **Timestamps** |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 last-update timestamp |

**Indexes:**
- `UNIQUE (org_id, unit_number)` WHERE `unit_number IS NOT NULL` — scoped apparatus unit number uniqueness
- `UNIQUE (org_id, serial_number)` WHERE `serial_number IS NOT NULL` — scoped serial number uniqueness across all asset types
- `(org_id, asset_type, status)` — filtered inventory queries

**CHECK constraints:**
- Apparatus requires unit_number: `asset_type != 'apparatus' OR unit_number IS NOT NULL`
- Apparatus cannot have assignment: `asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)`
- Mutual exclusion on gear assignment: `NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL)`
- Valid asset_type: `asset_type IN ('apparatus', 'gear')`

### Asset Inspection

An immutable record of an inspection performed on an asset. Uses a real FK to the unified `asset` table. Supports pass/fail with notes now, designed for future checklist expansion.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `asset_id` | TEXT | FK → asset.id, NOT NULL | The inspected asset (real FK, not polymorphic) |
| `inspector_staff_id` | TEXT | FK → staff_member.id, NOT NULL | Staff member who performed the inspection |
| `result` | TEXT | NOT NULL | One of: pass, fail |
| `notes` | TEXT | | Free-text inspection notes |
| `inspection_date` | TEXT | NOT NULL | ISO 8601 date the inspection was performed |
| `checklist_json` | TEXT | | Reserved for future checklist data (JSON). NULL for now. |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |

**Index:** `(org_id, asset_id, inspection_date)` for efficient history queries.

### Asset Audit Log

An immutable, append-only log of all state-changing operations on assets. Uses a real FK to the unified `asset` table. Follows the existing `staff_audit_log` pattern.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `actor_staff_id` | TEXT | FK → staff_member.id, NOT NULL | Staff member who performed the action |
| `action` | TEXT | NOT NULL | Enumerated action string (see FR-034) |
| `asset_id` | TEXT | FK → asset.id, NOT NULL | The affected asset (real FK, not polymorphic) |
| `detail_json` | TEXT | | JSON containing contextual data (old/new values, assignment target, etc.) |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |

**Index:** `(org_id, asset_id, created_at)` for efficient audit trail queries.

---

## Success Criteria

**SC-001:** An org member with `manage-assets` permission can create, update, and change the status of assets (both apparatus and gear types). All mutations are reflected in the unified inventory view and audit log.

**SC-002:** Gear assets can be assigned to exactly one target (staff member or apparatus asset) at a time. Reassignment automatically clears the previous assignment. Decommissioning automatically unassigns gear.

**SC-003:** Inspections can be logged on any asset by users with `manage-assets` permission, and on personally assigned gear by the assigned staff member. Inspection records are immutable and reference assets via real FK.

**SC-004:** Inspection intervals can be configured per asset. Logging an inspection recalculates the next due date. Overdue inspections are surfaceable via query.

**SC-005:** Gear assets with expiration dates approaching within 90 days (configurable) or already expired are surfaceable via query.

**SC-006:** Every state-changing operation produces an immutable audit log entry containing the actor, action, asset_id (real FK), and detail JSON.

**SC-007:** All authenticated org members (any role) can read the asset inventory, asset details, and inspection history. Write operations are restricted to users with `manage-assets` permission (or assigned staff for inspections).

**SC-008:** Unit numbers are unique per organization for apparatus assets. Serial numbers are unique per organization across all asset types (when provided). Both enforced via partial unique indexes on the unified `asset` table.

---

## Clarifications

1. **Scope is organization-level only.** Department and station assignment fields are not included in this iteration. When the department/station hierarchy is implemented, optional `department_id` and `station_id` foreign keys can be added to the `asset` table.

2. **Unified `asset` table, not separate tables.** Apparatus and gear share the vast majority of their columns and have nearly identical lifecycles (create → in-service → inspect → decommission). Separate tables would mean duplicated CRUD server functions, duplicated TypeScript types, and — critically — unenforceable polymorphic FK references from inspections and audit logs. A single table with an `asset_type` discriminator, type-scoped NULLable columns, and CHECK constraints keeps the schema honest while halving the server/UI surface area.

3. **Maximally harmonized columns.** Rather than maintaining separate type-specific columns for concepts that exist in both asset types, columns are harmonized:
   - **`serial_number`** replaces both `vin` (apparatus) and `serial_number` (gear). A VIN is a manufacturer-assigned serial number for vehicles — the same concept as a gear serial number. One column, one unique index, one validation path.
   - **`category`** replaces both `apparatus_subtype` and `gear_category`. Both classify what kind of asset it is within its type. Values are type-scoped via application logic (apparatus categories vs. gear categories).
   - **`manufacture_date`** (TEXT, ISO 8601) replaces `year` (INTEGER). NFPA 1851 requires the actual manufacture date — not just year — for calculating the 10-year PPE service life. For apparatus where only the model year is known, store as `YYYY-01-01`.
   - **`expiration_date`** is now common to both types. Gear expires (SCBA cylinder hydrostatic test, PPE 10-year retirement). Apparatus certifications and registrations also expire.

   After harmonization, the only apparatus-specific column is `unit_number` (operational callsign — no gear equivalent). The only gear-specific columns are `assigned_to_staff_id` and `assigned_to_apparatus_id` (gear gets assigned; apparatus does not).

4. **NFPA lifecycle date columns.** Per NFPA 1851 (PPE care & maintenance) and NFPA 1911 (apparatus inspection & maintenance), the schema includes `manufacture_date`, `purchased_date`, `in_service_date`, `expiration_date`, and `warranty_expiration_date`. All are optional ISO 8601 TEXT columns applicable to both asset types. These are the core dates required for OSHA/NFPA compliance tracking. Department-specific fields beyond these (e.g., specific call participation, decontamination records) belong in `custom_fields` or future schema extensions.

5. **EAV was explicitly rejected.** Entity-Attribute-Value trades away typed columns, CHECK constraints, unique indexes, and simple queries in exchange for flexibility this domain doesn't need. Asset fields are well-known and dictated by industry standards (NFPA, OSHA, FCC). A `custom_fields` JSON column on the `asset` table provides a controlled escape hatch for truly ad-hoc metadata without destroying query ergonomics.

6. **Inspections use simple pass/fail + notes now.** The `checklist_json` column is included as a TEXT field defaulting to NULL, providing a forward-compatible extension point for structured checklist inspections in a future iteration without requiring a schema migration.

7. **New `manage-assets` permission.** This is added to the RBAC permission matrix rather than being role-gated. By default, `owner` and `admin` have this permission. The permission can be extended to other roles as needed (e.g., a `manager` who is also an apparatus officer).

8. **Staff members can inspect their own assigned gear.** This permission is scoped to gear assets where `assigned_to_staff_id` matches the current user's staff member ID. Staff members cannot inspect apparatus or gear assigned to others without `manage-assets` permission.

9. **Expiration enforcement is query-time.** Rather than relying on a cron job or scheduled worker (which adds operational complexity), expired status is resolved at read time: queries that return gear should treat any item with `expiration_date < current_date` as effectively expired, and the UI should mark them accordingly. An optional background process can periodically update the `status` column for data consistency.

10. **Decommissioned is a terminal status** for both apparatus and gear. Once decommissioned, an asset cannot be returned to service. This is intentional to preserve audit trail integrity.

11. **Real FKs on inspections and audit logs.** Because all assets live in one table, `asset_inspection.asset_id` and `asset_audit_log.asset_id` are real foreign keys to `asset.id`. No polymorphic `target_type` + `target_id` pattern is needed, and referential integrity is enforced by the database.

12. **Assets cannot be deleted.** Decommissioning is the only mechanism for removing an asset from active use. This preserves audit trail integrity — every asset ever referenced in an inspection or audit log continues to exist — and aligns with NFPA record-keeping requirements that mandate retaining records even after retirement. Mistaken entries should be decommissioned immediately with an explanatory note.

### Session 2026-03-10

- Q: Can assets be deleted, or is decommissioning the only way to remove them from active use? → A: No deletion — decommissioning is the only removal; preserves full audit trail.

---

## Assumptions

1. The `staff_member` table exists and has an `id` (TEXT, UUID) primary key. Server functions can resolve the current user's `staff_member_id` from the session/org membership.

2. The existing `requireOrgMembership()` pattern in server functions provides the authenticated user's org context and role, which can be used to check `manage-assets` permission.

3. The existing `canDo(role, permission)` function in `src/lib/rbac.ts` can be extended with the new `manage-assets` permission without breaking existing permission checks.

4. UUID generation follows the existing pattern using `crypto.randomUUID()`.

5. Pagination follows existing patterns in the codebase (offset-based or cursor-based as already established).

6. The UI will be built within the existing `/_protected/orgs/$orgSlug/` route namespace, likely under a new `assets` route segment.

---

## Dependencies

1. **001-user-auth** — Authentication and session management (required for all server functions).
2. **003-create-org** — Organization entity and `organization` table (required for `org_id` foreign keys).
3. **004-org-rbac** — RBAC permission system and `canDo()` function (required for `manage-assets` permission).
4. **005-staff-management** — `staff_member` table (required for gear assignment and inspection inspector references).
5. **src/lib/rbac.ts** — Must be extended with the `manage-assets` permission.
6. **src/db/schema.sql** — Must be extended with `asset`, `asset_inspection`, and `asset_audit_log` tables.

---

## Implementation Notes

### File Structure (Anticipated)

- `specs/007-asset-management/spec.md` — This specification
- `specs/007-asset-management/data-model.md` — Detailed DDL and migration SQL
- `specs/007-asset-management/tasks.md` — Implementation task checklist
- `src/lib/asset.types.ts` — TypeScript type definitions for asset, inspection, audit log (unified types with discriminated unions)
- `src/server/assets.ts` — Server functions for all asset CRUD, assignment, and inspection operations (single set of functions, type-aware)
- `src/routes/_protected/orgs.$orgSlug/assets.tsx` — Asset management layout route
- `src/routes/_protected/orgs.$orgSlug/assets/` — Child routes (unified asset list with type filter, detail views, etc.)

### SQL DDL Preview

Unified asset table with harmonized columns and minimal type-specific fields:

```sql
CREATE TABLE IF NOT EXISTS asset (
  id                        TEXT NOT NULL PRIMARY KEY,
  org_id                    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_type                TEXT NOT NULL,  -- 'apparatus' | 'gear'
  name                      TEXT NOT NULL,
  category                  TEXT NOT NULL,  -- type-scoped: apparatus categories OR gear categories
  status                    TEXT NOT NULL,
  serial_number             TEXT,           -- VIN for apparatus, serial number for gear
  make                      TEXT,
  model                     TEXT,
  notes                     TEXT,
  -- Lifecycle dates (common, per NFPA 1851/1911)
  manufacture_date          TEXT,           -- ISO 8601; replaces year INTEGER
  purchased_date            TEXT,
  in_service_date           TEXT,
  expiration_date           TEXT,           -- gear expiry, apparatus cert expiry
  warranty_expiration_date  TEXT,
  -- Inspection scheduling
  inspection_interval_days  INTEGER,
  next_inspection_due       TEXT,
  -- Extensibility
  custom_fields             TEXT,           -- JSON object, NULL by default
  -- Apparatus-specific (NULL for gear)
  unit_number               TEXT,           -- operational callsign, e.g. "E-1"
  -- Gear-specific (NULL for apparatus)
  assigned_to_staff_id      TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
  assigned_to_apparatus_id  TEXT REFERENCES asset(id) ON DELETE SET NULL,
  -- Timestamps
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,

  -- Integrity constraints
  CHECK (asset_type IN ('apparatus', 'gear')),
  CHECK (asset_type != 'apparatus' OR unit_number IS NOT NULL),
  CHECK (asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)),
  CHECK (NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_unit   ON asset(org_id, unit_number) WHERE unit_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_serial ON asset(org_id, serial_number) WHERE serial_number IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_asset_org_type   ON asset(org_id, asset_type, status);
```

Inspection and audit log tables with real FKs:

```sql
CREATE TABLE IF NOT EXISTS asset_inspection (
  asset_id           TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  -- ... (real FK, not polymorphic target_type/target_id)
);

CREATE TABLE IF NOT EXISTS asset_audit_log (
  asset_id           TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  -- ... (real FK, not polymorphic target_type/target_id)
);
```
