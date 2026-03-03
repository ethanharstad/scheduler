# Research: Organization RBAC

**Branch**: `004-org-rbac` | **Date**: 2026-03-03

---

## Decision 1: Role Storage & Permission Check Mechanism

**Question**: Should the member's role be cached in the session record or queried live from `org_membership` on each request?

**Decision**: Live query from `org_membership` on each protected server function call.

**Rationale**:
- The current `session` table stores only `user_id` — no `role` or `org_id` column exists. Adding org-scoped role to the session would require either (a) storing multiple org contexts per session record, or (b) limiting the session to one active org — both are non-trivial changes with no benefit over a live query.
- A user holds different roles in different organizations. A session-cached role would need to be keyed by org, making it equivalent to a live membership query anyway.
- A single indexed D1 query (`org_membership` is indexed on `user_id` and `org_id`) adds negligible latency on Cloudflare Workers.
- The existing `getOrgServerFn` already does a live two-step lookup (org slug → membership row) on every navigation. All mutation server functions follow the same pattern.
- FR-012 ("role takes effect on next request") is naturally satisfied: the DB is always the source of truth; there is no stale cache to invalidate.

**Org-Scoped Invalidation (Clarification Q5)**: Because the role is queried live per request, there is nothing to invalidate. Role changes are effective immediately for any subsequent request. No session table changes are required.

**Alternatives Considered**:
- Session-cached role with invalidation: Rejected — complex multi-org state, no performance benefit on edge runtime.
- `session_org_context` join table: Rejected — over-engineered; duplicates what `org_membership` already provides.

---

## Decision 2: Permission Matrix Representation

**Question**: How should the mapping of roles to permissions be implemented in code?

**Decision**: Static in-memory lookup in `src/lib/rbac.ts` — a `Record<OrgRole, ReadonlySet<Permission>>` constant, with a `canDo(role, permission)` utility function.

**Rationale**:
- Permissions are system-defined and fixed for this release (confirmed in spec). No DB storage is needed.
- A static `Set` lookup is O(1) and Workers-compatible (no Node.js APIs, minimal bundle size).
- Centralizing the matrix in a single file makes it easy to extend in future releases.
- TypeScript union types for `Permission` give compile-time safety — a misspelled permission name fails at build time.

**Alternatives Considered**:
- DB-stored permission table: Rejected — out of scope for this release; adds unnecessary complexity for a fixed set.
- Switch/if-else per function: Rejected — duplicates logic across files; error-prone when roles change.

---

## Decision 3: Permission Enforcement Pattern in Server Functions

**Question**: What is the idiomatic pattern for enforcing role-based permissions in `createServerFn` handlers?

**Decision**: Create a reusable `requireOrgRole(env, orgSlug)` helper (in `src/server/members.ts`) that: (1) reads the session token from the cookie, (2) resolves `userId`, (3) looks up `org_membership` for the given org slug, and (4) returns `{ userId, orgId, role }` or throws/returns an error. Every mutation handler calls this as its first step before any business logic.

**Pattern**:
```
1. requireOrgRole(env, orgSlug) → { userId, orgId, role }
2. canDo(role, 'required-permission') || return FORBIDDEN
3. Business logic (sole-owner guard, DB mutation)
4. Return typed result
```

**Rationale**:
- Consistent with the `getAuthenticatedUserId` helper pattern already used in `org.ts` and `profile.ts`.
- Combining session validation + membership lookup in one helper reduces boilerplate and ensures the pattern is never accidentally skipped.
- Server-level enforcement (FR-011) is guaranteed because UI cannot bypass server functions.

**Alternatives Considered**:
- Middleware-level enforcement: TanStack Start v1 does not support global server function middleware. Rejected as not available.
- `beforeLoad` only: Rejected — `beforeLoad` guards navigation, not direct server function calls (e.g., via form actions). Both layers must enforce.

---

## Decision 4: Sole-Owner Guard Implementation

**Question**: How should the system prevent removing or demoting the last Owner?

**Decision**: Before executing any role change or removal that targets a user with `role = 'owner'`, query `SELECT COUNT(*) FROM org_membership WHERE org_id = ? AND role = 'owner' AND status = 'active'`. If count = 1 and the target is that owner, reject with `LAST_OWNER` error.

**Rationale**:
- Single COUNT query; returns immediately. The constraint check is cheap and deterministic.
- Covers both `changeMemberRole` (demoting the last owner) and `removeMember` (removing the last owner).
- Ownership transfer (`transferOwnership`) atomically assigns the new owner before demoting the old one, so the count never hits zero.

---

## Decision 5: Ownership Transfer Atomicity

**Question**: How should the ownership transfer be made atomic?

**Decision**: Use a D1 `batch()` call with two statements: (1) `UPDATE org_membership SET role = 'owner' WHERE ...` for the new owner, (2) `UPDATE org_membership SET role = 'admin' WHERE ...` for the previous owner. Both execute in the same batch. If either fails, neither is committed.

**Rationale**:
- D1 `batch()` is the established atomic operation pattern in this codebase (used in `createOrgServerFn` for org + membership creation).
- Prevents a window where the org has zero owners between the two updates.

---

## Decision 6: New Source Files

| File | Purpose |
|---|---|
| `src/lib/rbac.ts` | Permission type, role-permission matrix, `canDo()` |
| `src/server/members.ts` | All member management server functions |
| `src/routes/_protected/orgs.$orgSlug/members.tsx` | Members management page (P1) |

No new DB tables or schema migrations are required for this feature.
