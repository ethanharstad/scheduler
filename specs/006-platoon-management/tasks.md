# Tasks: Platoon Management

**Input**: Design documents from `/specs/006-platoon-management/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/platoons.md ✅

**Organization**: Tasks grouped by user story — each story is independently implementable and testable.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- No test tasks — tests not requested in specification

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema and type definitions that all phases depend on.

- [x] T001 [P] Add `platoon` and `platoon_membership` tables (with indexes) to `src/db/schema.sql` under a `-- Platoon Management (006-platoon-management)` comment — use the exact DDL from `specs/006-platoon-management/data-model.md`
- [x] T002 [P] Create `src/lib/platoon.types.ts` with all types from `data-model.md`: `Platoon`, `PlatoonMembership`, `PlatoonView`, `PlatoonDetailView`, `PlatoonMemberView`, and all server fn I/O types (`ListPlatoonsInput/Output`, `GetPlatoonInput/Output`, `CreatePlatoonInput/Output`, `UpdatePlatoonInput/Output`, `DeletePlatoonInput/Output`, `AssignMemberInput/Output`, `RemoveMemberFromPlatoonInput/Output`)

**Checkpoint**: Schema ready to apply locally; all TypeScript types available for import

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side infrastructure that all server functions share. Must complete before any user story server fn work.

**⚠️ CRITICAL**: No user story server function can be written until this phase is complete.

- [x] T003 Create `src/server/platoons.ts` with two non-exported helpers: (1) `requireOrgMembership` — copied from the same pattern in `src/server/members.ts` (session cookie → user_id → org_id → membership row, returns `MembershipContext | null`); (2) `isValidRRule(value: string): boolean` — strips optional `RRULE:` prefix, checks `FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)` is present, checks all segments match `KEY=VALUE` grammar — see `specs/006-platoon-management/research.md` Decision 1 for the exact regex. No exported server functions yet.

**Checkpoint**: Foundation ready — user story server fns can now be added to `src/server/platoons.ts`

---

## Phase 3: User Story 1 — View Platoon Roster (Priority: P1) 🎯 MVP

**Goal**: All org members can view the platoon list and individual platoon member rosters. No write controls shown.

**Independent Test**: Log in as an employee, navigate to `/orgs/:slug/platoons`, confirm platoons list with name/shift label/start date/member count; click a platoon, confirm member names appear; confirm no create/edit/delete buttons are visible.

- [x] T004 [US1] Implement `listPlatoonsServerFn` (GET) in `src/server/platoons.ts` — calls `requireOrgMembership` (any valid membership satisfies `view-schedules`; no `canDo` check needed); queries `platoon LEFT JOIN platoon_membership GROUP BY platoon.id ORDER BY LOWER(name) ASC`; returns `ListPlatoonsOutput` — see `specs/006-platoon-management/contracts/platoons.md` for full SQL sketch
- [x] T005 [US1] Implement `getPlatoonServerFn` (GET) in `src/server/platoons.ts` — calls `requireOrgMembership`; fetches platoon row by `id + org_id` (returns `NOT_FOUND` if absent); fetches member names via `platoon_membership JOIN staff_member ORDER BY staff_member.name ASC`; also fetches all active org staff members (id + name) for use by the assign-member UI in later stories; returns `GetPlatoonOutput`
- [x] T006 [P] [US1] Create `src/routes/_protected/orgs.$orgSlug/platoons.tsx` — route path `/_protected/orgs/$orgSlug/platoons`; `head` sets page title; no `beforeLoad` redirect (all members may view); loader calls `listPlatoonsServerFn`; component renders: alphabetical platoon list table (columns: name, shift label, start date, member count, color swatch if set); clicking a row navigates to the detail route; empty state when no platoons exist; no create/edit/delete controls rendered yet (added in US2)
- [x] T007 [P] [US1] Create `src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx` — route path `/_protected/orgs/$orgSlug/platoons/$platoonId`; loader calls `getPlatoonServerFn` (redirects to list on `NOT_FOUND`); component renders: platoon header (name, shift label, start date, color, description); member list showing names only (alphabetical); empty state when no members; breadcrumb back to platoon list; no write controls rendered yet (added in US3/US4/US5)
- [x] T008 [P] [US1] Add "Platoons" nav link to the org sidebar in `src/routes/_protected/orgs.$orgSlug.tsx` — link to `/orgs/$orgSlug/platoons`; no permission gate (all roles have `view-schedules`); place it in the scheduling section of the nav alongside any existing schedule links

**Checkpoint**: US1 fully functional — employees can browse platoons and member rosters; run independent test above

---

## Phase 4: User Story 2 — Create a Platoon (Priority: P2)

**Goal**: Users with `create-edit-schedules` permission can create a new platoon via the list page.

**Independent Test**: Log in as a manager, open the platoon list, use the create form to submit name "A Platoon", shift label "A Shift", RRULE `FREQ=DAILY;INTERVAL=3`, start date 2026-01-01 — platoon appears in list. Submit with an invalid RRULE → validation error. Submit with a duplicate name → duplicate error. Log in as employee → no create button visible.

- [x] T009 [US2] Implement `createPlatoonServerFn` (POST) in `src/server/platoons.ts` — calls `requireOrgMembership`; checks `canDo(role, 'create-edit-schedules')` → `FORBIDDEN`; calls `isValidRRule(rrule)` → `INVALID_RRULE`; queries `SELECT 1 FROM platoon WHERE org_id = ? AND LOWER(name) = LOWER(?)` → `DUPLICATE_NAME`; inserts new row with `crypto.randomUUID()` id and ISO 8601 timestamps; returns `{ success: true, platoonId }`
- [x] T010 [US2] Add create platoon UI to `src/routes/_protected/orgs.$orgSlug/platoons.tsx` — render a "New Platoon" button (and inline/modal form) only when `canDo(userRole, 'create-edit-schedules')`; form fields: name (required), shift label (required), pattern shortcut selector (24/48 → `FREQ=DAILY;INTERVAL=3`, 24/72 → `FREQ=DAILY;INTERVAL=4`, 48/96 → `FREQ=DAILY;INTERVAL=6`, Kelly → `FREQ=DAILY;INTERVAL=9`, California Swing → `FREQ=WEEKLY;BYDAY=MO,TU,WE`, Custom → no pre-fill) + editable RRULE text field (pre-populated by shortcut selection via client-side JS), start date (required), description (optional), color (optional); on submit calls `createPlatoonServerFn`; on success refreshes list and clears form; maps `DUPLICATE_NAME` and `INVALID_RRULE` error codes to user-facing messages

**Checkpoint**: US2 fully functional — managers can create platoons; employees cannot see create controls

---

## Phase 5: User Story 3 — Edit a Platoon (Priority: P3)

**Goal**: Users with `create-edit-schedules` permission can edit a platoon's fields from the detail page.

**Independent Test**: Log in as an admin, open a platoon detail, change its name and shift label, save — changes appear immediately in both the list and detail views. Enter an invalid RRULE → rejected. Rename to an existing name → rejected. Log in as employee → no edit controls visible.

- [x] T011 [US3] Implement `updatePlatoonServerFn` (POST) in `src/server/platoons.ts` — calls `requireOrgMembership`; checks `canDo` → `FORBIDDEN`; fetches platoon by `id + org_id` → `NOT_FOUND`; calls `isValidRRule(rrule)` → `INVALID_RRULE`; checks name uniqueness excluding the current platoon id → `DUPLICATE_NAME`; runs `UPDATE platoon SET name=?, shift_label=?, rrule=?, start_date=?, description=?, color=?, updated_at=? WHERE id=? AND org_id=?`
- [x] T012 [US3] Add edit platoon UI to `src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx` — render an "Edit" button (and inline/slide-over form) only when `canDo(userRole, 'create-edit-schedules')`; form fields identical to create form, pre-filled from loader data; pattern shortcut selector re-shown alongside the editable RRULE field (selecting a shortcut re-populates the RRULE field; fields remain independently editable per clarification); shift label field is independent of RRULE; on submit calls `updatePlatoonServerFn`; on success updates displayed platoon data; maps error codes to messages

**Checkpoint**: US3 fully functional — authorized users can edit platoon details

---

## Phase 6: User Story 4 — Assign and Remove Members (Priority: P4)

**Goal**: Users with `create-edit-schedules` permission can assign staff members to a platoon (with move confirmation when already assigned elsewhere) and remove them.

**Independent Test**: Log in as a manager, open a platoon, assign a staff member — member appears in list, count increments. Assign a member already on another platoon — confirmation prompt naming the source platoon appears; confirm → member moves; cancel → no change. Remove a member — member disappears from list, count decrements. Log in as employee — no assign/remove controls visible.

- [x] T013 [US4] Implement `assignMemberServerFn` (POST) in `src/server/platoons.ts` — calls `requireOrgMembership`; checks `canDo` → `FORBIDDEN`; verifies platoon `id + org_id` exists → `PLATOON_NOT_FOUND`; verifies staff member `id + org_id` exists with status != `removed` → `MEMBER_NOT_FOUND`; queries current membership to capture prior platoon name for `movedFrom`; executes `INSERT OR REPLACE INTO platoon_membership(id, platoon_id, staff_member_id, assigned_at) VALUES(?, ?, ?, ?)` (atomic upsert; prior membership for this staff_member_id is replaced by the unique index); returns `{ success: true, movedFrom: string | null }`
- [x] T014 [US4] Implement `removeMemberFromPlatoonServerFn` (POST) in `src/server/platoons.ts` — calls `requireOrgMembership`; checks `canDo` → `FORBIDDEN`; executes `DELETE FROM platoon_membership WHERE platoon_id = ? AND staff_member_id = ?`; if 0 rows deleted returns `NOT_FOUND`
- [x] T015 [US4] Add assign member UI to `src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx` — visible only when `canDo(userRole, 'create-edit-schedules')`; render a member selector (dropdown or search input populated from the org staff list already fetched by the loader in T005); on selection calls `assignMemberServerFn`; if `movedFrom` is non-null in the response, show an inline confirmation prompt ("This member is currently on [movedFrom]. Move them to this platoon?") before committing — implement as a two-step interaction (select → confirm if movedFrom → call server fn); on success refreshes the member list
- [x] T016 [US4] Add remove member button to each row in the member list in `src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx` — visible only when `canDo(userRole, 'create-edit-schedules')`; on click calls `removeMemberFromPlatoonServerFn`; on success removes the row and decrements member count; no separate confirmation dialog (single-click remove for individual members)

**Checkpoint**: US4 fully functional — authorized users can manage platoon membership

---

## Phase 7: User Story 5 — Delete a Platoon (Priority: P5)

**Goal**: Users with `create-edit-schedules` permission can delete a platoon with a confirmation step; all member assignments are cleared but staff records are preserved.

**Independent Test**: Log in as an admin, open a platoon with members, click Delete — confirmation prompt names the platoon and warns assignments will be cleared. Confirm → platoon removed from list; formerly assigned members still appear in staff roster unaffected. Cancel → platoon and members preserved.

- [x] T017 [US5] Implement `deletePlatoonServerFn` (POST) in `src/server/platoons.ts` — calls `requireOrgMembership`; checks `canDo` → `FORBIDDEN`; verifies platoon `id + org_id` exists → `NOT_FOUND`; executes `DELETE FROM platoon WHERE id = ? AND org_id = ?` (CASCADE on `platoon_membership.platoon_id` clears memberships automatically)
- [x] T018 [US5] Add delete platoon button + inline confirmation to `src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx` — visible only when `canDo(userRole, 'create-edit-schedules')`; first click shows inline confirmation ("Delete [platoon name]? All member assignments will be cleared.") with Confirm and Cancel buttons; on confirm calls `deletePlatoonServerFn`; on success navigates to `/orgs/$orgSlug/platoons` (the list page); maps `NOT_FOUND` error to a user-facing message

**Checkpoint**: All 5 user stories fully functional and independently testable

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T019 [P] Verify `npm run build` completes without TypeScript errors — fix any strict-mode violations (`no any`, unused vars/params, missing return types on server fns)
- [x] T020 [P] Run the quickstart.md verification checklist against the local dev server (`npm run dev`) and confirm all 8 checklist items pass; apply the D1 schema migration command from `quickstart.md` to local D1 before testing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 start immediately and in parallel
- **Foundational (Phase 2)**: T003 depends on T001 + T002 — BLOCKS all server fn work
- **US1 (Phase 3)**: T004 depends on T003; T005 depends on T004 (same file, sequential); T006, T007, T008 depend on T004+T005 and can run in parallel with each other
- **US2 (Phase 4)**: T009 depends on T003; T010 depends on T009 + T006
- **US3 (Phase 5)**: T011 depends on T003; T012 depends on T011 + T007
- **US4 (Phase 6)**: T013 depends on T003; T014 depends on T013 (same file); T015 depends on T013 + T007; T016 depends on T014 + T015
- **US5 (Phase 7)**: T017 depends on T003; T018 depends on T017 + T007
- **Polish (Phase 8)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — no other user story dependency; delivers standalone read-only views
- **US2 (P2)**: Depends on US1 routes being created (adds create form to platoons.tsx)
- **US3 (P3)**: Depends on US1 routes being created (adds edit form to platoons.$platoonId.tsx)
- **US4 (P4)**: Depends on US1 routes being created (adds assign/remove UI to platoons.$platoonId.tsx); US3 and US4 can proceed in parallel if staffed
- **US5 (P5)**: Depends on US1 routes being created (adds delete UI to platoons.$platoonId.tsx); US3, US4, US5 can all proceed in parallel after US1

### Parallel Opportunities

- T001 ‖ T002 (different files: schema.sql vs platoon.types.ts)
- T006 ‖ T007 ‖ T008 (three different files; all unblocked once T005 is done)
- T011 ‖ T013 ‖ T017 (all server fns are in the same file, so NOT actually parallel — sequential)
- T019 ‖ T020 (different verification tasks)
- After US1 completes: US3 ‖ US4 ‖ US5 route additions can proceed in parallel (all touch platoons.$platoonId.tsx but in separate UI sections — coordinate carefully if two developers work simultaneously)

---

## Parallel Execution Example: User Story 1

```text
# Step 1 — parallel:
T004: Implement listPlatoonsServerFn in src/server/platoons.ts
      → then T005: Implement getPlatoonServerFn (same file, sequential after T004)

