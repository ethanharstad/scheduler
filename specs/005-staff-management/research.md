# Research: Staff Member Management (005-staff-management)

**Branch**: `005-staff-management` | **Date**: 2026-03-03

## Decision Log

### D-001: Staff Roster vs. Extending org_membership

**Decision**: Introduce a new `staff_member` table as the primary roster entity rather than making `user_id` nullable in `org_membership`.

**Rationale**: `org_membership` is used throughout the codebase as the auth/access-control layer (e.g., `requireOrgMembership()` joins on it, all permission checks use it). Making `user_id` nullable there would require defensive null-checks across every existing query. A separate `staff_member` table keeps roster concerns isolated and lets `org_membership` remain the clean authorization source of truth.

**Alternatives considered**:
- Nullable `user_id` in `org_membership` — rejected: breaks existing query assumptions, adds defensive code in 7+ existing functions.
- Single-table with `account_status` column — rejected: same problems as above.

### D-002: Invitation Token Generation

**Decision**: Use the Web Crypto API (`crypto.getRandomValues`) to generate 32-byte URL-safe base64 tokens.

**Rationale**: Cloudflare Workers does not support Node's `crypto` module. The Web Crypto API (`globalThis.crypto`) is available in the Workers runtime and is sufficient for generating cryptographically secure random tokens.

**Alternatives considered**:
- `uuid()` — rejected: UUID v4 has ~122 bits of entropy and is typically readable/guessable format. 32 bytes (256 bits) of random is more appropriate for a security token.
- Third-party library — rejected: unnecessary bundle size; Web Crypto is built-in.

### D-003: Session Invalidation on Removal / Role Change

**Decision**: On removal or role change of an account-holding staff member, execute `DELETE FROM session WHERE user_id = ?` to invalidate all their sessions immediately.

**Rationale**: The `session` table has an index on `user_id` (confirmed in schema). A targeted DELETE by `user_id` is fast. This matches the pattern already used in `auth.ts` for password change (delete all sessions except the current one). For removal/role-change, deleting ALL sessions (including the current one for the affected user) is correct because the admin performing the action is a different user.

**Alternatives considered**:
- Setting a `revoked_at` column on sessions — rejected: over-engineering; the existing pattern uses hard deletes.
- Relying on session expiry (24h) — rejected: too long; spec requires immediate invalidation.

### D-004: Invitation Registration Route

**Decision**: Add a new public route `src/routes/join.$token.tsx` outside the `_protected` layout.

**Rationale**: Invitation links must be accessible without authentication. TanStack Router's file-based routing places routes outside `_protected/` as public by default. This mirrors the existing pattern for `verify-email.$token.tsx` and `reset-password.$token.tsx`.

**Behavior by account state**:
- No account with invitation email → show registration form; on submit, create user + org_membership + link staff_member.
- Existing account with matching email, not logged in → show login prompt; on successful login, link org_membership + staff_member automatically.
- Existing account with matching email, already logged in → auto-link and redirect to org workspace.

**Alternatives considered**:
- Reusing the existing `/register` route with query params — rejected: too much coupling to existing auth flow; invitation needs its own context (pre-filled email, locked to org).

### D-005: Audit Log Storage

**Decision**: Add a `staff_audit_log` table in D1. Metadata (e.g., old/new role) stored as JSON in a TEXT column.

**Rationale**: D1 (SQLite) supports TEXT columns for JSON. No schema migration complexity. Retention is indefinite (no TTL mechanism needed). Reads are infrequent (admin-only view) so query performance on a TEXT column is acceptable.

**Alternatives considered**:
- External logging service — rejected: adds an integration dependency; D1 is already in use.
- Separate `metadata_*` columns — rejected: the set of metadata fields varies by action type; a flexible JSON column is simpler.

### D-006: Duplicate Email Prevention

**Decision**: Add a UNIQUE index on `(org_id, email)` in `staff_member` (partial: WHERE email IS NOT NULL). Add a CHECK constraint `(email IS NOT NULL OR phone IS NOT NULL)` to enforce the "at least one contact field" requirement.

**Rationale**: SQLite partial indexes prevent email collisions within an org while allowing multiple members with NULL email. The CHECK constraint is enforced at the DB level, providing a safety net beyond application-level validation.

**Alternatives considered**:
- Application-level uniqueness check only — rejected: race conditions possible; DB constraints are the correct enforcement layer.

### D-007: Staff Member ↔ org_membership Relationship

**Decision**: When a staff member's account becomes active (invitation accepted), INSERT a new row into `org_membership` AND update `staff_member.user_id` and `staff_member.status`. The `org_membership` record is the source of truth for auth; `staff_member` is the source of truth for the roster display.

**Rationale**: `requireOrgMembership()` and all RBAC checks use `org_membership`. Keeping it as the auth source of truth requires no changes to existing server functions. The `staff_member` table serves as the extended roster view (including roster-only and pending members).

**Role sync**: `staff_member.role` and `org_membership.role` should always stay in sync for active members. Role changes update both tables atomically.

## Existing Codebase Patterns (Confirmed)

| Pattern | Location | Notes |
|---------|----------|-------|
| Server fn env access | `src/server/members.ts:L1` | `ctx.context as unknown as Cloudflare.Env` |
| requireOrgMembership | `src/server/members.ts` | Returns `{ userId, membershipId, orgId, role }` or null |
| Session deletion | `src/lib/auth.ts` | `DELETE FROM session WHERE user_id = ? AND session_token != ?` |
| Soft delete members | `src/server/members.ts` | `UPDATE org_membership SET status = 'inactive'` |
| Atomic D1 batch | `src/server/members.ts` | `env.DB.batch([stmt1, stmt2])` |
| Email sending | `src/server/auth.ts` | Resend API via `RESEND_API_KEY` binding |
| Public token routes | `src/routes/verify-email.$token.tsx` | Loader-based token validation; outside `_protected` |
| Route context sharing | `src/routes/_protected/orgs.$orgSlug.tsx` | `beforeLoad` returns `{ org, userRole }`; children read via `useRouteContext` |

## Roles Clarification

The actual `OrgRole` type in the codebase is: `'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'` — five roles, not three. The spec assumption of "owner/admin/member" was simplified. The plan will use the actual five-role model. The `staff_member.role` column will use the same five values.

## Permission Mapping for New Actions

| Action | Required Permission | Who Has It |
|--------|-------------------|------------|
| View staff roster | (any active member) | owner, admin, manager, employee, payroll_hr |
| Add roster-only member | `invite-members` | owner, admin |
| Send invitation | `invite-members` | owner, admin |
| Cancel / resend invitation | `invite-members` | owner, admin |
| Change staff role | `assign-roles` | owner, admin |
| Remove staff member | `remove-members` | owner, admin |
| View audit log | `assign-roles` | owner, admin |
