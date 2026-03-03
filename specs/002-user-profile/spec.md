# Feature Specification: User Profile

**Feature Branch**: `002-user-profile`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Add a user profile for authenticated users."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Personal Profile (Priority: P1)

A logged-in user navigates to their profile page and can see their current account information in one place, including their name, email address, and phone number. This gives users confidence that the system has their correct information and provides a central hub for account management.

**Why this priority**: Every authenticated user needs visibility into their own account data. This is the foundation upon which editing and other profile actions build. Without view capability, no other profile feature is useful.

**Independent Test**: Can be fully tested by logging in and navigating to the profile page — the user sees their stored information displayed accurately without needing any edit functionality.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they navigate to their profile page, **Then** they see their display name, email address, and phone number displayed clearly.
2. **Given** a logged-in user on their profile page, **When** the page loads, **Then** the information shown matches the data on file for their account.
3. **Given** a user who has not set an optional field (e.g., phone number), **When** they view their profile, **Then** the field is shown as empty or with a "Not provided" placeholder rather than an error.

---

### User Story 2 - Edit Profile Information (Priority: P2)

A logged-in user wants to update their personal details — such as changing their display name or phone number. They make edits on the profile page and save them. The system confirms the update was successful.

**Why this priority**: Profiles become stale as personnel information changes (name changes, contact updates). Editing is essential for keeping account information accurate, but the system is still useful for viewing even before editing is available.

**Independent Test**: Can be fully tested by navigating to the profile edit form, changing a field (e.g., phone number), saving, and verifying the new value is reflected on the profile page.

**Acceptance Scenarios**:

1. **Given** a logged-in user on their profile, **When** they edit their display name and save, **Then** the new name is displayed on their profile and persisted on subsequent visits.
2. **Given** a logged-in user editing their profile, **When** they submit a form with a required field left blank, **Then** the system shows a validation error and does not save the changes.
3. **Given** a logged-in user, **When** they save valid profile changes, **Then** the system shows a success confirmation and the updated values are immediately visible.
4. **Given** a logged-in user, **When** they cancel editing without saving, **Then** no changes are persisted and their original data is unchanged.

---

### User Story 3 - Change Password (Priority: P3)

A logged-in user wants to change their account password from their profile page. They enter their current password for verification, provide a new password, confirm it, and submit. The system validates and applies the change.

**Why this priority**: Password management is a security-critical self-service action that reduces reliance on the reset-by-email flow. It is lower priority than profile viewing and editing, as users can still use the existing "forgot password" flow as a workaround.

**Independent Test**: Can be fully tested by entering the current password plus a new password on the change-password form, submitting, logging out, and verifying the new password works on the next login.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they submit the change-password form with the correct current password and a valid new password (confirmed), **Then** the password is updated, all other active sessions for that account are invalidated, and they see a success message.
2. **Given** a logged-in user, **When** they submit the change-password form with an incorrect current password, **Then** the system rejects the request and displays an error without changing the password.
3. **Given** a logged-in user, **When** the new password and confirmation do not match, **Then** the system shows a validation error before submission.
4. **Given** a logged-in user, **When** they submit a new password that does not meet minimum security requirements, **Then** the system rejects it with a descriptive error message.
5. **Given** a user is logged in on two devices and changes their password on one, **When** the other device makes any authenticated request, **Then** that session is rejected and the user is redirected to the login page.

---

### User Story 4 - Upload Profile Photo (Priority: P4)

A logged-in user can upload a profile photo (avatar) that is displayed alongside their name throughout the application. They can also remove their current photo to revert to a default avatar.

**Why this priority**: Profile photos improve identification and personalization in team-oriented contexts (e.g., scheduling displays, roster views). However, the system delivers full value without photos, making this the lowest priority story.

**Independent Test**: Can be fully tested by uploading an image on the profile page, verifying the preview updates immediately, and confirming the photo persists on subsequent visits.

**Acceptance Scenarios**:

1. **Given** a logged-in user on their profile, **When** they upload a valid image file (JPEG or PNG, under 5 MB), **Then** the photo is saved and displayed as their avatar.
2. **Given** a logged-in user, **When** they attempt to upload a file that is not a supported image format or exceeds the size limit, **Then** the system rejects the upload and shows a descriptive error.
3. **Given** a logged-in user with a profile photo, **When** they choose to remove it, **Then** the photo is deleted and a default avatar placeholder is shown in its place.

