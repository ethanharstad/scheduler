# Feature Specification: User Authentication System

**Feature Branch**: `001-user-auth`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Build a generic user authentication system including login, logout, registration, and forgot password flow."

## Clarifications

### Session 2026-03-02

- Q: What is the session lifetime and is a "remember me" option required? → A: 24-hour idle timeout; session ends on browser close or explicit logout; no "remember me" option.
- Q: Does the User entity need profile fields beyond email and password? → A: No — email and password only; user profile management is out of scope for this feature.
- Q: What happens if the verification or password-reset email fails to deliver? → A: Best-effort delivery — account is created regardless; user sees the standard "check your inbox" message and can re-request the email via the 60-second cooldown mechanism.
- Q: Is there an admin role for managing user accounts? → A: No — the system is purely self-service; admin user management is out of scope for this feature.
- Q: Should security-relevant auth events be logged? → A: Yes — log failures and security events only: failed login attempts, account lockouts, password changes, and session creation/termination.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Login (Priority: P1)

A registered user provides their email and password to prove their identity and gain access to
protected parts of the application. On success, the application recognises them as authenticated
for the duration of their session. On failure, they receive a clear, non-leaking error message.

**Why this priority**: Login is the gateway to all authenticated functionality. An MVP with seeded
test accounts and a working login screen already delivers access to every protected feature.
Registration, password reset, and logout can follow independently.

**Independent Test**: Seed a test account, navigate to the login page, submit correct credentials,
confirm the user lands on a protected page. Confirm that wrong credentials are rejected with an
error and the user remains on the login page.

**Acceptance Scenarios**:

1. **Given** a visitor with a registered, verified email and correct password, **When** they submit
   the login form, **Then** they are authenticated, their session begins, and they are redirected
   to the application home page.
2. **Given** a visitor with a registered email and an incorrect password, **When** they submit the
   login form, **Then** they see a generic error ("Invalid email or password") and remain on the
   login page. The error MUST NOT reveal whether the email is registered.
3. **Given** a visitor who submits the login form with a blank email or blank password, **When**
   the form is submitted, **Then** the relevant fields are highlighted with validation errors and
   the request is not sent to the server.
4. **Given** an already-authenticated user, **When** they navigate to the login page, **Then** they
   are redirected to the home page without being prompted to log in again.
5. **Given** a user whose account is locked due to repeated failed attempts, **When** they try to
   log in (even with correct credentials), **Then** they receive a message indicating the account
   is temporarily locked and when they may try again.

---

### User Story 2 — Registration (Priority: P2)

A new visitor creates an account by providing their email address and choosing a password. The
system validates that the email is not already in use, enforces basic password strength rules, and
sends a verification email. The account is created immediately but access to protected features is
conditional on email verification.

**Why this priority**: Registration enables self-service onboarding. Without it, the application
can only admit pre-seeded users. It is independently testable once the user model exists.

**Independent Test**: Navigate to the registration page, submit a valid new email and a strong
password, confirm a verification email is dispatched, click the link in the email, then log in
successfully.

**Acceptance Scenarios**:

1. **Given** a visitor with a new email and a password meeting strength requirements, **When** they
   submit the registration form, **Then** an account is created, a verification email is sent to
   that address, and the visitor sees a message instructing them to check their inbox.
