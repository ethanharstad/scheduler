# Tasks: Organization Role-Based Access Control

**Input**: Design documents from `specs/004-org-rbac/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/server-functions.md ✓

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies between them)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new tooling or dependencies — this is an existing TypeScript/TanStack Start project. Verify prerequisites before writing code.

- [x] T001 Confirm `src/lib/org.types.ts` exports `OrgRole` type and all five values are present (`owner | admin | manager | employee | payroll_hr`) — no changes expected, read-only check

**Checkpoint**: All prerequisite types confirmed — foundational work can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core RBAC utility and server-side auth helper that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create `src/lib/rbac.types.ts` — define `Permission` union type (13 values: `view-org-settings`, `edit-org-settings`, `manage-billing`, `invite-members`, `remove-members`, `assign-roles`, `transfer-ownership`, `create-edit-schedules`, `view-schedules`, `approve-time-off`, `submit-time-off`, `view-reports`, `access-payroll-hr`); define `OrgMemberView` interface (`memberId`, `userId`, `email`, `displayName`, `role: OrgRole`, `joinedAt`); define all five server function I/O types: `ListMembersOutput`, `ChangeMemberRoleInput`/`Output`, `RemoveMemberInput`/`Output`, `TransferOwnershipInput`/`Output`, `GetMemberPermissionsOutput`

- [x] T003 [P] Create `src/lib/rbac.ts` — import `OrgRole` from `@/lib/org.types` and `Permission` from `@/lib/rbac.types`; implement `ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>>` static constant per the matrix in `data-model.md` (owner gets all 13 permissions; admin gets all except `manage-billing` and `transfer-ownership`; manager gets `create-edit-schedules`, `view-schedules`, `approve-time-off`, `submit-time-off`, `view-reports`; employee gets `view-schedules`, `submit-time-off`; payroll_hr gets `view-schedules`, `submit-time-off`, `view-reports`, `access-payroll-hr`); export `canDo(role: OrgRole, permission: Permission): boolean`

- [x] T004 Create `src/server/members.ts` — add imports (`createServerFn`, `getCookie` from `@tanstack/react-start/server`, `OrgRole` from `@/lib/org.types`, `canDo` from `@/lib/rbac`, all I/O types from `@/lib/rbac.types`); implement internal `requireOrgMembership(env: Cloudflare.Env, orgSlug: string): Promise<{ userId: string; orgId: string; role: OrgRole } | null>` helper — (1) read `session` cookie, (2) query `session` table for `user_id`, (3) query `organization` by slug for `org_id`, (4) query `org_membership` for `(org_id, user_id)` where `status = 'active'`, (5) return combined context or `null`

**Checkpoint**: Foundation ready — `canDo()` is available for import; `requireOrgMembership` is ready for server functions; user story implementation can begin

---

## Phase 3: User Story 1 — Admin Manages Member Roles (Priority: P1) 🎯 MVP

**Goal**: Owners and Admins can view all org members, change any member's role (except to Owner), and remove any member except the Owner. Changes are reflected immediately.

**Independent Test**: Log in as an Admin, navigate to `/orgs/:slug/members`, change a member's role from Employee to Manager, confirm the role badge updates. Log in as an Employee and confirm navigating to `/orgs/:slug/members` redirects back to the org dashboard.

### Implementation for User Story 1

- [x] T005 [US1] Add `listMembersServerFn` to `src/server/members.ts` — `createServerFn({ method: 'GET' })` with `.inputValidator((d: { orgSlug: string }) => d)`; call `requireOrgMembership` (any role is permitted — all members can list); JOIN `org_membership + user LEFT JOIN user_profile` where `org_id = ?` and `m.status = 'active'`; return `OrgMemberView[]` ordered by `joined_at ASC`; use `up.display_name ?? u.email.split('@')[0]` for `displayName`; return `ListMembersOutput`

- [x] T006 [US1] Add `changeMemberRoleServerFn` to `src/server/members.ts` — `createServerFn({ method: 'POST' })` with `.inputValidator((d: ChangeMemberRoleInput) => d)`; call `requireOrgMembership`; check `canDo(membership.role, 'assign-roles')` → `FORBIDDEN`; reject `data.newRole === 'owner'` → `INVALID_ROLE`; fetch target membership by `memberId` in same org → `NOT_FOUND`; if target's current role is `'owner'`: `SELECT COUNT(*) FROM org_membership WHERE org_id = ? AND role = 'owner' AND status = 'active'` — if count = 1 → `LAST_OWNER`; `UPDATE org_membership SET role = ? WHERE id = ? AND org_id = ?`; return `ChangeMemberRoleOutput`

- [x] T007 [US1] Add `removeMemberServerFn` to `src/server/members.ts` — `createServerFn({ method: 'POST' })` with `.inputValidator((d: RemoveMemberInput) => d)`; call `requireOrgMembership`; check `canDo(membership.role, 'remove-members')` → `FORBIDDEN`; fetch target membership → `NOT_FOUND`; if target role is `'owner'` and caller role is not `'owner'` → `FORBIDDEN`; LAST_OWNER guard (same COUNT query as T006) → `LAST_OWNER`; `UPDATE org_membership SET status = 'inactive' WHERE id = ? AND org_id = ?`; return `RemoveMemberOutput`

- [x] T008 [US1] Create `src/routes/_protected/orgs.$orgSlug/members.tsx` — `createFileRoute('/_protected/orgs/$orgSlug/members')`; in `beforeLoad`, read `userRole` from parent route context (`from: '/_protected/orgs/$orgSlug'`), if `!canDo(userRole, 'assign-roles')` throw `redirect({ to: '/orgs/$orgSlug', params: { orgSlug: params.orgSlug } })`; add `loader` that calls `listMembersServerFn({ data: { orgSlug: params.orgSlug } })` and returns `{ members, orgSlug }`; export `Route` and a placeholder `MembersPage` component

- [x] T009 [US1] Implement `MembersPage` component in `src/routes/_protected/orgs.$orgSlug/members.tsx` — read loader data via `Route.useLoaderData()`; read `userRole` from route context; render a page heading "Members"; render a table with columns: Member (displayName + email), Role (badge with role-specific color), Joined, Actions; for each row render a role-select dropdown (all roles except `owner`) that calls `changeMemberRoleServerFn` on change — disable for own row; for each non-owner row render a "Remove" button that shows a confirmation prompt before calling `removeMemberServerFn`; show loading state during mutations; show error messages inline on failure

- [x] T010 [US1] Add "Members" navigation link to the org header in `src/routes/_protected/orgs.$orgSlug.tsx` — import `canDo` from `@/lib/rbac`; read `userRole` from route context; render `<Link to="/orgs/$orgSlug/members" params={{ orgSlug: org.slug }}>Members</Link>` in the header (not yet conditional — US2 will add role-gating)

**Checkpoint**: US1 complete — Admin can access `/orgs/:slug/members`, view all members, change roles, and remove members. Employee is redirected away. Sole-Owner guard prevents removing the last owner.

---

## Phase 4: User Story 2 — System Enforces Permissions on Protected Features (Priority: P2)

**Goal**: Navigation menus show only items the current member has permission to access. Non-admin members never see the Members link. All permission-denied paths show a clear, actionable message.

**Independent Test**: Log in as an Employee — confirm the "Members" nav link is absent from the org header. Log in as an Admin — confirm the "Members" link is present. Attempt to visit `/orgs/:slug/members` as an Employee (direct URL) — confirm redirect to org dashboard.

### Implementation for User Story 2

- [x] T011 [US2] Update `src/routes/_protected/orgs.$orgSlug.tsx` — wrap the Members `<Link>` added in T010 with `{canDo(userRole, 'assign-roles') && (...)}` so it is hidden from Manager, Employee, and Payroll HR roles; import `canDo` from `@/lib/rbac` (already imported via T010); confirm `userRole` is read from route context (already available via `beforeLoad` return value)

- [x] T012 [US2] Update `src/routes/_protected/orgs.$orgSlug/index.tsx` — import `canDo` from `@/lib/rbac`; read `userRole` from route context (`from: '/_protected/orgs/$orgSlug'`); wrap any existing admin-only action elements (e.g., the existing "Owner Controls" section) with `canDo(userRole, ...)` guards using the appropriate permission from `src/lib/rbac.types.ts` (e.g., `edit-org-settings` for settings, `manage-billing` for billing); ensure role badge already displayed continues to show correctly

**Checkpoint**: US2 complete — Navigation items are role-filtered. The Members link is invisible to members without `assign-roles`. Direct URL access to `/orgs/:slug/members` without permission still redirects (enforced by US1 T008 beforeLoad).

---

## Phase 5: User Story 3 — Member Views Their Own Role and Permissions (Priority: P3)

**Goal**: Every member can see their current role and understand what that role allows them to do within the organization.

**Independent Test**: Log in as any member, navigate to the org dashboard (`/orgs/:slug`) — confirm the member's current role is displayed in a badge and a summary of their permitted features is visible.

### Implementation for User Story 3

- [x] T013 [US3] Add `getMemberPermissionsServerFn` to `src/server/members.ts` — `createServerFn({ method: 'GET' })` with `.inputValidator((d: { orgSlug: string }) => d)`; call `requireOrgMembership` (any role); return `{ success: true, role: membership.role, permissions: [...ROLE_PERMISSIONS[membership.role]] as Permission[] }`; import `ROLE_PERMISSIONS` from `@/lib/rbac`; return `GetMemberPermissionsOutput`

- [x] T014 [US3] Update `src/routes/_protected/orgs.$orgSlug/index.tsx` — add `getMemberPermissionsServerFn` call to the route `loader` (or derive from existing `userRole` context + `ROLE_PERMISSIONS` import to avoid extra DB round-trip); add a "Your Role" card/section that displays: role name as a styled badge, and a readable list of what this role permits (map each `Permission` value to a human-readable label); place this section below the org info and above placeholder content

**Checkpoint**: US3 complete — Any member can visit the org dashboard and see their role and permissions clearly displayed.

---

## Phase 6: User Story 4 — Owner Transfers Ownership (Priority: P4)

**Goal**: The current Owner can transfer the Owner role to another member. The original Owner automatically becomes an Admin. The transfer requires explicit confirmation.

**Independent Test**: Log in as the Owner of an org, navigate to `/orgs/:slug/members`, click "Transfer Ownership" on another member, confirm the dialog, verify the selected member is now shown as Owner and the original Owner is now shown as Admin.

### Implementation for User Story 4

- [x] T015 [US4] Add `transferOwnershipServerFn` to `src/server/members.ts` — `createServerFn({ method: 'POST' })` with `.inputValidator((d: TransferOwnershipInput) => d)`; call `requireOrgMembership`; check `canDo(membership.role, 'transfer-ownership')` → `FORBIDDEN`; reject `data.newOwnerMemberId === callerMembershipId` → `SELF_TRANSFER` (query caller's membership id from `requireOrgMembership` result or separate lookup); fetch target membership → `NOT_FOUND`; run D1 `batch([UPDATE new owner to 'owner', UPDATE caller to 'admin'])` using `env.DB.batch()`; return `TransferOwnershipOutput`

- [x] T016 [US4] Add "Transfer Ownership" UI to `src/routes/_protected/orgs.$orgSlug/members.tsx` — show a "Transfer Ownership" button in the Actions column for each non-owner member row, but only when `userRole === 'owner'`; on click, show a confirmation dialog (e.g., inline confirm prompt or a simple `window.confirm` message) stating the consequences before calling `transferOwnershipServerFn`; on success, re-fetch the member list to reflect the updated roles; on `SELF_TRANSFER` or `NOT_FOUND` errors, display inline error message

**Checkpoint**: US4 complete — Owner can transfer ownership with confirmation. Org always retains exactly one Owner after the transfer.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify correctness, type safety, and UX quality across all stories.

- [x] T017 [P] Run `npm run build` from the repository root and resolve any TypeScript errors in `src/lib/rbac.ts`, `src/lib/rbac.types.ts`, `src/server/members.ts`, and all modified/created route files — target: zero type errors, zero `any` usage

- [x] T018 [P] Audit all error paths in `src/server/members.ts` for consistent, descriptive error codes matching contracts — confirm every `{ success: false; error: ... }` return uses a code defined in `src/lib/rbac.types.ts` and matches `contracts/server-functions.md`

- [x] T019 Review all inline error messages displayed in `src/routes/_protected/orgs.$orgSlug/members.tsx` to ensure they are clear and actionable (SC-003): `FORBIDDEN` → "You don't have permission to do this", `LAST_OWNER` → "Cannot remove the last owner — transfer ownership first", `SELF_TRANSFER` → "You cannot transfer ownership to yourself"

- [x] T020 Verify `canDo()` guards are applied consistently in all UI components — confirm no nav item, button, or action is rendered for a role that lacks the corresponding permission (SC-004): cross-check every permission from `ROLE_PERMISSIONS` against what's rendered in `orgs.$orgSlug.tsx` and `orgs.$orgSlug/members.tsx`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — T005/T006/T007 can be written in any order (sequential, same file); T008 depends on T005; T009 depends on T008; T010 depends on T009
- **Phase 4 (US2)**: Depends on Phase 3 (specifically T010 for the nav link)
- **Phase 5 (US3)**: Depends on Phase 2; independent of US1 and US2
- **Phase 6 (US4)**: Depends on Phase 3 (specifically T008/T009 for the members page)
- **Phase 7 (Polish)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational phase — no dependency on other stories
- **US2 (P2)**: Depends on US1 T010 (Members nav link must exist to be conditionally shown)
- **US3 (P3)**: Depends only on Foundational phase — can run in parallel with US1/US2
- **US4 (P4)**: Depends on US1 T008/T009 (Members page must exist to add Transfer Ownership UI)

### Within Each User Story

- Server functions (T005–T007) must follow T004 (requireOrgMembership)
- Route file creation (T008) must follow server functions
- UI implementation (T009–T010) builds incrementally on T008
- Each story's server function must be complete before its UI tasks

### Parallel Opportunities

- T002 and T003 (different files: `rbac.types.ts` vs `rbac.ts`) can be written in parallel
- T002/T003 and T004 (`members.ts` skeleton) can start in parallel once T001 is confirmed
- US3 server function (T013) and US3 UI (T014) can begin after T003 (foundational), independent of US1
- Polish tasks T017 and T018 can run in parallel (different concerns, same files are read-only checks)

---

## Parallel Example: Foundational Phase

```text
Parallel batch after T001:
  Task: "T002 — create src/lib/rbac.types.ts"
  Task: "T003 — create src/lib/rbac.ts"

