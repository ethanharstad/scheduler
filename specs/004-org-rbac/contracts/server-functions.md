# Server Function Contracts: Organization RBAC

**Branch**: `004-org-rbac` | **Date**: 2026-03-03

All server functions live in `src/server/members.ts` and follow the `createServerFn` pattern established in this codebase. Every function performs session validation and permission checks before executing business logic.

---

## Permission Utility (`src/lib/rbac.ts`)

### `canDo(role, permission)`

```typescript
function canDo(role: OrgRole, permission: Permission): boolean
```

- Pure function; no I/O.
- Returns `true` if `role` is mapped to `permission` in the static matrix.
- Used by all server functions and by UI components for conditional rendering.

---

## `listMembersServerFn`

**Method**: GET
**Purpose**: Retrieve all active members of an org with their roles. Requires any active membership in the org.

**Input**:
```typescript
{ orgSlug: string }
```

**Output** (success):
```typescript
{
  success: true
  members: Array<{
    memberId: string      // org_membership.id
    userId: string
    email: string
    displayName: string   // user_profile.display_name or email local-part
    role: OrgRole
    joinedAt: string      // ISO 8601
  }>
}
```

**Output** (error):
```typescript
{ success: false; error: 'UNAUTHORIZED' }  // no active session or not a member
{ success: false; error: 'NOT_FOUND' }     // org slug does not exist
```

**Permission required**: Any active org membership (no specific permission gate — all members can view the member list).

**DB queries**:
1. Session → `user_id`
2. `org_membership JOIN organization` (by slug) → verify caller is a member, get `org_id`
3. `org_membership JOIN user LEFT JOIN user_profile` (by `org_id`) → member list

---

## `changeMemberRoleServerFn`

**Method**: POST
**Purpose**: Change the role of an existing org member.

**Input**:
```typescript
{
  orgSlug: string
  memberId: string   // org_membership.id of the target
  newRole: OrgRole
}
```

**Output** (success):
```typescript
{ success: true }
```

**Output** (error):
```typescript
{ success: false; error: 'UNAUTHORIZED' }    // no session or not a member
{ success: false; error: 'NOT_FOUND' }       // org or target member not found
{ success: false; error: 'FORBIDDEN' }       // caller lacks 'assign-roles' permission
{ success: false; error: 'INVALID_ROLE' }    // newRole = 'owner' (use transferOwnership instead)
{ success: false; error: 'LAST_OWNER' }      // would leave org with zero owners
```

**Permission required**: `assign-roles`

**Business rules enforced**:
1. `canDo(callerRole, 'assign-roles')` — only Owner and Admin may change roles
2. `newRole !== 'owner'` — Owner promotion is handled by `transferOwnershipServerFn`
3. If target's current role is `'owner'`: COUNT active owners ≥ 2 before allowing demotion (LAST_OWNER guard)

---

## `removeMemberServerFn`

**Method**: POST
**Purpose**: Remove a member from the organization (sets `status = 'inactive'` on the membership).

**Input**:
```typescript
{
  orgSlug: string
  memberId: string   // org_membership.id of the target
}
```

**Output** (success):
```typescript
{ success: true }
```

**Output** (error):
```typescript
{ success: false; error: 'UNAUTHORIZED' }    // no session or not a member
{ success: false; error: 'NOT_FOUND' }       // org or target member not found
{ success: false; error: 'FORBIDDEN' }       // caller lacks 'remove-members' permission, or target is the Owner and caller is not Owner
{ success: false; error: 'LAST_OWNER' }      // target is the last active Owner
```

**Permission required**: `remove-members`

**Business rules enforced**:
1. `canDo(callerRole, 'remove-members')` — only Owner and Admin
2. If target role is `'owner'`: caller must also be `'owner'` (FR-005/FR-006 — Admins cannot remove the Owner)
3. LAST_OWNER guard: if target role is `'owner'`, COUNT active owners ≥ 2 before allowing removal
4. A member may not remove themselves via this function (handled by account deletion flow)

**Storage**: Sets `org_membership.status = 'inactive'` rather than deleting the row (preserves historical data).

---

## `transferOwnershipServerFn`

**Method**: POST
**Purpose**: Transfer the Owner role from the caller to another active member. Caller becomes Admin.

**Input**:
```typescript
{
  orgSlug: string
  newOwnerMemberId: string   // org_membership.id of the member who will become Owner
}
```

**Output** (success):
```typescript
{ success: true }
```

**Output** (error):
```typescript
{ success: false; error: 'UNAUTHORIZED' }    // no session or caller is not a member
{ success: false; error: 'NOT_FOUND' }       // org or target member not found / inactive
{ success: false; error: 'FORBIDDEN' }       // caller is not the Owner
{ success: false; error: 'SELF_TRANSFER' }   // newOwnerMemberId is the caller's own membership
```

**Permission required**: `transfer-ownership` (Owner only)

**Business rules enforced**:
1. `canDo(callerRole, 'transfer-ownership')` — only Owner
2. Target member must be active in the org
3. Self-transfer is rejected
4. Atomic D1 `batch()`: UPDATE new owner to `'owner'` + UPDATE caller to `'admin'` in one batch

---

## `getMemberPermissionsServerFn`

**Method**: GET
**Purpose**: Return the calling user's role and their full permission list for a given org. Used for the "view my role & permissions" story (P3).

**Input**:
```typescript
{ orgSlug: string }
```

**Output** (success):
```typescript
{
  success: true
  role: OrgRole
  permissions: Permission[]   // all permissions granted to this role
}
```

**Output** (error):
```typescript
{ success: false; error: 'UNAUTHORIZED' }   // no session or not a member
{ success: false; error: 'NOT_FOUND' }      // org not found
```

**Permission required**: Active org membership (no specific permission — any member can view their own permissions).

---

## Permission Guard Helper (`src/server/members.ts` — internal)

All server functions share a `requireOrgMembership(env, orgSlug)` helper:

```typescript
// Returns caller's membership context or null
async function requireOrgMembership(
  env: Cloudflare.Env,
  orgSlug: string,
): Promise<{ userId: string; orgId: string; role: OrgRole } | null>
```

- Validates session cookie → `user_id`
- Queries `organization` by slug → `org_id`
- Queries `org_membership` for `(org_id, user_id)` where `status = 'active'`
- Returns combined context or `null` on any failure

Callers check `result === null` and return the appropriate error before proceeding to business logic.
