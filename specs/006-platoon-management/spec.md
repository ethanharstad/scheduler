# Feature Specification: Platoon Management

**Feature Branch**: `006-platoon-management`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Allow a user with sufficient permissions to create/edit platoons. Platoons are a scheduling unit for recurring schedules like 24/48, 24/72, or california swing/kelly schedules. Platoons have assigned members. Platoons should be viewable by all employees."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Platoon Roster (Priority: P1)

Any staff member who is logged in can navigate to the platoon list for their organization. They see each platoon's name, schedule pattern (e.g., "24/48"), and member count at a glance. Clicking into a platoon shows the full list of members assigned to it. No controls to create, edit, or remove are shown.

**Why this priority**: Visibility into how the organization is grouped is foundational. Even before management actions are built, all staff benefit from knowing which platoon they and their colleagues are on. This is the core read-only view that every other story builds on.

**Independent Test**: Log in as an employee (no admin privileges), navigate to the platoon section, and confirm the platoon list loads with names and patterns. Click a platoon and confirm the member list is visible. Confirm no add/edit/delete controls appear.

**Acceptance Scenarios**:

1. **Given** an employee is logged in, **When** they navigate to the platoons page, **Then** they see a list of all platoons in their organization, each showing the platoon name, shift label, start date, and member count.
2. **Given** a platoon exists with assigned members, **When** an employee clicks on the platoon, **Then** they see the full list of members assigned to that platoon.
3. **Given** an employee is viewing the platoon list or a platoon detail, **When** they look at the controls available, **Then** no create, edit, or delete options are visible to them.
4. **Given** no platoons have been created for the organization, **When** any member visits the platoon page, **Then** an informative empty state is displayed rather than a blank or broken page.

---

### User Story 2 - Create a Platoon (Priority: P2)

A user with scheduling authority (owner, admin, or manager) creates a new platoon by providing a name, selecting a pattern shortcut (which pre-populates an RRULE template), and supplying a start date. Optionally they can add a short description and a display color to visually distinguish platoons. The new platoon immediately appears in the list.

**Why this priority**: Creation is the prerequisite for all subsequent management actions. Without platoons, there is nothing to view, edit, or assign members to.

**Independent Test**: Log in as a manager, create a platoon named "A Platoon" with shift label "A Shift" using the "24/48" RRULE shortcut and a start date, and confirm it appears immediately in the platoon list showing the name, shift label, and start date.

**Acceptance Scenarios**:

1. **Given** a manager provides a name, shift label, start date, and RRULE (via predefined shortcut or manual entry), **When** they submit the form, **Then** the new platoon appears in the list immediately with the correct name and shift label.
2. **Given** a manager submits the create form without a name, **When** the form is submitted, **Then** a validation error is shown and no platoon is created.
3. **Given** a manager submits the create form without a start date, **When** the form is submitted, **Then** a validation error is shown and no platoon is created.
4. **Given** a platoon already exists with the name "A Shift", **When** a manager tries to create another platoon with the same name in the same organization, **Then** the system rejects it with a clear duplicate-name error.
5. **Given** a manager provides an optional description and color, **When** the platoon is created, **Then** both are saved and displayed on the platoon detail page.
6. **Given** a manager selects "Custom" and enters an invalid RRULE string, **When** they submit the form, **Then** the form is rejected with a clear validation error identifying the RRULE as invalid.
7. **Given** a user with the employee role is logged in, **When** they view the platoon page, **Then** no create button or form is visible or accessible.

---

### User Story 3 - Edit a Platoon (Priority: P3)

An authorized user can update an existing platoon's name, shift label, RRULE, start date, description, or display color. Changes are reflected immediately across all views.

**Why this priority**: Platoon configurations may change over time (e.g., switching from 24/48 to 24/72 when staffing levels change). Edit capability is necessary for ongoing maintenance but less critical than initial creation.

