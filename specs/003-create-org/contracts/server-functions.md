# Server Function Contracts: Organization Creation

**Branch**: `003-create-org` | **Date**: 2026-03-02

These are the TanStack Start `createServerFn` contracts for the organization creation feature.
All functions run server-side on Cloudflare Workers. All inputs and outputs carry explicit
TypeScript types (Principle II). All mutations use `method: 'POST'`; reads use `method: 'GET'`.

Shared types are defined in `src/lib/org.types.ts`.

```typescript
// src/lib/org.types.ts (shared types)

export type OrgRole = 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr';
export type OrgStatus = 'active' | 'inactive';

/** D1 row shape for the `organization` table */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: OrgStatus;
  created_at: string;
}

/** D1 row shape for the `org_membership` table */
export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  status: OrgStatus;
  joined_at: string;
}

/** Shape returned to the client for an organization */
export interface OrgView {
  id: string;
  slug: string;
  name: string;
  plan: string;
  createdAt: string;
}

/** Shape returned to the client for a user's org membership list entry */
export interface OrgMembershipView {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgRole;
}

/** Input for createOrgServerFn */
export interface CreateOrgInput {
  name: string;   // 2–100 chars
  slug: string;   // 2–50 chars, lowercase [a-z0-9-]
}
```

---

## `createOrgServerFn`

**Purpose**: Create a new organization and assign the authenticated user the Owner role.

**Method**: `POST`
**Location**: `src/server/org.ts`

```typescript
// Input:
type CreateOrgInput = {
  name: string;   // required; 2–100 chars
  slug: string;   // required; 2–50 chars; must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$
};

// Output:
type CreateOrgOutput =
  | { success: true; orgSlug: string }
  | {
      success: false;
      error: 'INVALID_INPUT' | 'SLUG_TAKEN' | 'ORG_LIMIT_REACHED';
      field?: 'name' | 'slug';
    };
```

**Behaviour**:
1. Verify an active session exists; return `INVALID_INPUT` if not authenticated (belt-and-suspenders — route guard already checks this)
2. Validate `name` (2–100 chars, non-empty after trim)
3. Validate `slug` (2–50 chars, matches `^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{2}$`)
4. `SELECT COUNT(*) FROM org_membership WHERE user_id = ?` — if ≥ 10, return `ORG_LIMIT_REACHED`
5. `env.DB.batch([INSERT organization, INSERT org_membership(role='owner')])` — atomic
6. If D1 throws a UNIQUE constraint error on `slug`, return `SLUG_TAKEN`
7. Return `{ success: true, orgSlug: slug }`

**Client usage**:
```typescript
const result = await createOrgServerFn({ data: { name, slug } });
if (result.success) {
  await navigate({ to: '/orgs/$orgSlug', params: { orgSlug: result.orgSlug } });
}
```

---

## `getOrgServerFn`

**Purpose**: Load an organization by slug and verify the current user is a member. Used in the org workspace layout's `beforeLoad` hook.

**Method**: `GET`
**Location**: `src/server/org.ts`

```typescript
// Input:
type GetOrgInput = {
  slug: string;   // required; the URL slug of the organization
};

// Output:
type GetOrgOutput =
  | { success: true; org: OrgView; userRole: OrgRole }
  | { success: false; error: 'NOT_FOUND' | 'UNAUTHORIZED' };
```

**Behaviour**:
1. Verify an active session exists; return `UNAUTHORIZED` if not
2. `SELECT * FROM organization WHERE slug = ? AND status = 'active'` — return `NOT_FOUND` if missing
3. `SELECT role FROM org_membership WHERE org_id = ? AND user_id = ? AND status = 'active'` — return `UNAUTHORIZED` if not a member
4. Return `{ success: true, org: OrgView, userRole }`

**Route usage** (in `orgs.$orgSlug.tsx` `beforeLoad`):
```typescript
beforeLoad: async ({ params }) => {
  const result = await getOrgServerFn({ data: { slug: params.orgSlug } });
  if (!result.success) throw redirect({ to: '/home' });
  return { org: result.org, userRole: result.userRole };
}
```

---

## `listUserOrgsServerFn`

**Purpose**: Return all organizations the current user belongs to, with their role in each. Used to populate an org switcher and to check whether the creation limit has been reached.

**Method**: `GET`
**Location**: `src/server/org.ts`

```typescript
// Input: none (reads session from cookie)

// Output:
type ListUserOrgsOutput =
  | { success: true; orgs: OrgMembershipView[]; atLimit: boolean }
  | { success: false; error: 'UNAUTHORIZED' };
```

**Behaviour**:
1. Verify an active session exists; return `UNAUTHORIZED` if not
2. `SELECT o.id, o.slug, o.name, m.role FROM organization o JOIN org_membership m ON o.id = m.org_id WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active' ORDER BY m.joined_at ASC`
3. Return `{ success: true, orgs: [...], atLimit: orgs.length >= 10 }`

**Client usage** (in `create-org.tsx` route loader):
```typescript
loader: async () => {
  const result = await listUserOrgsServerFn();
  if (!result.success) throw redirect({ to: '/login', search: { ... } });
  if (result.atLimit) throw redirect({ to: '/home' }); // or show limit-reached page
  return { atLimit: result.atLimit };
}
```
