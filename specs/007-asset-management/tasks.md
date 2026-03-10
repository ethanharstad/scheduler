# Tasks: Asset Management

**Input**: Design documents from `/specs/007-asset-management/`
**Prerequisites**: plan.md | spec.md | research.md | data-model.md | contracts/server-functions.md | quickstart.md

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US12 from spec.md)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema, types, and RBAC permission — everything needed before server functions.

- [ ] T001 [P] Append `asset`, `asset_inspection`, and `asset_audit_log` table DDL (with indexes and CHECK constraints) to `src/db/schema.sql` per `data-model.md`
- [ ] T002 [P] Add `'manage-assets'` to the `Permission` union type in `src/lib/rbac.types.ts`
- [ ] T003 Add `'manage-assets'` to the `owner`, `admin`, and `manager` role sets in `src/lib/rbac.ts` (depends on T002)
- [ ] T004 [P] Create `src/lib/asset.types.ts` with all TypeScript types: `AssetType`, `ApparatusCategory`, `GearCategory`, `ApparatusStatus`, `GearStatus` union types; `AssetView`, `AssetDetailView`, `InspectionView`, `AssetAuditEntry` view types; all server function input/output types per `contracts/server-functions.md`

**Checkpoint**: Schema applied, RBAC extended, types compiled — `npm run build` should succeed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server function file with shared helpers and core CRUD — needed by ALL user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 Create `src/server/assets.ts` with imports (`createServerFn`, `requireOrgMembership` from `@/server/_helpers`, `canDo` from `@/lib/rbac`, types from `@/lib/asset.types`) and shared helpers: `writeAssetAuditLog()` (inserts into `asset_audit_log`), `validateCustomFields()` (flat JSON, string/number/boolean values, 10 KB max), `validateCategory()` (type-scoped enum check), `validateStatus()` (type-scoped enum check), `isoNow()` (ISO 8601 timestamp)
- [ ] T006 Implement `createAssetServerFn` (POST) in `src/server/assets.ts` — validates input per contract, enforces `manage-assets` permission, generates UUID, inserts asset row, writes `asset.created` audit entry, returns `AssetView`; handles `DUPLICATE_UNIT_NUMBER` and `DUPLICATE_SERIAL_NUMBER` errors from unique index violations
- [ ] T007 Implement `listAssetsServerFn` (POST) in `src/server/assets.ts` — any org member, paginated (default 50, max 200), filterable by `assetType`, `status`, `category`, `assignedToStaffId`, `assignedToApparatusId`, `search` (name/unit_number/serial_number LIKE), returns `AssetView[]` with LEFT JOINs for assignment names + total count
- [ ] T008 Implement `getAssetServerFn` (POST) in `src/server/assets.ts` — any org member, returns `AssetDetailView` (all fields including notes, lifecycle dates, custom_fields) with LEFT JOINs for assignment names

**Checkpoint**: Core CRUD server functions work — can create and list assets via server function calls.

---

## Phase 3: US1 + US2 — Register Assets (Priority: P1) MVP

**Goal**: Users with `manage-assets` can create apparatus and gear via a form and see them in an inventory list.

**Independent Test**: Create an apparatus with name/unit number/category, create a gear item with name/serial/category/expiration — both appear in the asset list.

- [ ] T009 [US1] [US2] Create `src/routes/_protected/orgs.$orgSlug/assets.tsx` layout route — `beforeLoad` loads org context via `useRouteContext`, renders `<Outlet>` with asset management nav/header; conditionally show "Add Asset" link if user has `manage-assets` permission
- [ ] T010 [US1] [US2] Create `src/routes/_protected/orgs.$orgSlug/assets/index.tsx` — route loader calls `listAssetsServerFn`, renders paginated asset table with columns: name, type, category, status, serial/unit number; basic type filter tabs (All / Apparatus / Gear)
- [ ] T011 [US1] [US2] Create `src/routes/_protected/orgs.$orgSlug/assets/new.tsx` — asset creation form with type selector (apparatus/gear), dynamic fields based on type (unit_number required for apparatus, expiration_date for gear), category dropdown (type-scoped), optional fields (serial, make, model, dates, notes, custom_fields); calls `createAssetServerFn` on submit, navigates to asset list on success; shows validation errors for duplicates

