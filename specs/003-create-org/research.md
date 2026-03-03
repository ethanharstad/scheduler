# Research: Organization Creation

**Branch**: `003-create-org` | **Date**: 2026-03-02

---

## Decision 1: Slug Format & Uniqueness

**Decision**: Slugs are 2–50 characters, lowercase alphanumeric plus hyphens, no leading/trailing hyphens. Enforced by a `UNIQUE` index on `organization.slug` in D1.

**Rationale**: This is the standard format used by GitHub orgs, Slack workspaces, and Linear teams — familiar to users. The DB constraint provides the authoritative uniqueness check and handles concurrent creation races without application-level locking. If two users simultaneously submit identical slugs, the second INSERT fails with a D1 `UNIQUE constraint failed` error, which the server function catches and returns as `SLUG_TAKEN`.

**Alternatives considered**:
- Server-side SELECT-then-INSERT uniqueness check: rejected — race condition window between check and insert.
- UUID-only URLs (no slug): rejected — per spec/clarification Q1 decision to use slug-based URLs.
- Allowing uppercase: rejected — URLs are case-sensitive; lowercase-only prevents duplicate confusion.

**Slug suggestion logic**: The `CreateOrgForm` derives a suggested slug from the org name client-side: lowercase, spaces → hyphens, non-alphanumeric characters stripped. The user can edit the suggestion before submitting.

---

## Decision 2: Route Structure for Org Workspace

**Decision**: Use TanStack Router's layout + directory pattern:
- `src/routes/_protected/orgs.$orgSlug.tsx` — layout route at URL `/orgs/$orgSlug`, contains the org header and `<Outlet />`
- `src/routes/_protected/orgs.$orgSlug/index.tsx` — index (dashboard) at URL `/orgs/$orgSlug`

**Rationale**: This mirrors the existing `_protected.tsx` + `_protected/` pattern already in the codebase. The layout file's `beforeLoad` loads the org and verifies the current user is a member, protecting all org-scoped routes with a single guard. Future routes (departments, staff, schedule) are added as siblings inside `orgs.$orgSlug/` without duplicating the auth check.

**Alternatives considered**:
- Session-scoped workspace (no org in URL): rejected — per spec/clarification Q1 decision.
- ID-based URLs (`/orgs/$orgId`): rejected — per spec/clarification Q1 decision.
- Flat route per org page (no layout): rejected — would duplicate the membership guard in every route.

---

## Decision 3: Atomic Org Creation (Two-Table Batch)

**Decision**: Use `env.DB.batch([...])` to INSERT the `organization` row and the `org_membership` row in a single atomic D1 batch operation.

**Rationale**: If the organization insert succeeds but the membership insert fails, the user would have an org with no owner — an orphaned, unmanageable tenant. D1 batch executes both statements atomically, preventing this inconsistency. This is the same pattern used in `verifyEmailServerFn` (001-user-auth).

**Alternatives considered**:
- Two separate awaited INSERTs: rejected — not atomic; partial failure possible.
- Separate "create org" and "join org as owner" server functions: rejected — adds unnecessary round-trips and complexity for what is always a single coordinated action.

---

## Decision 4: Org Creation Limit Enforcement

**Decision**: Before inserting, query `SELECT COUNT(*) as count FROM org_membership WHERE user_id = ?`. If `count >= 10`, return `{ success: false, error: 'ORG_LIMIT_REACHED' }`. The form also checks the user's org count in the workspace loader and disables the "Create Organization" entry point when the limit is reached.

**Rationale**: The soft limit (max 10 orgs per user, per spec clarification Q2) must be enforced on the server — client-side gating is bypassable. Counting memberships (not owner-only) is simpler and future-proof; if a user reaches 10 memberships through invitations they have fewer creation slots, which is a safe tradeoff.

**Alternatives considered**:
- Count only owned orgs: considered, but counting all memberships is a more conservative, simpler rule that also prevents the overall membership table from growing unboundedly.
- Enforcing via a separate quota table: rejected — premature complexity; a simple COUNT is sufficient.

---

## Decision 5: Org Workspace Navigation Context

**Decision**: The `orgs.$orgSlug.tsx` layout's `beforeLoad` hook returns `{ org: OrgView, userRole: OrgRole }` as route context. Child routes access `{ org, userRole }` via `useRouteContext({ from: '/_protected/orgs/$orgSlug' })`.

**Rationale**: This is the exact same pattern as `_protected.tsx` returning `{ session }` for use in `home.tsx` and `profile.tsx`. It keeps all org-loading logic in one place and gives child routes typed access to the current org without additional server calls.

**Alternatives considered**:
- Re-fetching org in each child route: rejected — redundant D1 queries, violates Principle III (loader pre-hydration).
- React Context: rejected — TanStack Router route context achieves the same thing with full SSR support and no extra abstraction.

---

## Decision 6: Redirect Target After Creation

**Decision**: On successful `createOrgServerFn`, return `{ success: true, orgSlug: string }`. The client calls `router.navigate({ to: '/orgs/$orgSlug', params: { orgSlug } })`.

**Rationale**: Server functions cannot set navigation headers in this TanStack Start version (redirect must be thrown from a route loader, not a POST handler). The client-side navigate after a successful POST matches the existing `loginServerFn` → `navigate()` pattern in `_protected.tsx`.

**Alternatives considered**:
- `throw redirect(...)` inside the server function: rejected — redirect thrown inside `createServerFn` POST handlers does not propagate correctly in TanStack Start v1; confirmed by existing auth pattern.
- Returning the full org URL: rejected — the client already has access to `orgSlug` and can construct the route; unnecessary coupling.
