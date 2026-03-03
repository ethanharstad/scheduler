# Feature Specification: Organization Creation

**Feature Branch**: `003-create-org`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "An authenticated user creates an organization (the top-level tenant), becoming its first Owner. All data in the system is scoped under an org."

## Clarifications

### Session 2026-03-02

- Q: How is an organization identified in the URL — slug-based, ID-based, or session-scoped? → A: Slug-based `/orgs/[slug]/...`; user chooses a unique handle at creation time.
- Q: Is there a rate limit on how many organizations a single user can create? → A: Soft limit of 10 organizations per user; exceeding it requires contacting support.
- Q: Is org deletion or deactivation in scope? → A: Out of scope; org deletion/deactivation is a separate future feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Organization (Priority: P1)

An authenticated user who wants to set up their department on the platform navigates to the "Create Organization" page, fills in the organization's name, and submits the form. The system creates the organization, assigns the user the Owner role, and takes the user into the new organization's workspace.

**Why this priority**: This is the foundational action that enables all other platform functionality. Without an organization, a user cannot access any features. It is the entry point to the entire product.

**Independent Test**: Can be fully tested by an authenticated user submitting the org creation form and verifying they are assigned the Owner role and redirected to the org workspace.

**Acceptance Scenarios**:

1. **Given** an authenticated user has no organization, **When** they submit a valid organization name, **Then** the organization is created, they are assigned the Owner role, and they are directed to the organization's workspace.
2. **Given** an authenticated user already owns one organization, **When** they create a second organization, **Then** the new organization is created independently and the user holds the Owner role in both.
3. **Given** an authenticated user submits the creation form with an empty organization name, **When** the form is submitted, **Then** a clear validation error is shown and no organization is created.
4. **Given** an authenticated user submits the form with a name exceeding the maximum length, **When** the form is submitted, **Then** a validation error indicates the name is too long and no organization is created.
5. **Given** an authenticated user submits the form with a slug that is already taken, **When** the form is submitted, **Then** a validation error indicates the slug is unavailable and no organization is created.
6. **Given** an authenticated user submits the form with a slug containing invalid characters, **When** the form is submitted, **Then** a validation error indicates the slug format requirements and no organization is created.

---

### User Story 2 - Org-Scoped Workspace (Priority: P2)

After creating an organization, the user is placed inside the org's workspace. All actions they take — viewing staff, managing settings, creating departments — are automatically scoped to that organization. If the user belongs to multiple organizations, they can identify which org they are currently working in.

**Why this priority**: Correct data scoping is a foundational data integrity requirement. If data is not reliably scoped, all downstream features (scheduling, compliance, payroll) risk data leakage between tenants.

**Independent Test**: Can be fully tested by verifying that data created within one organization is not visible when operating under a different organization.

**Acceptance Scenarios**:

1. **Given** a user owns two organizations, **When** they are working in Organization A, **Then** data belonging to Organization B is not accessible or visible.
2. **Given** a user is in the org workspace, **When** they view any page, **Then** the current organization's name is clearly displayed so the user always knows which org they are in.

---

### User Story 3 - Owner Role Access (Priority: P3)

Upon creating an organization, the user automatically holds the Owner role with full administrative control. They can access all organization settings, including the ability to invite admins, manage departments, and configure the organization.

**Why this priority**: The Owner role must be established at creation time to ensure there is always at least one privileged user who can manage the organization. Without this, organizations would be orphaned with no one able to administer them.

**Independent Test**: Can be fully tested by verifying the creating user has access to all owner-level capabilities immediately after org creation with no additional steps.

**Acceptance Scenarios**:

1. **Given** a user has just created an organization, **When** they attempt to access organization settings, **Then** they have full access without any additional authorization step.
2. **Given** a user holds the Owner role, **When** another user attempts to access the same organization's settings with a non-Owner role, **Then** their access is limited to what their role permits.

---

### Edge Cases

