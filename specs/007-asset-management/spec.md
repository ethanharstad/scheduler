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

1. **Given** I am an authenticated org member with `manage-assets` permission, **When** I navigate to the asset management section and submit the "Add Apparatus" form with name "Engine 1", unit number "E-1", type "Engine", status "In-Service", and VIN "1HGCM82633A004352", **Then** the apparatus is created with a unique ID, appears in the apparatus list, and an audit log entry of type `apparatus.created` is recorded.
2. **Given** an apparatus with unit number "E-1" already exists in the organization, **When** I attempt to create another apparatus with unit number "E-1", **Then** the system rejects the request with a validation error indicating the unit number is already in use.
3. **Given** I am an authenticated org member without `manage-assets` permission, **When** I attempt to create an apparatus, **Then** the system returns a 403 Forbidden response.

---

### User Story 2 — Register Gear / Equipment (Priority: P1)

An org member with the `manage-assets` permission registers a piece of gear (SCBA, PPE set, radio, etc.) in the system so all equipment is inventoried with serial numbers, categories, and expiration dates.

**Why this priority**: Gear tracking is critical for compliance, safety, and accountability. Expiration-sensitive items like SCBA cylinders and PPE must be monitored.

**Independent Test**: A user with `manage-assets` can create a gear item and see it in the gear inventory.

**Acceptance Scenarios**:

1. **Given** I am an authenticated org member with `manage-assets` permission, **When** I submit the "Add Gear" form with name "SCBA Pack #12", serial number "SCB-2024-0012", category "SCBA", and expiration date "2028-06-15", **Then** the gear item is created, appears in the gear list, and an audit log entry of type `gear.created` is recorded.
2. **Given** I am an authenticated org member with `manage-assets` permission, **When** I create a gear item with category "Radio" and no expiration date, **Then** the gear item is created successfully with a NULL expiration date.
3. **Given** a gear item with serial number "SCB-2024-0012" already exists in the organization, **When** I attempt to create another gear item with the same serial number, **Then** the system rejects the request with a validation error.

---

### User Story 3 — Assign Gear to a Staff Member or Apparatus (Priority: P1)

An org member with the `manage-assets` permission assigns a gear item to a specific staff member or to an apparatus so the organization knows who has what equipment and what is on each vehicle.

**Why this priority**: Accountability for gear is a core operational need. Assignment tracking supports compliance audits and loss prevention.

**Independent Test**: A user with `manage-assets` can assign gear to a staff member, then reassign it to an apparatus, verifying that only one assignment exists at a time.

**Acceptance Scenarios**:

1. **Given** a gear item "SCBA Pack #12" exists with status "Available" and staff member "Jane Doe" exists, **When** I assign the gear to Jane Doe, **Then** the gear's `assigned_to_staff_id` is set to Jane Doe's ID, `assigned_to_apparatus_id` is NULL, status becomes "Assigned", and an audit log entry of type `gear.assigned` is recorded.
2. **Given** a gear item "Thermal Camera #3" exists with status "Available" and apparatus "Engine 1" exists, **When** I assign the gear to Engine 1, **Then** the gear's `assigned_to_apparatus_id` is set to Engine 1's ID, `assigned_to_staff_id` is NULL, status becomes "Assigned", and an audit log entry of type `gear.assigned` is recorded.
3. **Given** gear "Radio #7" is currently assigned to staff member "John Smith", **When** I reassign the gear to apparatus "Ladder 1", **Then** `assigned_to_staff_id` becomes NULL, `assigned_to_apparatus_id` is set to Ladder 1's ID, and audit log entries for both `gear.unassigned` and `gear.assigned` are recorded.
4. **Given** gear "Old SCBA #1" has status "Decommissioned", **When** I attempt to assign it to a staff member, **Then** the system rejects the request with a validation error.

---

### User Story 4 — Unassign Gear (Priority: P2)

An org member with the `manage-assets` permission unassigns gear from its current holder (staff member or apparatus) so returned or recovered equipment is properly tracked as unassigned.

**Why this priority**: When staff rotate, leave the organization, or apparatus are taken out of service, gear must be returned to the available pool.

**Independent Test**: A user with `manage-assets` can unassign gear and confirm it returns to "Available" status.

