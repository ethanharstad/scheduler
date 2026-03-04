# Feature Specification: Staff Member Management

**Feature Branch**: `005-staff-management`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Staff member management including setting member roles, inviting members, removing members. Additionally it is a valid use case to have members who do not have user accounts."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Staff Roster Without User Accounts (Priority: P1)

An organization administrator maintains a roster of all staff members, including people who have not yet created accounts. For example, a fire department chief can add a new recruit's name and contact information to the roster before that recruit ever signs up. The system tracks these "roster-only" staff members separately from full account holders, allowing the organization to maintain an accurate headcount and assign roles even when not everyone uses the software.

**Why this priority**: This is the foundational capability that distinguishes this feature from existing org membership. Without it, the remaining stories have no unique value. It enables organizations to keep accurate personnel records regardless of technology adoption.

**Independent Test**: An admin can add a staff member (name + at least one contact field), view them in the staff list labeled as having no account, and remove them — all without the person ever having a user account.

**Acceptance Scenarios**:

1. **Given** an org admin is on the staff management page, **When** they add a new staff member with a name and at least one contact field (email or phone), **Then** the person appears in the staff roster with a status indicating they have no linked account.
1a. **Given** an admin attempts to add a staff member with a name but no contact field, **When** they submit, **Then** the system rejects the entry with a clear validation error.
2. **Given** a roster-only staff member exists, **When** an admin views the staff list, **Then** the member is clearly distinguished from account-holding members.
3. **Given** a roster-only staff member exists, **When** an admin removes them and confirms, **Then** they are immediately removed from the roster.
4. **Given** an admin provides an email address for a roster-only staff member, **When** the same email already belongs to a registered user account, **Then** the system links the staff record to the existing account automatically rather than creating a separate entry.

---

### User Story 2 - Invite Staff Members to Create Accounts (Priority: P2)

An administrator wants to bring staff members onto the platform. When a staff member's email is known (either on an existing roster record or entered fresh), the admin can send them an invitation email. The invitee follows a link to register, and their account becomes linked to the organization automatically.

**Why this priority**: Invitation is the primary mechanism for growing the active user base within an organization. It bridges the gap between roster-only records and active account holders.

**Independent Test**: An admin sends an invitation to an email address, the recipient follows the link and registers, and the new user appears in the staff list as an active account holder.

**Acceptance Scenarios**:

1. **Given** an admin initiates an invitation for a new email address, **When** they confirm, **Then** an invitation email is sent and the person appears in the staff list with a "pending invitation" status.
2. **Given** a pending invitation exists, **When** the invitee registers via the invitation link, **Then** their account is linked to the organization and their status changes to active.
3. **Given** a pending invitation exists, **When** the admin cancels it, **Then** the invitation is invalidated and the invitation link no longer works.
4. **Given** a pending invitation has not been accepted, **When** the admin chooses to resend it, **Then** a new invitation email is sent and the previous link is invalidated.
5. **Given** a roster-only member with a known email receives an invitation and registers, **When** registration is complete, **Then** their existing roster record is linked to their new account with no duplicate entry created.

---

### User Story 3 - Assign and Change Staff Roles (Priority: P3)

An organization admin or owner can assign a role to any staff member, whether or not they have a user account. For account holders, the role governs their access and permissions within the organization. For roster-only members, the role is recorded for organizational record-keeping and will be applied if they later link an account.

**Why this priority**: Role assignment is needed for both access control and organizational record-keeping, but requires the roster to exist first (P1) and is enhanced by account linking (P2).

**Independent Test**: An admin changes a staff member's role; the new role is reflected immediately in the staff list, and (for account holders) their permissions are updated accordingly.

**Acceptance Scenarios**:

1. **Given** a staff member exists (with or without an account), **When** an admin assigns or changes their role, **Then** the role is saved and visible on the staff list immediately.
2. **Given** an account-holding member has their role changed to one with fewer permissions, **When** the change is saved, **Then** their active sessions are invalidated and their access is restricted to the new role upon next login.
3. **Given** a member currently holds the Owner role, **When** an admin attempts to change their role, **Then** the system requires ownership to be transferred first before the role can be changed.
4. **Given** a roster-only member has a role assigned, **When** they later link a user account (via invitation), **Then** their assigned role is applied to their account.

---

### User Story 4 - Remove Staff Members (Priority: P4)

An admin can remove a staff member from the organization, whether they have an account or not. Removing a member with an account revokes their access to the organization but does not delete their user account. Removing a roster-only member deletes their record. A confirmation step is required before any removal takes effect.

**Why this priority**: Removal is an important management capability but is lower priority than the additive flows that build the roster.

**Independent Test**: An admin removes both an account-holder and a roster-only staff member, confirms the prompt each time, and neither appears in the staff list afterward.

**Acceptance Scenarios**:

1. **Given** an account-holding staff member exists, **When** an admin removes them and confirms, **Then** they lose access to the organization immediately, all their active sessions are invalidated, and they no longer appear in the staff list (their user account is preserved).
2. **Given** a roster-only staff member exists, **When** an admin removes them and confirms, **Then** the record is deleted.
3. **Given** an admin initiates removal, **When** the confirmation prompt appears, **Then** the admin can cancel without any changes being made.
4. **Given** a member holds the Owner role, **When** removal is attempted, **Then** the system prevents removal until ownership is transferred to another member.

---

### Edge Cases

