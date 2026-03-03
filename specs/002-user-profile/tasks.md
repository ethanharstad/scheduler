# Tasks: User Profile

**Input**: Design documents from `/specs/002-user-profile/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/server-functions.md ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in same phase)
- **[Story]**: User story this task belongs to (US1–US4)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema migration, new Cloudflare binding, and shared TypeScript types. All tasks touch
different files and are independent of each other.

- [x] T001 Add `user_profile` table to `src/db/schema.sql` (append the CREATE TABLE IF NOT EXISTS block from data-model.md) and apply locally via `wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql`
- [x] T002 [P] Add R2 bucket binding to `wrangler.jsonc` — add `"r2_buckets": [{ "binding": "PROFILE_PHOTOS", "bucket_name": "scheduler-profile-photos" }]` alongside the existing `d1_databases` block, then run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`
- [x] T003 [P] Extend `src/types/env.d.ts` — add `PROFILE_PHOTOS: R2Bucket` to the `Cloudflare.Env` interface
- [x] T004 [P] Create `src/lib/profile.types.ts` — define `UserProfile`, `ProfileView`, `UpdateProfileInput`, `ChangePasswordInput`, and `UploadPhotoInput` interfaces exactly as specified in data-model.md § TypeScript Types

**Checkpoint**: Schema updated, R2 binding declared, types defined — ready for server function implementation.

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: `getProfileServerFn` is the single prerequisite for every user story — it provides the
profile data the route loader depends on and creates the `user_profile` row on first access.

**⚠️ CRITICAL**: The profile route cannot be built until this function exists.

- [x] T005 Create `src/server/profile.ts` and implement `getProfileServerFn` (method: GET) — read `session_token` cookie, validate session via `getSessionServerFn` from `src/lib/auth.ts`, then `INSERT OR IGNORE INTO user_profile (user_id, display_name, phone_number, avatar_key, updated_at) VALUES (?, ?, NULL, NULL, ?)` using the email local-part as the default display_name, then SELECT the row and return `{ success: true, profile: ProfileView }` where `avatarUrl` is `/profile/photo/<user_id>` when `avatar_key` is non-null, else null; return `{ success: false, error: 'UNAUTHENTICATED' }` if no valid session

**Checkpoint**: `getProfileServerFn` callable — US1 implementation can begin.

---

## Phase 3: User Story 1 — View Personal Profile (Priority: P1) 🎯 MVP

**Goal**: Authenticated users can navigate to `/profile` and see their display name, email address, and phone number in a read-only view.

**Independent Test**: Log in → navigate to `/profile` → verify display name, email, and phone (or "Not provided") are rendered correctly. Refresh the page and confirm data persists.

- [x] T006 [US1] Create `src/routes/_protected/profile.tsx` — define `createFileRoute('/_protected/profile')` with a `loader` that calls `getProfileServerFn()` and throws `redirect` to `/login` if `success: false`; render a read-only profile card showing `profile.displayName`, `profile.email` (labelled as read-only), and `profile.phoneNumber` (or "Not provided" when null); use Tailwind CSS v4 with the existing dark slate palette from `src/routes/_protected.tsx`

**Checkpoint**: `/profile` renders profile data. US1 is fully functional and independently testable.

---

## Phase 4: User Story 2 — Edit Profile Information (Priority: P2)

**Goal**: Users can edit their display name and phone number inline on the profile page, with validation errors and a success confirmation.

**Independent Test**: On `/profile`, click edit, change display name, save → verify new name shown. Enter `abc` as phone number → verify validation error. Click cancel → verify original values unchanged.

- [x] T007 [US2] Add `updateProfileServerFn` to `src/server/profile.ts` (method: POST, input: `UpdateProfileInput`) — validate session; trim `displayName` and reject if empty or > 100 chars; if `phoneNumber` is non-empty validate against `^\+?[\d\s\-\(\)]{7,20}$`, treat empty string as null; `UPDATE user_profile SET display_name = ?, phone_number = ?, updated_at = ? WHERE user_id = ?`; return updated `ProfileView` on success or `{ success: false, error: 'INVALID_INPUT', field: 'displayName' | 'phoneNumber' }` on validation failure
- [x] T008 [US2] Update `src/routes/_protected/profile.tsx` — add controlled edit state (display name input, phone number input); on save call `updateProfileServerFn`, show field-level validation error messages and a top-level success banner on save; on cancel reset inputs to current values without saving; keep email field always read-only with a visual indicator