Sequential after T002 + T003:
  Task: "T004 — create src/server/members.ts with requireOrgMembership helper"
```

## Parallel Example: US1 + US3 (after Foundational)

```text
Sequential track A (US1):
  T005 → T006 → T007 → T008 → T009 → T010

Parallel track B (US3 server fn — different file concern):
  T013 (getMemberPermissionsServerFn added to members.ts after T007)
  T014 (dashboard UI — different file from US1 members page)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T004)
3. Complete Phase 3: User Story 1 (T005–T010)
4. **STOP and VALIDATE**: Admin can manage roles at `/orgs/:slug/members`; Employee is redirected; sole-owner guard works
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → `canDo()` utility and `requireOrgMembership` available
2. US1 complete → Members management page live for Owners and Admins (MVP)
3. US2 complete → Navigation is role-filtered; no unauthorized menu items visible
4. US3 complete → All members can see their role and permissions on the dashboard
5. US4 complete → Owners can transfer ownership with confirmation

---

## Task Summary

| Phase | Tasks | Story |
|---|---|---|
| Phase 1: Setup | T001 | — |
| Phase 2: Foundational | T002–T004 | — |
| Phase 3: US1 Admin Role Management | T005–T010 | US1 (P1) |
| Phase 4: US2 Permission Enforcement | T011–T012 | US2 (P2) |
| Phase 5: US3 View My Permissions | T013–T014 | US3 (P3) |
| Phase 6: US4 Transfer Ownership | T015–T016 | US4 (P4) |
| Phase 7: Polish | T017–T020 | — |
| **Total** | **20 tasks** | |

## Notes

- No tests generated (not requested in spec)
- No new DB tables or schema migrations required
- No new npm dependencies required
- `src/routeTree.gen.ts` will auto-regenerate when `npm run dev` is run after adding the new route file (T008) — do not edit manually