**Acceptance Scenarios**:

1. **Given** gear "PPE Set #5" is assigned to staff member "Jane Doe", **When** I unassign the gear, **Then** `assigned_to_staff_id` becomes NULL, status becomes "Available", and an audit log entry of type `gear.unassigned` is recorded.

---

### User Story 5 — Log an Inspection on an Apparatus (Priority: P1)

An org member with `manage-assets` permission logs an inspection result (pass/fail) with optional notes on an apparatus so there is a verifiable record of apparatus checks for compliance and safety.

**Why this priority**: Emergency apparatus require regular inspections. A digital log replaces paper checklists and ensures accountability.

**Independent Test**: An authorized user can create an inspection record for an apparatus and see it in the inspection history.

**Acceptance Scenarios**:

1. **Given** apparatus "Engine 1" exists and I have `manage-assets` permission, **When** I submit an inspection with result "Pass" and notes "All lights, sirens, and pump operational", **Then** an inspection record is created with `result = 'pass'`, my staff member ID as inspector, the current date as inspection date, and an audit log entry of type `apparatus.inspected` is recorded.
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

1. **Given** apparatus "Engine 1" has status "In-Service", **When** I change its status to "Out-of-Service", **Then** the status is updated and an audit log entry of type `apparatus.status_changed` is recorded with the old and new status values.
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

1. **Given** apparatus "Engine 1" has 15 inspection records, **When** I view the apparatus detail page, **Then** I see all apparatus fields (name, unit number, type, status, VIN, make, model, year, inspection interval, next inspection due) and the 15 inspection records in reverse chronological order.

---

## Functional Requirements

### Apparatus Management

**FR-001:** The system MUST allow users with `manage-assets` permission to create an apparatus record with the following fields: name (required), unit_number (required, unique per org), apparatus_type (required, from predefined list), status (required, default "in_service"), VIN (optional), make (optional), model (optional), year (optional, integer), and notes (optional).

**FR-002:** The system MUST enforce that `unit_number` is unique within an organization.

**FR-003:** The system MUST support the following apparatus types: `engine`, `ladder_truck`, `ambulance_medic`, `battalion_chief`, `rescue`, `brush_wildland`, `tanker_tender`, `boat`, `atv_utv`, `command_vehicle`, `utility`, `other`.

**FR-004:** The system MUST support the following apparatus statuses: `in_service`, `out_of_service`, `reserve`, `decommissioned`.

**FR-005:** The system MUST NOT allow status transitions from `decommissioned` to any other status. Decommissioning is a terminal state.

**FR-006:** When an apparatus is decommissioned, the system MUST automatically unassign all gear currently assigned to that apparatus.

**FR-007:** The system MUST allow users with `manage-assets` permission to update any mutable apparatus field (name, unit_number, apparatus_type, status, VIN, make, model, year, notes, inspection_interval_days).

### Gear Management

**FR-008:** The system MUST allow users with `manage-assets` permission to create a gear item with the following fields: name (required), serial_number (optional, unique per org if provided), category (required, from predefined list), status (required, default "available"), expiration_date (optional, ISO 8601 TEXT), make (optional), model (optional), and notes (optional).

**FR-009:** The system MUST enforce that non-NULL `serial_number` values are unique within an organization.

**FR-010:** The system MUST support the following gear categories: `scba`, `ppe`, `radio`, `medical_equipment`, `tools`, `hose`, `nozzle`, `thermal_camera`, `gas_detector`, `lighting`, `extrication`, `rope_rescue`, `water_rescue`, `hazmat`, `other`.

**FR-011:** The system MUST support the following gear statuses: `available`, `assigned`, `out_of_service`, `decommissioned`, `expired`.

**FR-012:** The system MUST allow users with `manage-assets` permission to assign gear to exactly one target: either a `staff_member` or an `apparatus`, but not both simultaneously. Assignment MUST clear any previous assignment.

**FR-013:** The system MUST set gear status to `assigned` when gear is assigned and to `available` when gear is unassigned (unless the gear is `out_of_service` or `decommissioned`).

**FR-014:** The system MUST NOT allow assignment of gear with status `decommissioned` or `expired`.

