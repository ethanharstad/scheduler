# Tasks: Organization Creation

**Input**: Design documents from `specs/003-create-org/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/server-functions.md ✅

**Organization**: Tasks grouped by user story — each story is independently implementable and testable.
**Tests**: Not requested in spec — no test tasks generated.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies between the parallel tasks)
- **[Story]**: User story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Extend the D1 schema with the two new tables required by this feature.

- [x] T001 Update `src/db/schema.sql` — append `organization` table (fields: `id TEXT PK`, `slug TEXT UNIQUE`, `name TEXT`, `type TEXT`, `plan TEXT DEFAULT 'free'`, `status TEXT DEFAULT 'active'`, `created_at TEXT`) and `org_membership` table (fields: `id TEXT PK`, `org_id TEXT REFERENCES organization(id) ON DELETE CASCADE`, `user_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `role TEXT`, `status TEXT DEFAULT 'active'`, `joined_at TEXT`) with all indexes from `data-model.md`

**Checkpoint**: Schema ready — run `wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql` to verify both tables and indexes are created without error.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared TypeScript types required by all server functions and routes in this feature.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Create `src/lib/org.types.ts` — export `OrgRole = 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'`, `OrgStatus = 'active' | 'inactive'`; D1 row interfaces `Organization` and `OrgMembership`; client-facing view interfaces `OrgView` (id, slug, name, plan, createdAt) and `OrgMembershipView` (orgId, orgSlug, orgName, role); `CreateOrgInput` (name, slug) — full field shapes from `contracts/server-functions.md`

**Checkpoint**: Foundation ready — `src/lib/org.types.ts` compiles cleanly under `tsc --noEmit`.

---

## Phase 3: User Story 1 — Create Organization (Priority: P1) 🎯 MVP

**Goal**: An authenticated user fills out the org creation form, the system creates the org and assigns the Owner role, and the user lands in the new org workspace.

**Independent Test**: Log in → navigate to `/create-org` → submit a valid name, slug, and type → verify redirect to `/orgs/[slug]` and that the slug appears in the URL. Confirm D1 row exists in both `organization` and `org_membership` tables with `role = 'owner'`.

- [x] T003 [US1] Implement `createOrgServerFn` in `src/server/org.ts` — `method: 'POST'`, `inputValidator((d: CreateOrgInput) => d)`, handler: (1) read session via `getCookie('session')` and validate against `session` table; (2) trim name and validate 2–100 chars; (3) validate slug against `^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$` and max 50 chars; (4) `SELECT COUNT(*) as count FROM org_membership WHERE user_id = ?` — return `{ success: false, error: 'ORG_LIMIT_REACHED' }` if count ≥ 10; (5) `env.DB.batch([INSERT organization, INSERT org_membership(role='owner')])` with `globalThis.crypto.randomUUID()` IDs and `new Date().toISOString()` timestamps; (6) catch D1 UNIQUE constraint error on slug → return `{ success: false, error: 'SLUG_TAKEN', field: 'slug' }`; (7) return `{ success: true, orgSlug: slug }` — full output type from `contracts/server-functions.md`

- [x] T004 [US1] Implement `listUserOrgsServerFn` in `src/server/org.ts` — `method: 'GET'`, no inputValidator, handler: (1) validate session cookie; return `{ success: false, error: 'UNAUTHORIZED' }` if no session; (2) `SELECT o.id, o.slug, o.name, o.type, m.role FROM organization o JOIN org_membership m ON o.id = m.org_id WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active' ORDER BY m.joined_at ASC`; (3) return `{ success: true, orgs: OrgMembershipView[], atLimit: orgs.length >= 10 }` — full output type from `contracts/server-functions.md`

