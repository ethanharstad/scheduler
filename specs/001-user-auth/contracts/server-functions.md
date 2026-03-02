# Server Function Contracts: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-03-02

These are the TanStack Start `createServerFn` contracts for the authentication feature.
All functions run server-side on Cloudflare Workers. All inputs and outputs carry explicit
TypeScript types (Principle II). All mutations use `method: 'POST'`.

---

## `getSessionServerFn`

**Purpose**: Validate the session cookie and return the current user context, or `null`.
Used in every `beforeLoad` hook to guard protected routes.

**Method**: `GET`
**Location**: `src/lib/auth.ts`

```typescript
// Input: none (reads cookie from request headers internally)
// Output:
type GetSessionOutput =
  | { userId: string; email: string }
  | null;
```

**Behaviour**:
1. Extracts `session` cookie from request headers
2. Queries `session` table by `session_token` where `expires_at > now`
3. Updates `last_activity_at` and extends `expires_at` by 24 h on hit
4. Returns `SessionContext` on valid session, `null` otherwise

**Side effects**: Updates `last_activity_at` / `expires_at` in D1 on every call with a valid session.

---

## `loginServerFn`

**Purpose**: Authenticate with email + password; create a session; set the session cookie.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type LoginInput = {
  email: string;     // required; validated as email format
  password: string;  // required; min 1 char (strength already enforced at registration)
};

// Output (success):
type LoginOutput =
  | { success: true; redirectTo: string }
  | { success: false; error: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'EMAIL_UNVERIFIED'; lockedUntil?: string };
```

**Behaviour**:
1. Normalise email to lowercase
2. Look up `user` by email; return `INVALID_CREDENTIALS` generically if not found (no enumeration)
3. Check `lock_until`; return `ACCOUNT_LOCKED` with `lockedUntil` ISO string if active
4. Verify password via PBKDF2-SHA256; increment `failed_attempts` on failure; lock on ≥ 10
5. Check `user.verified`; return `EMAIL_UNVERIFIED` if 0
6. Reset `failed_attempts = 0`, `lock_until = NULL`
7. Insert `session` row; set `Set-Cookie` header; return `{ success: true, redirectTo }`
8. Log `session_created` security event

**Response headers** (on success):
```
Set-Cookie: session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400
```

---

## `registerServerFn`

**Purpose**: Create a new user account and dispatch a verification email.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type RegisterInput = {
  email: string;    // required; RFC 5322 format
  password: string; // required; min 8 chars, ≥1 letter, ≥1 digit
};

// Output:
type RegisterOutput =
  | { success: true }
  | { success: false; error: 'EMAIL_TAKEN' | 'INVALID_INPUT'; field?: 'email' | 'password' };
```

**Behaviour**:
1. Normalise email to lowercase; validate format server-side
2. Validate password strength (8+ chars, ≥1 letter, ≥1 digit)
3. Check `user` table for existing email; return `EMAIL_TAKEN` if found
4. Hash password (PBKDF2-SHA256)
5. Insert `user` row (`verified = 0`)
6. Generate email verification token (32-byte random, expires 24 h); insert row
7. Attempt to send verification email via Resend — best-effort (failure does not roll back user creation)
8. Return `{ success: true }` — client shows "check your inbox" regardless of email delivery

---

## `verifyEmailServerFn`

**Purpose**: Mark a user's email as verified given a valid, unexpired token.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type VerifyEmailInput = {
  token: string; // from URL param
};

// Output:
type VerifyEmailOutput =
  | { success: true }
  | { success: false; error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'ALREADY_USED' };
```

**Behaviour**:
1. Look up `email_verification_token` by `token` where `used = 0`
2. Return `INVALID_TOKEN` if not found; `EXPIRED_TOKEN` if `expires_at < now`; `ALREADY_USED` if `used = 1`
3. In a single D1 transaction: set `token.used = 1`, set `user.verified = 1`
4. Return `{ success: true }`

---

## `resendVerificationServerFn`

**Purpose**: Issue a new verification email for an unverified account, subject to cooldown.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type ResendVerificationInput = {
  email: string;
};

// Output:
type ResendVerificationOutput =
  | { success: true }
  | { success: false; error: 'COOLDOWN' | 'ALREADY_VERIFIED' | 'NOT_FOUND'; retryAfter?: number };
```

**Behaviour**:
1. Look up `user` by email; return generic `{ success: true }` if not found (no enumeration)
2. Return `ALREADY_VERIFIED` if `user.verified = 1`
3. Check most-recent `email_verification_token` for this user; return `COOLDOWN` with `retryAfter`
   seconds if `created_at` is within the last 60 seconds (FR-011)
4. Invalidate all previous unused tokens for this user (`used = 1`)
5. Generate new token; send email best-effort; return `{ success: true }`

---

## `forgotPasswordServerFn`

**Purpose**: Issue a password-reset email for a registered address.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type ForgotPasswordInput = {
  email: string;
};

// Output:
type ForgotPasswordOutput = { success: true }; // always — no email enumeration
```

**Behaviour**:
1. Normalise email; look up `user` — if not found, return `{ success: true }` silently (FR-005)
2. Check most-recent `password_reset_token` for this user; enforce 60-second cooldown (FR-011)
   — still returns `{ success: true }` externally (no enumeration)
3. Invalidate all previous unused reset tokens for this user
4. Generate new reset token (32-byte random, expires 60 min); insert row
5. Send password-reset email via Resend — best-effort
6. Return `{ success: true }`

---

## `resetPasswordServerFn`

**Purpose**: Set a new password using a valid reset token; invalidate all sessions.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input:
type ResetPasswordInput = {
  token: string;    // from URL param
  password: string; // new password; must meet strength requirements
};

// Output:
type ResetPasswordOutput =
  | { success: true }
  | { success: false; error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'ALREADY_USED' | 'INVALID_INPUT' };
```

**Behaviour**:
1. Look up `password_reset_token` by `token` where `used = 0`
2. Return appropriate error if invalid, expired, or already used
3. Validate new password strength server-side
4. In a single D1 transaction:
   a. Hash new password (PBKDF2-SHA256)
   b. Update `user.password_hash`
   c. Set `password_reset_token.used = 1`
   d. Delete all `session` rows for this user (FR-007)
5. Log `password_changed` security event
6. Return `{ success: true }`

---

## `logoutServerFn`

**Purpose**: Terminate the current session and clear the session cookie.

**Method**: `POST`
**Location**: `src/server/auth.ts`

```typescript
// Input: none (reads cookie from request headers internally)
// Output:
type LogoutOutput = { success: true };
```

**Behaviour**:
1. Extract `session` cookie from request headers
2. Delete the matching `session` row from D1 (if found)
3. Log `session_terminated` security event
4. Return `{ success: true }` with `Set-Cookie` header to clear the cookie

**Response headers**:
```
Set-Cookie: session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
```

---

## Route-Level `beforeLoad` Contracts

### Protected route guard (`src/routes/_protected/__layout.tsx`)

```typescript
beforeLoad: async ({ location }) => {
  const session = await getSessionServerFn();
  if (!session) {
    throw redirect({ to: '/login', search: { from: location.pathname } });
  }
  return { session }; // available to child routes via useRouteContext()
}
```

### Login / register redirect for authenticated users

```typescript
beforeLoad: async () => {
  const session = await getSessionServerFn();
  if (session) throw redirect({ to: '/' });
}
```
