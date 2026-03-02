---

description: "Task list for User Authentication System"
---

# Tasks: User Authentication System

**Input**: Design documents from `specs/001-user-auth/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/server-functions.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.
US1 (Login) → US2 (Registration) → US3 (Forgot Password) → US4 (Logout).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1–US4)
- All file paths are relative to the repository root

## Path Conventions

- Shared auth utilities: `src/lib/`
- All server functions (createServerFn): `src/server/auth.ts`
- Route files: `src/routes/`
- D1 schema: `src/db/schema.sql`

---

## Phase 1: Setup

**Purpose**: Cloudflare infrastructure and project initialization — must complete before any
implementation work begins.

- [x] T001 Create the Cloudflare D1 database by running `npx wrangler d1 create scheduler-auth`, then add the returned `database_id` to `wrangler.jsonc` as a `d1_databases` binding with `binding: "DB"` and `database_name: "scheduler-auth"`
- [x] T002 [P] Create `.dev.vars` file at the repository root (gitignored) containing `RESEND_API_KEY=re_placeholder` for local development — add `.dev.vars` to `.gitignore` if not already present
- [x] T003 Regenerate Cloudflare binding types by running `npm run cf-typegen` to expose `env.DB: D1Database` in `worker-configuration.d.ts` (depends on T001)
- [x] T004 [P] Create `src/db/schema.sql` with the four D1 tables from `data-model.md`: `user`, `session`, `email_verification_token`, `password_reset_token` — include all columns, constraints (`NOT NULL`, `UNIQUE`, `REFERENCES ... ON DELETE CASCADE`), and indexes (`idx_user_email`, `idx_session_token`, `idx_session_user_id`, `idx_evt_token`, `idx_evt_user_id`, `idx_prt_token`, `idx_prt_user_id`)
- [x] T005 Apply schema to the local D1 database by running `npx wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql` (depends on T001, T004)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared TypeScript types, crypto helpers, security logger, session validator, and
protected route guard — all user stories depend on this phase being complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 [P] Create `src/lib/auth.types.ts` with TypeScript interfaces matching the D1 schema: `User`, `Session`, `EmailVerificationToken`, `PasswordResetToken` (all fields from `data-model.md`), and `SessionContext { userId: string; email: string }` (the shape returned to routes after session validation)
- [x] T007 [P] Create `src/server/auth.ts` with shared input validation helpers: `validateEmail(email: string): boolean` and `validatePasswordStrength(password: string): boolean` (≥8 chars, ≥1 letter, ≥1 digit)
- [x] T008 Create `src/lib/auth.ts` with three utility functions: `hashPassword`, `verifyPassword`, `generateToken`
- [x] T009 Add `logSecurityEvent` to `src/lib/auth.ts`
- [x] T010 Add `getSessionServerFn` to `src/lib/auth.ts`
- [x] T011 Create `src/routes/_protected.tsx` (pathless layout, standard TanStack Router convention) with `beforeLoad` auth guard returning `{ session }` in route context (depends on T010)

**Checkpoint**: Foundation ready — all user story implementation can now begin.

---

## Phase 3: User Story 1 — Login (Priority: P1) 🎯 MVP

**Goal**: A seeded or registered+verified user can log in with email and password, receive a
session cookie, and access protected routes. Wrong credentials are rejected with a generic error.
Locked accounts and unverified accounts are blocked with clear, non-leaking messages.

**Independent Test**: Insert a test `user` row in D1 (`verified=1`, valid `password_hash`) via
`wrangler d1 execute`. Navigate to `/login`, submit correct credentials → lands on the protected
home page. Submit wrong password → "Invalid email or password" error, stays on `/login`. Submit
with blank fields → client-side validation fires, no server request sent.

### Implementation for User Story 1

- [x] T012 [US1] Implement `loginServerFn` in `src/server/auth.ts`
- [x] T013 [US1] Create `src/routes/login.tsx` with form, error handling, and resend-verification inline button
- [x] T014 [P] [US1] Create `src/routes/_protected/home.tsx` (URL: `/home`, avoids conflict with public `/`) — reads session from `useRouteContext({ from: '/_protected' })`

**Checkpoint**: User Story 1 fully functional — login, session creation, protected route guard, and account lockout all working independently.

---

## Phase 4: User Story 2 — Registration (Priority: P2)

**Goal**: A new visitor registers with email and password, receives a verification email,
clicks the link to verify their account, and can then log in. Duplicate emails are rejected.
Password strength is enforced. Email delivery is best-effort.

**Independent Test**: Navigate to `/register`, submit a new email and valid password → see
"check your inbox" message. Follow the verification link in the Resend dashboard → redirected
to `/login` with success notice. Log in with the new credentials → lands on protected home page.

### Implementation for User Story 2

- [x] T015 [US2] Add `registerServerFn` to `src/server/auth.ts`
- [x] T016 [US2] Add `verifyEmailServerFn` to `src/server/auth.ts`
- [x] T017 [US2] Add `resendVerificationServerFn` to `src/server/auth.ts`
- [x] T018 [P] [US2] Create `src/routes/register.tsx` with password strength feedback and resend flow
- [x] T019 [P] [US2] Create `src/routes/verify-email.$token.tsx` (uses loader, redirects to `/login?verified=1` on success)

**Checkpoint**: User Story 2 fully functional — registration, email verification, and resend flow working independently.

---

## Phase 5: User Story 3 — Forgot Password (Priority: P3)

**Goal**: A user who has forgotten their password requests a reset email, follows the link,
sets a new password, and all existing sessions are terminated. The same confirmation is shown
for registered and unregistered emails (no enumeration).

**Independent Test**: Log out a test account. Navigate to `/forgot-password`, submit the
registered email → same "check your email" message shown. Follow reset link → set new password
→ redirect to `/login`. Log in with new password → success. Attempt to use the same reset link
again → error shown.

### Implementation for User Story 3

- [x] T020 [US3] Add `forgotPasswordServerFn` to `src/server/auth.ts`
- [x] T021 [US3] Add `resetPasswordServerFn` to `src/server/auth.ts` (D1 batch: update user, mark token used, delete all sessions)
- [x] T022 [P] [US3] Create `src/routes/forgot-password.tsx` with neutral confirmation and cooldown note
- [x] T023 [P] [US3] Create `src/routes/reset-password.$token.tsx` with strength feedback, redirects to `/login?reset=1` on success

**Checkpoint**: User Story 3 fully functional — forgot password and reset flow working independently.

---

## Phase 6: User Story 4 — Logout (Priority: P4)

**Goal**: An authenticated user explicitly ends their session. The session row is deleted from D1,
the cookie is cleared, and all protected routes redirect to `/login` immediately after.

**Independent Test**: Log in as a test user. Click the logout button → redirect to `/login`.
Navigate directly to `/` (the protected home page) → redirect back to `/login`.

### Implementation for User Story 4

- [x] T024 [US4] Add `logoutServerFn` to `src/server/auth.ts`
- [x] T025 [US4] Add logout button (Lucide `LogOut` icon) to `src/routes/_protected.tsx` layout

**Checkpoint**: All four user stories complete — the full authentication system is functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, success/error banners from inter-story redirects, and build check.

- [x] T026 [P] Add `?verified=1` success banner to `src/routes/login.tsx`
- [x] T027 [P] Add `?reset=1` success banner to `src/routes/login.tsx` (combined with T026 in same file)
- [x] T028 Run the end-to-end validation from `quickstart.md`: create D1 database (if not done), apply schema, set `RESEND_API_KEY` secret, `npm run dev`, and manually walk through all four flows (registration → verify → login → forgot-password → reset → logout) to confirm all acceptance scenarios pass
- [x] T029 Run `npm run build` and confirm the production bundle compiles without TypeScript errors and the Worker bundle size stays under the 1 MB Cloudflare Workers limit (Principle IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: T001–T005 must be complete — **blocks all user stories**
- **US1 Login (Phase 3)**: Depends on Phase 2; no dependency on US2/US3/US4
- **US2 Registration (Phase 4)**: Depends on Phase 2; T015–T017 must complete before T018–T019
- **US3 Forgot Password (Phase 5)**: Depends on Phase 2; T020–T021 must complete before T022–T023
- **US4 Logout (Phase 6)**: Depends on Phase 2 + T012 (loginServerFn creates the file); T024 before T025
- **Polish (Phase 7)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Phase 2 — no dependency on US2/US3/US4
- **US2 (P2)**: Can start immediately after Phase 2 — no dependency on US1/US3/US4
- **US3 (P3)**: Can start immediately after Phase 2 — no dependency on US1/US2/US4
- **US4 (P4)**: Can start after Phase 2 + T012 (logoutServerFn goes in same file as loginServerFn)

### Within Each User Story

- Server functions (all in `src/server/auth.ts`): strictly sequential — one function at a time
- Route files: fully parallelisable with each other and with server functions in different files
- Models before services before routes is the ordering within each story's server function block

### Parallel Opportunities

- **Phase 1**: T002 [P] with T001; T004 [P] with T001; T003 after T001
- **Phase 2**: T006 [P] with T007 (different files); T008–T010 sequential (same file as T008); T011 after T010
- **Phase 3**: T013 [P] with T014 (different files), both after T012
- **Phase 4**: T018 [P] with T019 (different files), both after T017
- **Phase 5**: T022 [P] with T023 (different files), both after T021
- **Phase 7**: T026 [P] with T027 (small edits to same file — combine or do sequentially)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 Login (T012 → T013, T014 in parallel)
4. **STOP and validate**: Seed a user in D1, log in, verify session, test lockout
5. Demo: protected home page accessible only when authenticated

### Incremental Delivery

1. Setup + Foundational → infrastructure ready
2. US1 Login (T012–T014) → MVP: seeded users can log in ✅
3. US2 Registration (T015–T019) → users can self-register and verify email ✅
4. US3 Forgot Password (T020–T023) → users can recover locked-out accounts ✅
5. US4 Logout (T024–T025) → security hygiene complete ✅
6. Polish (T026–T029) → banners, build validation ✅

### Parallel Team Strategy

With two developers after Foundational is complete:

- **Developer A**: US1 (T012 → T013, T014) + US4 (T024, T025) — login/logout, same server file
- **Developer B**: US2 (T015 → T016 → T017 → T018, T019) + US3 (T020 → T021 → T022, T023) — registration/reset, appending to same server file sequentially
- Both merge when all stories are done, then collaborate on Polish

---

## Notes

- `[P]` tasks involve different files with no shared in-progress dependencies — safe to parallelise
- `src/server/auth.ts` is a single file — all server function tasks (T012, T015–T017, T020–T021, T024) MUST be done sequentially; they each add a new export to the same file
- All `createServerFn` calls must use `getRequestHeaders()` from `@tanstack/react-start/server` to access the incoming request headers server-side
- All D1 access is via `env.DB` which is available in `createServerFn` handlers through the Cloudflare Workers request context
- Commit after each task or logical group; every Phase 3–6 checkpoint is a good commit point
