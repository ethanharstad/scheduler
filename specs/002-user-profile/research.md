# Research: User Profile

**Branch**: `002-user-profile` | **Date**: 2026-03-02
**Purpose**: Resolve all technical unknowns before Phase 1 design

---

## 1. Profile Data Storage — New Table vs. Extending `user`

### Decision: New `user_profile` table (1:1 with `user`)

**Rationale**: The existing `user` table deliberately contains only auth-related fields (per
feature 001 data-model note: "No profile fields beyond auth-related attributes"). Maintaining
that separation keeps the auth module clean and avoids a growing `user` table as future profile
fields are added. A dedicated `user_profile` table with `user_id` as primary key (and FK)
expresses the 1:1 relationship without joins on the hot authentication path.

**Row creation strategy**: `user_profile` rows are created lazily via `INSERT OR IGNORE` when
`getProfileServerFn` is first called. This avoids modifying the existing `registerServerFn`
from feature 001 and is safe because the profile page is only reachable by authenticated,
verified users.

**Alternatives considered**:
- **Add columns to `user`**: Simpler (no join), but mixes auth and profile concerns; future
  profile growth (e.g., bio, timezone, preferences) would bloat the auth table. Rejected in
  favour of separation.
- **Separate `user_profile` created at registration**: Requires modifying `registerServerFn`
  (feature 001 code). Rejected to avoid cross-feature entanglement.

---

## 2. Profile Photo Storage — Cloudflare R2

### Decision: Cloudflare R2 with a server-proxied photo endpoint

**Rationale**: R2 is the Cloudflare-native object store, requires no egress fees within the
Workers ecosystem, and is Workers-compatible via the `PROFILE_PHOTOS` R2 binding. Photos are
stored at a deterministic key (`profile-photos/<user_id>`) — one slot per user, overwritten
on re-upload. The photo is served through a dedicated route
`/profile/photo/$userId` that streams the R2 object back to the browser. This avoids exposing
R2 bucket URLs directly and allows future cache-control header tuning.

**Upload mechanism**: Images are base64-encoded on the client before being sent to the upload
server function as a JSON-serialisable string. Decoded server-side before writing to R2.
A 5 MB image encodes to ~6.7 MB base64 — well within the Cloudflare Workers 100 MB request
body limit.

**Failure mode (Clarification Q5)**: If R2 is unavailable, the upload/removal server function
returns `{ success: false, error: 'STORAGE_UNAVAILABLE' }`. The profile page shows a specific
error message for photo operations while all other profile actions (edit, password change)
remain fully available.

**wrangler.jsonc binding**:
```jsonc
"r2_buckets": [
  {
    "binding": "PROFILE_PHOTOS",
    "bucket_name": "scheduler-profile-photos"
  }
]
```

After adding the binding, run `npm run cf-typegen` to update `worker-configuration.d.ts`,
then extend `src/types/env.d.ts` with `PROFILE_PHOTOS: R2Bucket`.

**Alternatives considered**:
- **Pre-signed R2 upload URLs**: Client uploads directly to R2. Avoids routing the payload
  through the Worker. More complex (requires generating a signed URL server-side, then a
  separate client-to-R2 PUT). Rejected as over-engineered for P4 scope (Principle V).
- **External storage (Cloudflare Images, AWS S3)**: Adds external dependency. Rejected in
  favour of Cloudflare-native solution (Principle IV).
- **Store image as D1 BLOB**: D1 is not designed for binary data storage. Rejected.

---

## 3. Phone Number Validation — Regex vs. Library

### Decision: Loose international format regex; no external library

**Rationale**: The spec requires accepting "any globally valid phone number format" (Clarification
Q3). `libphonenumber-js` is the definitive solution but adds ~190 KB to the bundle, approaching
the Cloudflare Workers 1 MB compressed limit (Principle IV constraint). For a non-critical
profile field, a permissive regex that rejects obviously malformed inputs is proportionate.

**Validation rule**: Phone number must match `^\+?[\d\s\-\(\)]{7,20}$` — permits digits,
spaces, hyphens, and parentheses; 7–20 characters total; optional leading `+`. This accepts
common international formats (E.164, local-style) while rejecting garbage input.

**Alternatives considered**:
- **libphonenumber-js**: Accurate per-country validation. Rejected due to bundle size impact
  near the Workers limit (Principle IV).
- **Accept any non-empty string**: No validation. Rejected — the spec explicitly requires
  format validation for phone numbers.

---

## 4. Password Change — Session Invalidation Strategy

### Decision: Delete all sessions except the current one (keep current session active)

**Rationale**: Clarification Q1 states "all other active sessions are invalidated; only the
current session remains active." The current session is identified by the `session_token`
cookie present in the request. The implementation reads the cookie, then runs:

```sql
DELETE FROM session WHERE user_id = ? AND session_token != ?
```

This is an atomic D1 operation batched with the password hash update, ensuring no window
between the password change and the session purge.

**This differs from the existing `resetPasswordServerFn`** (feature 001), which deletes ALL
sessions (including the current one). The change-password flow should not force the user to
re-login immediately — they are already authenticated and explicitly performing a security action.

---

## 5. Profile Photo Serving — Photo Route

### Decision: New TanStack Start route `src/routes/profile.photo.$userId.tsx`

**Rationale**: A route-based photo endpoint allows:
1. Serving photos without exposing R2 bucket URLs or requiring public bucket access.
2. Adding `Cache-Control` headers (`public, max-age=3600`) to allow CDN caching.
3. Future auth checks if photos ever become non-public.

The route is a loader-only route (no React component) that returns a `Response` with the R2
object's body and appropriate headers. TanStack Start supports returning a `Response` directly
from a loader.

**Key: deterministic** — `profile-photos/<user_id>` — so the URL is predictable and cacheable.

---

## Unresolved / Deferred Decisions

| Item | Decision | Notes |
|---|---|---|
| R2 bucket public vs. private | Private (served through proxy route) | Avoids exposing bucket config; simpler setup |
| Photo CDN caching | `Cache-Control: public, max-age=3600` | 1-hour browser cache; invalidated by re-upload changing the key or adding a cache-bust param |
| Phone number display formatting | Stored and displayed as-entered | Normalisation (e.g., E.164) deferred to a future iteration |
| Concurrent edit conflict | Last-write-wins (Clarification Q4) | No optimistic-lock header needed |
