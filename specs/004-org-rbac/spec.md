# Feature Specification: Organization Role-Based Access Control

**Feature Branch**: `004-org-rbac`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: "Role Based Authentication System for mapping permissions to users at an organization level."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Manages Member Roles (Priority: P1)

An organization administrator needs to control what each member can do within the organization. They can assign or change any member's role (except promoting someone to Owner), and the system immediately reflects that change in what that member can access.

**Why this priority**: Role assignment is the core capability of RBAC. Without it, permissions cannot be meaningfully controlled. Every other story depends on this existing.

**Independent Test**: Can be fully tested by logging in as an admin, navigating to the member list, changing a member's role, then verifying the member's accessible features have changed accordingly.

**Acceptance Scenarios**:

1. **Given** an admin is viewing the organization member list, **When** they change a member's role from Employee to Manager, **Then** the member's role is updated immediately and they gain access to Manager-level features
2. **Given** an admin is viewing the organization member list, **When** they attempt to assign the Owner role, **Then** the system prevents this action and displays an explanation that only the current Owner can transfer ownership
3. **Given** a Manager is viewing the organization member list, **When** they attempt to change another member's role, **Then** the system denies the action and displays an access denied message
4. **Given** an admin changes a member's role, **When** that member is currently logged in, **Then** their access is updated without requiring them to log out and back in

---

### User Story 2 - System Enforces Permissions on Protected Features (Priority: P2)

When a member attempts to access a feature or perform an action they are not authorized for, the system prevents the action and provides a clear message. Members only see navigation options and controls they are permitted to use.

**Why this priority**: Permission enforcement is the fundamental security guarantee of RBAC. Without enforcement, role assignment has no effect. This must work correctly before any other stories deliver value.

**Independent Test**: Can be tested by logging in as an Employee and attempting to navigate to admin-only areas — the system should block access and show appropriate messaging.

**Acceptance Scenarios**:

1. **Given** an Employee is logged in, **When** they attempt to navigate to a schedule management page (create/edit), **Then** they are redirected away with an access denied message
2. **Given** a Manager is logged in, **When** they attempt to access billing settings, **Then** the system denies access and explains they lack the required permission
3. **Given** a Payroll HR member is logged in, **When** they navigate the application, **Then** they see payroll and HR features but not general admin features
4. **Given** any member is logged in, **When** they use the navigation, **Then** only navigation items they have permission to access are shown

---

### User Story 3 - Member Views Their Own Role and Permissions (Priority: P3)

A member can see what role they hold within their organization and understand what that role allows them to do. This transparency reduces confusion and support requests when members encounter access denied messages.

**Why this priority**: Transparency about permissions helps members understand their access level and reduces friction. Lower priority than enforcement because the system works correctly without it, but it significantly improves user experience.

**Independent Test**: Can be tested by logging in as any member and viewing the organization profile or settings page — the member's role and a summary of their permissions are visible.

**Acceptance Scenarios**:

1. **Given** a member is viewing their organization profile, **When** they look at their membership details, **Then** they see their current role clearly labeled
2. **Given** a member receives an access denied message, **When** they follow the provided link, **Then** they are taken to a page that explains their role and what permissions it includes

---

### User Story 4 - Owner Transfers Ownership (Priority: P4)

The organization owner can transfer the Owner role to another existing member, at which point the original owner becomes an Admin. This supports succession planning and team restructuring.

**Why this priority**: Ownership transfer is an infrequent but critical operation. Without it, organizations are permanently locked to the founding owner's account. Lower priority because it is rarely needed and the system remains functional without it.

**Independent Test**: Can be tested by logging in as an Owner, initiating an ownership transfer to another member, confirming the transfer, and verifying the new Owner has full access while the original owner now has Admin access.

**Acceptance Scenarios**:

1. **Given** the Owner is viewing the member list, **When** they select a member and choose "Transfer Ownership," **Then** the system prompts for confirmation before proceeding
2. **Given** the Owner confirms the ownership transfer, **When** the transfer completes, **Then** the selected member now holds the Owner role and the original owner is downgraded to Admin
3. **Given** a non-Owner member is logged in, **When** they view the member list, **Then** the "Transfer Ownership" option is not available to them
4. **Given** an Owner attempts to transfer ownership to themselves, **Then** the system prevents this action

---

### Edge Cases

