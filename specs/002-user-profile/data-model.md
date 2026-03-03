# Data Model: User Profile

**Branch**: `002-user-profile` | **Date**: 2026-03-02
**Storage**: Cloudflare D1 (SQLite) + Cloudflare R2

All datetime values are stored as ISO 8601 TEXT (`YYYY-MM-DDTHH:MM:SS.sssZ`).
All primary keys are UUIDs generated via `crypto.randomUUID()`, except `user_profile`
which uses `user_id` as its primary key (1:1 relationship).

---

## New Entity

### `user_profile`

Stores personal and contact information for a user. One row per user; created lazily on first
profile access via `INSERT OR IGNORE`.

```sql
CREATE TABLE IF NOT EXISTS user_profile (
  user_id      TEXT NOT NULL PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,           -- required; editable by user; defaults to email local-part
  phone_number TEXT,                    -- optional; loosely validated international format or NULL
  avatar_key   TEXT,                    -- R2 object key ("profile-photos/<user_id>") or NULL
  updated_at   TEXT NOT NULL            -- ISO 8601; set on every write
);
```

**Validation rules**:
- `display_name`: required (non-empty after trimming); max 100 characters; whitespace-only rejected
- `phone_number`: optional; if provided, must match `^\+?[\d\s\-\(\)]{7,20}$`; stored as-entered
- `avatar_key`: set to `profile-photos/<user_id>` when a photo is uploaded; set to NULL on removal;
  never returned to the client — photo URL is derived server-side

**Row creation**:
```sql
INSERT OR IGNORE INTO user_profile (user_id, display_name, phone_number, avatar_key, updated_at)
VALUES (?, ?, NULL, NULL, ?)
```
`display_name` defaults to the local-part of the user's email address (characters before `@`).

**State transitions**:
```
[no row]        ──first profile access──► [row created, display_name=email-local-part, no photo]
[has profile]   ──updateProfile────────► [display_name and/or phone_number updated, updated_at refreshed]
[has profile]   ──uploadPhoto──────────► [avatar_key set to "profile-photos/<user_id>"]
[has photo]     ──removePhoto──────────► [avatar_key set to NULL; R2 object deleted]
[has profile]   ──user deleted─────────► [row deleted via ON DELETE CASCADE]
```

---

## Unchanged Entities (reference only)

The following tables from feature 001 are read or modified by this feature but their schemas
are unchanged.

### `user` (read + password update)

- `password_hash`: updated by `changePasswordServerFn`
- `email`: read to derive default `display_name` and for security event logging

### `session` (modified on password change)

```sql
-- Invalidate all sessions except the current one:
DELETE FROM session WHERE user_id = ? AND session_token != ?
```

---

## R2 Object Store

**Bucket**: `scheduler-profile-photos` (binding name: `PROFILE_PHOTOS`)

| Key pattern | Description |
|---|---|
| `profile-photos/<user_id>` | User's current profile photo |

- One object per user (deterministic key); new upload overwrites the previous.
- Object metadata: `Content-Type: image/jpeg` or `image/png` (preserved from upload).
- Object deleted via `env.PROFILE_PHOTOS.delete(key)` on photo removal.
- Served via `GET /profile/photo/$userId` route (proxied, not public bucket URL).

---

## Entity Relationships

```
user ──1:1──► user_profile
user ──1:N──► session         (unchanged from 001)
```

- `user_profile.user_id` references `user(id)` with `ON DELETE CASCADE`
- No circular references

---

## Schema Migration

Append to `src/db/schema.sql`:
```sql
-- User Profile (002-user-profile)
CREATE TABLE IF NOT EXISTS user_profile (
  user_id      TEXT NOT NULL PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  phone_number TEXT,
  avatar_key   TEXT,
  updated_at   TEXT NOT NULL
);
```

Apply:
```bash
# Local dev:
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
# Production:
wrangler d1 execute scheduler-auth --file=src/db/schema.sql
```

---

## TypeScript Types

Add to `src/lib/profile.types.ts`:

```typescript
/** D1 row shape for the `user_profile` table */
export interface UserProfile {
  user_id: string
  display_name: string
  phone_number: string | null
  avatar_key: string | null
  updated_at: string
}

/** Shape returned to the client (avatar_key resolved to URL or null) */
export interface ProfileView {
  userId: string
  email: string
  displayName: string
  phoneNumber: string | null
  avatarUrl: string | null
}

/** Input for updateProfileServerFn */
export interface UpdateProfileInput {
  displayName: string
  phoneNumber: string | null
}

/** Input for changePasswordServerFn */
export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/** Input for uploadPhotoServerFn */
export interface UploadPhotoInput {
  base64: string
  mimeType: 'image/jpeg' | 'image/png'
}
```
