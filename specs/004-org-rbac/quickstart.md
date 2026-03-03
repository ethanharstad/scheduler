# Quickstart: Adding Permission-Gated Features

**Branch**: `004-org-rbac` | **Date**: 2026-03-03

This guide explains how to use the RBAC system introduced in `004-org-rbac` when adding new permission-gated features to the scheduler.

---

## 1. Add a New Permission (if needed)

Edit `src/lib/rbac.ts` and add the new permission to the `Permission` union type:

```typescript
export type Permission =
  | 'view-org-settings'
  | 'my-new-permission'   // ← add here
  // ...
```

Then update `ROLE_PERMISSIONS` to map the appropriate roles:

```typescript
const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner:      new Set([..., 'my-new-permission']),
  admin:      new Set([..., 'my-new-permission']),
  manager:    new Set([...]),  // no access
  employee:   new Set([...]),  // no access
  payroll_hr: new Set([...]),  // no access
}
```

TypeScript will fail at build time if you misspell a permission name.

---

## 2. Guard a Server Function

In your server function handler, call `requireOrgMembership` (from `src/server/members.ts`) then check the permission:

```typescript
import { requireOrgMembership } from '@/server/members'
import { canDo } from '@/lib/rbac'

export const myMutationServerFn = createServerFn({ method: 'POST' })
  .inputValidator((d: MyInput) => d)
  .handler(async (ctx) => {
    const { data } = ctx
    const env = ctx.context as unknown as Cloudflare.Env

    const membership = await requireOrgMembership(env, data.orgSlug)
    if (!membership) return { success: false, error: 'UNAUTHORIZED' }

    if (!canDo(membership.role, 'my-new-permission')) {
      return { success: false, error: 'FORBIDDEN' }
    }

    // ... business logic using membership.userId and membership.orgId
  })
```

---

## 3. Guard a Route (`beforeLoad`)

To block navigation to a route entirely, use the `userRole` already in route context:

```typescript
import { canDo } from '@/lib/rbac'

export const Route = createFileRoute('/_protected/orgs/$orgSlug/my-feature')({
  beforeLoad: ({ context }) => {
    if (!canDo(context.userRole, 'my-new-permission')) {
      throw redirect({ to: '/orgs/$orgSlug' })
    }
  },
  component: MyFeature,
})
```

---

## 4. Conditionally Render UI Controls

Use `canDo` in components to show/hide controls. The `userRole` is available from route context:

```typescript
import { useRouteContext } from '@tanstack/react-router'
import { canDo } from '@/lib/rbac'

function MyFeatureComponent() {
  const { userRole } = useRouteContext({ from: '/_protected/orgs/$orgSlug' })

  return (
    <div>
      {canDo(userRole, 'my-new-permission') && (
        <button>Privileged Action</button>
      )}
    </div>
  )
}
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/rbac.ts` | Permission type, role matrix, `canDo()` |
| `src/server/members.ts` | `requireOrgMembership()` helper + member management fns |
| `src/routes/_protected/orgs.$orgSlug/members.tsx` | Members management page (reference implementation) |