**Independent Test**: Log in as an admin, open an existing platoon, change its name and schedule pattern, save, and confirm both changes appear immediately on the platoon list and detail page.

**Acceptance Scenarios**:

1. **Given** an authorized user opens a platoon's edit form, **When** they change the name and save, **Then** the updated name is shown immediately in the list and on the detail page.
2. **Given** an authorized user changes the shift label or RRULE, **When** they save, **Then** the updated values are displayed everywhere the platoon appears.
3. **Given** an authorized user edits the RRULE directly and enters an invalid string, **When** they save, **Then** the system rejects the save with a validation error identifying the RRULE as invalid.
4. **Given** an authorized user renames a platoon to a name already used by another platoon in the organization, **When** they save, **Then** the system rejects it with a duplicate-name error and preserves the original name.
5. **Given** an authorized user clears the optional description or color, **When** they save, **Then** those fields are removed from the platoon.

---

### User Story 4 - Assign and Remove Members (Priority: P4)

An authorized user can add staff members from the organization's roster to a platoon and remove them. Staff members can only belong to one platoon at a time. If a staff member is already on a different platoon, the system warns the user before moving them.

**Why this priority**: Member assignment is what gives platoons operational meaning. However it depends on platoons existing (P2) and requires a staff roster to draw from.

**Independent Test**: Log in as a manager, open a platoon, assign two staff members to it, then remove one. Confirm the member count updates correctly after each action. Try to assign a member who is already on another platoon and confirm the move-confirmation prompt appears.

**Acceptance Scenarios**:

1. **Given** an authorized user is viewing a platoon with no members, **When** they add a staff member from the roster, **Then** that member appears in the platoon's member list and the member count increments.
2. **Given** a staff member is already assigned to Platoon A, **When** an authorized user tries to add them to Platoon B, **Then** a confirmation prompt appears explaining that the member will be moved from Platoon A.
3. **Given** the confirmation prompt appears, **When** the user confirms, **Then** the member is removed from Platoon A and added to Platoon B.
4. **Given** the confirmation prompt appears, **When** the user cancels, **Then** no change is made to either platoon.
5. **Given** a member is assigned to a platoon, **When** an authorized user removes them, **Then** the member no longer appears in the platoon and the member count decrements.
6. **Given** an employee (no scheduling authority) is viewing a platoon, **When** they view the member list, **Then** no add or remove controls are available.

---

### User Story 5 - Delete a Platoon (Priority: P5)

An authorized user can delete a platoon. Before deletion executes, a confirmation prompt explains that all member assignments will be removed. After deletion, members remain in the organization roster — only their platoon assignment is cleared.

**Why this priority**: Deletion is needed to keep the platoon list accurate as operations change, but it is the least urgent management action.

**Independent Test**: Log in as an admin, delete a platoon that has members, confirm the prompt, and verify the platoon is gone while all formerly assigned members still appear in the staff roster without a platoon assignment.

**Acceptance Scenarios**:

1. **Given** an authorized user initiates platoon deletion, **When** they view the confirmation prompt, **Then** it clearly states the platoon name and warns that all member assignments will be cleared.
2. **Given** the confirmation prompt is shown, **When** the user confirms, **Then** the platoon is removed from the list and all previously assigned members have their platoon assignment cleared.
3. **Given** the confirmation prompt is shown, **When** the user cancels, **Then** the platoon and all assignments are preserved.
4. **Given** a platoon is deleted, **When** the staff roster is viewed, **Then** no members are missing — only their platoon assignment field is blank.

---

### Edge Cases

