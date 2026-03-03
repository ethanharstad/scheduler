# Server Function Contracts: User Profile

**Branch**: `002-user-profile` | **Date**: 2026-03-02
**File**: `src/server/profile.ts`

All functions follow the project's established `createServerFn` pattern:
- Access `env` via `ctx.context as unknown as Cloudflare.Env`
- Access session cookie via `getCookie('session')` from `@tanstack/react-start/server`
- All inputs validated via `.inputValidator()`; all outputs carry explicit TypeScript types

---

## `getProfileServerFn`

Retrieves the current user's profile. Creates the `user_profile` row (with default values)
if one does not yet exist.

**Method**: `GET`
**Auth**: Required (reads session cookie)

**Output**:
```typescript
type GetProfileOutput =
  | { success: true; profile: ProfileView }
  | { success: false; error: 'UNAUTHENTICATED' }
```

**Behaviour**:
1. Read `session_token` cookie → validate session → get `user_id` and `email`.
2. `INSERT OR IGNORE INTO user_profile (user_id, display_name, ...) VALUES (?, ?, NULL, NULL, ?)` using email local-part as default `display_name`.
3. `SELECT` the `user_profile` row.
4. Construct `avatarUrl`: if `avatar_key` is set → `/profile/photo/<user_id>`; else `null`.
5. Return `ProfileView` (never exposes `avatar_key` raw).

**Used by**: `_protected/profile.tsx` route loader.

---

## `updateProfileServerFn`

Updates the current user's `display_name` and `phone_number`.

**Method**: `POST`
**Auth**: Required
**Input**:
```typescript
type UpdateProfileInput = {
  displayName: string
  phoneNumber: string | null
}
```

**Output**:
```typescript
type UpdateProfileOutput =
  | { success: true; profile: ProfileView }
  | { success: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT'; field?: 'displayName' | 'phoneNumber' }
```

**Validation**:
- `displayName`: trimmed, non-empty, max 100 chars.
- `phoneNumber`: if non-null/non-empty, must match `^\+?[\d\s\-\(\)]{7,20}$`; null/empty string treated as NULL.

**Behaviour**:
1. Validate session.
2. Validate inputs; return `INVALID_INPUT` with `field` if invalid.
3. `UPDATE user_profile SET display_name = ?, phone_number = ?, updated_at = ? WHERE user_id = ?`
4. Return updated `ProfileView`.

---

## `changePasswordServerFn`

Changes the current user's password. On success, invalidates all other active sessions.

**Method**: `POST`
**Auth**: Required
**Input**:
```typescript
type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
}
```

**Output**:
```typescript
type ChangePasswordOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHENTICATED' | 'WRONG_PASSWORD' | 'INVALID_INPUT' }
```

**Behaviour**:
1. Read `session_token` cookie → validate session → get `user_id`.
2. Fetch `password_hash` from `user` table.
3. `verifyPassword(currentPassword, password_hash)` — return `WRONG_PASSWORD` if mismatch.
4. `validatePasswordStrength(newPassword)` (reuses existing helper) — return `INVALID_INPUT` if weak.
5. `hashPassword(newPassword)` → new hash.
6. D1 batch:
   - `UPDATE user SET password_hash = ? WHERE id = ?`
   - `DELETE FROM session WHERE user_id = ? AND session_token != ?` (preserves current session)
7. Log security event: `password_changed_via_profile`.
8. Return `{ success: true }`.

---

## `uploadPhotoServerFn`

Uploads a profile photo to R2 and stores the key in `user_profile`.

**Method**: `POST`
**Auth**: Required
**Input**:
```typescript
type UploadPhotoInput = {
  base64: string                          // base64-encoded image data
  mimeType: 'image/jpeg' | 'image/png'
}
```

**Output**:
```typescript
type UploadPhotoOutput =
  | { success: true; avatarUrl: string }
  | { success: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'TOO_LARGE' | 'STORAGE_UNAVAILABLE' }
```

**Validation**:
- `mimeType` must be `image/jpeg` or `image/png`.
- Decoded byte length must be ≤ 5,242,880 bytes (5 MB).

**Behaviour**:
1. Validate session → get `user_id`.
2. Decode base64 → `Uint8Array`.
3. Validate decoded size ≤ 5 MB.
4. `env.PROFILE_PHOTOS.put('profile-photos/<user_id>', body, { httpMetadata: { contentType: mimeType } })`.
5. On R2 error → return `STORAGE_UNAVAILABLE`.
6. `UPDATE user_profile SET avatar_key = ?, updated_at = ? WHERE user_id = ?`.
7. Return `{ success: true, avatarUrl: '/profile/photo/<user_id>' }`.

---

## `removePhotoServerFn`

Removes the current user's profile photo from R2 and clears `avatar_key`.

**Method**: `POST`
**Auth**: Required
**Input**: none

**Output**:
```typescript
type RemovePhotoOutput =
  | { success: true }
  | { success: false; error: 'UNAUTHENTICATED' | 'STORAGE_UNAVAILABLE' }
```

**Behaviour**:
1. Validate session → get `user_id`.
2. `env.PROFILE_PHOTOS.delete('profile-photos/<user_id>')`.
3. On R2 error → return `STORAGE_UNAVAILABLE`.
4. `UPDATE user_profile SET avatar_key = NULL, updated_at = ? WHERE user_id = ?`.
5. Return `{ success: true }`.

---

## Photo Serving Route

**File**: `src/routes/profile.photo.$userId.tsx`
**URL**: `GET /profile/photo/:userId`
**Auth**: None required (photos are not sensitive in this iteration)

**Behaviour**:
1. Read `userId` path param.
2. `env.PROFILE_PHOTOS.get('profile-photos/<userId>')`.
3. If not found → return 404.
4. Return `new Response(object.body, { headers: { 'Content-Type': object.httpMetadata.contentType, 'Cache-Control': 'public, max-age=3600' } })`.

**Implementation note**: This route returns a raw `Response` from the loader (not a React
component). TanStack Start supports returning a `Response` directly from a loader to implement
file-serving routes.
