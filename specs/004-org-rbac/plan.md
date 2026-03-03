# Implementation Plan: Organization Role-Based Access Control

**Branch**: `004-org-rbac` | **Date**: 2026-03-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-org-rbac/spec.md`

---

## Summary

Implement a role-based access control (RBAC) system that enforces org-scoped permissions across the scheduler application. Five fixed roles (Owner, Admin, Manager, Employee, Payroll HR) are mapped to 13 named permissions in a static in-memory matrix. Permissions are enforced server-side on every protected server function call via a shared `requireOrgMembership` helper and `canDo()` utility. A new Members page (`/orgs/:slug/members`) allows Owners and Admins to view and manage member roles. No new DB tables are required — the existing `org_membership` table stores the role per user per org.

---

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (existing `org_membership` + `session` tables)
**Storage**: Cloudflare D1 — no schema changes required; `org_membership.role` column is the source of truth
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Full-stack web application (SSR)
**Performance Goals**: Permission check adds ≤2 indexed D1 queries per protected request (session lookup + membership lookup); both are indexed
**Constraints**: No Node.js built-in APIs; no long-lived in-memory state across Workers invocations; bundle size within Cloudflare Workers limits
**Scale/Scope**: Per-org member lists (expected tens to low hundreds of members per org)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Principle I — Component-First Architecture ✅

The Members management page will be implemented as a self-contained route component. The `canDo()` utility and `OrgMemberView` type are defined in dedicated modules. The `MemberRow` and `RoleBadge` sub-components will have explicit props; no component reaches beyond its module boundary.

### Principle II — Type Safety ✅

- `Permission` is a TypeScript union type — misspelled permission names fail at compile time.
- All server function inputs and outputs carry explicit typed unions (see `data-model.md`).
- `OrgRole` is an existing union type from `src/lib/org.types.ts`; no `any` used.
- `requireOrgMembership` returns a typed `{ userId, orgId, role }` object or `null`.

### Principle III — Server-First Data Fetching ✅

- The Members page will use a route loader to pre-load the member list via `listMembersServerFn`.
- All mutations (role change, remove, transfer ownership) use `createServerFn({ method: 'POST' })`.
- No client-side `fetch` calls to D1; all DB access is through server functions.

### Principle IV — Edge-Runtime Compatibility ✅

- All code uses Web Crypto API (already established pattern) and D1 (CF native).
- `ROLE_PERMISSIONS` is a static `Record<OrgRole, ReadonlySet<Permission>>` — no Node.js APIs.
- `Set` is available in the Workers runtime.
- No new runtime dependencies introduced.

### Principle V — Simplicity & YAGNI ✅

- `src/lib/rbac.ts` is a single small file used in both server functions and UI components (used in ≥2 places — passes the abstraction threshold).
- `requireOrgMembership` helper is used by every member management server function (≥2 callers).
- No over-engineering: no abstract permission registry, no DB-stored permissions, no custom role builder.
- No Complexity Tracking violations to document.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-org-rbac/
├── plan.md                      # This file
├── research.md                  # Phase 0 — design decisions
├── data-model.md                # Phase 1 — schema + code-level types
├── quickstart.md                # Phase 1 — how to add new permissions
├── contracts/
│   └── server-functions.md      # Phase 1 — server function contracts
├── checklists/
│   └── requirements.md          # Spec quality checklist
└── tasks.md                     # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── rbac.ts                  # NEW: Permission type, role matrix, canDo()
│   └── rbac.types.ts            # NEW: OrgMemberView + server fn I/O types
├── server/
│   └── members.ts               # NEW: listMembers, changeMemberRole, removeMember,
│                                #       transferOwnership, getMemberPermissions,
│                                #       requireOrgMembership (internal helper)
└── routes/
    └── _protected/
        └── orgs.$orgSlug/
            └── members.tsx      # NEW: /orgs/:slug/members page (P1 story)
```

**Structure Decision**: Single-project layout (existing pattern). New files follow the established `src/lib/`, `src/server/`, `src/routes/` structure. No new top-level directories.

---

## Implementation Phases

### Phase A — Core Permission Utility (`src/lib/rbac.ts` + `src/lib/rbac.types.ts`)

1. Define `Permission` union type (13 permissions from spec)
2. Define `OrgMemberView` interface
3. Define server function I/O types for all 5 member management functions
4. Implement `ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>>` static matrix
5. Export `canDo(role: OrgRole, permission: Permission): boolean`

**Dependencies**: None (pure code, no I/O)
**Parallelizable with**: Nothing (everything depends on this)

---