**Checkpoint**: MVP complete — apparatus and gear can be created and listed. Run `npm run dev` to regenerate route tree.

---

## Phase 4: US11 — View Asset Inventory (Priority: P1)

**Goal**: Any org member views the full filterable inventory of apparatus and gear, plus their own assigned gear.

**Independent Test**: An org member with any role sees all assets, can filter by status/category, and sees their personal gear on the my-gear page.

- [ ] T012 [US11] Implement `getMyGearServerFn` (POST) in `src/server/assets.ts` — any org member, looks up current user's `staff_member` record by `user_id` + `org_id`, returns all gear where `assigned_to_staff_id` matches
- [ ] T013 [US11] Implement `getApparatusGearServerFn` (POST) in `src/server/assets.ts` — any org member, returns all gear where `assigned_to_apparatus_id` matches the given apparatus ID
- [ ] T014 [US11] Enhance `src/routes/_protected/orgs.$orgSlug/assets/index.tsx` — add status filter dropdown, category filter dropdown, search input (name/serial/unit), pagination controls; show expiration badge for gear with upcoming/past expiration
- [ ] T015 [US11] Create `src/routes/_protected/orgs.$orgSlug/assets/my-gear.tsx` — route loader calls `getMyGearServerFn`, renders personal gear list with name, category, status, serial number, expiration date; shows "No gear assigned" empty state

**Checkpoint**: Full inventory browsing works for all org members. My-gear page shows personal assignments.

---

## Phase 5: US3 — Assign Gear to Staff or Apparatus (Priority: P1)

**Goal**: Users with `manage-assets` can assign gear to a staff member or apparatus, with proper audit trail.

**Independent Test**: Assign gear to a staff member, verify status becomes "Assigned" and audit log records the assignment. Reassign to an apparatus, verify previous assignment cleared.

- [ ] T016 [US3] Implement `assignGearServerFn` (POST) in `src/server/assets.ts` — enforces `manage-assets`, validates asset is gear and not decommissioned/expired, validates target exists (staff_member or apparatus asset), clears previous assignment (writes `asset.unassigned` if reassigning), sets new assignment + status to `assigned`, writes `asset.assigned` audit entry
- [ ] T017 [US3] Create `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — route loader calls `getAssetServerFn`, renders asset detail page with all fields; for gear assets with `manage-assets` permission, show assignment section with staff/apparatus selector and "Assign" button calling `assignGearServerFn`; display current assignment (staff name or apparatus name)

**Checkpoint**: Gear assignment works end-to-end. Reassignment clears previous assignment.

---

## Phase 6: US5 + US6 — Log Inspections (Priority: P1)

**Goal**: Users with `manage-assets` can log pass/fail inspections on any asset; staff can inspect their own assigned gear.

**Independent Test**: Log a passing inspection on an apparatus, log a failing inspection on gear assigned to the current user (without `manage-assets`). Both appear in the asset's inspection history.

- [ ] T018 [US5] [US6] Implement `logInspectionServerFn` (POST) in `src/server/assets.ts` — permission check: `manage-assets` OR (asset is gear AND `assigned_to_staff_id` matches current user's staff_member_id); inserts `asset_inspection` record with UUID, result, notes, inspection_date (defaults to today); if asset has `inspection_interval_days`, recalculates `next_inspection_due`; writes `asset.inspected` audit entry
- [ ] T019 [US5] [US6] Add inspection form to `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — pass/fail radio buttons, optional notes textarea, optional date picker (defaults to today); "Log Inspection" button calls `logInspectionServerFn`; show form if user has `manage-assets` OR is assigned staff member; display recent inspections summary (last 5) below the form

**Checkpoint**: Inspections can be logged on apparatus and gear. Permission check for assigned-staff self-inspection works.

---

## Phase 7: US4 — Unassign Gear (Priority: P2)

**Goal**: Users with `manage-assets` can unassign gear, returning it to "Available" status.

**Independent Test**: Unassign gear from a staff member, verify status returns to "Available" and audit log records the unassignment.

