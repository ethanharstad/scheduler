# Implementation Plan: Staff Member Management

**Branch**: `005-staff-management` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-staff-management/spec.md`

## Summary

Add a comprehensive staff roster system to the organization workspace. Extends the existing org membership model with three new D1 tables (`staff_member`, `staff_invitation`, `staff_audit_log`), a new public invitation acceptance route (`/join/$token`), and a new staff management page (`/orgs/$orgSlug/staff`). Roster-only members (no user account) are fully supported. All destructive actions (remove, role change) immediately invalidate the affected user's sessions. Every management action is written to an immutable audit log.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
**Storage**: Cloudflare D1 (SQLite) — binding name `DB`; 3 new tables: `staff_member`, `staff_invitation`, `staff_audit_log`
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Full-stack web application (SSR)
**Performance Goals**: Staff list renders in <1s; role/remove mutations complete in <500ms
**Constraints**: Workers edge runtime — Web Crypto API only (no Node crypto); no in-memory state across requests; bundle < 1 MB compressed
**Scale/Scope**: Org-level staff management; expected roster size up to ~500 members per org

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Component-First | ✅ PASS | Staff list, audit log, and invitation flows are self-contained components. No cross-boundary state mutations. |
| II. Type Safety | ✅ PASS | New `src/lib/staff.types.ts` carries all I/O types. All server fn inputs/outputs explicitly typed. `any` not used. |
| III. Server-First | ✅ PASS | All data fetching via `createServerFn`. Route loaders pre-fetch staff list and audit log. |
| IV. Edge-Runtime | ✅ PASS | Token generation uses `globalThis.crypto.getRandomValues` (Web Crypto). No Node built-ins. Email via existing Resend pattern. |
| V. Simplicity | ✅ PASS | New abstractions (helpers in `staff.ts`) are used in multiple server functions. No single-use abstractions. Route files planned <200 lines each (staff list and invite flow split if needed). |

**No violations.** Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/005-staff-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── server-functions.md   # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema.sql               # ADD: 3 new CREATE TABLE statements
├── lib/
│   ├── staff.types.ts           # NEW: StaffStatus, StaffAuditAction, all view/input types
│   └── (org.types.ts — no change)
├── server/
│   └── staff.ts                 # NEW: 10 server functions + helpers
└── routes/
    ├── join.$token.tsx           # NEW: public invitation acceptance route
    └── _protected/
        └── orgs.$orgSlug/
            ├── staff.tsx         # NEW: staff roster page (list, add, invite, role, remove)
            └── staff.audit.tsx   # NEW: audit log page (admin/owner only)

(existing files modified):
src/routes/_protected/orgs.$orgSlug.tsx    # ADD: Staff nav link (guarded by invite-members or view)
```

**Structure Decision**: Single-project web app layout. New server module `src/server/staff.ts` follows the existing pattern from `src/server/members.ts`. New types module `src/lib/staff.types.ts` follows `src/lib/org.types.ts`. Two new protected child routes follow the existing `orgs.$orgSlug/` nested pattern. One new public route `join.$token.tsx` follows the `verify-email.$token.tsx` pattern.

## Phase 0: Research

**Status**: ✅ Complete — see [research.md](./research.md)

Key decisions:
- **D-001**: New `staff_member` table (not extending `org_membership`)
- **D-002**: Web Crypto API for invitation tokens (32 bytes, base64url)
- **D-003**: `DELETE FROM session WHERE user_id = ?` for immediate session invalidation
- **D-004**: Public `join.$token.tsx` route (outside `_protected`)
- **D-005**: D1 TEXT column for JSON audit metadata; indefinite retention
- **D-006**: Partial UNIQUE index + CHECK constraint for email uniqueness
- **D-007**: `staff_member` + `org_membership` kept in sync atomically via `env.DB.batch()`

## Phase 1: Design & Contracts

**Status**: ✅ Complete

### Data Model

See [data-model.md](./data-model.md) for full DDL.

