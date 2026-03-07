# Server Function Contracts: Platoon Management

All functions live in `src/server/platoons.ts`. All use `createServerFn` (TanStack Start v1) and access D1 via `ctx.context as unknown as Cloudflare.Env`. Permission enforcement mirrors `src/server/members.ts`.

---

## `listPlatoonsServerFn`

**Method**: GET
**Permission**: `view-schedules` (all roles)
**Input**: `{ orgSlug: string }`
**Output**: `ListPlatoonsOutput`

**Behavior**:
1. Resolve session + org membership via `requireOrgMembership`. Return `UNAUTHORIZED` if none.
2. Any valid membership (including `employee`) satisfies `view-schedules`; no `canDo` check needed.
3. Query `platoon` LEFT JOIN `platoon_membership` to count members per platoon.
4. Return platoons sorted `ORDER BY LOWER(name) ASC`.

**SQL sketch**:
```sql
SELECT p.id, p.name, p.shift_label, p.rrule, p.start_date, p.description, p.color,
       COUNT(pm.id) AS member_count
FROM platoon p
LEFT JOIN platoon_membership pm ON pm.platoon_id = p.id
WHERE p.org_id = ?
GROUP BY p.id
ORDER BY LOWER(p.name) ASC
```

---

## `getPlatoonServerFn`

**Method**: GET
**Permission**: `view-schedules` (all roles)
**Input**: `{ orgSlug: string; platoonId: string }`
**Output**: `GetPlatoonOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. Fetch platoon row by `id` + `org_id`. Return `NOT_FOUND` if absent.
3. Fetch member names via `platoon_membership JOIN staff_member`.
4. Return `PlatoonDetailView`.

**SQL sketch**:
```sql
-- Platoon row
SELECT id, name, shift_label, rrule, start_date, description, color
FROM platoon WHERE id = ? AND org_id = ?

-- Members
SELECT sm.id AS staff_member_id, sm.name
FROM platoon_membership pm
JOIN staff_member sm ON sm.id = pm.staff_member_id
WHERE pm.platoon_id = ?
ORDER BY sm.name ASC
```

---

## `createPlatoonServerFn`

**Method**: POST
**Permission**: `create-edit-schedules` (owner, admin, manager)
**Input**: `CreatePlatoonInput`
**Output**: `CreatePlatoonOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. `canDo(role, 'create-edit-schedules')` → `FORBIDDEN`.
3. `isValidRRule(rrule)` → `INVALID_RRULE`.
4. Check `SELECT 1 FROM platoon WHERE org_id = ? AND LOWER(name) = LOWER(?)` → `DUPLICATE_NAME`.
5. `INSERT INTO platoon` with `crypto.randomUUID()` as id, `new Date().toISOString()` for timestamps.
6. Return `{ success: true, platoonId }`.

---

## `updatePlatoonServerFn`

**Method**: POST
**Permission**: `create-edit-schedules`
**Input**: `UpdatePlatoonInput`
**Output**: `UpdatePlatoonOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. `canDo` → `FORBIDDEN`.
3. Fetch platoon by `id + org_id` → `NOT_FOUND`.
4. `isValidRRule(rrule)` → `INVALID_RRULE`.
5. Duplicate name check (excluding current platoon id) → `DUPLICATE_NAME`.
6. `UPDATE platoon SET ... WHERE id = ? AND org_id = ?`.

---

## `deletePlatoonServerFn`

**Method**: POST
**Permission**: `create-edit-schedules`
**Input**: `{ orgSlug: string; platoonId: string }`
**Output**: `DeletePlatoonOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. `canDo` → `FORBIDDEN`.
3. Fetch platoon `id + org_id` → `NOT_FOUND`.
4. `DELETE FROM platoon WHERE id = ? AND org_id = ?`. Cascade removes memberships automatically.

---

## `assignMemberServerFn`

**Method**: POST
**Permission**: `create-edit-schedules`
**Input**: `{ orgSlug: string; platoonId: string; staffMemberId: string }`
**Output**: `AssignMemberOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. `canDo` → `FORBIDDEN`.
3. Verify platoon `id + org_id` exists → `PLATOON_NOT_FOUND`.
4. Verify staff member `id + org_id` exists (status != `removed`) → `MEMBER_NOT_FOUND`.
5. Check for existing membership to determine `movedFrom` name (for confirmation UX feedback).
6. `INSERT OR REPLACE INTO platoon_membership(id, platoon_id, staff_member_id, assigned_at)` — atomic upsert; last-write-wins for concurrent requests.
7. Return `{ success: true, movedFrom: <prior platoon name or null> }`.

**Note**: `INSERT OR REPLACE` triggers on the `UNIQUE(staff_member_id)` index, replacing any prior membership row. This is the mechanism for last-write-wins concurrent assignment.

---

## `removeMemberFromPlatoonServerFn`

**Method**: POST
**Permission**: `create-edit-schedules`
**Input**: `{ orgSlug: string; platoonId: string; staffMemberId: string }`
**Output**: `RemoveMemberFromPlatoonOutput`

**Behavior**:
1. `requireOrgMembership` → `UNAUTHORIZED`.
2. `canDo` → `FORBIDDEN`.
3. `DELETE FROM platoon_membership WHERE platoon_id = ? AND staff_member_id = ?`. If 0 rows affected → `NOT_FOUND`.

---

## RRULE Validator

Implemented inline in `src/server/platoons.ts` (not exported):

```typescript
function isValidRRule(value: string): boolean {
  const rule = value.replace(/^RRULE:/i, '').trim()
  if (!/\bFREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)\b/.test(rule)) return false
  if (!/^[A-Z]+=[^\s;]+(;[A-Z]+=[^\s;]+)*$/.test(rule)) return false
  return true
}
```

---

## Sidebar Navigation

Add to `src/routes/_protected/orgs.$orgSlug.tsx` sidebar nav (visible to all members):

```tsx
<NavLink to="/orgs/$orgSlug/platoons" params={{ orgSlug }}>
  Platoons
</NavLink>
```

No permission gate — `view-schedules` is granted to every role including `employee`.
