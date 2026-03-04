# Quickstart: Staff Member Management (005-staff-management)

**Branch**: `005-staff-management`

## Prerequisites

- Features 001-user-auth, 002-user-profile, 003-create-org, and 004-org-rbac must be deployed and their schema applied to D1.
- Resend API key (`RESEND_API_KEY`) must be configured in Cloudflare secrets.

## 1. Apply Database Schema

Add the three new tables to `src/db/schema.sql` and apply via Wrangler:

```bash
# Local development
npx wrangler d1 execute DB --local --file=src/db/schema.sql

# Production
npx wrangler d1 execute DB --remote --file=src/db/schema.sql
```

The new `CREATE TABLE IF NOT EXISTS` statements are idempotent — safe to run against an existing database.

## 2. New Files to Create

| File | Purpose |
|------|---------|
| `src/lib/staff.types.ts` | All TypeScript types for the staff management feature |
| `src/server/staff.ts` | 10 server functions + token generation + session invalidation helpers |
| `src/routes/join.$token.tsx` | Public invitation acceptance route |
| `src/routes/_protected/orgs.$orgSlug/staff.tsx` | Staff roster page |
| `src/routes/_protected/orgs.$orgSlug/staff.audit.tsx` | Audit log page |

## 3. Files to Modify

| File | Change |
|------|--------|
| `src/db/schema.sql` | Add 3 new table definitions |
| `src/routes/_protected/orgs.$orgSlug.tsx` | Add "Staff" nav link |

## 4. Start Dev Server

```bash
npm run dev
```

The route tree (`src/routeTree.gen.ts`) regenerates automatically. Do not edit it manually.

## 5. Key URLs

| URL | Description |
|-----|-------------|
| `/orgs/:slug/staff` | Staff roster (all members) |
| `/orgs/:slug/staff/audit` | Audit log (admin/owner only) |
| `/join/:token` | Invitation acceptance (public) |

## 6. Testing Checklist

- [ ] Add a roster-only member (name + email, name + phone)
- [ ] Attempt to add a member with name only → expect validation error
- [ ] Invite a roster-only member → check email received, status becomes "pending"
- [ ] Accept invitation (new account path) → check user created, org_membership inserted, staff_member linked
- [ ] Accept invitation (existing account path) → check org_membership inserted, no new user created
- [ ] Cancel invitation → check status reverts to roster_only
- [ ] Resend invitation → check old link is invalid, new link works
- [ ] Change role → check both staff_member and org_membership updated; check affected user is logged out
- [ ] Remove account-holding member → check org_membership inactive, sessions deleted, user account preserved
- [ ] Remove roster-only member → check staff_member removed
- [ ] View audit log → verify all above actions are logged with actor, timestamp, and relevant metadata
- [ ] Standard member (employee/manager role) can view staff list but cannot add/invite/change/remove

## 7. Deploy

```bash
npm run deploy
```