2. **Given** a visitor who provides an email address already associated with an existing account,
   **When** they submit the registration form, **Then** they see an error ("An account with this
   email already exists") and no new account is created.
3. **Given** a visitor who provides a password shorter than 8 characters or missing at least one
   letter and one number, **When** they submit the form, **Then** they see inline validation
   feedback describing the unmet requirement and the form is not submitted.
4. **Given** a newly registered user who clicks the verification link in their email, **When** the
   link is valid and not expired, **Then** their account is marked verified and they are redirected
   to the login page with a success notice.
5. **Given** a newly registered user who clicks an expired or invalid verification link, **When**
   the link is followed, **Then** they see an error and are offered an option to request a new
   verification email.
6. **Given** a registered but unverified user who attempts to log in, **When** they submit correct
   credentials, **Then** they receive a message that their email has not yet been verified, with an
   option to resend the verification email.

---

### User Story 3 — Forgot Password (Priority: P3)

A registered user who cannot remember their password requests a reset link by providing their email
address. The system sends a time-limited link to that address. Following the link allows the user
to choose a new password and regain access.

**Why this priority**: Password recovery is essential for user retention. Without it, any user who
forgets their password is permanently locked out. It is independently deliverable after US1 and US2
exist.

**Independent Test**: Log out of a test account, navigate to the forgot-password page, submit the
registered email, follow the reset link in the email, set a new password, then log in with the new
password successfully.

**Acceptance Scenarios**:

1. **Given** a visitor who provides a registered email on the forgot-password form, **When** they
   submit, **Then** a password-reset email is sent and they see a confirmation message. The same
   confirmation message MUST be shown for unregistered emails (no email enumeration).
2. **Given** a user who follows a valid, unexpired password-reset link, **When** they submit a new
   password meeting strength requirements, **Then** their password is updated, the reset link is
   invalidated, all existing sessions are terminated, and they are redirected to the login page
   with a success notice.
3. **Given** a user who follows an expired or already-used password-reset link, **When** they
   attempt to set a new password, **Then** they see an error and are offered a link to request a
   fresh reset email.
4. **Given** a user who requests multiple reset emails in succession, **When** a new link is
   generated, **Then** all previously issued reset links for that account are immediately
   invalidated.

---

### User Story 4 — Logout (Priority: P4)

An authenticated user explicitly ends their session. After logout, the session is invalidated
server-side and any attempt to access protected pages redirects to the login page.

**Why this priority**: Logout is a security hygiene requirement but straightforward to implement.
It depends solely on a working session (P1) and adds no new data model complexity.

**Independent Test**: Log in as a test user, invoke the logout action, confirm redirection to the
login page, then attempt to navigate directly to a protected URL and confirm redirection back to
the login page.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they invoke the logout action, **Then** their session
   is terminated server-side, they are redirected to the login page, and their browser no longer
   holds a valid session credential.
2. **Given** a user who has just logged out, **When** they click the browser back button and
   attempt to re-access a previously visited protected page, **Then** they are redirected to the
   login page.

---

### Edge Cases

- What happens when a user submits the login form many times in rapid succession? — Rate limiting
  applies: after 10 failed attempts within 15 minutes, the account is locked for 15 minutes.
- What happens if the verification or reset email fails to deliver or is never received? — Email
  delivery is best-effort. Account creation and reset-token generation proceed regardless of
  delivery outcome. Users see the standard "check your inbox" message and can re-request the email
  via the 60-second cooldown re-send mechanism (FR-011).
- What happens when a user changes their password via the reset flow while logged in on another
  device? — All existing sessions for that account are invalidated upon password change.
- What happens when an unauthenticated user tries to access a protected URL directly? — They are
  redirected to the login page, and the originally requested URL is preserved so they are sent
  there automatically after successful login.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a registered, verified user to authenticate using their email
  address and password.
- **FR-002**: The system MUST reject login attempts with incorrect credentials and MUST NOT reveal
  whether the submitted email address is registered.
- **FR-003**: The system MUST allow a new visitor to create an account by providing a unique email
  address and a password that meets the minimum strength requirement (8+ characters, at least one
  letter and one number).
- **FR-004**: The system MUST attempt to send an email verification message after account creation
  on a best-effort basis; account creation MUST NOT be rolled back if email delivery fails. The
  account MUST be verified before the user can access protected features.
- **FR-005**: The system MUST allow a registered user to request a password-reset email; the same
  confirmation response MUST be shown regardless of whether the email is registered.
- **FR-006**: The system MUST generate a single-use, time-limited (60-minute) password-reset link
  and MUST invalidate all previously issued reset links for the same account when a new one is
  generated.
- **FR-007**: The system MUST invalidate all active sessions for a user when their password is
  changed via the reset flow.
- **FR-008**: The system MUST allow an authenticated user to log out, invalidating their server-side
  session immediately.
- **FR-009**: The system MUST redirect unauthenticated users who request a protected URL to the
  login page, preserving the originally requested path for post-login redirect.
- **FR-010**: The system MUST apply account-level rate limiting for login attempts; after 10 failed
  attempts within any 15-minute window, the account MUST be locked for 15 minutes.
- **FR-011**: The system MUST enforce a minimum 60-second cooldown between re-send requests for
  both verification emails and password-reset emails.
- **FR-012**: The system MUST validate email format and password strength on the client side before
  submitting any form to the server.
- **FR-013**: The system MUST expire an authenticated session after 24 hours of inactivity; an
  expired session MUST be treated as invalid and the user MUST be redirected to the login page.
  There is no "remember me" persistent-session option.
- **FR-014**: The system MUST emit a structured log entry for each of the following security events:
  failed login attempt (including reason: wrong password, account locked, unverified), account
  lockout triggered, account lockout lifted, password changed via reset flow, session created
  (on successful login), and session terminated (on logout or expiry). Log entries MUST include
  a timestamp and the associated account identifier.

### Key Entities

- **User**: Represents a person with an account. Key attributes: unique email address, hashed
  password, verification status, account lock status and lock-expiry timestamp, created date.
  No profile fields (display name, etc.) — user profile management is out of scope.
- **Session**: Represents an authenticated browser session. Key attributes: association to a User,
  creation timestamp, last-activity timestamp, idle-expiry policy (24 hours of inactivity),
  invalidation flag. Sessions also end on browser close or explicit logout.
- **Email Verification Token**: Time-limited token issued after registration to verify ownership
  of the email address. Key attributes: association to a User, token value, expiry timestamp,
  used flag.
- **Password Reset Token**: Time-limited, single-use token authorising one password change.
  Key attributes: association to a User, token value, expiry timestamp (60 minutes), used flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can complete the full registration → email verification → login flow in
  under 5 minutes from first visiting the registration page.
- **SC-002**: A returning user can log in within 30 seconds of reaching the login page under normal
  operating conditions.
- **SC-003**: A user who has forgotten their password can regain access within 5 minutes of
  initiating the forgot-password flow, assuming prompt access to their inbox.
- **SC-004**: 100% of login, registration, and forgot-password form submissions are validated
  client-side before reaching the server, eliminating empty or malformed requests.
- **SC-005**: All password-reset links expire within 60 minutes of issuance and are single-use;
  0% of expired or previously used links successfully complete a password change.
- **SC-006**: Account lockout is enforced after at most 10 failed login attempts within any
  15-minute window, with no exceptions.
- **SC-007**: No error message or system response in any authentication flow reveals whether a
  given email address is registered (no email enumeration).
- **SC-008**: Every failed login attempt, account lockout, password change, and session
  creation/termination produces a verifiable log entry containing a timestamp and account
  identifier; 0% of these events are silently unlogged.

## Assumptions

The following reasonable defaults were applied without seeking clarification:

- **Authentication method**: Email and password only. Social login (OAuth) and SSO are out of scope
  for this iteration.
- **Admin role**: Out of scope. There is no admin interface for viewing, deactivating, or deleting
  user accounts. The system is purely self-service.
- **Email verification**: Required before first login. Industry-standard practice that reduces
  fraudulent account creation.
- **Password strength**: Minimum 8 characters, at least one letter and one number. Stricter rules
  (symbols, uppercase enforcement) can be introduced via a future amendment.
- **Reset link expiry**: 60 minutes. Balances security with typical email delivery latency.
- **Session model**: Server-side sessions, cookie-backed. Storage mechanism is an implementation
  detail outside this spec.
- **Rate limiting scope**: Account-level (by email) for login; IP-level for password-reset requests
  to prevent both targeted account attacks and bulk email enumeration.
- **Multi-device logout on password change**: Changing via reset flow invalidates all sessions.
  A "log out all devices" feature for other scenarios is out of scope.
- **User profile management**: Out of scope. The User entity holds only auth-related fields
  (email, password, verification/lock state). Display names, avatars, preferences, etc. belong
  to a separate profile feature.