- [x] T005 [US1] Create `src/routes/_protected/create-org.tsx` — `createFileRoute('/_protected/create-org')({ loader, component })`; loader: call `listUserOrgsServerFn()`, if `!result.success` redirect to `/login`, if `result.atLimit` redirect to `/home` (org limit reached — user cannot create more); component `CreateOrgPage`: controlled form with two fields: (a) `name` text input (label "Organization Name", required, 2–100 chars), (b) `slug` text input (label "URL Slug", required, 2–50 chars lowercase) that auto-suggests by transforming `name` on change: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)` — user may override; submit handler calls `createOrgServerFn({ data: { name, slug } })`, maps errors to inline field messages (`SLUG_TAKEN` → "This slug is already taken", `INVALID_INPUT` → field-specific message, `ORG_LIMIT_REACHED` → page-level banner), on `success: true` calls `navigate({ to: '/orgs/$orgSlug', params: { orgSlug: result.orgSlug } })`; style consistent with existing auth forms (dark bg `slate-900`, input `slate-800`, labels `gray-300`, primary button `blue-600 hover:blue-700`)

**Checkpoint**: US1 independently testable — full creation flow from `/create-org` to `/orgs/[slug]` works end-to-end.

---

## Phase 4: User Story 2 — Org-Scoped Workspace (Priority: P2)

**Goal**: After creation, the user is in an org workspace where the current org is always visible. All data accessed within the workspace is scoped to that org. Users with multiple orgs can identify which org they are in.

**Independent Test**: Create two organizations. Navigate to `/orgs/[slug-a]` — verify org A's name appears in the header. Navigate to `/orgs/[slug-b]` — verify org B's name appears and org A's data is not shown. Directly navigating to `/orgs/nonexistent-slug` should redirect to `/home`.

- [x] T006 [US2] Implement `getOrgServerFn` in `src/server/org.ts` — `method: 'GET'`, `inputValidator((d: { slug: string }) => d)`, handler: (1) validate session; return `{ success: false, error: 'UNAUTHORIZED' }` if no session; (2) `SELECT * FROM organization WHERE slug = ? AND status = 'active'` — return `{ success: false, error: 'NOT_FOUND' }` if missing; (3) `SELECT role FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'` — return `{ success: false, error: 'UNAUTHORIZED' }` if not a member; (4) return `{ success: true, org: OrgView, userRole: OrgRole }` mapping snake_case D1 columns to camelCase view fields — full output type from `contracts/server-functions.md`

- [x] T007 [US2] Create `src/routes/_protected/orgs.$orgSlug.tsx` — `createFileRoute('/_protected/orgs/$orgSlug')({ beforeLoad, component })`; beforeLoad: call `getOrgServerFn({ data: { slug: params.orgSlug } })`, if `!result.success` throw `redirect({ to: '/home' })`, return `{ org: result.org, userRole: result.userRole }` as route context; component `OrgLayout`: renders outer shell with a workspace header bar showing the org name and type badge (e.g. "Springfield Fire Dept · Fire"), a "← All Organizations" link to `/home`, plus `<Outlet />`; the org name must be visible on every page within the workspace — this satisfies FR-011

- [x] T008 [US2] Create `src/routes/_protected/orgs.$orgSlug/index.tsx` — `createFileRoute('/_protected/orgs/$orgSlug/')({ component })`; component `OrgDashboard`: reads `{ org }` from `useRouteContext({ from: '/_protected/orgs/$orgSlug' })`; renders a dashboard placeholder showing org name and creation date formatted as a locale date string; includes a muted "More features coming soon" placeholder section

**Checkpoint**: US2 independently testable — workspace header shows correct org per URL, wrong slug redirects, two-org isolation verified.

---

## Phase 5: User Story 3 — Owner Role Access (Priority: P3)

**Goal**: The creating user immediately holds the Owner role with full administrative access — no additional steps required. The role is visible and owner-only sections are gated.

**Independent Test**: Create an org → land in workspace → verify "Owner" role badge is visible on the dashboard → verify the "Organization Settings" section is visible. Confirm there are no additional prompts or loading states before the Owner content appears.

- [x] T009 [US3] Update `src/routes/_protected/orgs.$orgSlug/index.tsx` — read `userRole` from `useRouteContext({ from: '/_protected/orgs/$orgSlug' })`; add a "Your Role" badge below the org name (e.g. pill-style: `owner` → blue "Owner", `admin` → slate "Admin", etc.); add a conditionally rendered "Organization Settings" card section (`userRole === 'owner'` only) with a heading "Owner Controls", body text "Manage your organization's settings, members, and billing", and a muted "Coming soon" label — this satisfies US3 acceptance scenario 1 (owner sees full access immediately) and scenario 2 (non-owner would not see this section)

**Checkpoint**: US3 independently testable — freshly created org shows "Owner" badge and "Organization Settings" section with zero additional steps.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Entry point discoverability, multi-org navigation, and end-to-end smoke test.

