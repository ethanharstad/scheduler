# Data Model: Organization RBAC

**Branch**: `004-org-rbac` | **Date**: 2026-03-03

---

## Schema Changes

**No new database tables are required.** The existing `org_membership` table (from `003-create-org`) already captures the role-per-user-per-org relationship needed for RBAC. The permission matrix lives entirely in code (`src/lib/rbac.ts`).

---

## Existing Tables (referenced)

### `session`
```sql
CREATE TABLE IF NOT EXISTS session (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_token    TEXT NOT NULL UNIQUE,
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  expires_at       TEXT NOT NULL
);
```
**Usage**: Session token is read from the `session` cookie on each request to resolve `user_id`. No changes required.

### `org_membership`
```sql
CREATE TABLE IF NOT EXISTS org_membership (
  id        TEXT NOT NULL PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES user(id)    ON DELETE CASCADE,
  role      TEXT NOT NULL,   -- 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'
  status    TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON org_membership(org_id, user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_user   ON org_membership(user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_org    ON org_membership(org_id);
```
**Usage**: Source of truth for a user's role within an org. The `role` column is updated by `changeMemberRoleServerFn` and `transferOwnershipServerFn`. The UNIQUE index on `(org_id, user_id)` enforces one role per membership.

---

## Code-Level Data Model

### `Permission` (union type — `src/lib/rbac.ts`)

```
'view-org-settings'
'edit-org-settings'
'manage-billing'
'invite-members'
'remove-members'
'assign-roles'
'transfer-ownership'
'create-edit-schedules'
'view-schedules'
'approve-time-off'
'submit-time-off'
'view-reports'
'access-payroll-hr'
```

### Role → Permission Mapping (`src/lib/rbac.ts`)

| Permission | owner | admin | manager | employee | payroll_hr |
|---|:---:|:---:|:---:|:---:|:---:|
| `view-org-settings` | ✓ | ✓ | — | — | — |
| `edit-org-settings` | ✓ | ✓ | — | — | — |
| `manage-billing` | ✓ | — | — | — | — |
| `invite-members` | ✓ | ✓ | — | — | — |
| `remove-members` | ✓ | ✓ | — | — | — |
| `assign-roles` | ✓ | ✓ | — | — | — |
| `transfer-ownership` | ✓ | — | — | — | — |
| `create-edit-schedules` | ✓ | ✓ | ✓ | — | — |
| `view-schedules` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `approve-time-off` | ✓ | ✓ | ✓ | — | — |
| `submit-time-off` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `view-reports` | ✓ | ✓ | ✓ | — | ✓ |
| `access-payroll-hr` | ✓ | — | — | — | ✓ |

### `OrgMemberView` (client-facing shape — `src/lib/rbac.types.ts`)

```typescript
interface OrgMemberView {
  memberId: string       // org_membership.id
  userId: string         // user.id
  email: string          // user.email
  displayName: string    // user_profile.display_name (or email local-part fallback)
  role: OrgRole
  joinedAt: string       // ISO 8601
}
```

### Server Function I/O Types (`src/server/members.ts`)

#### `listMembersServerFn`
- **Input**: `{ orgSlug: string }`
- **Output**: `{ success: true; members: OrgMemberView[] } | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }`

#### `changeMemberRoleServerFn`
- **Input**: `{ orgSlug: string; memberId: string; newRole: OrgRole }`
- **Output**: `{ success: true } | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_ROLE' | 'LAST_OWNER' }`

#### `removeMemberServerFn`
- **Input**: `{ orgSlug: string; memberId: string }`
- **Output**: `{ success: true } | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'LAST_OWNER' }`

#### `transferOwnershipServerFn`
- **Input**: `{ orgSlug: string; newOwnerMemberId: string }`
- **Output**: `{ success: true } | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'FORBIDDEN' | 'SELF_TRANSFER' }`

#### `getMemberPermissionsServerFn`
- **Input**: `{ orgSlug: string }`
- **Output**: `{ success: true; role: OrgRole; permissions: Permission[] } | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }`

---

## Invariants & Constraints

| Constraint | Enforcement |
|---|---|
| One role per user per org | `UNIQUE INDEX idx_org_membership_unique ON org_membership(org_id, user_id)` (DB) |
| Org must always have ≥1 active Owner | Checked before any demotion/removal targeting an Owner (application layer) |
| Only Owner can assign Owner role | `canDo(callerRole, 'transfer-ownership')` check (application layer) |
| Admin cannot remove Owner | `canDo(callerRole, 'remove-members')` + target-role guard (application layer) |
| Ownership transfer is atomic | D1 `batch()` — both `UPDATE` statements commit together |