**FR-015:** When gear is decommissioned, the system MUST automatically clear any existing assignment.

**FR-016:** The system MUST allow users with `manage-assets` permission to update any mutable gear field.

### Inspections

**FR-017:** The system MUST allow users with `manage-assets` permission to log an inspection on any apparatus or gear item.

**FR-018:** The system MUST allow a staff member to log an inspection on gear that is assigned to them, even without `manage-assets` permission.

**FR-019:** An inspection record MUST contain: the target asset (apparatus or gear, via polymorphic reference), result (`pass` or `fail`), inspector (`staff_member_id`), inspection_date (ISO 8601 TEXT), and notes (optional text).

**FR-020:** Inspection records MUST be immutable once created. They cannot be updated or deleted.

**FR-021:** The system MUST support an optional `checklist_json` TEXT column on inspection records, defaulting to NULL, to enable future checklist-based inspections without schema migration.

**FR-022:** When an inspection is logged on an asset that has an `inspection_interval_days` set, the system MUST recalculate `next_inspection_due` as `inspection_date + inspection_interval_days`.

### Inspection Scheduling

**FR-023:** The system MUST allow users with `manage-assets` permission to set an `inspection_interval_days` value on any apparatus or gear item. Supported named intervals: daily (1), weekly (7), monthly (30), quarterly (90), semi-annual (182), annual (365).

**FR-024:** The system MUST store a `next_inspection_due` date (ISO 8601 TEXT) on apparatus and gear records, computed from the last inspection date plus the interval, or from the date the interval was set if no inspection exists.

**FR-025:** The system MUST provide a query that returns all assets (apparatus and gear) where `next_inspection_due` is in the past (overdue) or within a configurable lookahead window (default 7 days).

### Expiration Tracking

**FR-026:** The system MUST provide a query that returns all gear items where `expiration_date` is within a configurable lookahead window (default 90 days) or already past.

**FR-027:** The system SHOULD automatically set gear status to `expired` when `expiration_date` is in the past. This MAY be enforced at query time rather than via a scheduled job (given Cloudflare Workers constraints).

### Audit Logging

**FR-028:** The system MUST record an immutable audit log entry for every state-changing operation on an asset. The audit log MUST include: `id` (UUID), `org_id`, `actor_staff_id`, `action` (enumerated string), `target_type` (`apparatus` or `gear`), `target_id`, `detail_json` (JSON text containing old/new values or contextual data), and `created_at` (ISO 8601).

**FR-029:** The following actions MUST be audited: `apparatus.created`, `apparatus.updated`, `apparatus.status_changed`, `apparatus.inspected`, `gear.created`, `gear.updated`, `gear.status_changed`, `gear.assigned`, `gear.unassigned`, `gear.inspected`.

**FR-030:** Audit log records MUST be immutable. They cannot be updated or deleted.

### Permissions

**FR-031:** The system MUST add a `manage-assets` permission to the RBAC permission matrix in `src/lib/rbac.ts`.

**FR-032:** By default, `owner` and `admin` roles MUST have `manage-assets` permission. Other roles MUST NOT have it by default.

**FR-033:** All authenticated org members (any role) MUST have read access to the asset inventory (apparatus list, gear list, asset detail, inspection history).

**FR-034:** Staff members MUST be able to log inspections on gear assigned to them without `manage-assets` permission.

### Viewing and Filtering

**FR-035:** The system MUST provide a paginated apparatus list endpoint, filterable by `apparatus_type` and `status`.

**FR-036:** The system MUST provide a paginated gear list endpoint, filterable by `category`, `status`, `assigned_to_staff_id`, and `assigned_to_apparatus_id`.

**FR-037:** The system MUST provide an endpoint to retrieve all gear assigned to the currently authenticated staff member.

**FR-038:** The system MUST provide an endpoint to retrieve all gear assigned to a specific apparatus.

---

## Key Entities

### Apparatus

