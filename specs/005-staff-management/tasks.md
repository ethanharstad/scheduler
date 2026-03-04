# Tasks: Staff Member Management

**Input**: Design documents from `/specs/005-staff-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/server-functions.md ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P]-marked tasks in the same phase (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup (Schema & Types)

**Purpose**: Add the three new D1 tables and establish the TypeScript type foundation. No user story work can begin until T001–T003 are complete.

- [x] T001 Add `staff_member`, `staff_invitation`, and `staff_audit_log` CREATE TABLE statements (including all indexes and CHECK constraints from data-model.md) to `src/db/schema.sql`
- [x] T002 [P] Apply updated schema to local D1 dev database: `npx wrangler d1 execute DB --local --file=src/db/schema.sql`
- [x] T003 [P] Create `src/lib/staff.types.ts` — export `StaffStatus`, `StaffAuditAction`, `StaffMemberView`, `StaffAuditEntry`, `AddStaffMemberInput`, `InviteStaffMemberInput`, `ChangeStaffRoleInput`, `RemoveStaffMemberInput`, `InvitationActionInput`, `GetInvitationInput`, `InvitationView`, `AcceptInvitationInput` (all types from data-model.md § TypeScript Types)

**Checkpoint**: Schema applied, types file compiles — foundational layer ready

---

## Phase 2: Foundational (Server Helpers)

**Purpose**: Private helper functions shared by all server functions. Must be complete before any server function can be implemented.

**⚠️ CRITICAL**: No user story server function work can begin until this phase is complete.

- [x] T004 Create `src/server/staff.ts` with three private helper functions: `generateToken()` (32-byte `crypto.getRandomValues`, base64url-encoded), `invalidateUserSessions(env, userId)` (`DELETE FROM session WHERE user_id = ?`), and `writeAuditLog(env, entry)` (INSERT into `staff_audit_log`). Import types from `@/lib/staff.types` and `@/lib/org.types`.

**Checkpoint**: Helper functions in place — server functions can now be implemented

---

## Phase 3: User Story 1 — Manage Staff Roster Without User Accounts (Priority: P1) 🎯 MVP

**Goal**: Admins can add roster-only staff (name + at least one contact field), view all staff with clear status indicators, and remove roster-only members. Members added with a matching email to an existing user are auto-linked.

**Independent Test**: Add a roster-only member (name + email), verify they appear in the staff list with "No account" status; add a member whose email matches an existing registered user, verify they appear as "Active". Remove a roster-only member, verify they disappear.

- [x] T005 [US1] Implement `listStaffServerFn` and `addStaffMemberServerFn` in `src/server/staff.ts` — `listStaffServerFn` (GET, any active member, queries staff_member JOIN user_profile where user_id IS NOT NULL, status != 'removed', returns `StaffMemberView[]`); `addStaffMemberServerFn` (POST, requires `invite-members`, validates name + at least one contact field, checks for duplicate email within org, auto-links if email matches existing user via INSERT org_membership + UPDATE staff_member.user_id + status='active', otherwise INSERT staff_member status='roster_only', writes audit log action='member_added')
- [x] T006 [US1] Create `src/routes/_protected/orgs.$orgSlug/staff.tsx` — file-based route at URL `/orgs/:slug/staff`; `loader` calls `listStaffServerFn`; renders a table of all staff members showing: name, email/phone, role badge, status badge ('No account' / 'Invite pending' / 'Active'), joined date; no permission restriction on viewing (all active org members see this page)
- [x] T007 [US1] Add "Add Staff Member" panel to `src/routes/_protected/orgs.$orgSlug/staff.tsx` — form with fields: name (required), email (optional), phone (optional), role (select, default 'employee'); client-side validation: name required, at least one of email/phone required; on submit calls `addStaffMemberServerFn`; success appends new member to list; error codes map to user-friendly inline messages (`CONTACT_REQUIRED`, `DUPLICATE_EMAIL`, `FORBIDDEN`); panel only rendered when `canDo(userRole, 'invite-members')`
- [x] T008 [P] [US1] Update `src/routes/_protected/orgs.$orgSlug.tsx` — add "Staff" nav link pointing to `/orgs/$orgSlug/staff`; visible to all active org members (no permission guard); position after existing nav links

**Checkpoint**: User Story 1 fully functional — add, view, and remove (removal UI comes in US4) roster-only members; auto-link on email match works

---

## Phase 4: User Story 2 — Invite Staff Members to Create Accounts (Priority: P2)

**Goal**: Admins can send email invitations to roster-only staff members. Invitees click the link, register (or log in if they have an account), and appear as active staff. Admins can cancel or resend pending invitations.

**Independent Test**: Send invitation to a roster-only member with email; verify status changes to 'Invite pending' and an email is sent; follow the invitation link, register a new account, verify the new user appears as Active in the staff list; cancel a pending invitation, verify the link no longer works and status reverts to 'No account'.

- [x] T009 [US2] Implement `inviteStaffMemberServerFn`, `cancelInvitationServerFn`, and `resendInvitationServerFn` in `src/server/staff.ts` — `inviteStaffMemberServerFn` (POST, requires `invite-members`, validates staff_member is roster_only and has email, generates token via `generateToken()`, inserts `staff_invitation` with 7-day expiry, updates `staff_member.status='pending'`, sends invitation email via Resend API using `RESEND_API_KEY` with subject "You've been invited to join [Org] on Scheduler" and join link `{origin}/join/{token}`, writes audit log); `cancelInvitationServerFn` (POST, requires `invite-members`, sets `staff_invitation.status='cancelled'`, sets `staff_member.status='roster_only'`, writes audit log); `resendInvitationServerFn` (POST, requires `invite-members`, atomic batch: cancel existing pending invite + insert new invite with fresh token + new expiry, sends new email, writes audit log action='invitation_resent')
- [x] T010 [US2] Implement `getInvitationByTokenServerFn` and `acceptInvitationServerFn` in `src/server/staff.ts` — `getInvitationByTokenServerFn` (GET, public/no auth, looks up `staff_invitation` by token joined with `staff_member`, `organization`, and `user_profile` of inviter, returns `InvitationView` or error `NOT_FOUND`/`EXPIRED`/`ALREADY_USED`); `acceptInvitationServerFn` (POST, public/no auth, validates token, handles three cases: (1) no existing account — validate name+password, create `user` with `verified=1`, create `org_membership`, update `staff_member` status='active' + user_id, mark invitation accepted, create session + set cookie, write audit log action='invitation_accepted'; (2) invitee logged in with matching email — insert `org_membership`, update `staff_member`, mark invitation accepted, write audit log action='member_linked'; (3) no session and existing account detected — return `{ success: false, error: 'LOGIN_REQUIRED' }` so client can show login form)
- [x] T011 [US2] Create `src/routes/join.$token.tsx` — public route (outside `_protected`) at URL `/join/:token`; loader calls `getSessionServerFn` (detect existing login) and `getInvitationByTokenServerFn` to validate token; renders one of three states: (a) error state for NOT_FOUND/EXPIRED/ALREADY_USED with user-friendly message; (b) registration form (name, password) for unauthenticated users with no account — on submit calls `acceptInvitationServerFn` then redirects to `/orgs/$orgSlug`; (c) login prompt for existing account case — on successful login re-submits token; org name and inviter name displayed prominently in all states; pre-fill email field from invitation (read-only)
- [x] T012 [P] [US2] Add invite/cancel/resend action buttons to `src/routes/_protected/orgs.$orgSlug/staff.tsx` — for roster_only members with an email: show "Send Invite" button (calls `inviteStaffMemberServerFn`); for roster_only members without email: show disabled "Invite" button with tooltip "Add an email address first"; for pending members: show "Resend Invite" and "Cancel Invite" buttons; all buttons gated by `canDo(userRole, 'invite-members')`; inline loading/error states per member row

**Checkpoint**: User Story 2 fully functional — invitation send/cancel/resend flow works; registration and account-linking via invitation link works

---

## Phase 5: User Story 3 — Assign and Change Staff Roles (Priority: P3)

**Goal**: Admins can change any staff member's role (with or without an account). For account holders, the role change takes effect immediately by invalidating their sessions. Role changes are atomic across staff_member and org_membership.

**Independent Test**: Change a member's role from 'employee' to 'manager'; verify both the staff list and (by re-loading their session) their permissions reflect the new role immediately; verify the old role is logged in the audit trail.

- [x] T013 [US3] Implement `changeStaffRoleServerFn` in `src/server/staff.ts` — POST, requires `assign-roles`; validates newRole is a valid OrgRole; prevents changing Owner role without transfer (returns `OWNER_TRANSFER_REQUIRED`); atomic `env.DB.batch()`: UPDATE `staff_member.role` + (if active member) UPDATE `org_membership.role`; if member has user_id: call `invalidateUserSessions(env, userId)`; write audit log action='role_changed' with metadata `{from: oldRole, to: newRole}`
- [x] T014 [US3] Add role change dropdown to each member row in `src/routes/_protected/orgs.$orgSlug/staff.tsx` — `<select>` element populated with all OrgRole values; rendered only when `canDo(userRole, 'assign-roles')`; owner-role members show a static badge instead of a dropdown; onChange calls `changeStaffRoleServerFn` and updates the member's role in local state on success; inline error display for `OWNER_TRANSFER_REQUIRED` and other errors; busy/loading state disables dropdown during request

**Checkpoint**: User Story 3 fully functional — role changes apply immediately, sessions invalidated, audit logged

---

## Phase 6: User Story 4 — Remove Staff Members (Priority: P4)

**Goal**: Admins can remove any staff member (roster-only, pending, or active). Removal immediately revokes access for account holders, cancels pending invitations, and logs the action. A confirmation step is required.

**Independent Test**: Remove an account-holding member; verify they no longer appear in the staff list, their org_membership is inactive, and their sessions are invalidated (they cannot navigate to org routes); remove a roster-only member; verify the record is gone.

- [x] T015 [US4] Implement `removeStaffMemberServerFn` in `src/server/staff.ts` — POST, requires `remove-members`; prevents removing the last active Owner (returns `LAST_OWNER`); atomic `env.DB.batch()`: set `staff_member.status='removed'`; if active member: set `org_membership.status='inactive'`; if pending invitation: set `staff_invitation.status='cancelled'`; if member has user_id: call `invalidateUserSessions(env, userId)`; write audit log action='member_removed'
- [x] T016 [US4] Add remove button with inline confirmation to `src/routes/_protected/orgs.$orgSlug/staff.tsx` — "Remove" button per member row rendered only when `canDo(userRole, 'remove-members')`; clicking shows inline confirmation ("Are you sure? This will revoke their access immediately.") with Confirm/Cancel; confirm calls `removeStaffMemberServerFn` and removes member from local list on success; LAST_OWNER error shows explanatory message; busy state disables button during request; owner-role members that cannot be removed show a tooltip explaining transfer is required first

**Checkpoint**: All 4 user stories fully functional — complete staff management lifecycle works end to end

---

## Phase 7: Audit Log View

**Purpose**: Surface the staff management history to admins and owners. Cross-cutting — depends on audit log entries being written by all previous phases.

- [x] T017 Implement `getStaffAuditLogServerFn` in `src/server/staff.ts` — GET, requires `assign-roles`; queries `staff_audit_log` WHERE org_id = ? ORDER BY created_at DESC; joins `staff_member` (for member name, nullable) and `user`/`user_profile` (for performer name, nullable); accepts optional `limit` (default 50, max 200) and `offset` query params; returns `{ success: true; entries: StaffAuditEntry[]; total: number }`
- [x] T018 Create `src/routes/_protected/orgs.$orgSlug/staff.audit.tsx` — route at URL `/orgs/:slug/staff/audit`; `beforeLoad` redirects with `throw redirect(...)` if `!canDo(userRole, 'assign-roles')`; `loader` calls `getStaffAuditLogServerFn`; renders reverse-chronological list of audit entries: action label, member name (or "Deleted member" if null), performed-by name, human-readable relative timestamp; action badges color-coded by type (add/remove/invite/role-change); pagination controls if total > 50; link from staff page to audit log visible to admins/owners

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, production deployment, and any final cleanup.

- [x] T019 Run the full quickstart.md testing checklist end-to-end in the local dev environment — verify all 11 checklist items pass; fix any bugs found before moving to production
- [ ] T020 [P] Apply schema migration to remote (production) D1: `npx wrangler d1 execute DB --remote --file=src/db/schema.sql` — confirm all three new tables are created in production
- [x] T021 [P] Verify `npm run build` passes with no TypeScript errors — resolve any `verbatimModuleSyntax` import errors or unused local warnings before deploying
- [ ] T022 Run `npm run deploy` to deploy to Cloudflare Workers — verify the staff management pages load in production and invitation emails are received

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately; T002 and T003 are [P] with each other
- **Phase 2 (Foundational)**: Depends on Phase 1 (needs types from T003) — **BLOCKS all user story phases**
- **Phase 3 (US1)**: Depends on Phase 2 — T005 → T006 → T007; T008 [P] with T005/T006/T007
- **Phase 4 (US2)**: Depends on Phase 3 (staff list must exist to add invite buttons) — T009 → T010; T011 [P] with T012
- **Phase 5 (US3)**: Depends on Phase 3 (role UI added to existing staff list) — T013 → T014
- **Phase 6 (US4)**: Depends on Phase 3 — T015 → T016
- **Phase 7 (Audit Log)**: Depends on Phases 3–6 (audit entries must be written by all server functions) — T017 → T018
- **Phase 8 (Polish)**: Depends on all prior phases — T020, T021 [P] with each other; T022 depends on T021

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|-------|-----------|---------------------|
| US1 (P1) | Phase 2 complete | — (first story) |
| US2 (P2) | US1 complete (invite buttons added to staff.tsx) | US3, US4 server fns (different files) |
| US3 (P3) | Phase 2 + US1 staff.tsx exists | US2 server fns, US4 server fns |
| US4 (P4) | Phase 2 + US1 staff.tsx exists | US2 server fns, US3 server fns |

### Within Each User Story

- Server function tasks must complete before corresponding UI tasks (routes import server functions)
- Within Phase 4: T011 (join.$token.tsx) and T012 (staff.tsx updates) can be [P] — different files

---

## Parallel Execution Examples

### Phase 1

```
Parallel:
  Agent A: T001 — Add tables to schema.sql, then T002 — apply schema locally
  Agent B: T003 — Create staff.types.ts