- [x] T010 [P] Update `src/routes/_protected.tsx` — in `ProtectedLayout`, call `listUserOrgsServerFn()` in a `useEffect`-free way: add a `loader` to the `_protected` route that fetches the org list, then in the header render: if the user belongs to at least one org, show an "Organizations" `<Link to="/home">` in the top nav; if `!atLimit`, also show a "New Organization" `<Link to="/create-org">` button — this ensures `create-org` is discoverable without requiring the user to know the URL

- [x] T011 [P] Update `src/routes/_protected/orgs.$orgSlug.tsx` — in the workspace header, replace the plain "← All Organizations" link with a full org-switcher row: show the current org name with a small down-chevron icon (Lucide `ChevronDown`); clicking it navigates to `/home` (since the full org list lives there for now); this satisfies the US2 requirement that users with multiple orgs can always identify and switch their current org

- [x] T012 Apply schema migration, run dev server, and validate the full smoke test from `quickstart.md` — confirm: (1) `wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql` succeeds, (2) `npm run dev` starts without type errors, (3) login → `/create-org` → submit valid form → redirect to `/orgs/[slug]` → org name visible in header → "Owner" badge visible on dashboard, (4) `npm run build` passes with no TypeScript errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — no dependency on US2/US3
- **US2 (Phase 4)**: Depends on Phase 2 — no dependency on US1 (getOrgServerFn is independent of createOrgServerFn)
- **US3 (Phase 5)**: Depends on Phase 4 (reads userRole from orgs.$orgSlug route context)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — independently testable without US2/US3
- **US2 (P2)**: Can start after Foundational — independently testable without US1 (access the workspace directly via URL)
- **US3 (P3)**: Depends on US2 (extends `orgs.$orgSlug/index.tsx`) — cannot start until T008 is done

### Within Each User Story

- T003 before T004 (same file `src/server/org.ts` — write sequentially)
- T004 before T005 (create-org loader calls `listUserOrgsServerFn`)
- T003 before T005 (create-org form calls `createOrgServerFn`)
- T006 before T007 (workspace layout calls `getOrgServerFn`)
- T007 before T008 (dashboard reads route context from layout)
- T008 before T009 (US3 extends the dashboard)

### Parallel Opportunities

- After Phase 2 completes: US1 (T003→T004→T005) and US2 (T006→T007→T008) can start in parallel
- T010 and T011 within Phase 6 touch different files and can run in parallel

---

## Parallel Example: US1 + US2 After Foundation

```text
# After T002 completes, two streams can run in parallel:

Stream A (US1):
  T003 → T004 → T005
  (createOrgServerFn → listUserOrgsServerFn → create-org.tsx)

Stream B (US2):
  T006 → T007 → T008
  (getOrgServerFn → orgs.$orgSlug layout → orgs.$orgSlug/index.tsx)

Then sequentially:
  T009 (US3: extends index.tsx from T008)
  T010 [P] + T011 [P] (Polish: different files)
  T012 (Smoke test)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002)
3. Complete Phase 3: US1 (T003 → T004 → T005)
4. **STOP and VALIDATE**: Navigate to `/create-org`, create an org, verify redirect — independently testable without the workspace layout
5. Continue to US2 if validated

### Incremental Delivery

1. T001 + T002 → Schema + types ready
2. T003 → T004 → T005 → Org creation works (MVP)
3. T006 → T007 → T008 → Workspace accessible and data-scoped
4. T009 → Owner role visible and gated
5. T010 → T011 → T012 → Entry point and polish complete

### Task Count Summary

| Phase | Tasks | User Story |
|---|---|---|
| Phase 1: Setup | 1 | — |
| Phase 2: Foundational | 1 | — |
| Phase 3 | 3 | US1 (P1) |
| Phase 4 | 3 | US2 (P2) |
| Phase 5 | 1 | US3 (P3) |
| Phase 6: Polish | 3 | — |
| **Total** | **12** | |

---

## Notes

- [P] tasks = different files, no mutual dependencies — safe to assign to separate agents/developers
- [Story] label maps each task to a specific user story for traceability
- No test tasks generated (not requested in spec)
- `src/routeTree.gen.ts` is auto-regenerated by `npm run dev` / `npm run build` — never edit manually
- After adding any route file, run `npm run dev` once to regenerate `routeTree.gen.ts` before type-checking
- All three server functions live in `src/server/org.ts` — write T003, T004, T006 sequentially in that file
