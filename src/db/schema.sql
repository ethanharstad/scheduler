-- Scheduler — D1 Schema
-- Apply: wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
-- All datetimes: ISO 8601 TEXT. Booleans: INTEGER 0/1. PKs: crypto.randomUUID().
-- Tables are dependency-ordered: referenced tables are created before referencing tables.

-- ============================================================
-- Auth (001-user-auth)
-- ============================================================

CREATE TABLE IF NOT EXISTS user (
  id              TEXT    PRIMARY KEY,
  email           TEXT    NOT NULL UNIQUE,        -- stored lowercase
  password_hash   TEXT    NOT NULL,               -- base64(salt[32] || PBKDF2-SHA256[32])
  verified        INTEGER NOT NULL DEFAULT 0,     -- 0=unverified, 1=verified
  failed_attempts INTEGER NOT NULL DEFAULT 0,     -- consecutive failed login count
  lock_until      TEXT,                           -- ISO 8601 or NULL
  is_system_admin INTEGER NOT NULL DEFAULT 0,     -- 0=regular user, 1=platform admin
  created_at      TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON user(email);

CREATE TABLE IF NOT EXISTS session (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_token    TEXT NOT NULL UNIQUE,           -- 32-byte random → base64url
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  expires_at       TEXT NOT NULL                   -- last_activity_at + 24 hours
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token   ON session(session_token);
CREATE        INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);

CREATE TABLE IF NOT EXISTS email_verification_token (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,              -- 32-byte random → base64url
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,                     -- created_at + 24 hours
  used       INTEGER NOT NULL DEFAULT 0            -- 0=unused, 1=consumed
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evt_token   ON email_verification_token(token);
CREATE        INDEX IF NOT EXISTS idx_evt_user_id ON email_verification_token(user_id);

CREATE TABLE IF NOT EXISTS password_reset_token (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,              -- 32-byte random → base64url
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,                     -- created_at + 60 minutes
  used       INTEGER NOT NULL DEFAULT 0            -- 0=unused, 1=consumed
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prt_token   ON password_reset_token(token);
CREATE        INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_token(user_id);

-- ============================================================
-- User Profile (002-user-profile)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profile (
  user_id      TEXT NOT NULL PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,           -- required; editable; defaults to email local-part
  phone_number TEXT,                    -- optional; loosely validated international format or NULL
  avatar_key   TEXT,                    -- R2 object key ("profile-photos/<user_id>") or NULL
  updated_at   TEXT NOT NULL            -- ISO 8601
);

-- ============================================================
-- Organization & Membership (003-create-org)
-- ============================================================

CREATE TABLE IF NOT EXISTS organization (
  id                  TEXT NOT NULL PRIMARY KEY,              -- crypto.randomUUID()
  slug                TEXT NOT NULL UNIQUE,                   -- 2-50 chars, lowercase [a-z0-9-], globally unique URL handle
  name                TEXT NOT NULL,                          -- 2-100 chars, display name
  plan                TEXT NOT NULL DEFAULT 'free',           -- 'free' (Phase 8 adds more)
  status              TEXT NOT NULL DEFAULT 'active',         -- 'active' (deletion deferred to future feature)
  schedule_day_start  TEXT NOT NULL DEFAULT '00:00',          -- HH:MM; start of scheduling day (e.g. '07:00' for 24-hr fire shifts)
  created_at          TEXT NOT NULL                           -- ISO 8601
);

-- Migration for existing DBs:
-- wrangler d1 execute scheduler-auth --local --command="ALTER TABLE organization ADD COLUMN schedule_day_start TEXT NOT NULL DEFAULT '00:00'"
-- wrangler d1 execute scheduler-auth --command="ALTER TABLE organization ADD COLUMN schedule_day_start TEXT NOT NULL DEFAULT '00:00'"

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_slug   ON organization(slug);
CREATE        INDEX IF NOT EXISTS idx_org_status ON organization(status);

CREATE TABLE IF NOT EXISTS org_membership (
  id        TEXT NOT NULL PRIMARY KEY,               -- crypto.randomUUID()
  org_id    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role      TEXT NOT NULL,                           -- 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'
  status    TEXT NOT NULL DEFAULT 'active',          -- 'active' | 'inactive'
  joined_at TEXT NOT NULL                            -- ISO 8601
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_unique ON org_membership(org_id, user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_user   ON org_membership(user_id);
CREATE        INDEX IF NOT EXISTS idx_org_membership_org    ON org_membership(org_id);

-- ============================================================
-- Qualifications (008-qualifications)
-- Must precede staff_member (rank FK) and position (rank FK)
-- ============================================================

CREATE TABLE IF NOT EXISTS rank (
  id         TEXT NOT NULL PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,           -- org-defined, e.g. "Captain"
  sort_order INTEGER NOT NULL,        -- 1=lowest; higher=more senior
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (sort_order >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_org_name  ON rank(org_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_rank_org_order ON rank(org_id, sort_order);

-- Org-defined certification categories
CREATE TABLE IF NOT EXISTS cert_type (
  id          TEXT NOT NULL PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,           -- org-defined; unique per org
  description TEXT,
  is_leveled  INTEGER NOT NULL DEFAULT 0,  -- 0=single credential, 1=has ordered levels
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_type_org_name ON cert_type(org_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_cert_type_org      ON cert_type(org_id);

-- Org-defined levels within a leveled cert_type
CREATE TABLE IF NOT EXISTS cert_level (
  id           TEXT NOT NULL PRIMARY KEY,
  cert_type_id TEXT NOT NULL REFERENCES cert_type(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,         -- org-defined level name
  level_order  INTEGER NOT NULL,      -- 1=lowest; higher=more advanced
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_level_type_order ON cert_level(cert_type_id, level_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_level_type_name  ON cert_level(cert_type_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_cert_level_type       ON cert_level(cert_type_id);

-- Named shift positions with requirements
CREATE TABLE IF NOT EXISTS position (
  id          TEXT NOT NULL PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  min_rank_id TEXT REFERENCES rank(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- higher = more important; matches rank convention
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_position_org_name  ON position(org_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_position_org       ON position(org_id);
CREATE        INDEX IF NOT EXISTS idx_position_org_order ON position(org_id, sort_order);

-- Which cert types a position requires (AND logic: all must be met)
CREATE TABLE IF NOT EXISTS position_cert_requirement (
  id                TEXT NOT NULL PRIMARY KEY,
  position_id       TEXT NOT NULL REFERENCES position(id) ON DELETE CASCADE,
  cert_type_id      TEXT NOT NULL REFERENCES cert_type(id) ON DELETE CASCADE,
  min_cert_level_id TEXT REFERENCES cert_level(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  UNIQUE (position_id, cert_type_id)
);
CREATE INDEX IF NOT EXISTS idx_pos_cert_req_position ON position_cert_requirement(position_id);

-- ============================================================
-- Staff Member Management (005-staff-management)
-- Depends on: organization, user, rank, position
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_member (
  id           TEXT NOT NULL PRIMARY KEY,               -- crypto.randomUUID()
  org_id       TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES user(id) ON DELETE SET NULL, -- NULL if no account yet
  name         TEXT NOT NULL,                           -- 1-100 chars
  email        TEXT,                                    -- optional; required if phone is NULL
  phone        TEXT,                                    -- optional; required if email is NULL
  role         TEXT NOT NULL DEFAULT 'employee',        -- OrgRole
  status       TEXT NOT NULL DEFAULT 'roster_only',     -- roster_only | pending | active | removed
  added_by     TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,                           -- ISO 8601
  updated_at   TEXT NOT NULL,                           -- ISO 8601
  rank_id      TEXT REFERENCES rank(id)     ON DELETE SET NULL,
  position_id  TEXT REFERENCES position(id) ON DELETE SET NULL,

  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_member_org_email
  ON staff_member(org_id, email) WHERE email IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_staff_member_org    ON staff_member(org_id);
CREATE        INDEX IF NOT EXISTS idx_staff_member_user   ON staff_member(user_id) WHERE user_id IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_staff_member_rank   ON staff_member(rank_id) WHERE rank_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_invitation (
  id              TEXT NOT NULL PRIMARY KEY,            -- crypto.randomUUID()
  org_id          TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,                 -- 32-byte random, base64url
  invited_by      TEXT REFERENCES user(id) ON DELETE SET NULL,
  expires_at      TEXT NOT NULL,                        -- ISO 8601; 7 days from creation
  status          TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | cancelled
  created_at      TEXT NOT NULL                         -- ISO 8601
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitation_token      ON staff_invitation(token);
CREATE        INDEX IF NOT EXISTS idx_staff_invitation_org_member ON staff_invitation(org_id, staff_member_id);

CREATE TABLE IF NOT EXISTS staff_audit_log (
  id              TEXT NOT NULL PRIMARY KEY,            -- crypto.randomUUID()
  org_id          TEXT NOT NULL,                        -- denormalized; org may be deleted later
  staff_member_id TEXT,                                 -- NULL if member record removed
  performed_by    TEXT,                                 -- user_id; NULL if system action
  action          TEXT NOT NULL,                        -- StaffAuditAction
  metadata        TEXT,                                 -- JSON: action-specific details
  created_at      TEXT NOT NULL                         -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_org ON staff_audit_log(org_id, created_at DESC);

-- Staff credential records (one active record per person per cert type)
CREATE TABLE IF NOT EXISTS staff_certification (
  id              TEXT NOT NULL PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  cert_type_id    TEXT NOT NULL REFERENCES cert_type(id) ON DELETE CASCADE,
  cert_level_id   TEXT REFERENCES cert_level(id) ON DELETE SET NULL,
  issued_at       TEXT,           -- ISO 8601 date or NULL
  expires_at      TEXT,           -- ISO 8601 date or NULL (no expiry)
  cert_number     TEXT,           -- license/cert number, optional
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
  added_by        TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
-- One record per person per cert type; upgrading a level = UPDATE, not new row
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_cert_member_type ON staff_certification(staff_member_id, cert_type_id);
CREATE        INDEX IF NOT EXISTS idx_staff_cert_org         ON staff_certification(org_id);
CREATE        INDEX IF NOT EXISTS idx_staff_cert_member      ON staff_certification(staff_member_id);
CREATE        INDEX IF NOT EXISTS idx_staff_cert_expiry
  ON staff_certification(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- ============================================================
-- Scheduling (006-scheduling)
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule (
  id         TEXT NOT NULL PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,                          -- YYYY-MM-DD, inclusive
  end_date   TEXT NOT NULL,                          -- YYYY-MM-DD, inclusive
  status     TEXT NOT NULL DEFAULT 'draft',          -- 'draft' | 'published'
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_org       ON schedule(org_id);
CREATE INDEX IF NOT EXISTS idx_schedule_org_dates ON schedule(org_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS shift_assignment (
  id              TEXT NOT NULL PRIMARY KEY,
  schedule_id     TEXT NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  start_datetime  TEXT NOT NULL,                     -- ISO 8601 datetime
  end_datetime    TEXT NOT NULL,                     -- ISO 8601 datetime
  position        TEXT,                              -- e.g. "Engine 1", "Medic 2"
  position_id     TEXT REFERENCES position(id) ON DELETE SET NULL, -- optional; links to named position
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_shift_assignment_schedule ON shift_assignment(schedule_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignment_staff    ON shift_assignment(staff_member_id);

-- ============================================================
-- Platoon Management (006-platoon-management)
-- ============================================================

CREATE TABLE IF NOT EXISTS platoon (
  id          TEXT NOT NULL PRIMARY KEY,            -- crypto.randomUUID()
  org_id      TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                        -- 2-100 chars; unique within org (case-insensitive)
  shift_label TEXT NOT NULL,                        -- e.g. "A Shift", "B Shift"; user-editable; independent of rrules
  rrules      TEXT NOT NULL,                        -- JSON: RRuleEntry[] = [{rrule, startOffset}]; each rrule anchors to start_date + startOffset days
  start_date       TEXT NOT NULL,                   -- YYYY-MM-DD; anchors RRULE to calendar (acts as DTSTART)
  shift_start_time TEXT NOT NULL DEFAULT '08:00',   -- HH:MM; start time of shift
  shift_end_time   TEXT NOT NULL DEFAULT '08:00',   -- HH:MM; end time of shift (≤ start = crosses midnight)
  description TEXT,                                 -- optional; free text
  color       TEXT,                                 -- optional; e.g. "#e63946" or "red"
  created_at  TEXT NOT NULL,                        -- ISO 8601
  updated_at  TEXT NOT NULL                         -- ISO 8601
);

-- Case-insensitive unique name per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_org_name ON platoon(org_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_platoon_org      ON platoon(org_id);

CREATE TABLE IF NOT EXISTS platoon_membership (
  id              TEXT NOT NULL PRIMARY KEY,         -- crypto.randomUUID()
  platoon_id      TEXT NOT NULL REFERENCES platoon(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  position_id     TEXT REFERENCES position(id) ON DELETE SET NULL, -- optional; role/position within the platoon
  assigned_at     TEXT NOT NULL                      -- ISO 8601; date of current assignment
);

-- Enforces one-platoon-per-member at the DB level (last-write-wins via INSERT OR REPLACE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_membership_staff   ON platoon_membership(staff_member_id);
CREATE        INDEX IF NOT EXISTS idx_platoon_membership_platoon ON platoon_membership(platoon_id);

-- ============================================================
-- Scheduling Constraints (007-scheduling-constraints)
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_constraint (
  id              TEXT NOT NULL PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  created_by      TEXT REFERENCES user(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK(type IN ('time_off', 'unavailable', 'preferred', 'not_preferred')),
  status          TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'denied')),
  start_datetime  TEXT NOT NULL,    -- ISO 8601 datetime (e.g. 2026-03-15T00:00:00)
  end_datetime    TEXT NOT NULL,    -- ISO 8601 datetime, must be > start_datetime
  -- Optional recurrence: NULL = one-time; non-NULL = applies to matching days within the
  -- [start_datetime..end_datetime] window; time-of-day bounds come from the datetime values
  days_of_week    TEXT,             -- JSON number[] e.g. [1,3,5]; 0=Sun … 6=Sat; NULL = not recurring
  reason          TEXT,             -- optional free text
  reviewer_id     TEXT REFERENCES user(id) ON DELETE SET NULL,
  reviewed_at     TEXT,             -- ISO 8601 or NULL
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_staff_constraint_org     ON staff_constraint(org_id);
CREATE INDEX IF NOT EXISTS idx_staff_constraint_member  ON staff_constraint(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_constraint_pending ON staff_constraint(org_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_staff_constraint_dates   ON staff_constraint(staff_member_id, start_datetime, end_datetime);

-- ============================================================
-- Schedule Requirements (009-schedule-requirements)
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_requirement (
  id               TEXT NOT NULL PRIMARY KEY,
  org_id           TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,                         -- 1-100 chars
  position_id      TEXT REFERENCES position(id) ON DELETE SET NULL,
  min_staff        INTEGER NOT NULL DEFAULT 1,
  max_staff        INTEGER,                               -- NULL = no cap; if set, >= min_staff
  effective_start  TEXT NOT NULL,                         -- YYYY-MM-DD inclusive
  effective_end    TEXT,                                  -- YYYY-MM-DD inclusive; NULL = no end date
  rrule            TEXT NOT NULL,                         -- single RFC 5545 RRULE string (no "RRULE:" prefix)
  window_start_time     TEXT,                            -- HH:MM; start of staffing window; NULL = no time constraint
  window_end_time       TEXT,                            -- HH:MM; end of staffing window; NULL = no time constraint
  window_end_day_offset INTEGER,                         -- days after RRULE anchor that window ends (0=same day); NULL = no time window
  sort_order       INTEGER NOT NULL DEFAULT 0,            -- explicit display ordering; lower = first
  created_by       TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (effective_end IS NULL OR effective_end >= effective_start),
  CHECK (min_staff >= 0),
  CHECK (max_staff IS NULL OR max_staff >= min_staff),
  CHECK (window_end_day_offset IS NULL OR window_end_day_offset >= 0)
);

CREATE INDEX IF NOT EXISTS idx_schedule_req_org       ON schedule_requirement(org_id);
CREATE INDEX IF NOT EXISTS idx_schedule_req_org_dates ON schedule_requirement(org_id, effective_start, effective_end);
CREATE INDEX IF NOT EXISTS idx_schedule_req_org_order ON schedule_requirement(org_id, sort_order);

-- ============================================================
-- Asset Management (007-asset-management)
-- ============================================================

CREATE TABLE IF NOT EXISTS asset (
  id                        TEXT NOT NULL PRIMARY KEY,
  org_id                    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_type                TEXT NOT NULL,
  name                      TEXT NOT NULL,
  category                  TEXT NOT NULL,
  status                    TEXT NOT NULL,
  serial_number             TEXT,
  make                      TEXT,
  model                     TEXT,
  notes                     TEXT,
  manufacture_date          TEXT,
  purchased_date            TEXT,
  in_service_date           TEXT,
  expiration_date           TEXT,
  warranty_expiration_date  TEXT,
  custom_fields             TEXT,
  unit_number               TEXT,
  assigned_to_staff_id      TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
  assigned_to_apparatus_id  TEXT REFERENCES asset(id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  CHECK (asset_type IN ('apparatus', 'gear')),
  CHECK (asset_type != 'apparatus' OR unit_number IS NOT NULL),
  CHECK (asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)),
  CHECK (NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_unit
  ON asset(org_id, unit_number) WHERE unit_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_org_serial
  ON asset(org_id, serial_number) WHERE serial_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_org_type
  ON asset(org_id, asset_type, status);

CREATE INDEX IF NOT EXISTS idx_asset_staff_assignment
  ON asset(assigned_to_staff_id) WHERE assigned_to_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_apparatus_assignment
  ON asset(assigned_to_apparatus_id) WHERE assigned_to_apparatus_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_expiration
  ON asset(org_id, expiration_date) WHERE expiration_date IS NOT NULL;

-- Inspection schedules: many-to-many between assets and form templates
CREATE TABLE IF NOT EXISTS asset_inspection_schedule (
  id                        TEXT NOT NULL PRIMARY KEY,
  org_id                    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_id                  TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  form_template_id          TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  recurrence_rule           TEXT NOT NULL,                -- JSON: {"freq":"weekly","dayOfWeek":5}
  interval_days             INTEGER NOT NULL,             -- derived from freq for simpler queries
  next_inspection_due       TEXT,                         -- ISO date, recalculated after each submission
  is_active                 INTEGER NOT NULL DEFAULT 1,   -- soft-disable without deleting
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ais_asset ON asset_inspection_schedule(org_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_ais_due   ON asset_inspection_schedule(org_id, next_inspection_due) WHERE next_inspection_due IS NOT NULL AND is_active = 1;

CREATE TABLE IF NOT EXISTS asset_audit_log (
  id               TEXT NOT NULL PRIMARY KEY,
  org_id           TEXT NOT NULL,
  actor_staff_id   TEXT NOT NULL,
  action           TEXT NOT NULL,
  asset_id         TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  detail_json      TEXT,
  created_at       TEXT NOT NULL,
  CHECK (action IN (
    'asset.created',
    'asset.updated',
    'asset.status_changed',
    'asset.assigned',
    'asset.unassigned',
    'asset.schedule_created',
    'asset.schedule_updated',
    'asset.schedule_deleted'
  ))
);

CREATE INDEX IF NOT EXISTS idx_audit_asset
  ON asset_audit_log(org_id, asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON asset_audit_log(actor_staff_id);

-- ============================================================
-- Generic Forms (010-generic-forms)
-- ============================================================

-- Form template: defines a reusable form structure
CREATE TABLE IF NOT EXISTS form_template (
  id              TEXT NOT NULL PRIMARY KEY,
  org_id          TEXT REFERENCES organization(id) ON DELETE CASCADE,  -- NULL for system templates
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL,                                       -- 'equipment_inspection' | 'property_inspection' | 'medication' | 'custom'
  is_system       INTEGER NOT NULL DEFAULT 0,                          -- 1 = built-in starter template
  status          TEXT NOT NULL DEFAULT 'draft',                       -- 'draft' | 'published' | 'archived'
  created_by      TEXT REFERENCES staff_member(id) ON DELETE SET NULL, -- NULL for system templates
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (category IN ('equipment_inspection', 'property_inspection', 'medication', 'custom')),
  CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_form_template_org ON form_template(org_id, status);

-- Immutable version snapshot; submissions reference a specific version
CREATE TABLE IF NOT EXISTS form_template_version (
  id              TEXT NOT NULL PRIMARY KEY,
  template_id     TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  fields_json     TEXT NOT NULL,             -- JSON: FormFieldDefinition[]
  published_at    TEXT,                      -- NULL = draft; set when published
  created_at      TEXT NOT NULL,
  UNIQUE(template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_ftv_template ON form_template_version(template_id, version_number);

-- A completed (or in-progress) form instance
CREATE TABLE IF NOT EXISTS form_submission (
  id                  TEXT NOT NULL PRIMARY KEY,
  org_id              TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template_id         TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  template_version_id TEXT NOT NULL REFERENCES form_template_version(id),
  submitted_by        TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'complete',   -- 'in_progress' | 'complete'
  linked_entity_type  TEXT,                               -- 'asset' | 'staff_member' | NULL
  linked_entity_id    TEXT,                               -- FK to the linked entity
  schedule_id         TEXT REFERENCES asset_inspection_schedule(id) ON DELETE SET NULL,
  submitted_at        TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (status IN ('in_progress', 'complete'))
);

CREATE INDEX IF NOT EXISTS idx_submission_org    ON form_submission(org_id, template_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_submission_entity ON form_submission(org_id, linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_submission_staff  ON form_submission(org_id, submitted_by);

-- One row per field per submission; typed columns enable SQL reporting
CREATE TABLE IF NOT EXISTS form_response_value (
  id              TEXT NOT NULL PRIMARY KEY,
  submission_id   TEXT NOT NULL REFERENCES form_submission(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,       -- stable field identifier; repeating groups use 'group[0].child'
  field_type      TEXT NOT NULL,       -- mirrors FormFieldType
  value_text      TEXT,                -- text, select, multi_select (JSON array), date, time, signature, photo
  value_number    REAL,                -- number fields
  value_boolean   INTEGER,             -- boolean/checkbox (0 | 1)
  UNIQUE(submission_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_frv_submission   ON form_response_value(submission_id);
CREATE INDEX IF NOT EXISTS idx_frv_field_text   ON form_response_value(field_key, value_text);
CREATE INDEX IF NOT EXISTS idx_frv_field_number ON form_response_value(field_key, value_number);