```

### Phase 3 (US1) — Mostly Sequential

```
Sequential per agent:
  T005 → T006 → T007

Parallel once T005 is done:
  Agent A: T006 (route skeleton + loader)
  Agent B: T008 (nav link in orgSlug.tsx)
```

### Phases 4–6 (US2/US3/US4) — Server Functions Can Partially Parallel

```
After Phase 3 complete:
  Agent A: T009 → T010 → T011 (invite server fns + join route)
  Agent B: T012 (invite UI on staff.tsx, once T009 done)
  Agent C: T013 → T014 (role change server fn + UI)
  Agent D: T015 → T016 (remove server fn + UI)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004)
3. Complete Phase 3: User Story 1 (T005–T008)
4. **STOP and VALIDATE**: Can add roster-only staff, view list, auto-link existing users
5. Demo/deploy the MVP roster management

### Incremental Delivery

1. **MVP**: Phase 1 + 2 + US1 → Roster management without invitations
2. **+Invitations**: US2 → Full invitation flow (send, accept, cancel, resend)
3. **+Role Management**: US3 → Role change with immediate session invalidation
4. **+Removal**: US4 → Remove members with session invalidation
5. **+Audit Trail**: Phase 7 → Full audit log view

### Recommended Single-Agent Order

T001 → T002 (parallel with T003) → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022

---

## Notes

- [P] tasks = different files with no dependency on each other — safe to run with parallel agents
- [Story] label maps every implementation task to a specific user story for traceability
- Each user story phase is independently testable without implementing later stories
- `src/routeTree.gen.ts` regenerates automatically on `npm run dev` — never edit manually
- All server functions must use `ctx.context as unknown as Cloudflare.Env` for D1/Resend access (Constitution Principle IV)
- No `any` types; use `import type { X }` for type-only imports (`verbatimModuleSyntax: true`)
- Audit log writes are embedded within each server function's transaction (not a separate task per story — already included in T005, T009, T013, T015, T017)