A vehicle or unit belonging to an organization. Represents engines, ladders, ambulances, command vehicles, and other operational apparatus.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `name` | TEXT | NOT NULL | Display name (e.g., "Engine 1") |
| `unit_number` | TEXT | NOT NULL, UNIQUE per org | Operational unit number (e.g., "E-1") |
| `apparatus_type` | TEXT | NOT NULL | One of: engine, ladder_truck, ambulance_medic, battalion_chief, rescue, brush_wildland, tanker_tender, boat, atv_utv, command_vehicle, utility, other |
| `status` | TEXT | NOT NULL, DEFAULT 'in_service' | One of: in_service, out_of_service, reserve, decommissioned |
| `vin` | TEXT | | Vehicle Identification Number |
| `make` | TEXT | | Manufacturer |
| `model` | TEXT | | Model name |
| `year` | INTEGER | | Model year |
| `notes` | TEXT | | Free-text notes |
| `inspection_interval_days` | INTEGER | | Inspection cadence in days (NULL = no schedule) |
| `next_inspection_due` | TEXT | | ISO 8601 date of next required inspection |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 last-update timestamp |

**Unique constraint:** `(org_id, unit_number)`

### Gear

An individual piece of equipment or PPE that can be assigned to a staff member or an apparatus. Tracks serial numbers, categories, expiration dates, and assignment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `name` | TEXT | NOT NULL | Display name (e.g., "SCBA Pack #12") |
| `serial_number` | TEXT | UNIQUE per org (when not NULL) | Manufacturer serial number |
| `category` | TEXT | NOT NULL | One of: scba, ppe, radio, medical_equipment, tools, hose, nozzle, thermal_camera, gas_detector, lighting, extrication, rope_rescue, water_rescue, hazmat, other |
| `status` | TEXT | NOT NULL, DEFAULT 'available' | One of: available, assigned, out_of_service, decommissioned, expired |
| `assigned_to_staff_id` | TEXT | FK → staff_member.id, nullable | Staff member currently holding this gear (mutually exclusive with apparatus assignment) |
| `assigned_to_apparatus_id` | TEXT | FK → apparatus.id, nullable | Apparatus this gear is mounted on (mutually exclusive with staff assignment) |
| `expiration_date` | TEXT | | ISO 8601 date when this gear expires |
| `make` | TEXT | | Manufacturer |
| `model` | TEXT | | Model name |
| `notes` | TEXT | | Free-text notes |
| `inspection_interval_days` | INTEGER | | Inspection cadence in days (NULL = no schedule) |
| `next_inspection_due` | TEXT | | ISO 8601 date of next required inspection |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 last-update timestamp |

**Unique constraint:** `(org_id, serial_number)` WHERE `serial_number IS NOT NULL`
**Check constraint:** `NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL)` — cannot be assigned to both simultaneously

### Asset Inspection

An immutable record of an inspection performed on an apparatus or gear item. Supports pass/fail with notes now, designed for future checklist expansion.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `target_type` | TEXT | NOT NULL | Either 'apparatus' or 'gear' |
| `target_id` | TEXT | NOT NULL | FK to apparatus.id or gear.id depending on target_type |
| `inspector_staff_id` | TEXT | FK → staff_member.id, NOT NULL | Staff member who performed the inspection |
| `result` | TEXT | NOT NULL | One of: pass, fail |
| `notes` | TEXT | | Free-text inspection notes |
| `inspection_date` | TEXT | NOT NULL | ISO 8601 date the inspection was performed |
| `checklist_json` | TEXT | | Reserved for future checklist data (JSON). NULL for now. |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |

**Index:** `(org_id, target_type, target_id, inspection_date)` for efficient history queries.

### Asset Audit Log

An immutable, append-only log of all state-changing operations on assets. Follows the existing `staff_audit_log` pattern.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PK, UUID | Unique identifier |
| `org_id` | TEXT | FK → organization.id, NOT NULL | Owning organization |
| `actor_staff_id` | TEXT | FK → staff_member.id, NOT NULL | Staff member who performed the action |
| `action` | TEXT | NOT NULL | Enumerated action string (see FR-029) |
| `target_type` | TEXT | NOT NULL | Either 'apparatus' or 'gear' |
| `target_id` | TEXT | NOT NULL | ID of the affected apparatus or gear |
| `detail_json` | TEXT | | JSON containing contextual data (old/new values, assignment target, etc.) |
| `created_at` | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | ISO 8601 creation timestamp |