**Checkpoint**: Profile edit fully functional. US1 + US2 both independently testable.

---

## Phase 5: User Story 3 — Change Password (Priority: P3)

**Goal**: Users can change their password from the profile page. On success, all other active sessions are invalidated and a success message is shown.

**Independent Test**: Submit change-password form with correct current password + valid new password → success message shown → log out → log in with new password → succeeds. Open two tabs, change password in tab 1 → refresh tab 2 → redirected to login.

- [x] T009 [US3] Add `changePasswordServerFn` to `src/server/profile.ts` (method: POST, input: `ChangePasswordInput`) — validate session and read `session_token` cookie; fetch `password_hash` from `user` table; call `verifyPassword(currentPassword, password_hash)` (imported from `src/lib/auth.ts`) and return `{ success: false, error: 'WRONG_PASSWORD' }` on mismatch; call `validatePasswordStrength(newPassword)` (imported from `src/server/auth.ts`) and return `{ success: false, error: 'INVALID_INPUT' }` if weak; hash new password and execute a D1 batch: `[UPDATE user SET password_hash = ? WHERE id = ?`, `DELETE FROM session WHERE user_id = ? AND session_token != ?]`; log security event `password_changed_via_profile` via `logSecurityEvent` from `src/lib/auth.ts`; return `{ success: true }`
- [x] T010 [US3] Update `src/routes/_protected/profile.tsx` — add a change-password section with three fields (current password, new password, confirm new password); validate on the client that new password and confirm match before submitting; call `changePasswordServerFn`; show `WRONG_PASSWORD` error inline on the current-password field, `INVALID_INPUT` error with the password strength hint, and a success banner on completion; clear all three fields on success

**Checkpoint**: Password change fully functional with session invalidation. US1 + US2 + US3 all testable independently.

---

## Phase 6: User Story 4 — Upload Profile Photo (Priority: P4)

**Goal**: Users can upload a JPEG or PNG photo (≤ 5 MB) as their avatar and remove it. If photo storage is unavailable, a clear error is shown while other profile functions remain usable.

**Independent Test**: Upload a valid JPEG → avatar shown in profile. Upload a PDF or a file > 5 MB → error shown. Remove photo → default avatar placeholder shown. Verify other profile fields still save/load normally when photo operations fail.

- [x] T011 [US4] Add `uploadPhotoServerFn` to `src/server/profile.ts` (method: POST, input: `UploadPhotoInput`) — validate session; validate `mimeType` is `image/jpeg` or `image/png`; decode base64 string to `Uint8Array` using `Uint8Array.from(atob(base64), c => c.charCodeAt(0))`; return `{ success: false, error: 'TOO_LARGE' }` if byte length > 5_242_880; call `env.PROFILE_PHOTOS.put('profile-photos/<user_id>', bytes, { httpMetadata: { contentType: mimeType } })` and catch errors to return `{ success: false, error: 'STORAGE_UNAVAILABLE' }`; `UPDATE user_profile SET avatar_key = ?, updated_at = ? WHERE user_id = ?`; return `{ success: true, avatarUrl: '/profile/photo/<user_id>' }`
- [x] T012 [US4] Add `removePhotoServerFn` to `src/server/profile.ts` (method: POST, no input) — validate session; call `env.PROFILE_PHOTOS.delete('profile-photos/<user_id>')` and catch errors to return `{ success: false, error: 'STORAGE_UNAVAILABLE' }`; `UPDATE user_profile SET avatar_key = NULL, updated_at = ? WHERE user_id = ?`; return `{ success: true }`
- [x] T013 [P] [US4] Create `src/routes/profile.photo.$userId.tsx` — define `createFileRoute('/profile/photo/$userId')` with a loader that reads `params.userId`, calls `env.PROFILE_PHOTOS.get('profile-photos/<userId>')` (access env via `getRouteContext` or server function pattern), returns a `Response` with the object body, `Content-Type` from `object.httpMetadata?.contentType`, and `Cache-Control: public, max-age=3600`; return a 404 `Response` if the object is null
- [x] T014 [US4] Update `src/routes/_protected/profile.tsx` — add avatar section above the profile form: display an `<img>` using `profile.avatarUrl` when set or a circular placeholder when null; add an upload `<input type="file" accept="image/jpeg,image/png">` that reads the selected file as base64 (via `FileReader.readAsDataURL`), strips the data URL prefix, and calls `uploadPhotoServerFn`; add a remove button (shown only when `avatarUrl` is set) that calls `removePhotoServerFn`; show `TOO_LARGE`, `STORAGE_UNAVAILABLE` error messages specific to photo operations; on upload success update `avatarUrl` in local state without a full page reload

