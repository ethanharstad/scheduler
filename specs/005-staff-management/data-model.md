# Data Model: Staff Member Management (005-staff-management)

**Branch**: `005-staff-management` | **Date**: 2026-03-03

## New Tables

### `staff_member`

Primary roster table for all staff in an organization, regardless of whether they have a user account.

```sql
CREATE TABLE IF NOT EXISTS staff_member (
  id           TEXT PRIMARY KEY,                    -- UUID
  org_id       TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES user(id) ON DELETE SET NULL, -- NULL if no account yet
  name         TEXT NOT NULL,                        -- Full name, 1-100 chars
  email        TEXT,                                 -- Optional but required if phone is NULL
  phone        TEXT,                                 -- Optional but required if email is NULL
  role         TEXT NOT NULL DEFAULT 'employee',     -- OrgRole: owner|admin|manager|employee|payroll_hr
  status       TEXT NOT NULL DEFAULT 'roster_only',  -- roster_only | pending | active
  added_by     TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,                        -- ISO 8601
  updated_at   TEXT NOT NULL,                        -- ISO 8601

  CHECK (email IS NOT NULL OR phone IS NOT NULL)     -- At least one contact field required
);

-- Prevent duplicate emails within an org
CREATE UNIQUE INDEX IF NOT EXISTS staff_member_org_email
  ON staff_member(org_id, email) WHERE email IS NOT NULL;

-- Fast lookup by org
CREATE INDEX IF NOT EXISTS staff_member_org_id ON staff_member(org_id);

-- Fast lookup by user (for linking on registration)
CREATE INDEX IF NOT EXISTS staff_member_user_id ON staff_member(user_id) WHERE user_id IS NOT NULL;
```

**Status transitions**:
- `roster_only` → `pending` (admin sends invitation)
- `roster_only` → `active` (email matches existing registered user on add)
- `pending` → `active` (invitee registers or logs in via invitation link)
- `pending` → `roster_only` (admin cancels invitation)
- `active` → (removed: row deleted or org_membership set inactive — see note below)

**Removal**: When a staff member is removed, their `staff_member` row is soft-deleted by setting `status = 'removed'` (not hard-deleted, to preserve audit log references). For account-holding members, their `org_membership` row is also set to `status = 'inactive'`.

**Role sync**: For active members, `staff_member.role` MUST always match `org_membership.role`. Role changes update both rows atomically via `env.DB.batch()`.

---

### `staff_invitation`

Tracks pending invitations sent to email addresses.

```sql
CREATE TABLE IF NOT EXISTS staff_invitation (
  id               TEXT PRIMARY KEY,               -- UUID
  org_id           TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  staff_member_id  TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  token            TEXT NOT NULL UNIQUE,           -- 32-byte random, base64url-encoded
  invited_by       TEXT REFERENCES user(id) ON DELETE SET NULL,
  expires_at       TEXT NOT NULL,                  -- ISO 8601; 7 days from creation
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | cancelled
  created_at       TEXT NOT NULL                   -- ISO 8601
);

CREATE INDEX IF NOT EXISTS staff_invitation_token ON staff_invitation(token);
CREATE INDEX IF NOT EXISTS staff_invitation_org_member
  ON staff_invitation(org_id, staff_member_id);
```

**Invariant**: At most one `pending` invitation per `staff_member_id` at a time. On resend, the previous invitation is set to `cancelled` and a new one is inserted atomically.

---

### `staff_audit_log`

Immutable append-only log of all staff management actions. Never purged.

```sql
CREATE TABLE IF NOT EXISTS staff_audit_log (
  id               TEXT PRIMARY KEY,               -- UUID
  org_id           TEXT NOT NULL,                  -- Denormalized (org may be deleted later)
  staff_member_id  TEXT,                           -- NULL if member was hard-deleted (future-proof)
  performed_by     TEXT,                           -- user_id of acting admin; NULL if system
  action           TEXT NOT NULL,                  -- See action enum below
  metadata         TEXT,                           -- JSON: action-specific details
  created_at       TEXT NOT NULL                   -- ISO 8601
);

CREATE INDEX IF NOT EXISTS staff_audit_log_org ON staff_audit_log(org_id, created_at DESC);
```