### Phase B — Member Management Server Functions (`src/server/members.ts`)

1. Implement `requireOrgMembership(env, orgSlug)` internal helper
   - Session cookie → `user_id` (reuse `getCookie` pattern from `org.ts`)
   - Query `organization` by slug → `org_id`
   - Query `org_membership` by `(org_id, user_id)` where `status = 'active'`
   - Return `{ userId, orgId, role }` or `null`

2. Implement `listMembersServerFn`
   - Call `requireOrgMembership` (any role permitted)
   - JOIN `org_membership + user + user_profile` for all active members
   - Return `OrgMemberView[]` ordered by `joined_at ASC`

3. Implement `changeMemberRoleServerFn`
   - `requireOrgMembership` → check `canDo(role, 'assign-roles')` → `FORBIDDEN`
   - Reject `newRole === 'owner'` → `INVALID_ROLE`
   - If target current role is `'owner'`: COUNT active owners; if = 1 → `LAST_OWNER`
   - `UPDATE org_membership SET role = ? WHERE id = ? AND org_id = ?`

4. Implement `removeMemberServerFn`
   - `requireOrgMembership` → check `canDo(role, 'remove-members')` → `FORBIDDEN`
   - Fetch target membership; if target role is `'owner'` and caller is not `'owner'` → `FORBIDDEN`
   - LAST_OWNER guard (same as above)
   - `UPDATE org_membership SET status = 'inactive' WHERE id = ? AND org_id = ?`

5. Implement `transferOwnershipServerFn`
   - `requireOrgMembership` → check `canDo(role, 'transfer-ownership')` → `FORBIDDEN`
   - Reject if `newOwnerMemberId` is caller's own membership → `SELF_TRANSFER`
   - Fetch target membership; must be active → `NOT_FOUND`
   - D1 `batch()`: UPDATE new owner to `'owner'` + UPDATE caller to `'admin'`

6. Implement `getMemberPermissionsServerFn`
   - `requireOrgMembership` (any role)
   - Return `{ role, permissions: [...ROLE_PERMISSIONS[role]] }`

**Dependencies**: Phase A complete

---

### Phase C — Members Page (`src/routes/_protected/orgs.$orgSlug/members.tsx`)

1. Create route file at `src/routes/_protected/orgs.$orgSlug/members.tsx`
   - `createFileRoute('/_protected/orgs/$orgSlug/members')`
   - `beforeLoad`: read `userRole` from parent context; if `!canDo(userRole, 'assign-roles')` → redirect to org dashboard
   - `loader`: call `listMembersServerFn({ orgSlug: params.orgSlug })`

2. Implement `MembersPage` component
   - Display table/list of members: name, email, role badge, joined date
   - Show role-change dropdown for members the caller can manage
   - Show remove button (with confirmation) for members the caller can remove
   - "Transfer Ownership" button (Owner only, confirmation dialog)
   - Handle loading/error/empty states

3. Add "Members" navigation link in org layout (`orgs.$orgSlug.tsx`) — visible to Admin+ only

**Dependencies**: Phases A and B complete

---

### Phase D — Permission Display Page (P3 — View My Permissions)

1. Add permissions summary section to org dashboard (`orgs.$orgSlug/index.tsx`)
   - Call `getMemberPermissionsServerFn` in the route loader (or reuse data from `getOrgServerFn` + `canDo`)
   - Display current role badge + list of what the role allows

**Dependencies**: Phase A complete (can be done in parallel with Phase C)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Role storage | Live D1 query per request | No session changes needed; always fresh; consistent with existing pattern |
| Permission model | Static in-memory `Set` per role | Fixed permissions, Workers-safe, O(1) lookup, compile-time type safety |
| Session invalidation | N/A — live query eliminates stale cache | `beforeLoad` already re-queries org context on every navigation |
| DB schema changes | None | `org_membership.role` already stores the necessary data |
| Ownership transfer atomicity | D1 `batch()` | Prevents zero-owner window; established pattern from `createOrgServerFn` |
| Admin peer management | Unrestricted (Q1: Option A) | Admins may change/remove other Admins; only Owner role is protected |

---

## Error Codes Reference

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | No valid session or caller is not a member of this org |
| `NOT_FOUND` | Org slug or target membership does not exist / is inactive |
| `FORBIDDEN` | Caller's role lacks the required permission |
| `INVALID_ROLE` | `newRole = 'owner'` passed to `changeMemberRole` (use transfer instead) |
| `LAST_OWNER` | Operation would leave the org with zero active Owners |
| `SELF_TRANSFER` | Owner attempted to transfer ownership to themselves |
