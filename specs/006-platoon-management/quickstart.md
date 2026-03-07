# Quickstart: Platoon Management (006-platoon-management)

## Prerequisites

- Feature branch `006-platoon-management` checked out
- D1 database running locally (`wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql`)
- At least one org with staff members (005-staff-management complete)

## Apply Schema Changes

```bash
wrangler d1 execute scheduler-auth --local \
  --command "
    CREATE TABLE IF NOT EXISTS platoon (
      id TEXT NOT NULL PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      shift_label TEXT NOT NULL,
      rrule TEXT NOT NULL,
      start_date TEXT NOT NULL,
      description TEXT,
      color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_org_name ON platoon(org_id, LOWER(name));
    CREATE INDEX IF NOT EXISTS idx_platoon_org ON platoon(org_id);

    CREATE TABLE IF NOT EXISTS platoon_membership (
      id TEXT NOT NULL PRIMARY KEY,
      platoon_id TEXT NOT NULL REFERENCES platoon(id) ON DELETE CASCADE,
      staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_membership_staff ON platoon_membership(staff_member_id);
    CREATE INDEX IF NOT EXISTS idx_platoon_membership_platoon ON platoon_membership(platoon_id);
  "
```

## Dev Server

```bash
npm run dev   # http://localhost:3000
```

## Key URLs

| URL | What to test |
|---|---|
| `/orgs/:slug/platoons` | Platoon list; create form for manager+ |
| `/orgs/:slug/platoons/:id` | Platoon detail; assign/remove members; edit/delete for manager+ |

## Test Checklist

- [ ] Employee sees platoon list (no write controls)
- [ ] Manager creates platoon with valid RRULE
- [ ] Invalid RRULE rejected with error
- [ ] Duplicate name rejected
- [ ] Assign member → member appears in detail
- [ ] Assign same member to second platoon → movedFrom returned; confirmation shown
- [ ] Remove member → member count decrements; staff roster intact
- [ ] Delete platoon → platoon gone; members in roster unaffected

## Run Tests

```bash
npm run test
```