**Action enum** (stored as TEXT):
| Value | Triggered by |
|-------|-------------|
| `member_added` | Admin adds roster-only member |
| `member_removed` | Admin removes any staff member |
| `member_linked` | Roster-only/pending member linked to user account |
| `role_changed` | Admin changes role; metadata: `{ from: OrgRole, to: OrgRole }` |
| `invitation_sent` | Admin sends invitation |
| `invitation_cancelled` | Admin cancels invitation |
| `invitation_resent` | Admin resends invitation (cancels old, creates new) |
| `invitation_accepted` | Invitee completes registration |

**Metadata examples**:
```json
// role_changed
{ "from": "employee", "to": "manager" }

// invitation_sent / accepted / cancelled / resent
{ "email": "john@example.com" }

// member_added
{ "name": "John Smith", "email": "john@example.com" }
```

---

## Modified Tables

### `org_membership` (no schema change)

No DDL changes required. When a staff member becomes active, a new `org_membership` row is inserted with `status = 'active'`. When removed, the row is set to `status = 'inactive'`. The existing UNIQUE index on `(org_id, user_id)` prevents duplicates.

---

## TypeScript Types

### `src/lib/staff.types.ts`

```typescript
import type { OrgRole } from '@/lib/org.types'

export type StaffStatus = 'roster_only' | 'pending' | 'active' | 'removed'

export type StaffAuditAction =
  | 'member_added'
  | 'member_removed'
  | 'member_linked'
  | 'role_changed'
  | 'invitation_sent'
  | 'invitation_cancelled'
  | 'invitation_resent'
  | 'invitation_accepted'

// Returned by listStaffServerFn
export interface StaffMemberView {
  id: string                  // staff_member.id
  name: string
  email: string | null
  phone: string | null
  role: OrgRole
  status: StaffStatus
  userId: string | null       // null if roster_only or pending
  addedAt: string             // ISO 8601
  updatedAt: string
}

// Returned by getStaffAuditLogServerFn
export interface StaffAuditEntry {
  id: string
  staffMemberId: string | null
  staffMemberName: string | null  // denormalized for display when member is removed
  performedByUserId: string | null
  performedByName: string | null  // denormalized for display
  action: StaffAuditAction
  metadata: Record<string, string> | null
  createdAt: string
}

// Input for addStaffMemberServerFn
export interface AddStaffMemberInput {
  orgSlug: string
  name: string
  email?: string
  phone?: string
  role: OrgRole
}

// Input for inviteStaffMemberServerFn
export interface InviteStaffMemberInput {
  orgSlug: string
  staffMemberId: string  // invite an existing roster-only member, OR
  email?: string         // fresh invite (creates staff_member on the fly if needed)
}

// Input for changeStaffRoleServerFn
export interface ChangeStaffRoleInput {
  orgSlug: string
  staffMemberId: string
  newRole: OrgRole
}

// Input for removeStaffMemberServerFn
export interface RemoveStaffMemberInput {
  orgSlug: string
  staffMemberId: string
}

// Input for cancelInvitationServerFn / resendInvitationServerFn
export interface InvitationActionInput {
  orgSlug: string
  staffMemberId: string
}

// Input for getInvitationByTokenServerFn (public, no auth)
export interface GetInvitationInput {
  token: string
}

// Returned by getInvitationByTokenServerFn
export interface InvitationView {
  token: string
  orgName: string
  orgSlug: string
  email: string
  role: OrgRole
  inviterName: string | null
  expiresAt: string
}

// Input for acceptInvitationServerFn
export interface AcceptInvitationInput {
  token: string
  // If account exists: user is already logged in (session cookie present)
  // If no account: provide registration details
  name?: string
  password?: string
}
```

---

## Entity Relationship Summary

```
organization (existing)
    │
    ├── org_membership (existing) ←──────────────────────────────┐
    │         │ user_id → user (existing)                        │
    │                                                            │
    └── staff_member (NEW)                                       │
              │ user_id → user (nullable, SET NULL on delete)    │
              │ org_id → organization                            │
              │ added_by → user                                  │ on accept: INSERT
              │                                                  │
              └── staff_invitation (NEW)                         │
              │         token (UNIQUE, indexed)                  │
              │         staff_member_id → staff_member           │
              │         invited_by → user                        │
              │                                                  │
              └── staff_audit_log (NEW)                          │
                        org_id (denormalized)                    │
                        staff_member_id → staff_member (nullable)│
                        performed_by → user (nullable)           │
```