- [ ] T020 [US4] Implement `unassignGearServerFn` (POST) in `src/server/assets.ts` — enforces `manage-assets`, validates asset is gear and currently assigned, clears both assignment fields, sets status to `available` (unless `out_of_service`), writes `asset.unassigned` audit entry
- [ ] T021 [US4] Add "Unassign" button to gear assignment section in `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — visible only when gear is assigned and user has `manage-assets`; calls `unassignGearServerFn`, refreshes asset detail on success

**Checkpoint**: Gear can be unassigned. Status correctly reverts to "Available".

---

## Phase 8: US9 + US10 — Update Asset Status and Fields (Priority: P2)

**Goal**: Users with `manage-assets` can change asset status (with decommission side effects) and update mutable fields.

**Independent Test**: Change apparatus status to "Out-of-Service", then to "Decommissioned" — verify all assigned gear is unassigned. Update gear serial number and verify unique constraint enforcement.

- [ ] T022 [US9] [US10] Implement `changeAssetStatusServerFn` (POST) in `src/server/assets.ts` — enforces `manage-assets`, validates new status is valid for asset type, rejects transitions from `decommissioned`, writes `asset.status_changed` audit entry with old/new values; on apparatus decommission: batch-unassign all gear (set `assigned_to_*` NULL, status to `available`, write `asset.unassigned` for each); on gear decommission: clear assignment if exists
- [ ] T023 [US9] [US10] Implement `updateAssetServerFn` (POST) in `src/server/assets.ts` — enforces `manage-assets`, rejects updates to decommissioned assets, validates category is type-scoped, enforces unique serial_number/unit_number, updates only provided fields, writes `asset.updated` audit entry with changed field old/new values in `detail_json`
- [ ] T024 [US9] [US10] Add status change dropdown and edit form to `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — status change: dropdown with valid statuses for asset type + confirm button, shows warning for decommission ("This cannot be undone. All assigned gear will be unassigned."); edit form: modal or inline editing for mutable fields (name, category, serial, make, model, dates, notes, custom_fields), calls `updateAssetServerFn`

**Checkpoint**: Status changes work with decommission side effects. Asset fields can be edited.

---

## Phase 9: US7 — Set Inspection Schedule (Priority: P2)

**Goal**: Users with `manage-assets` can configure inspection intervals, and the system tracks next-due dates.

**Independent Test**: Set a monthly (30-day) inspection interval on an apparatus. Log an inspection. Verify `next_inspection_due` recalculates to inspection_date + 30 days.