---

### Edge Cases

- What happens when a user's session expires while they are mid-edit on their profile — are unsaved changes preserved or lost?
- Concurrent edits (same account edited from two sessions simultaneously) use last-write-wins — whichever save completes last becomes the stored value; no conflict error is shown.
- What happens if a user attempts to set their display name to only whitespace or special characters?
- If photo storage is unavailable, the system shows a clear error message for the upload/removal action; all other profile functionality (display name, phone number, password change) remains fully available.
- How are profile photos handled if the user's account is later deactivated or deleted?
- What is displayed on shared views (e.g., schedule boards) if a user has no display name set?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the authenticated user's profile information (display name, email address, phone number) on a dedicated profile page accessible only when logged in.
- **FR-002**: System MUST allow authenticated users to edit their display name and phone number.
- **FR-003**: System MUST treat email address as read-only on the profile — it cannot be changed from this page (email changes are out of scope for this feature).
- **FR-004**: System MUST validate profile fields before saving: display name is required; phone number, if provided, must be a valid internationally formatted phone number (any globally valid format accepted).
- **FR-005**: System MUST persist profile changes immediately upon successful save so they are reflected on all subsequent page views.
- **FR-006**: System MUST provide a change-password form on the profile page that requires the user's current password before accepting a new one. Upon success, all other active sessions for that account MUST be invalidated immediately; only the current session remains active.
- **FR-007**: System MUST enforce the same password strength requirements for the change-password flow as for registration (minimum length and complexity).
- **FR-008**: System MUST allow authenticated users to upload a profile photo (JPEG or PNG, maximum 5 MB) and display it as their avatar.
- **FR-009**: System MUST allow authenticated users to remove their profile photo, reverting to a default avatar placeholder.
- **FR-010**: System MUST show a clear success or error message after every save operation (profile edit, password change, photo upload/removal).
- **FR-011**: System MUST restrict profile pages so that unauthenticated users are redirected to the login page.

### Key Entities

- **User Profile**: Represents a user's personal and contact information. Key attributes: display name (required), email address (from auth record, read-only), phone number (optional), profile photo (optional). Belongs to one user account.
- **Profile Photo**: A user-uploaded image associated with a user profile. Key attributes: file reference, upload timestamp. Displayed as an avatar throughout the application; defaults to a placeholder when absent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authenticated users can view their complete profile information within 2 seconds of navigating to the profile page.
- **SC-002**: Users can complete a profile update (edit and save) in under 60 seconds.
- **SC-003**: 95% of profile save operations complete successfully without error under normal conditions.
- **SC-004**: Users can change their password and immediately log in with the new password without needing to use the password-reset email flow.
- **SC-005**: Profile photo uploads under the size limit succeed on the first attempt for supported file types.
- **SC-006**: Unauthenticated access to any profile page results in a redirect to the login page 100% of the time.

## Clarifications

### Session 2026-03-02

- Q: When a user changes their password, what happens to other active sessions? → A: All other active sessions are invalidated immediately; only the current session remains active.
- Q: Should job title be included in the user profile? → A: Job title removed from scope entirely.
- Q: What phone number formats should be accepted? → A: Any internationally valid phone number format (global scope).
- Q: How should concurrent edits from two sessions be handled? → A: Last write wins; no conflict detection or error shown.
- Q: What should happen if photo storage is unavailable during an upload or removal? → A: Show a clear error message; all other profile functionality remains fully available.

## Assumptions

- Email address changes are intentionally out of scope; changing a primary email involves identity verification and is a separate, higher-complexity feature.
- The existing authentication system (feature 001) stores a user record keyed by email; the profile extends this record with additional fields.
- Profile photos are stored in a managed file/object store; no image processing (resizing, cropping) is required in this iteration beyond format and size validation.
- "Display name" defaults to the name provided at registration; it can be edited independently of the auth record.
- Password strength rules (minimum length, complexity) are defined by the existing registration flow and are reused here without change.
- Profile data is visible only to the owning user in this iteration; sharing profile information across team members (e.g., public department roster) is a future feature.