- What happens when the sole Owner of an organization is removed? — The system must prevent removing the last Owner from an organization.
- What happens when a user's role changes mid-session while they are actively using a protected feature? — Permission checks are applied on the next request or page navigation; the member may complete their current action but is blocked on the next protected action.
- What happens if a member is both an Employee in one organization and an Admin in another? — Permissions are strictly scoped to each organization; membership in one does not affect the other.
- What happens when a member with active scheduled shifts has their role changed? — Existing scheduled data is retained; only future permission-gated actions are affected.
- What if the Owner account is deleted (from 001-user-auth flow)? — Account deletion must be blocked if the user is the sole Owner of any active organization.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a fixed set of roles for organization members: Owner, Admin, Manager, Employee, and Payroll HR
- **FR-002**: System MUST define a fixed set of feature-level permissions and map each role to its permitted set of features
- **FR-003**: System MUST enforce permission checks before allowing access to any permission-gated feature or action
- **FR-004**: System MUST display only navigation items and action controls that the current member has permission to access
- **FR-005**: Admins MUST be able to change any member's role to any role except Owner, including changing the role of other Admins; Admins MUST also be able to remove any member except the Owner
- **FR-006**: Only the current Owner MUST be able to assign the Owner role (via ownership transfer)
- **FR-007**: The system MUST prevent an organization from existing with zero Owners
- **FR-008**: Ownership transfer MUST require explicit confirmation before taking effect
- **FR-009**: Upon ownership transfer, the previous Owner MUST automatically be assigned the Admin role
- **FR-010**: Members MUST be able to view their own current role within each organization they belong to
- **FR-011**: Permission checks MUST be applied at the server level, not only in the user interface
- **FR-012**: The member's role MUST be stored in their session record and used for permission checks on each request; when a role change is saved, only sessions where the affected member is currently acting in the context of the changed organization MUST be invalidated, so their next request reloads the updated role; sessions in other organizations are unaffected
- **FR-013**: System MUST prevent account deletion for users who are the sole Owner of any active organization

### Role-Permission Matrix

| Feature Area | Owner | Admin | Manager | Employee | Payroll HR |
|---|---|---|---|---|---|
| View organization settings | ✓ | ✓ | — | — | — |
| Edit organization settings | ✓ | ✓ | — | — | — |
| Manage billing | ✓ | — | — | — | — |
| Invite / remove members | ✓ | ✓ | — | — | — |
| Assign member roles | ✓ | ✓ | — | — | — |
| Transfer ownership | ✓ | — | — | — | — |
| Create / edit schedules | ✓ | ✓ | ✓ | — | — |
| View schedules | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve time-off requests | ✓ | ✓ | ✓ | — | — |
| Submit time-off requests | ✓ | ✓ | ✓ | ✓ | ✓ |
| View reports | ✓ | ✓ | ✓ | — | ✓ |
| Access payroll / HR features | ✓ | — | — | — | ✓ |

### Key Entities

- **Role**: A named position within an organization that determines a member's access level. Fixed set: Owner, Admin, Manager, Employee, Payroll HR. Each role has an implicit hierarchy for display and validation purposes (Owner > Admin > Manager ≥ Employee / Payroll HR).
- **Permission**: A specific, named capability granting access to a feature area or action (e.g., "manage-billing", "create-schedules"). Permissions are predefined by the system and cannot be customized by organizations.
- **Role-Permission Mapping**: The system-defined assignment of which permissions each role holds. This is not user-configurable in this release.
- **Membership** (existing, `org_membership`): Associates a user with an organization and carries the user's role for that organization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can view the member list, change a member's role, and have the change take effect in under 30 seconds end-to-end
- **SC-002**: 100% of permission-gated features are blocked at the server level when accessed without sufficient role — no client-side-only enforcement gaps
- **SC-003**: Members attempting to access a feature they lack permission for always receive a clear, actionable message (not a generic error) explaining why access was denied
- **SC-004**: Navigation menus display only the items relevant to the current member's role, with zero unauthorized menu items visible
- **SC-005**: Ownership transfer completes in a single session with no more than two confirmation steps
- **SC-006**: An organization can never reach a state of zero Owners as a result of any role management operation

## Clarifications

### Session 2026-03-03

- Q: Can an Admin manage (change role of, or remove) another Admin? → A: Yes — Admins can manage any member including other Admins; only the Owner role is off-limits for assignment by Admins.
- Q: Where does the system read the member's role when checking permissions on each request? → A: Role is stored in the session record; when a role change occurs, the affected member's session(s) are invalidated, forcing a fresh role load on their next request.
- Q: Should Payroll HR members be able to submit time-off requests? → A: Yes — Payroll HR are still employees and must be able to submit their own time-off requests.
- Q: Can an Admin remove another Admin from the organization? → A: Yes — Admins can remove any member except the Owner (mirrors role-change rule).
- Q: When a role change invalidates the affected member's sessions, should it affect all sessions or only those in the context of the changed organization? → A: Only sessions in the context of the affected organization should be invalidated; sessions in other organizations are unaffected.

## Assumptions

- Roles are predefined and fixed for this release; custom org-defined roles are out of scope.
- One role per membership: a user holds exactly one role per organization.
- Permissions are feature-level (can access a feature area: yes/no), not record-level (e.g., "can edit shift X but not shift Y").
- The existing `OrgRole` type (`owner | admin | manager | employee | payroll_hr`) maps directly to the five roles in this spec.
- The Payroll HR role is a lateral specialist role, not a managerial role — it has access to payroll/HR features that Managers lack, but cannot manage schedules or approve time-off. Payroll HR members can submit their own time-off requests like any other employee.
- The member's role is stored in their session record for efficient per-request permission checks. A role change invalidates only the affected member's sessions associated with the changed organization; sessions in other organizations are unaffected.
- Audit logging of role changes is out of scope for this release but should be considered in a future iteration.

## Out of Scope

- Department-level or station-level roles (future: department/station RBAC)
- Custom organization-defined roles or permissions
- Record-level permissions (e.g., per-shift or per-document access control)
- Audit log / history of role changes
- Bulk role assignment
