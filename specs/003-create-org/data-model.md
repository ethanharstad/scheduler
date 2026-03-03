# Data Model: Organization Creation

**Branch**: `003-create-org` | **Date**: 2026-03-02

---

## New Tables

### `organization`

Top-level tenant. Every other data record in the system references an `organization.id`.

```sql
CREATE TABLE IF NOT EXISTS organization (
  id          TEXT NOT NULL PRIMARY KEY,   -- crypto.randomUUID()
  slug        TEXT NOT NULL UNIQUE,        -- 2-50 chars, lowercase [a-z0-9-], no leading/trailing hyphens
  name        TEXT NOT NULL,               -- 2-100 chars, display name
  plan        TEXT NOT NULL DEFAULT 'free',-- 'free' (only value for now; Phase 8 adds more)
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' (deletion deferred; reserved for future admin feature)
  created_at  TEXT NOT NULL                -- ISO 8601
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_slug       ON organization(slug);
CREATE        INDEX IF NOT EXISTS idx_org_status     ON organization(status);
```

**Field notes**:
- `slug`: globally unique, immutable after creation (changing slugs breaks bookmarked URLs — slug rename is a future feature)
- `plan`: reserved field; always `'free'` until Phase 8 billing is implemented
- `status`: reserved field; always `'active'` — org deletion/deactivation is out of scope for this feature

---

### `org_membership`

Join table between `user` and `organization`. Tracks which users belong to which org and in what role.

```sql
CREATE TABLE IF NOT EXISTS org_membership (
  id          TEXT NOT NULL PRIMARY KEY,   -- crypto.randomUUID()
  org_id      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,               -- 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive'
  joined_at   TEXT NOT NULL                -- ISO 8601
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON org_membership(org_id, user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_user   ON org_membership(user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_org    ON org_membership(org_id);
```

**Field notes**:
- `(org_id, user_id)` unique constraint: a user can hold at most one membership per organization
- `role`: stored as lowercase snake_case string; only `'owner'` is assigned in this feature; other roles used by future staff-management features
- `status`: reserved for soft-deactivation of members (future staff-management feature); always `'active'` at creation time

---

## Relationships

```text
user (existing)
  └──< org_membership >──  organization
         role, status            slug, name, plan
```

- One `user` → many `org_membership` rows (one per org they belong to)
- One `organization` → many `org_membership` rows (one per member)
- `org_membership` rows cascade-delete when either parent is deleted

---

## Invariants

1. Every `organization` row MUST have at least one `org_membership` row with `role = 'owner'` and `status = 'active'` at all times. This invariant is established at creation via an atomic batch INSERT.
2. A user MAY NOT hold more than 10 `org_membership` rows (any role, any org). Enforced in `createOrgServerFn` before insertion.
3. `organization.slug` MUST match `^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$` or `^[a-z0-9]{2,50}$`. Validated in the server function before insertion.

---

## Migration

Apply to the local D1 instance:

```bash
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
```

Apply to the remote (production) D1 instance:

```bash
wrangler d1 execute scheduler-auth --file=src/db/schema.sql
```

The new `CREATE TABLE IF NOT EXISTS` statements are additive and safe to run against an existing database.
