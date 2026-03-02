# Data Model: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-03-02
**Storage**: Cloudflare D1 (SQLite)

All datetime values are stored as ISO 8601 TEXT (`YYYY-MM-DDTHH:MM:SS.sssZ`).
All boolean values are stored as INTEGER (`0` = false, `1` = true).
All primary keys are UUIDs generated via `crypto.randomUUID()`.

---

## Entities

### `user`

Represents a registered account. No profile fields beyond auth-related attributes (Clarification Q2).

```sql
CREATE TABLE user (
  id              TEXT    PRIMARY KEY,           -- crypto.randomUUID()
  email           TEXT    NOT NULL UNIQUE,       -- normalised to lowercase
  password_hash   TEXT    NOT NULL,              -- base64(salt[32] ‖ PBKDF2-SHA256[32])
  verified        INTEGER NOT NULL DEFAULT 0,    -- 0=unverified, 1=verified
  failed_attempts INTEGER NOT NULL DEFAULT 0,    -- consecutive failed login count
  lock_until      TEXT,                          -- ISO 8601 or NULL (account lockout expiry)
  created_at      TEXT    NOT NULL               -- ISO 8601
);

CREATE UNIQUE INDEX idx_user_email ON user(email);
```

**State transitions**:
```
[created, verified=0] ──verify email──► [verified=1, active]
[active]              ──10 failures──► [locked, lock_until=now+15m]
[locked]              ──lock expires──► [active, failed_attempts reset]
[active]              ──correct login──► [active, failed_attempts=0]
```

**Validation rules**:
- `email`: valid RFC 5322 format; stored lowercase; UNIQUE constraint enforced by D1
- `password_hash`: always set at creation; never returned to the client
- `failed_attempts`: incremented on wrong password; reset to 0 on successful login
- `lock_until`: NULL when not locked; compared server-side against current UTC time

---

### `session`

Represents a single authenticated browser session.

```sql
CREATE TABLE session (
  id               TEXT PRIMARY KEY,          -- crypto.randomUUID()
  user_id          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_token    TEXT NOT NULL UNIQUE,      -- 32-byte random → base64url (URL-safe)
  created_at       TEXT NOT NULL,             -- ISO 8601
  last_activity_at TEXT NOT NULL,             -- updated on every authenticated request
  expires_at       TEXT NOT NULL              -- last_activity_at + 24 hours
);

CREATE UNIQUE INDEX idx_session_token   ON session(session_token);
CREATE        INDEX idx_session_user_id ON session(user_id);
```

**Lifecycle**:
- Created on successful login; `session_token` placed in `HttpOnly; Secure; SameSite=Lax` cookie
- `last_activity_at` and `expires_at` updated on each authenticated request
- Invalidated (row deleted) on explicit logout or password change via reset flow
- Expired sessions (where `expires_at < now`) are treated as absent; periodic cleanup optional

**Session cookie spec**:
```
Set-Cookie: session=<session_token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

---

### `email_verification_token`

Short-lived token emailed to new registrants to confirm address ownership.

```sql
CREATE TABLE email_verification_token (
  id         TEXT    PRIMARY KEY,             -- crypto.randomUUID()
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,         -- 32-byte random → base64url
  created_at TEXT    NOT NULL,                -- ISO 8601
  expires_at TEXT    NOT NULL,                -- created_at + 24 hours
  used       INTEGER NOT NULL DEFAULT 0       -- 0=unused, 1=consumed
);

CREATE UNIQUE INDEX idx_evt_token   ON email_verification_token(token);
CREATE        INDEX idx_evt_user_id ON email_verification_token(user_id);
```

**Rules**:
- A new token invalidates all previous unused tokens for the same user (set `used=1` on re-send)
- On successful verification: `used` set to 1, `user.verified` set to 1 (single transaction)
- Token URL: `/verify-email/<token>` — token compared server-side, constant-time

---

### `password_reset_token`

Single-use, 60-minute token authorising one password change.

```sql
CREATE TABLE password_reset_token (
  id         TEXT    PRIMARY KEY,             -- crypto.randomUUID()
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,         -- 32-byte random → base64url
  created_at TEXT    NOT NULL,                -- ISO 8601
  expires_at TEXT    NOT NULL,                -- created_at + 60 minutes (FR-006)
  used       INTEGER NOT NULL DEFAULT 0       -- 0=unused, 1=consumed
);

CREATE UNIQUE INDEX idx_prt_token   ON password_reset_token(token);
CREATE        INDEX idx_prt_user_id ON password_reset_token(user_id);
```

**Rules**:
- Issuing a new reset token immediately invalidates all previous unused tokens for the same user
  (set `used=1`), per spec FR-006
- On successful password change: `used` set to 1, all `session` rows for the user are deleted
  (FR-007), new password hash written — all in a single D1 transaction
- Token URL: `/reset-password/<token>`

---

## Entity Relationships

```
user ──1:N──► session
user ──1:N──► email_verification_token
user ──1:N──► password_reset_token
```

- All child rows reference `user(id)` with `ON DELETE CASCADE`
- No circular references

---

## D1 Schema File Location

`src/db/schema.sql` — applied via:
```bash
wrangler d1 execute scheduler-auth --file=src/db/schema.sql
# For local dev:
wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
```

---

## TypeScript Types (generated from schema)

These types live in `src/lib/auth.types.ts` and are used across server functions:

```typescript
export interface User {
  id: string;
  email: string;
  password_hash: string;
  verified: 0 | 1;
  failed_attempts: number;
  lock_until: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  session_token: string;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
}

export interface EmailVerificationToken {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  used: 0 | 1;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string;
  used: 0 | 1;
}

/** Shape returned to the client / route context after session validation */
export interface SessionContext {
  userId: string;
  email: string;
}
```
