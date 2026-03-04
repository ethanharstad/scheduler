# Server Function Contracts: Staff Member Management

**Branch**: `005-staff-management` | **Date**: 2026-03-03
**File**: `src/server/staff.ts`

All functions use TanStack Start `createServerFn`. Auth is enforced via the `requireOrgMembership()` helper from `src/server/members.ts`. All inputs and outputs carry explicit TypeScript types (Constitution Principle II).

---

## `listStaffServerFn`

**Method**: GET
**Auth**: Any active org member
**Permission**: none (all members can view)

**Input**:
```typescript
{ orgSlug: string }
```

**Output**:
```typescript
| { success: true; members: StaffMemberView[] }
| { success: false; error: 'UNAUTHORIZED' }
```

**Behavior**: Returns all staff_member rows for the org with status != 'removed', sorted by name. Joins user_profile for display names where user_id is set.

---

## `addStaffMemberServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `invite-members`

**Input**:
```typescript
{
  orgSlug: string
  name: string           // 1–100 chars
  email?: string         // optional; required if phone not provided
  phone?: string         // optional; required if email not provided
  role: OrgRole          // defaults to 'employee' if not specified
}
```

**Output**:
```typescript
| { success: true; member: StaffMemberView }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'DUPLICATE_EMAIL' | 'CONTACT_REQUIRED' }
```

**Behavior**:
1. Validates name + at least one contact field.
2. Checks for duplicate email within org (if email provided).
3. If email matches an existing registered user → creates staff_member with status='active' and inserts org_membership (if not already a member).
4. Otherwise → creates staff_member with status='roster_only'.
5. Inserts `staff_audit_log` entry with action='member_added'.

---

## `inviteStaffMemberServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `invite-members`

**Input**:
```typescript
{
  orgSlug: string
  staffMemberId: string   // must be roster_only status
}
```

**Output**:
```typescript
| { success: true }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_EMAIL' | 'ALREADY_ACTIVE' | 'ALREADY_PENDING' }
```

**Behavior**:
1. Verifies staff member exists, belongs to org, has an email, and is roster_only.
2. Generates a 32-byte cryptographically random token (Web Crypto API).
3. Inserts staff_invitation (status='pending', expires_at = now + 7 days).
4. Updates staff_member.status = 'pending'.
5. Sends invitation email via Resend API with the join link.
6. Inserts audit log entry with action='invitation_sent'.

---

## `cancelInvitationServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `invite-members`

**Input**:
```typescript
{ orgSlug: string; staffMemberId: string }
```

**Output**:
```typescript
| { success: true }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_PENDING_INVITATION' }
```

**Behavior**:
1. Finds pending invitation for the staff member.
2. Sets staff_invitation.status = 'cancelled'.
3. Sets staff_member.status = 'roster_only'.
4. Inserts audit log entry with action='invitation_cancelled'.

---

## `resendInvitationServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `invite-members`

**Input**:
```typescript
{ orgSlug: string; staffMemberId: string }
```

**Output**:
```typescript
| { success: true }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_PENDING_INVITATION' }
```

**Behavior**: Atomic batch —
1. Sets current pending invitation to status='cancelled'.
2. Inserts new invitation with fresh token and new expiry.
3. Sends new invitation email.
4. Inserts audit log entry with action='invitation_resent'.

---

## `changeStaffRoleServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `assign-roles`

**Input**:
```typescript
{ orgSlug: string; staffMemberId: string; newRole: OrgRole }
```

**Output**:
```typescript
| { success: true }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_ROLE' | 'OWNER_TRANSFER_REQUIRED' }
```

**Behavior**:
1. Validates new role is a valid OrgRole.
2. Prevents changing the Owner role without transfer (existing logic from 004-org-rbac).
3. Atomic batch: updates staff_member.role AND org_membership.role (if active member).
4. If the member has a linked user account (active): `DELETE FROM session WHERE user_id = ?` to invalidate all sessions.
5. Inserts audit log entry with action='role_changed', metadata=`{from, to}`.

---

## `removeStaffMemberServerFn`

**Method**: POST
**Auth**: Admin or owner
**Permission**: `remove-members`

**Input**:
```typescript
{ orgSlug: string; staffMemberId: string }
```

**Output**:
```typescript
| { success: true }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'LAST_OWNER' }
```

**Behavior**:
1. Prevents removing the last active owner.
2. Atomic batch:
   - Sets staff_member.status = 'removed'.
   - If active member: sets org_membership.status = 'inactive'.
   - If pending invitation: sets staff_invitation.status = 'cancelled'.
3. If the member has a linked user account: `DELETE FROM session WHERE user_id = ?`.
4. Inserts audit log entry with action='member_removed'.

---

## `getInvitationByTokenServerFn`

**Method**: GET
**Auth**: None (public)

**Input**:
```typescript
{ token: string }
```

**Output**:
```typescript
| { success: true; invitation: InvitationView }
| { success: false; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' }
```

**Behavior**: Used by the `join.$token` route loader to validate and display invitation details before the user registers or logs in.

---

## `acceptInvitationServerFn`

**Method**: POST
**Auth**: None required (public endpoint)

**Input**:
```typescript
{
  token: string
  // Registration path (no existing account):
  name?: string
  password?: string
  // Login path (existing account): session cookie present — no extra fields needed
}
```

**Output**:
```typescript
| { success: true; orgSlug: string }   // redirect target
| { success: false; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'VALIDATION_ERROR' | 'EMAIL_TAKEN' }
```

**Behavior — three cases**:

**Case 1: Invitee has no account**
1. Validate token, name, password.
2. Create user row (hashed password, verified=1 since invited via email).
3. Insert org_membership with the staff_member's role.
4. Update staff_member: status='active', user_id=new user id.
5. Set staff_invitation.status = 'accepted'.
6. Create session and set cookie.
7. Insert audit log: action='invitation_accepted'.

**Case 2: Invitee has existing account (already logged in)**
1. Validate token.
2. Verify logged-in user's email matches invitation email.
3. Insert org_membership (if not already a member).
4. Update staff_member: status='active', user_id=existing user id.
5. Set staff_invitation.status = 'accepted'.
6. Insert audit log: action='member_linked'.

**Case 3: Invitee has existing account (not logged in)**
- Handled entirely client-side: show login form; on successful login re-submit token → falls into Case 2.

---

## `getStaffAuditLogServerFn`

**Method**: GET
**Auth**: Admin or owner
**Permission**: `assign-roles`

**Input**:
```typescript
{ orgSlug: string; limit?: number; offset?: number }
```

**Output**:
```typescript
| { success: true; entries: StaffAuditEntry[]; total: number }
| { success: false; error: 'UNAUTHORIZED' | 'FORBIDDEN' }
```

**Behavior**: Returns audit log entries for the org in reverse chronological order. Joins staff_member and user/user_profile for display names. Default limit: 50.