**Checkpoint**: All four user stories complete and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Navigation integration and production validation.

- [x] T015 Update `src/routes/_protected.tsx` — add a "Profile" navigation link in the header alongside the existing "Sign out" button, linking to `/profile`
- [x] T016 Verify production build passes — run `npm run build` and resolve any TypeScript or bundler errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately; T002/T003/T004 can run in parallel after T001 or alongside it
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — no other story dependencies
- **US2 (Phase 4)**: Depends on Phase 2 — independent of US1 in server layer; adds to the same route file (sequential after US1 for route tasks)
- **US3 (Phase 5)**: Depends on Phase 2 — independent of US1/US2 in server layer; adds to same route file
- **US4 (Phase 6)**: Depends on Phase 1 (R2 binding) and Phase 2; T013 can run in parallel with T012
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Only depends on Phase 2 (getProfileServerFn) — no story dependencies
- **US2 (P2)**: Only depends on Phase 2 — route changes build on US1's route file but server function is independent
- **US3 (P3)**: Only depends on Phase 2 — route changes build on US1/US2 route file but server function is independent
- **US4 (P4)**: Depends on Phase 1 R2 setup (T002, T003) and Phase 2 — server functions are independent; T013 (photo route) is independent of T012

### Within Each Story

- Server function task → route task (server function must exist before the route calls it)
- T011 → T012 (same file, sequential) but T013 can run in parallel with T012
- T011, T012, T013 must all complete before T014

### Parallel Opportunities

- Phase 1: T002, T003, T004 can all run in parallel (different files, no shared dependency)
- Phase 6: T012 and T013 can run in parallel (different files, both start after T011)

---

## Parallel Example: Phase 1

```
Immediately startable in parallel:
  T001: src/db/schema.sql           ← add user_profile table
  T002: wrangler.jsonc              ← add R2 binding
  T003: src/types/env.d.ts         ← add PROFILE_PHOTOS type
  T004: src/lib/profile.types.ts   ← create TypeScript interfaces
```

## Parallel Example: Phase 6 (US4)

```
After T011 completes:
  T012: removePhotoServerFn in src/server/profile.ts
  T013: Create src/routes/profile.photo.$userId.tsx   ← [P] with T012
Then:
  T014: Add photo UI to src/routes/_protected/profile.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005)
3. Complete Phase 3: US1 — View Profile (T006)
4. **STOP and VALIDATE**: Log in → `/profile` → confirm display name, email, phone render correctly
5. Deploy or demo if ready

### Incremental Delivery

1. T001–T005 → Foundation ready
2. T006 → `/profile` page renders read-only data (US1 MVP)
3. T007–T008 → Users can edit name and phone (US2)
4. T009–T010 → Users can change password with session invalidation (US3)
5. T011–T014 → Users can upload and remove profile photos (US4)
6. T015–T016 → Navigation + build verified

Each increment delivers value without breaking previous stories.

---

## Notes

- No test tasks — tests not requested in spec
- All `createServerFn` implementations follow the pattern in `src/server/auth.ts`: access env via `ctx.context as unknown as Cloudflare.Env`, import auth helpers from `src/lib/auth.ts` and `src/server/auth.ts`
- `getSessionServerFn` from `src/lib/auth.ts` is used to validate the session cookie in every server function (established pattern from feature 001)
- Photo route (T013) needs env access — use the same `src/server.ts` context pattern; check TanStack Start v1 loader context for `getRouteContext` or pass env through a server function if needed
- `verbatimModuleSyntax: true` is enforced — use `import type { X }` for type-only imports
- After completing T002, run `npm run cf-typegen` before starting T003 to avoid type conflicts with the auto-generated `worker-configuration.d.ts`