- What if two authorized users create platoons with the same name simultaneously? The system must enforce uniqueness at the data layer and return a clear error to whichever request arrives second.
- What if the only remaining unassigned staff member is added to a platoon and then that platoon is deleted? The member returns to an unassigned state in the roster.
- What if a staff member is removed from the organization while they are assigned to a platoon? Removing them from the org also removes their platoon assignment; the platoon member count decreases accordingly.
- What if there are no staff members in the roster to assign? The add-member interface should display an appropriate empty state or disable the action with an explanation.
- What if a platoon has zero members? An empty platoon is valid and should display an empty state, not be automatically deleted.
- What if a user submits a syntactically valid RRULE string that describes an unusual recurrence (e.g., every 1000 days)? The system accepts any syntactically valid RRULE per the iCalendar RFC without semantic validation of reasonableness.
- What if two admins simultaneously assign the same staff member to different platoons? Last-write-wins — the member ends up on whichever platoon committed second with no error surfaced. The result is always consistent (member on exactly one platoon).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Authorized users (those with scheduling authority) MUST be able to create a platoon by providing a name, a shift label, an RRULE (via shortcut or manual entry), and a start date.
- **FR-002**: The system MUST enforce platoon name uniqueness within an organization; duplicate names MUST be rejected with an explanatory error.
- **FR-003**: Every platoon MUST store an iCalendar RRULE string (RFC 5545) and a start date that together define its shift rotation. The system MUST validate that the RRULE value is syntactically correct and reject the form if it is not.
- **FR-003a**: The creation form MUST offer predefined pattern shortcuts (24/48, 24/72, 48/96, Kelly, California Swing, Custom) that pre-populate an RRULE template for the user. These shortcuts are UI conveniences only and are NOT stored on the platoon record. Selecting a predefined shortcut does NOT bypass the start date requirement; the user MUST always provide a start date.
- **FR-003b**: When "Custom" is selected, the user MUST enter the RRULE string directly with no pre-population. The start date requirement still applies.
- **FR-004**: Authorized users MUST be able to add an optional description and an optional display color when creating or editing a platoon.
- **FR-005**: Authorized users MUST be able to edit a platoon's name, shift label, RRULE, start date, description, and color at any time after creation. The shift label and RRULE are independently editable with no automatic coupling between them. The edit form MUST present the same predefined shortcut selector and editable RRULE text field as the creation form, with both fields pre-filled from the stored values.
- **FR-006**: Authorized users MUST be able to assign any staff member from the organization roster to a platoon.
- **FR-007**: The system MUST enforce that each staff member belongs to at most one platoon at a time.
- **FR-008**: When an authorized user attempts to assign a staff member who is already assigned to a different platoon, the system MUST present a confirmation prompt before moving that member.
- **FR-009**: Authorized users MUST be able to remove a staff member from a platoon without removing them from the organization roster.
- **FR-010**: Authorized users MUST be able to delete a platoon after confirming that all member assignments will be cleared. Member records in the organization roster MUST NOT be deleted.
- **FR-011**: All organization members MUST be able to view the complete platoon list, including each platoon's name, shift label, start date, description, color, and member count. The list MUST be sorted alphabetically by platoon name.
- **FR-012**: All organization members MUST be able to view the full member roster of any platoon in a read-only mode. Each member entry MUST display the member's name only.
- **FR-013**: Create, edit, assign, and delete controls MUST be hidden from users who do not have scheduling authority.

### Key Entities

- **Platoon**: Represents a named shift group within an organization. Has a name (required, unique within org), a shift label (required; a short user-editable designator such as "A Shift", "B Shift", or "C Shift" — independent of the RRULE, solely for human identification within the rotation), a recurrence rule (required; a valid iCalendar RRULE string per RFC 5545 representing the shift rotation), a start date (required; the date on which the recurrence begins — anchors the RRULE to the calendar), an optional description, an optional display color, and a reference to its organization. Tracks creation and last-update timestamps. Note: the predefined pattern shortcuts (24/48, 24/72, 48/96, Kelly, California Swing) are UI helpers that pre-populate the RRULE field and are not stored on the platoon record.
- **Platoon Membership**: Represents the current assignment of a single staff member to a single platoon. Links a staff member record to a platoon. A staff member may have at most one membership at a time; reassigning a member replaces (not soft-deletes) the existing record. No historical record of past assignments is retained.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can create a new platoon and see it appear in the list in under one minute from start to finish.
- **SC-002**: An authorized user can assign ten staff members to a platoon in under two minutes.
- **SC-003**: Moving a member between platoons (including the confirmation step) takes no more than 30 seconds.
- **SC-004**: All employees can view the platoon list and open a platoon detail page with member names without any action being blocked by permissions.
- **SC-005**: Zero staff member records are lost or deleted as a result of any platoon management action (assign, remove, or platoon deletion).
- **SC-006**: Authorized users can complete all primary platoon management tasks (create, edit, assign members, remove members, delete) without requiring support intervention.
- **SC-007**: The system rejects any platoon submission containing a syntactically invalid RRULE string 100% of the time, with a clear error message identifying the problem.