**Index:** `(org_id, target_type, target_id, created_at)` for efficient audit trail queries.

---

## Success Criteria

**SC-001:** An org member with `manage-assets` permission can create, update, and change the status of apparatus and gear items. All mutations are reflected in the inventory views and audit log.

**SC-002:** Gear can be assigned to exactly one target (staff member or apparatus) at a time. Reassignment automatically clears the previous assignment. Decommissioning automatically unassigns gear.

**SC-003:** Inspections can be logged on any apparatus or gear item by users with `manage-assets` permission, and on personally assigned gear by the assigned staff member. Inspection records are immutable.

**SC-004:** Inspection intervals can be configured per asset. Logging an inspection recalculates the next due date. Overdue inspections are surfaceable via query.

**SC-005:** Gear with expiration dates approaching within 90 days (configurable) or already expired is surfaceable via query.

**SC-006:** Every state-changing operation produces an immutable audit log entry containing the actor, action, target, and detail JSON.

**SC-007:** All authenticated org members (any role) can read the asset inventory, asset details, and inspection history. Write operations are restricted to users with `manage-assets` permission (or assigned staff for inspections).

**SC-008:** Unit numbers are unique per organization for apparatus. Serial numbers are unique per organization for gear (when provided).

---

## Clarifications

1. **Scope is organization-level only.** Department and station assignment fields are not included in this iteration. When the department/station hierarchy is implemented, optional `department_id` and `station_id` foreign keys can be added to both `apparatus` and `gear` tables.

2. **Separate tables for apparatus and gear.** These are fundamentally different asset types with different fields (VIN/year vs. serial_number/expiration_date) and different lifecycle semantics. A single polymorphic "asset" table would require excessive NULLable columns and complicate queries.

3. **Inspections use simple pass/fail + notes now.** The `checklist_json` column is included as a TEXT field defaulting to NULL, providing a forward-compatible extension point for structured checklist inspections in a future iteration without requiring a schema migration.

4. **New `manage-assets` permission.** This is added to the RBAC permission matrix rather than being role-gated. By default, `owner` and `admin` have this permission. The permission can be extended to other roles as needed (e.g., a `manager` who is also an apparatus officer).

5. **Staff members can inspect their own assigned gear.** This permission is scoped to gear items where `assigned_to_staff_id` matches the current user's staff member ID. Staff members cannot inspect apparatus or gear assigned to others without `manage-assets` permission.

6. **Expiration enforcement is query-time.** Rather than relying on a cron job or scheduled worker (which adds operational complexity), expired status is resolved at read time: queries that return gear should treat any item with `expiration_date < current_date` as effectively expired, and the UI should mark them accordingly. An optional background process can periodically update the `status` column for data consistency.

7. **Decommissioned is a terminal status** for both apparatus and gear. Once decommissioned, an asset cannot be returned to service. This is intentional to preserve audit trail integrity.

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
6. **src/db/schema.sql** — Must be extended with `apparatus`, `gear`, `asset_inspection`, and `asset_audit_log` tables.

---

## Implementation Notes

### File Structure (Anticipated)

- `specs/007-asset-management/spec.md` — This specification
- `specs/007-asset-management/data-model.md` — Detailed DDL and migration SQL
- `specs/007-asset-management/tasks.md` — Implementation task checklist
- `src/lib/asset.types.ts` — TypeScript type definitions for apparatus, gear, inspection, audit log
- `src/server/assets.ts` — Server functions for all asset CRUD, assignment, and inspection operations
- `src/routes/_protected/orgs.$orgSlug/assets.tsx` — Asset management layout route
- `src/routes/_protected/orgs.$orgSlug/assets/` — Child routes (apparatus list, gear list, detail views, etc.)

### SQL DDL Preview

The `apparatus` and `gear` tables should use a composite unique index rather than a column-level UNIQUE constraint to scope uniqueness to the organization:

```sql
CREATE UNIQUE INDEX idx_apparatus_org_unit ON apparatus(org_id, unit_number);
CREATE UNIQUE INDEX idx_gear_org_serial ON gear(org_id, serial_number) WHERE serial_number IS NOT NULL;
```

The mutual exclusion constraint on gear assignment:

```sql
CHECK (NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL))
```