**New tables summary**:

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `staff_member` | Primary roster; links to user optionally | CHECK(email OR phone); UNIQUE(org_id, email) partial |
| `staff_invitation` | Pending join invitations | UNIQUE(token); at most 1 pending per staff_member |
| `staff_audit_log` | Immutable action history | Append-only; never purged |

**Schema migration**: Three new `CREATE TABLE IF NOT EXISTS` statements added to `src/db/schema.sql`. Applied manually to D1 via Wrangler.

### Server Functions

See [contracts/server-functions.md](./contracts/server-functions.md) for full input/output specs.

**Functions in `src/server/staff.ts`**:

| Function | Method | Permission | Key side-effects |
|----------|--------|------------|-----------------|
| `listStaffServerFn` | GET | any member | — |
| `addStaffMemberServerFn` | POST | `invite-members` | audit log |
| `inviteStaffMemberServerFn` | POST | `invite-members` | email sent; audit log |
| `cancelInvitationServerFn` | POST | `invite-members` | audit log |
| `resendInvitationServerFn` | POST | `invite-members` | email sent; audit log |
| `changeStaffRoleServerFn` | POST | `assign-roles` | session invalidation; audit log |
| `removeStaffMemberServerFn` | POST | `remove-members` | session invalidation; audit log |
| `getInvitationByTokenServerFn` | GET | none (public) | — |
| `acceptInvitationServerFn` | POST | none (public) | user creation; session creation; audit log |
| `getStaffAuditLogServerFn` | GET | `assign-roles` | — |

### Routes

| Route file | URL | Auth | Purpose |
|-----------|-----|------|---------|
| `src/routes/join.$token.tsx` | `/join/:token` | None | Invitation acceptance (register or login) |
| `src/routes/_protected/orgs.$orgSlug/staff.tsx` | `/orgs/:slug/staff` | Active member | Staff roster management |
| `src/routes/_protected/orgs.$orgSlug/staff.audit.tsx` | `/orgs/:slug/staff/audit` | Admin/owner | Audit log view |

### Email Templates

Invitation email (sent by `inviteStaffMemberServerFn` and `resendInvitationServerFn`):
- Subject: `You've been invited to join [Org Name] on Scheduler`
- Body: Inviter name, org name, role, CTA button → `https://{origin}/join/{token}`, expiry notice (7 days)
- Sent via existing Resend pattern in `src/server/auth.ts`

### Org Layout Navigation Update

`src/routes/_protected/orgs.$orgSlug.tsx` — add "Staff" link to nav, visible to all active members (read-only page is visible to all). The existing "Members" link (from `004-org-rbac`) may be hidden or retained; plan retains it to avoid breaking the previous feature.

## Post-Design Constitution Re-Check

All five principles continue to pass. No new violations introduced by the Phase 1 design. The `acceptInvitationServerFn` public endpoint does not require a session, which is consistent with the existing `verify-email.$token.tsx` and `reset-password.$token.tsx` patterns (Principle III allows public server functions when the data is not session-gated by design).

## Implementation Notes

### Token Generation (Workers-safe)

```typescript
function generateToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
```

### Session Invalidation Helper

```typescript
async function invalidateUserSessions(env: Cloudflare.Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM session WHERE user_id = ?').bind(userId).run()
}
```

Used by both `changeStaffRoleServerFn` and `removeStaffMemberServerFn`.

### Atomic Role Sync

When role changes for an active member, both tables must update together:

```typescript
await env.DB.batch([
  env.DB.prepare('UPDATE staff_member SET role = ?, updated_at = ? WHERE id = ?')
    .bind(newRole, now, staffMemberId),
  env.DB.prepare('UPDATE org_membership SET role = ? WHERE user_id = ? AND org_id = ?')
    .bind(newRole, userId, orgId),
])
```

### Invitation Acceptance — Existing Account Path

If the invitee is already logged in (session cookie present), `acceptInvitationServerFn` should detect the existing session and skip user creation. The `join.$token.tsx` route loader should call `getSessionServerFn` to check login state and render the appropriate form.