- What happens if the user's session expires mid-way through the creation form? The form data is lost, no partial organization is created, and the user is redirected to log in.
- What happens if an organization is created but the user immediately closes their browser? The organization persists; the user returns to it upon next login.
- What happens if a user already has 10 organizations and attempts to create another? The creation form is disabled with a message directing them to contact support.
- What if two users simultaneously submit creation forms with the same organization name? Both organizations are created — names are not globally unique identifiers.
- What if a user has no organization and directly navigates to an org-scoped URL? The system redirects them to create or select an organization first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow any authenticated user to create a new organization at any time.
- **FR-002**: System MUST require a non-empty organization name of between 2 and 100 characters.
- **FR-002b**: System MUST require the user to choose a unique organization slug (URL handle) at creation time, consisting of 2–50 lowercase alphanumeric characters and hyphens, with no leading or trailing hyphens.
- **FR-002c**: System MUST reject a slug that is already in use by another organization and prompt the user to choose a different one.
- **FR-002d**: System MUST suggest a default slug derived from the organization name (e.g., spaces replaced with hyphens, special characters removed) to reduce user effort.
- **FR-004**: System MUST automatically assign the creating user the Owner role for the newly created organization upon successful creation.
- **FR-005**: System MUST scope all data records (departments, staff, schedules, settings) to exactly one organization.
- **FR-006**: System MUST redirect the user to the organization's workspace immediately after successful creation.
- **FR-007**: System MUST assign new organizations to the Free plan tier by default, with no payment required at creation time.
- **FR-008**: System MUST allow a single user to be a member (in any role) of more than one organization simultaneously.
- **FR-009**: System MUST prevent unauthenticated users from creating organizations.
- **FR-009b**: System MUST enforce a soft limit of 10 organizations per user. When the limit is reached, the creation form is disabled and the user is shown a message directing them to contact support to increase their limit.
- **FR-010**: System MUST display a clear, actionable error message for each validation failure on the creation form.
- **FR-011**: System MUST clearly indicate to the user which organization they are currently operating in at all times within the org workspace.

### Key Entities

- **Organization**: The top-level tenant unit. Attributes: unique identifier, slug (globally unique URL handle, 2–50 characters, lowercase alphanumeric and hyphens), name (2–100 characters), plan tier (Free by default), creation date, status (Active / Inactive). All other system data belongs to an organization. The org workspace is accessed at `/orgs/[slug]/`.
- **Organization Membership**: The relationship between a user and an organization. Attributes: user reference, organization reference, role (Owner, Admin, Manager, Employee, Payroll/HR), membership status (Active / Inactive), join date. A user may hold memberships in multiple organizations.
- **Owner Role**: A membership role granting unrestricted administrative control over an organization, including the ability to manage settings, billing, and other members' roles. Each organization must have at least one Owner at all times.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authenticated users can complete organization creation in under 90 seconds from navigating to the creation page to arriving in the org workspace.
- **SC-002**: 95% of users successfully complete organization creation on their first attempt without contacting support.
- **SC-003**: 100% of data records in the system are associated with exactly one organization — zero orphaned records exist at any point.
- **SC-004**: The creating user holds the Owner role and has full access to the organization workspace immediately upon creation, with no delay or additional steps.
- **SC-005**: Users belonging to multiple organizations experience zero data cross-contamination between organizations.

## Assumptions

- A user may create and belong to multiple organizations. This supports consultants, administrators managing multiple departments, and multi-agency users.
- Organization names are not globally unique. Two different departments may share the same name without conflict; organizations are distinguished by their system-assigned identifier.
- No setup wizard or guided onboarding flow is included in this feature. Post-creation onboarding (adding departments, inviting staff) is a separate feature.
- Organization deletion and deactivation are out of scope. The Active/Inactive status field on the Organization entity is reserved for a future admin/settings feature. Within this feature, organizations once created remain active indefinitely.
- The Free plan tier grants full feature access for initial setup. Plan-based feature gating is deferred to Phase 8.
- An authenticated user who has no organization membership may be directed to the organization creation page as part of a post-login redirect — this redirect behavior is considered part of a separate onboarding flow feature.
- Departments and stations are not created during this flow; they are added after the organization exists.

## Dependencies

- **001-user-auth**: User authentication must be complete. Users must have an authenticated session to create an organization.
