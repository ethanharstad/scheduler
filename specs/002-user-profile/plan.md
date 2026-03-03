# Implementation Plan: User Profile

**Branch**: `002-user-profile` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-user-profile/spec.md`

## Summary

Add a self-service user profile page for authenticated users. The feature extends the existing
auth system (001) with a new `user_profile` D1 table (1:1 with `user`) storing display name,
phone number, and a reference to a profile photo in Cloudflare R2. A single protected route
(`/profile`) lets users view and edit their details, change their password (invalidating all
other sessions), and upload or remove a profile photo. All data access goes through TanStack
Start server functions; the profile page is pre-loaded via a route loader.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict mode)
**Primary Dependencies**: TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (existing), Cloudflare R2 (new `PROFILE_PHOTOS` binding)
**Storage**: Cloudflare D1 — new `user_profile` table; Cloudflare R2 — `scheduler-profile-photos` bucket for avatar images
**Testing**: Vitest + Testing Library (`npm run test`)
**Target Platform**: Cloudflare Workers (edge runtime)
**Project Type**: Full-stack SSR web application
**Performance Goals**: Profile page initial load ≤ 2 s (SC-001); no specific server latency target beyond Workers p95 norms (~50 ms for D1 queries)
**Constraints**: No Node.js built-in APIs; bundle < 1 MB compressed; no new ORM or phone-number library dependencies; R2 binding required for photo storage
**Scale/Scope**: One `user_profile` row per user; one R2 object per user (deterministic key, overwritten on re-upload); photos ≤ 5 MB

## Constitution Check

*GATE: Must pass before implementation begins.*

### Principle I — Component-First Architecture ✅

The profile route (`_protected/profile.tsx`) is a self-contained component. The three form
sections (profile info, change password, photo upload) will be local functions within the
route file (each fits well under the 200-line single-component budget, and they are not
reused elsewhere — extracting them would violate YAGNI per Principle V). No component
reaches beyond its own file boundary.

### Principle II — Type Safety ✅

All server function inputs and outputs carry explicit TypeScript types (defined in
`src/lib/profile.types.ts`). The new `UserProfile`, `ProfileView`, `UpdateProfileInput`,
`ChangePasswordInput`, and `UploadPhotoInput` interfaces cover the full data surface. No
`any` usage; strict mode enforced.

### Principle III — Server-First Data Fetching ✅

The `/profile` route uses a `loader` that calls `getProfileServerFn` server-side, ensuring
the page arrives hydrated with profile data. All mutations (update, change password, photo
upload/removal) use POST server functions — no client-side `fetch` calls.

### Principle IV — Edge-Runtime Compatibility ✅

- D1 (existing binding `DB`): Workers-native. ✅
- R2 (new binding `PROFILE_PHOTOS`): Workers-native. ✅
- No Node.js built-ins used. `crypto.randomUUID()` and `globalThis.crypto` are used (already
  established pattern from feature 001). ✅
- Photo upload uses `base64` → `Uint8Array` decode (Web API, no Node Buffer). ✅
- No new runtime dependencies added to the bundle. ✅

**Note**: R2 is a new binding type not previously used in this project. It must be declared
in `wrangler.jsonc`, and `src/types/env.d.ts` must be updated with `PROFILE_PHOTOS: R2Bucket`.
This is documented in the Complexity Tracking table.

### Principle V — Simplicity & YAGNI ✅

- No new abstractions introduced. `validatePasswordStrength` and `verifyPassword`/`hashPassword`
  reused directly from `src/server/auth.ts` and `src/lib/auth.ts`.
- No new library dependencies.
- Form sections stay in the route file (single use).
- Phone validation uses a short regex inline — no library.
- Photo key is deterministic (`profile-photos/<user_id>`) — no UUID needed, no lookup table.

## Project Structure

### Documentation (this feature)

```text
specs/002-user-profile/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── server-functions.md   ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks — not created here)
```

### Source Code Changes

**New files**:
```text
src/
├── lib/
│   └── profile.types.ts              # UserProfile, ProfileView, input types
├── server/
│   └── profile.ts                    # 5 server functions (get, update, changePassword, upload, remove)
└── routes/
    ├── profile.photo.$userId.tsx     # Photo serving route (loader-only, returns Response)
    └── _protected/
        └── profile.tsx               # Profile page route (/profile)
```

**Modified files**:
```text
src/
├── db/schema.sql                     # + user_profile table
└── types/env.d.ts                    # + PROFILE_PHOTOS: R2Bucket
wrangler.jsonc                        # + r2_buckets binding
```

**Structure Decision**: Single-project layout (existing). Profile feature follows the same
`src/server/` + `src/routes/_protected/` + `src/lib/` pattern established in feature 001.
No new directories needed beyond what already exists.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| New Cloudflare binding type (R2) | Profile photo storage requires an object store; D1 is not designed for binary data | Skipping photo upload entirely would drop P4 scope (US4); storing base64 in D1 would work for tiny images but fails the 5 MB requirement and degrades query performance |
