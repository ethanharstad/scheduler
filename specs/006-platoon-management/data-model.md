# Data Model: Platoon Management (006-platoon-management)

## New Tables

### `platoon`

Represents a named shift group within an organization.

```sql
CREATE TABLE IF NOT EXISTS platoon (
  id          TEXT NOT NULL PRIMARY KEY,            -- crypto.randomUUID()
  org_id      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                        -- 2-100 chars; unique within org (case-insensitive)
  shift_label TEXT NOT NULL,                        -- e.g. "A Shift", "B Shift"; user-editable; independent of rrule
  rrule       TEXT NOT NULL,                        -- iCalendar RRULE string (RFC 5545); syntactically validated
  start_date  TEXT NOT NULL,                        -- YYYY-MM-DD; anchors RRULE to calendar (acts as DTSTART)
  description TEXT,                                 -- optional; free text
  color       TEXT,                                 -- optional; e.g. "#e63946" or "red"
  created_at  TEXT NOT NULL,                        -- ISO 8601
  updated_at  TEXT NOT NULL                         -- ISO 8601
);

-- Case-insensitive unique name per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_org_name ON platoon(org_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_platoon_org      ON platoon(org_id);
```

**Constraints**:
- `name`: required; 2–100 characters; case-insensitively unique within `org_id`
- `shift_label`: required; 1–50 characters; no uniqueness constraint
- `rrule`: required; must pass `isValidRRule()` check before insert/update (see research.md)
- `start_date`: required; `YYYY-MM-DD` format
- `color`: optional; stored as-is (hex code or named color — no server-side format enforcement)

---

### `platoon_membership`

Represents the *current* assignment of a staff member to a platoon. No history is retained.

```sql
CREATE TABLE IF NOT EXISTS platoon_membership (
  id              TEXT NOT NULL PRIMARY KEY,         -- crypto.randomUUID()
  platoon_id      TEXT NOT NULL REFERENCES platoon(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  assigned_at     TEXT NOT NULL                      -- ISO 8601; date of current assignment
);

-- Enforces one-platoon-per-member at the DB level (last-write-wins via INSERT OR REPLACE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_membership_staff   ON platoon_membership(staff_member_id);
CREATE        INDEX IF NOT EXISTS idx_platoon_membership_platoon ON platoon_membership(platoon_id);
```

**Constraints**:
- `UNIQUE(staff_member_id)`: one membership per staff member at any time; enforced at DB layer
- `ON DELETE CASCADE` on `platoon_id`: deleting a platoon automatically removes all its memberships
- `ON DELETE CASCADE` on `staff_member_id`: removing a staff member removes their platoon assignment

---

## Schema Modification

Add the following block to `src/db/schema.sql` (after the existing staff management section):

```sql
-- Platoon Management (006-platoon-management)
-- [tables above]
```

---

## TypeScript Types (`src/lib/platoon.types.ts`)

### D1 row shapes

```typescript
// Raw DB row
export interface Platoon {
  id: string
  org_id: string
  name: string
  shift_label: string
  rrule: string
  start_date: string
  description: string | null
  color: string | null
  created_at: string
  updated_at: string
}

export interface PlatoonMembership {
  id: string
  platoon_id: string
  staff_member_id: string
  assigned_at: string
}
```

### Client-facing view shapes

```typescript
/** Returned in the list endpoint — includes member count */
export interface PlatoonView {
  id: string
  name: string
  shiftLabel: string
  rrule: string
  startDate: string
  description: string | null
  color: string | null
  memberCount: number
}

/** Returned in the detail endpoint — includes member names */
export interface PlatoonDetailView {
  id: string
  name: string
  shiftLabel: string
  rrule: string
  startDate: string
  description: string | null
  color: string | null
  members: PlatoonMemberView[]
}

/** A single member entry in a platoon detail view */
export interface PlatoonMemberView {
  staffMemberId: string
  name: string
}
```

### Server function I/O types

```typescript
// --- List ---
export type ListPlatoonsInput = { orgSlug: string }
export type ListPlatoonsOutput =
  | { success: true; platoons: PlatoonView[] }
  | { success: false; error: 'UNAUTHORIZED' }

// --- Get detail ---
export type GetPlatoonInput = { orgSlug: string; platoonId: string }
export type GetPlatoonOutput =
  | { success: true; platoon: PlatoonDetailView }
  | { success: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' }

// --- Create ---
export type CreatePlatoonInput = {
  orgSlug: string
  name: string
  shiftLabel: string
  rrule: string
  startDate: string
  description?: string
  color?: string
}
export type CreatePlatoonOutput =
  | { success: true; platoonId: string }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DUPLICATE_NAME' | 'INVALID_RRULE' }

// --- Update ---
export type UpdatePlatoonInput = {
  orgSlug: string
  platoonId: string
  name: string
  shiftLabel: string
  rrule: string
  startDate: string
  description?: string
  color?: string
}
export type UpdatePlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'DUPLICATE_NAME' | 'INVALID_RRULE' }

// --- Delete ---
export type DeletePlatoonInput = { orgSlug: string; platoonId: string }
export type DeletePlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }

// --- Assign member ---
export type AssignMemberInput = {
  orgSlug: string
  platoonId: string
  staffMemberId: string
}
export type AssignMemberOutput =
  | { success: true; movedFrom: string | null }  // movedFrom = previous platoon name, or null
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'PLATOON_NOT_FOUND' | 'MEMBER_NOT_FOUND' }

// --- Remove member ---
export type RemoveMemberFromPlatoonInput = {
  orgSlug: string
  platoonId: string
  staffMemberId: string
}
export type RemoveMemberFromPlatoonOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' }
```

---

## Entity Relationships

```text
organization (1) ──< platoon (many)
platoon      (1) ──< platoon_membership (many)
staff_member (1) ──  platoon_membership (0 or 1)   ← unique constraint enforces max 1
```

`platoon_membership.staff_member_id` has a `UNIQUE` index, so each staff member can appear at most once across all platoon memberships — enforcing the one-platoon-per-member rule at the database level.