- [ ] T025 [US7] Implement `setInspectionIntervalServerFn` (POST) in `src/server/assets.ts` — enforces `manage-assets`, accepts `intervalDays` (positive integer or null to clear), calculates `next_inspection_due` from last inspection date (query `asset_inspection` for most recent) or today if no inspections exist, updates asset record
- [ ] T026 [US7] Add inspection schedule configuration to `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — interval selector with named presets (Daily, Weekly, Monthly, Quarterly, Semi-Annual, Annual) + "None" option, displays current `next_inspection_due` date with overdue indicator; calls `setInspectionIntervalServerFn` on change

**Checkpoint**: Inspection intervals are configurable. Next-due dates recalculate after inspections.

---

## Phase 10: US12 — View Asset Detail and Inspection History (Priority: P2)

**Goal**: Any org member views full asset detail including paginated inspection history and audit trail.

**Independent Test**: View an apparatus detail page with 15+ inspection records — see all fields and chronological inspection history with pagination.

- [ ] T027 [US12] Implement `getInspectionHistoryServerFn` (POST) in `src/server/assets.ts` — any org member, paginated (default 50, max 200), returns `InspectionView[]` with inspector name (LEFT JOIN staff_member) in reverse chronological order + total count
- [ ] T028 [US12] Implement `getAssetAuditLogServerFn` (POST) in `src/server/assets.ts` — any org member, paginated (default 50, max 200), returns `AssetAuditEntry[]` with actor name (LEFT JOIN staff_member) in reverse chronological order + total count
- [ ] T029 [US12] Enhance `src/routes/_protected/orgs.$orgSlug/assets/$assetId.tsx` — add tabbed sections for "Details", "Inspections", "Audit Log"; inspection tab: paginated inspection history table (date, inspector, result, notes) loaded via `getInspectionHistoryServerFn`; audit tab: paginated audit log table (date, actor, action, details) loaded via `getAssetAuditLogServerFn`; details tab: all asset fields including lifecycle dates, custom fields, inspection schedule

**Checkpoint**: Full asset detail with inspection history and audit trail visible to all org members.

---

## Phase 11: US8 — View Expiring and Overdue Assets (Priority: P2)

**Goal**: Users with `manage-assets` see assets approaching expiration and assets with overdue inspections.

**Independent Test**: Create gear with expiration 60 days from now, create apparatus with overdue inspection — both appear in the alerts view.

- [ ] T030 [US8] Implement `getExpiringAssetsServerFn` (POST) in `src/server/assets.ts` — any org member, returns all assets where `expiration_date` is within `lookaheadDays` (default 90) of today or already past, sorted by expiration date ascending; excludes decommissioned assets
- [ ] T031 [US8] Implement `getOverdueInspectionsServerFn` (POST) in `src/server/assets.ts` — any org member, returns all assets where `next_inspection_due` is in the past or within `lookaheadDays` (default 7) of today, sorted by due date ascending; excludes decommissioned assets
- [ ] T032 [US8] Add alerts/compliance section to `src/routes/_protected/orgs.$orgSlug/assets/index.tsx` — collapsible dashboard at top of inventory page showing: "Expiring Soon" count + list (gear/apparatus approaching expiration with days remaining), "Overdue Inspections" count + list (assets past due with days overdue); loaded via `getExpiringAssetsServerFn` and `getOverdueInspectionsServerFn` in route loader; color-coded badges (red for overdue/expired, amber for approaching)

**Checkpoint**: Expiration and inspection compliance alerts are visible on the inventory page.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, visual polish, and edge case handling.

- [ ] T033 Run `npm run build` and fix any TypeScript compilation errors in `src/server/assets.ts`, `src/lib/asset.types.ts`, and all route files
- [ ] T034 Verify `npm run dev` regenerates `src/routeTree.gen.ts` with all new asset routes
- [ ] T035 [P] Add empty states to all asset route pages — "No assets found" on inventory, "No inspections recorded" on detail, "No gear assigned" on my-gear
- [ ] T036 [P] Add loading states and error handling to all asset route pages — skeleton loaders during data fetch, error boundaries for failed server function calls
- [ ] T037 Validate against `specs/007-asset-management/quickstart.md` — verify all setup steps, key patterns, and testing approaches work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
  - T001, T002, T004 can run in parallel (different files)
  - T003 depends on T002 (needs Permission type updated first)
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
  - T005 → T006 → T007 → T008 (sequential; single file, each builds on helpers)
- **US1+US2 (Phase 3)**: Depends on Phase 2 (needs createAsset + listAssets server fns)
  - T009 first (layout), then T010 ‖ T011 (different route files)
- **US11 (Phase 4)**: Depends on Phase 3 (needs asset list page to enhance)
  - T012 ‖ T013 (different server fns, no dependency), then T014 + T015
- **US3 (Phase 5)**: Depends on Phase 2 (needs core CRUD)
  - T016 (server fn) → T017 (route)
- **US5+US6 (Phase 6)**: Depends on Phase 5 (needs $assetId.tsx to exist)
  - T018 (server fn) → T019 (route enhancement)
- **US4 (Phase 7)**: Depends on Phase 5 (needs assignment to unassign)
  - T020 (server fn) → T021 (route enhancement)
- **US9+US10 (Phase 8)**: Depends on Phase 5 (needs $assetId.tsx)
  - T022 ‖ T023 (different server fns), then T024
- **US7 (Phase 9)**: Depends on Phase 6 (needs inspection capability for interval recalculation)
  - T025 (server fn) → T026 (route enhancement)
- **US12 (Phase 10)**: Depends on Phase 6 (needs inspections to have history to show)
  - T027 ‖ T028 (different server fns), then T029
- **US8 (Phase 11)**: Depends on Phase 4 (needs inventory page) + Phase 9 (needs inspection scheduling for overdue)
  - T030 ‖ T031 (different server fns), then T032
- **Polish (Phase 12)**: Depends on all previous phases
  - T033 → T034 (build first, then dev server)
  - T035 ‖ T036 (different concerns, same files but independent changes)
  - T037 last (end-to-end validation)

### User Story Dependencies

- **US1+US2 (P1)**: After Foundational — no other story dependency
- **US11 (P1)**: After Phase 3 — needs assets to exist for inventory view
- **US3 (P1)**: After Foundational — no other story dependency; creates $assetId.tsx
- **US5+US6 (P1)**: After US3 — needs $assetId.tsx route to add inspection form
- **US4 (P2)**: After US3 — needs assignment to exist before unassign makes sense
- **US9+US10 (P2)**: After US3 — needs $assetId.tsx for status/edit UI
- **US7 (P2)**: After US5+US6 — inspection interval recalculation depends on inspection logging
- **US12 (P2)**: After US5+US6 — needs inspection history data to display
- **US8 (P2)**: After US11 + US7 — needs inventory page and inspection scheduling

### Within Each User Story

- Server functions before routes (data layer before UI)
- Helpers before specific functions (shared utilities first)
- Layout route before child routes
- Core view before enhancements

---

## Parallel Opportunities

### Phase 1 (Setup)

```
T001 (schema.sql) ‖ T002 (rbac.types.ts) ‖ T004 (asset.types.ts)
Then: T003 (rbac.ts, depends on T002)
```

### Phase 3 (US1+US2 Routes)

```
After T009 (layout):
T010 (index.tsx) ‖ T011 (new.tsx)
```

### Phase 4 (US11 Server Functions)

```
T012 (getMyGear) ‖ T013 (getApparatusGear)
Then: T014 ‖ T015 (different route files)
```

### Phase 8 (US9+US10 Server Functions)

```
T022 (changeStatus) ‖ T023 (updateAsset)
Then: T024 (UI)
```

### Phase 10 (US12 Server Functions)

```
T027 (inspectionHistory) ‖ T028 (auditLog)
Then: T029 (UI)
```

### Phase 11 (US8 Server Functions)

```
T030 (expiring) ‖ T031 (overdue)
Then: T032 (UI)
```

### Cross-Phase Parallelism

Once Phase 2 (Foundational) is complete:
- **Phase 3** (US1+US2 routes) and **Phase 5** (US3 assignment) can start in parallel (different route files)
- **Phase 4** (US11 server fns T012/T013) can start in parallel with Phase 3 routes

Once Phase 5 (US3) is complete:
- **Phase 6** (US5+US6), **Phase 7** (US4), and **Phase 8** (US9+US10) can start in parallel (different server fns, same $assetId.tsx file needs coordination)

---

## Implementation Strategy

### MVP First (Phases 1-3: US1 + US2)

1. Complete Phase 1: Setup (schema, types, RBAC)
2. Complete Phase 2: Foundational (server function file + core CRUD)
3. Complete Phase 3: US1+US2 (create form + list view)
4. **STOP and VALIDATE**: Create an apparatus, create a gear item, see both in list
5. Deploy/demo if ready — basic asset registry is operational

### P1 Delivery (Phases 4-6: US11, US3, US5+US6)

6. Phase 4: US11 (full inventory with filters + my-gear page)
7. Phase 5: US3 (gear assignment + detail page)
8. Phase 6: US5+US6 (inspection logging)
9. **STOP and VALIDATE**: Full P1 feature set — create, view, assign, inspect

### P2 Delivery (Phases 7-11: US4, US7-US10, US12)

10. Phase 7: US4 (unassign gear)
11. Phase 8: US9+US10 (status changes + field editing)
12. Phase 9: US7 (inspection scheduling)
13. Phase 10: US12 (full detail + history views)
14. Phase 11: US8 (expiration/overdue alerts)
15. **STOP and VALIDATE**: Complete feature set

### Final

16. Phase 12: Polish (build, empty states, loading states, quickstart validation)

---

## Notes

- [P] tasks = different files, no shared dependencies
- [Story] label maps task to user stories from spec.md (US1–US12)
- All server functions go in single file `src/server/assets.ts` — sequential within file, no [P] within same file
- Route files are separate — [P] safe across different route files
- `$assetId.tsx` is progressively enhanced across Phases 5-11 — each phase adds a section
- No test tasks included (not explicitly requested in spec)
- Commit after each phase or logical task group
- Stop at any checkpoint to validate independently