# Step 2 — all three in parallel after T004 + T005:
T006: Create src/routes/_protected/orgs.$orgSlug/platoons.tsx (list route)
T007: Create src/routes/_protected/orgs.$orgSlug/platoons.$platoonId.tsx (detail route)
T008: Add Platoons nav link to src/routes/_protected/orgs.$orgSlug.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: T001 + T002 (parallel)
2. Complete Phase 2: T003
3. Complete Phase 3: T004 → T005 → (T006 ‖ T007 ‖ T008)
4. **STOP and VALIDATE**: All employees can view platoons and member lists
5. Apply schema and smoke-test with `npm run dev`

### Incremental Delivery

1. Setup + Foundational → skeleton ready
2. US1 → read-only platoon browsing for all staff *(MVP)*
3. US2 → managers can create platoons
4. US3 + US4 in parallel → edit + member management
5. US5 → delete platoons
6. Polish → build check + quickstart verification

### Notes

- Server fns all go in `src/server/platoons.ts` — add them sequentially (same file, no parallel edits)
- Route files are independent — T006, T007 are safe to work on simultaneously if two developers
- `INSERT OR REPLACE` in `assignMemberServerFn` handles the one-platoon-per-member constraint atomically at the DB level — no application-level locking needed
- Predefined pattern shortcuts (24/48, Kelly, etc.) are entirely client-side JS in the create/edit forms — they just pre-populate the RRULE text field; nothing is stored about which shortcut was selected
- Commit after each phase checkpoint to keep history clean
