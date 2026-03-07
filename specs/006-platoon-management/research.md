# Research: Platoon Management (006-platoon-management)

## Decision 1: RRULE Syntactic Validation in Cloudflare Workers

**Decision**: Pure-JS regex validator inlined in `src/server/platoons.ts` — no npm package.

**Rationale**: The spec requires syntactic-only validation (RFC 5545 grammar). A custom validator checking for the mandatory `FREQ=` property plus `KEY=VALUE;`-delimited structure is sufficient and adds zero bundle size. The popular `rrule` npm package is pure-JS and technically Workers-compatible, but adds ~50 KB to the bundle for no gain over a 5-line inline check.

**Validator logic**:
```typescript
function isValidRRule(value: string): boolean {
  // Strip optional leading "RRULE:" prefix
  const rule = value.replace(/^RRULE:/i, '').trim()
  // Must contain a valid FREQ property
  if (!/\bFREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)\b/.test(rule)) return false
  // Must be semicolon-delimited PROPERTY=VALUE pairs (no control chars)
  if (!/^[A-Z]+=[^\s;]+(;[A-Z]+=[^\s;]+)*$/.test(rule)) return false
  return true
}
```

**Alternatives considered**:
- `rrule` npm package: Workers-compatible but adds bundle weight for a syntactic check; rejected
- Full iCalendar parser: Out of scope and far too heavy; rejected
- No validation: Rejected — spec explicitly requires syntactic validation (FR-003, SC-007)

---

## Decision 2: Case-Insensitive Unique Name Enforcement

**Decision**: `CREATE UNIQUE INDEX ON platoon(org_id, LOWER(name))` combined with `LOWER(?) = LOWER(name)` duplicate check before insert/update.

**Rationale**: D1/SQLite supports `LOWER()` in index expressions via a functional index. This gives true case-insensitive DB-level uniqueness without relying solely on application-layer checks. Concurrent insert conflicts are surfaced as a SQLite `UNIQUE constraint failed` error, which the server fn maps to a `DUPLICATE_NAME` error code.

**Alternatives considered**:
- `COLLATE NOCASE` on the column: Works but only applies when the column is declared with that collation; functional index is more explicit and readable
- Application-layer only: Insufficient for concurrent writes; rejected

---

## Decision 3: `requireOrgMembership` Helper Placement

**Decision**: Inline a copy of the helper in `src/server/platoons.ts`. Do not create a shared module.

**Rationale**: The helper already exists in `src/server/members.ts`. The Simplicity principle (V) prohibits new abstractions unless used in ≥2 distinct places. This is one new server file. Extracting to `src/server/shared.ts` would be a premature abstraction for a single reuse. If a third feature adds another server file, extraction becomes justified at that point.

**Alternatives considered**:
- Extract to `src/server/auth-helpers.ts`: Premature; rejected under Principle V
- Re-export from `members.ts`: Creates coupling between unrelated features; rejected

---

## Decision 4: Predefined Pattern Shortcut RRULEs

**Decision**: Client-side only; not stored. Predefined shortcuts pre-populate the RRULE text field. The stored RRULE is whatever the user submits (after validation).

**RRULE templates for each predefined shortcut**:

| Shortcut | Interpretation | Generated RRULE |
|---|---|---|
| 24/48 | 3-platoon rotation; each platoon works 1 day, off 2 | `FREQ=DAILY;INTERVAL=3` |
| 24/72 | 4-platoon rotation; each platoon works 1 day, off 3 | `FREQ=DAILY;INTERVAL=4` |
| 48/96 | 3-platoon rotation; each platoon works 2 days, off 4 | `FREQ=DAILY;INTERVAL=6` |
| Kelly | 9-shift cycle (complex, varies by dept) | `FREQ=DAILY;INTERVAL=9` (approximate; users should adjust) |
| California Swing | Rotating 24/48/24/72 pattern | `FREQ=WEEKLY;BYDAY=MO,TU,WE` (approximate; users should adjust) |
| Custom | User-defined | *(no pre-population; user enters RRULE directly)* |

**Note**: Kelly and California Swing cannot be accurately expressed as simple single-rule RRULEs because they involve irregular cycles. The generated templates are reasonable starting points; the user is expected to refine them. This is acceptable because RRULE editing is available in both create and edit modes.

**How the start date anchors the RRULE**: DTSTART (stored as `start_date`) offsets each platoon within the rotation. For a 24/48 system with 3 platoons:
- Platoon A: start_date = Jan 1; RRULE = `FREQ=DAILY;INTERVAL=3` → works Jan 1, 4, 7, …
- Platoon B: start_date = Jan 2; RRULE = `FREQ=DAILY;INTERVAL=3` → works Jan 2, 5, 8, …
- Platoon C: start_date = Jan 3; RRULE = `FREQ=DAILY;INTERVAL=3` → works Jan 3, 6, 9, …

---

## Decision 5: Concurrent Member Assignment (Last-Write-Wins)

**Decision**: `INSERT OR REPLACE INTO platoon_membership` (SQLite upsert). The unique index on `staff_member_id` ensures one membership at a time; the last write atomically replaces any existing membership.

**Rationale**: D1 `INSERT OR REPLACE` is atomic at the statement level. No application-level locking needed. Both admins' writes produce a consistent state (member on exactly one platoon). Spec clarification confirmed last-write-wins with no error surfaced (Session 2026-03-06).

**Alternatives considered**:
- `INSERT OR IGNORE` (first-write-wins): Rejected per spec clarification
- Optimistic concurrency control (e.g., version column): Unnecessary complexity for a low-frequency operation; rejected

---

## Decision 6: Platoon Deletion Cascade

**Decision**: `ON DELETE CASCADE` on `platoon_membership.platoon_id` reference. Deleting a platoon automatically removes all its memberships in a single D1 statement.

**Rationale**: Simplest approach; consistent with how `org_membership` handles org deletion. No batch statement needed for the cascade — SQLite handles it atomically.
