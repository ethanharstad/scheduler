# Implemented Features

Tracks all features that have been built and are live in the codebase. When a roadmap item is implemented, move it here with its spec reference.

---

## 001 — User Authentication

**Spec:** `specs/001-user-auth/`

Login, registration, email verification, password reset, and logout. Includes session management with expiry, account lockout after failed attempts, and PBKDF2-SHA256 password hashing. Workers-safe token generation for all auth flows.

---

## 002 — User Profile

**Spec:** `specs/002-user-profile/`

Authenticated users can view and edit their profile (display name, phone number), change password, and upload/remove profile photos stored in Cloudflare R2.

---

## 003 — Organization Creation

**Spec:** `specs/003-create-org/`

Authenticated users create organizations as top-level tenants with slug-based URL routing. Creator becomes Owner automatically. Supports multi-org membership per user (soft limit of 10). Each org gets a dedicated Durable Object instance for data isolation.

---

## 004 — Organization RBAC

**Spec:** `specs/004-org-rbac/`

Five fixed roles — Owner, Admin, Manager, Employee, Payroll/HR — with a server-enforced permission matrix (`src/lib/rbac.ts`). Admins manage member roles (except Owner); only Owner can transfer ownership. Session invalidation on role changes.

---

## 005 — Staff Management

**Spec:** `specs/005-staff-management/`

Roster-only staff (no platform account required), pending invitations with 7-day token expiry, and account-linked active staff. Role assignment, invitation acceptance via `/join/$token`, and a full audit log tracking add, remove, role change, invite, and cancel actions. Roster visible to all org members; write access restricted to admins and owners.

---

## 006 — Platoon Management

**Spec:** `specs/006-platoon-management/`

Shift rotation groups (platoons) with RRULE-based recurrence patterns supporting 24/48, 24/72, Kelly, and custom rotations. Staff assigned to at most one platoon. Includes member assignment/removal, platoon deletion (clears assignments, retains staff), and read-only visibility for all org members.

---

## 007 — Asset Management

**Spec:** `specs/007-asset-management/`

Unified tracking of apparatus (vehicles — engines, ambulances, etc.) and gear (PPE, SCBA, radios, tools). Gear can be assigned to staff, apparatus, or locations. Supports inspection scheduling with recurrence rules, pass/fail inspection results via the form system, expiration tracking, status lifecycle (in-service through decommissioned), and immutable audit logs.

---

## Additional Implemented Capabilities

These features were built alongside or after the numbered specs:

### System Admin Panel
Admin routes (`/admin`, `/admin/orgs`, `/admin/users`) for system-wide user and organization management. Gated by `is_system_admin` flag on the user table.

### Stations
Station/location management per org with name, code, address, active/inactive status, and sort ordering.

### Qualifications System
Ranks (ordered hierarchy), certification types (optionally leveled via cert levels), positions (with rank and certification requirements), and per-staff certification tracking with issue/expiry dates and status.

### Schedule Builder
Schedule creation with draft status, shift assignments linking staff to date/time slots and positions, and a calendar view component (`ScheduleCalendar`).

### Schedule Requirements
Configurable staffing requirements per position with recurrence rules, time windows, and min/max staff counts.

### Staff Availability & Constraints
Staff can submit time-off requests, unavailability, preferred/not-preferred time slots. Supports pending/approved/denied status with reviewer tracking.

### Form System
Template-based forms with versioned field definitions, a visual form builder (`FieldBuilder`), and a form renderer for submissions. Supports equipment inspection, property inspection, medication, and custom categories. Submissions link to asset inspection schedules or arbitrary entities. System-level templates (D1) and org-level templates (Durable Object).