- What happens if an invitation email bounces or fails to deliver? The system should surface an error and allow the admin to correct the address or retry.
- What happens if an invited person already has an account with that email? The system should link their existing account to the organization rather than asking them to register again.
- What happens if an admin tries to add a staff member with an email already on the roster? The system should prevent duplicate entries and surface a clear error.
- What happens to pending invitations when the admin who sent them is removed before acceptance? Pending invitations remain valid; other admins or the owner can manage them.
- What if an invitation link is accessed after the invitation was cancelled or expired? The system displays an informative error and the registration does not proceed.
- What if there is only one member in the organization and they are the Owner? The system should warn but not block removal (the organization can become ownerless rather than trapping the last member).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Administrators MUST be able to add a staff member to the organization roster by providing a name plus at least one contact field (email or phone). Both contact fields are not required simultaneously, but at least one must be provided.
- **FR-002**: The system MUST clearly distinguish between staff members who have linked user accounts and those who do not (roster-only) across all views.
- **FR-003**: Administrators MUST be able to send an email invitation to a staff member by email address, resulting in a "pending invitation" entry on the roster.
- **FR-004**: The system MUST allow an invitee to complete registration and become a linked account holder via their unique invitation link.
- **FR-005**: The system MUST prevent an invitation link from being reused after it has been accepted, cancelled, or expired.
- **FR-006**: Administrators MUST be able to cancel a pending invitation at any time before acceptance.
- **FR-007**: Administrators MUST be able to resend an invitation to a pending invitee, invalidating the previous link and issuing a new one.
- **FR-008**: Administrators MUST be able to assign a role to any staff member (account holder or roster-only).
- **FR-009**: Administrators MUST be able to change a staff member's role at any time, subject to ownership transfer rules. For account-holding members, all active sessions MUST be invalidated when their role changes so that the new permissions apply on their next login.
- **FR-010**: The system MUST prevent removing or demoting the member who holds the Owner role without first transferring ownership.
- **FR-011**: Administrators MUST be able to remove any staff member, with a required confirmation step before the action executes.
- **FR-012**: When a roster-only member's email matches an existing registered user account, the system MUST link the two records automatically rather than creating a duplicate.
- **FR-013**: When a roster-only member accepts an invitation and registers, the system MUST apply their pre-assigned role to their new account.
- **FR-014**: Removing an account-holding member MUST revoke their access to the organization without deleting their underlying user account. All of the member's active sessions within the organization MUST be invalidated immediately upon removal — if they are currently active, they are logged out on their next request.
- **FR-015**: The staff roster MUST be visible to all organization members. Account holders with the standard member role may view the roster in read-only mode; only administrators and owners may make changes (add, invite, change roles, remove).
- **FR-016**: The system MUST record an audit log entry for every staff management action (add, remove, role change, invitation sent, invitation cancelled, invitation resent), capturing the action type, the affected staff member, the administrator who performed it, and the timestamp.
- **FR-017**: Administrators and owners MUST be able to view the audit log for their organization's staff management history.

### Key Entities

- **Staff Member**: Represents a person on the organization's roster. Has a name, optional contact details (email, phone), an assigned role, and a status (roster-only / pending invitation / active). A roster-only or pending member may eventually be linked to a user account.
- **Invitation**: A record of a pending request for someone to join the organization. Associated with a staff member record (or creates one on acceptance), contains an email address, a unique secure token, a sent timestamp, and an expiry. Status: pending → accepted or cancelled.
- **Staff Audit Log Entry**: A record of a management action taken on a staff member. Captures the action type (added, removed, role changed, invitation sent, invitation cancelled, invitation resent), the staff member affected, the administrator who performed it, and a timestamp. Entries are retained indefinitely and are never automatically purged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can add a roster-only staff member and see them in the staff list in under one minute from start to finish.
- **SC-002**: An invitation email is delivered to the invitee within one minute of the admin sending it under normal conditions.
- **SC-003**: An invitee can complete registration via an invitation link and appear as an active staff member in under three minutes.
- **SC-004**: Role changes for account-holding members cause immediate session invalidation — the member's new permissions apply on their next login with no extended delay.
- **SC-005**: Zero duplicate staff records are created when a roster-only member's email matches an existing user account or when an invited member registers.
- **SC-006**: Admins can complete all primary staff management actions (add, invite, change role, remove) without requiring support intervention.

## Clarifications

### Session 2026-03-03

- Q: Should the system record a history of staff management actions (add, remove, role change, invite sent/cancelled)? → A: Yes — record all changes with the acting user and timestamp.
- Q: How should roster-only staff members without email be uniquely identified to prevent duplicates? → A: Require name plus at least one contact field (email or phone); name alone is not sufficient.
- Q: When an account-holding member is removed, how immediately should their access be revoked? → A: All active sessions are invalidated immediately; the member is logged out if currently active.
- Q: How long should staff management audit log entries be retained? → A: Indefinitely — no automatic purge.
- Q: Should a role change (especially demotion) invalidate the affected member's active sessions? → A: Yes — role changes invalidate active sessions; permissions take effect on next login.

## Assumptions

- Invitation emails are sent via the existing email infrastructure already used for auth flows (e.g., email verification from 001-user-auth).
- "Roles" in this feature refer to the organization-level access roles established in the RBAC system (004-org-rbac): owner, admin, member. Custom job titles, ranks, or certifications are out of scope for this feature.
- Invitations expire after 7 days if not accepted, consistent with common industry practice. Admins can resend to generate a new expiry.
- A staff member record can only be in one status at a time: roster-only, pending invitation, or active.
- The feature scope is organization-level staff management. Department or station sub-level staff management is out of scope.

## Dependencies

- **004-org-rbac**: Role definitions and permission enforcement — must be in place for role assignment to be meaningful for account holders.
- **001-user-auth**: User account registration and email infrastructure — invitation registration flow depends on this.