## Clarifications

### Session 2026-03-06

- Q: When "Custom" is selected as the schedule pattern, what input is required? → A: The user must enter a valid iCalendar RRULE string (RFC 5545); the system validates syntactic correctness before saving.
- Q: Should the system retain history of past platoon membership when a member is moved or removed? → A: No — only the current assignment is stored. Moving a member replaces the existing membership record with no historical trail.
- Q: How should platoons be ordered in the list? → A: Alphabetical by platoon name (automatic); no user-controlled ordering or sort field required.
- Q: What information about each member should appear in the platoon member list? → A: Name only.
- Q: Should predefined patterns (24/48, 24/72, etc.) store an RRULE like Custom, or be stored as named labels only? → A: Uniform — all patterns store an iCalendar RRULE. Predefined patterns are UI shortcuts that generate an RRULE template; a start date is always required to anchor the recurrence.

### Session 2026-03-06 (continued)

- Q: What is the "pattern label" field intended to hold, and is it independent of the RRULE? → A: Yes, fully independent. It is a required user-editable shift designator (e.g., "A Shift", "B Shift", "C Shift") that identifies the platoon's role within the rotation cycle. The predefined RRULE shortcuts (24/48, Kelly, etc.) are UI helpers only and are not stored.
- Q: In edit mode, how does the RRULE field behave? → A: Both the predefined shortcut selector and the editable RRULE text field are shown, identical to creation mode. Selecting a shortcut re-populates the RRULE template; the user may then edit the RRULE directly.
- Q: When two admins simultaneously assign the same member to different platoons, which wins? → A: Last-write-wins — the second assignment silently overwrites the first. The member always ends up on exactly one platoon; no concurrency error is surfaced.

## Assumptions

- Platoons are scoped to the organization level. Department or station sub-level platoon grouping is out of scope for this feature.
- "Authorized users" in this feature are those holding roles with the existing `create-edit-schedules` permission: owner, admin, and manager. No new permissions are introduced.
- All platoons store a complete iCalendar RRULE and a start date. These describe the rotation type but are not yet used to generate or display actual calendar schedules. Schedule generation is a future feature; the RRULE + start date model is established now to support it without a schema change later.
- The predefined pattern shortcuts (24/48, 24/72, 48/96, Kelly, California Swing) exist only as UI helpers. They are not stored on the platoon record; only the resulting RRULE (and the user-provided start date and shift label) are persisted.
- Display color is a simple string value (e.g., a hex color code or named color). Color picker UI conventions are at the implementer's discretion.
- Staff members available for assignment come from the existing staff roster (005-staff-management). Users without a staff member record are not assignable to platoons.
- Platoon names are case-insensitively unique within an organization (e.g., "A Shift" and "a shift" are considered duplicates).
- RRULE validation is syntactic only (RFC 5545 grammar); the system does not validate whether the recurrence describes a schedule that makes operational sense.

## Dependencies

- **004-org-rbac**: `create-edit-schedules` permission (for write access) and `view-schedules` permission (for read access) are already defined and enforced through the existing RBAC system.
- **005-staff-management**: The staff member roster is the source of assignable personnel. Platoon assignment should reflect and stay consistent with staff roster status.
