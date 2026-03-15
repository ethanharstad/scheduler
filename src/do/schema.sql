-- Org Durable Object — Internal SQLite Schema
-- Derived from src/db/schema.sql with org_id columns removed (isolation is physical).
-- User FKs become soft references (TEXT column, no REFERENCES clause).
-- All datetimes: ISO 8601 TEXT. Booleans: INTEGER 0/1. PKs: crypto.randomUUID().

-- ============================================================
-- Org Settings (single row — replaces organization extended fields)
-- ============================================================

CREATE TABLE IF NOT EXISTS org_settings (
  id                  TEXT NOT NULL PRIMARY KEY DEFAULT 'settings',
  org_id              TEXT NOT NULL,                             -- original org UUID (for cross-ref)
  slug                TEXT NOT NULL,                             -- mirror of D1 organization.slug
  name                TEXT NOT NULL,
  plan                TEXT NOT NULL DEFAULT 'free',
  status              TEXT NOT NULL DEFAULT 'active',
  schedule_day_start  TEXT NOT NULL DEFAULT '00:00',
  quick_shifts        TEXT,
  created_at          TEXT NOT NULL
);

-- ============================================================
-- Org Membership (source of truth; D1 keeps slim auth index)
-- ============================================================

CREATE TABLE IF NOT EXISTS org_membership (
  id        TEXT NOT NULL PRIMARY KEY,
  user_id   TEXT NOT NULL,                                      -- soft ref to D1 user
  role      TEXT NOT NULL,                                      -- 'owner' | 'admin' | 'manager' | 'employee' | 'payroll_hr'
  status    TEXT NOT NULL DEFAULT 'active',                     -- 'active' | 'inactive'
  joined_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_user ON org_membership(user_id);

-- ============================================================
-- Stations
-- ============================================================

CREATE TABLE IF NOT EXISTS station (
  id          TEXT NOT NULL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,
  address     TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_station_name ON station(LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_station_code ON station(LOWER(code)) WHERE code IS NOT NULL;

-- ============================================================
-- Qualifications
-- ============================================================

CREATE TABLE IF NOT EXISTS rank (
  id         TEXT NOT NULL PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (sort_order >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_name  ON rank(LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_rank_order ON rank(sort_order);

CREATE TABLE IF NOT EXISTS cert_type (
  id          TEXT NOT NULL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_leveled  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_type_name ON cert_type(LOWER(name));

CREATE TABLE IF NOT EXISTS cert_level (
  id           TEXT NOT NULL PRIMARY KEY,
  cert_type_id TEXT NOT NULL REFERENCES cert_type(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  level_order  INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_level_type_order ON cert_level(cert_type_id, level_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_level_type_name  ON cert_level(cert_type_id, LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_cert_level_type       ON cert_level(cert_type_id);

CREATE TABLE IF NOT EXISTS position (
  id          TEXT NOT NULL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  min_rank_id TEXT REFERENCES rank(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_position_name  ON position(LOWER(name));
CREATE        INDEX IF NOT EXISTS idx_position_order ON position(sort_order);

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
-- Staff Members
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_member (
  id           TEXT NOT NULL PRIMARY KEY,
  user_id      TEXT,                                            -- soft ref to D1 user; NULL if no account
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  role         TEXT NOT NULL DEFAULT 'employee',
  status       TEXT NOT NULL DEFAULT 'roster_only',             -- roster_only | pending | active | removed
  added_by     TEXT,                                            -- soft ref to D1 user
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  rank_id      TEXT REFERENCES rank(id) ON DELETE SET NULL,
  position_id  TEXT REFERENCES position(id) ON DELETE SET NULL,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_member_email ON staff_member(email) WHERE email IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_staff_member_user  ON staff_member(user_id) WHERE user_id IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_staff_member_rank  ON staff_member(rank_id) WHERE rank_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_invitation (
  id              TEXT NOT NULL PRIMARY KEY,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  invited_by      TEXT,                                         -- soft ref to D1 user
  expires_at      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',              -- pending | accepted | cancelled
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitation_token  ON staff_invitation(token);
CREATE        INDEX IF NOT EXISTS idx_staff_invitation_member ON staff_invitation(staff_member_id);

CREATE TABLE IF NOT EXISTS staff_audit_log (
  id              TEXT NOT NULL PRIMARY KEY,
  staff_member_id TEXT,
  performed_by    TEXT,                                         -- soft ref to D1 user
  action          TEXT NOT NULL,
  metadata        TEXT,                                         -- JSON
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_date ON staff_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS staff_certification (
  id              TEXT NOT NULL PRIMARY KEY,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  cert_type_id    TEXT NOT NULL REFERENCES cert_type(id) ON DELETE CASCADE,
  cert_level_id   TEXT REFERENCES cert_level(id) ON DELETE SET NULL,
  issued_at       TEXT,
  expires_at      TEXT,
  cert_number     TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
  added_by        TEXT,                                         -- soft ref to D1 user
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_cert_member_type ON staff_certification(staff_member_id, cert_type_id);
CREATE        INDEX IF NOT EXISTS idx_staff_cert_member      ON staff_certification(staff_member_id);
CREATE        INDEX IF NOT EXISTS idx_staff_cert_expiry
  ON staff_certification(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- ============================================================
-- Scheduling
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule (
  id         TEXT NOT NULL PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,                                              -- soft ref to D1 user
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_dates ON schedule(start_date, end_date);

CREATE TABLE IF NOT EXISTS shift_assignment (
  id              TEXT NOT NULL PRIMARY KEY,
  schedule_id     TEXT NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  start_datetime  TEXT NOT NULL,
  end_datetime    TEXT NOT NULL,
  position        TEXT,
  position_id     TEXT REFERENCES position(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_shift_assignment_schedule ON shift_assignment(schedule_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignment_staff    ON shift_assignment(staff_member_id);

-- ============================================================
-- Platoons
-- ============================================================

CREATE TABLE IF NOT EXISTS platoon (
  id               TEXT NOT NULL PRIMARY KEY,
  name             TEXT NOT NULL,
  shift_label      TEXT NOT NULL,
  rrules           TEXT NOT NULL,                               -- JSON: RRuleEntry[]
  start_date       TEXT NOT NULL,
  shift_start_time TEXT NOT NULL DEFAULT '08:00',
  shift_end_time   TEXT NOT NULL DEFAULT '08:00',
  description      TEXT,
  color            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_name ON platoon(LOWER(name));

CREATE TABLE IF NOT EXISTS platoon_membership (
  id              TEXT NOT NULL PRIMARY KEY,
  platoon_id      TEXT NOT NULL REFERENCES platoon(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  position_id     TEXT REFERENCES position(id) ON DELETE SET NULL,
  assigned_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platoon_membership_staff   ON platoon_membership(staff_member_id);
CREATE        INDEX IF NOT EXISTS idx_platoon_membership_platoon ON platoon_membership(platoon_id);

-- ============================================================
-- Scheduling Constraints
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_constraint (
  id              TEXT NOT NULL PRIMARY KEY,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  created_by      TEXT,                                         -- soft ref to D1 user
  type            TEXT NOT NULL CHECK(type IN ('time_off', 'unavailable', 'preferred', 'not_preferred')),
  status          TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'denied')),
  start_datetime  TEXT NOT NULL,
  end_datetime    TEXT NOT NULL,
  days_of_week    TEXT,
  reason          TEXT,
  reviewer_id     TEXT,                                         -- soft ref to D1 user
  reviewed_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_staff_constraint_member  ON staff_constraint(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_constraint_pending ON staff_constraint(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_staff_constraint_dates   ON staff_constraint(staff_member_id, start_datetime, end_datetime);

-- ============================================================
-- Schedule Requirements
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_requirement (
  id               TEXT NOT NULL PRIMARY KEY,
  name             TEXT NOT NULL,
  position_id      TEXT REFERENCES position(id) ON DELETE SET NULL,
  min_staff        INTEGER NOT NULL DEFAULT 1,
  max_staff        INTEGER,
  effective_start  TEXT NOT NULL,
  effective_end    TEXT,
  rrule            TEXT NOT NULL,
  window_start_time     TEXT,
  window_end_time       TEXT,
  window_end_day_offset INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,                                        -- soft ref to D1 user
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (effective_end IS NULL OR effective_end >= effective_start),
  CHECK (min_staff >= 0),
  CHECK (max_staff IS NULL OR max_staff >= min_staff),
  CHECK (window_end_day_offset IS NULL OR window_end_day_offset >= 0)
);

CREATE INDEX IF NOT EXISTS idx_schedule_req_dates ON schedule_requirement(effective_start, effective_end);
CREATE INDEX IF NOT EXISTS idx_schedule_req_order ON schedule_requirement(sort_order);

-- ============================================================
-- Assets
-- ============================================================

CREATE TABLE IF NOT EXISTS asset (
  id                        TEXT NOT NULL PRIMARY KEY,
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
  assigned_to_location_id   TEXT REFERENCES asset_location(id) ON DELETE SET NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  CHECK (asset_type IN ('apparatus', 'gear')),
  CHECK (asset_type != 'apparatus' OR unit_number IS NOT NULL),
  CHECK (asset_type != 'apparatus' OR (assigned_to_staff_id IS NULL AND assigned_to_apparatus_id IS NULL)),
  CHECK (NOT (assigned_to_staff_id IS NOT NULL AND assigned_to_apparatus_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_unit
  ON asset(unit_number) WHERE unit_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_serial
  ON asset(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_type
  ON asset(asset_type, status);
CREATE INDEX IF NOT EXISTS idx_asset_staff_assignment
  ON asset(assigned_to_staff_id) WHERE assigned_to_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_apparatus_assignment
  ON asset(assigned_to_apparatus_id) WHERE assigned_to_apparatus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_expiration
  ON asset(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_location_assignment
  ON asset(assigned_to_location_id) WHERE assigned_to_location_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_location (
  id          TEXT NOT NULL PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(asset_id, name)
);

CREATE INDEX IF NOT EXISTS idx_asset_location_asset
  ON asset_location(asset_id, sort_order);

CREATE TABLE IF NOT EXISTS asset_inspection_schedule (
  id                        TEXT NOT NULL PRIMARY KEY,
  asset_id                  TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  form_template_id          TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  recurrence_rule           TEXT NOT NULL,
  interval_days             INTEGER NOT NULL,
  next_inspection_due       TEXT,
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ais_asset ON asset_inspection_schedule(asset_id);
CREATE INDEX IF NOT EXISTS idx_ais_due   ON asset_inspection_schedule(next_inspection_due) WHERE next_inspection_due IS NOT NULL AND is_active = 1;

CREATE TABLE IF NOT EXISTS asset_audit_log (
  id               TEXT NOT NULL PRIMARY KEY,
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
  ON asset_audit_log(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON asset_audit_log(actor_staff_id);

-- ============================================================
-- Forms (org-scoped templates; system templates stay in D1)
-- ============================================================

CREATE TABLE IF NOT EXISTS form_template (
  id              TEXT NOT NULL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL,
  is_system       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_by      TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (category IN ('equipment_inspection', 'property_inspection', 'medication', 'custom')),
  CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_form_template_status ON form_template(status);

CREATE TABLE IF NOT EXISTS form_template_version (
  id              TEXT NOT NULL PRIMARY KEY,
  template_id     TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  fields_json     TEXT NOT NULL,
  published_at    TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE(template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_ftv_template ON form_template_version(template_id, version_number);

CREATE TABLE IF NOT EXISTS form_submission (
  id                  TEXT NOT NULL PRIMARY KEY,
  template_id         TEXT NOT NULL REFERENCES form_template(id) ON DELETE CASCADE,
  template_version_id TEXT NOT NULL REFERENCES form_template_version(id),
  submitted_by        TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'complete',
  linked_entity_type  TEXT,
  linked_entity_id    TEXT,
  schedule_id         TEXT REFERENCES asset_inspection_schedule(id) ON DELETE SET NULL,
  submitted_at        TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (status IN ('in_progress', 'complete'))
);

CREATE INDEX IF NOT EXISTS idx_submission_template ON form_submission(template_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_submission_entity   ON form_submission(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_submission_staff    ON form_submission(submitted_by);

CREATE TABLE IF NOT EXISTS form_response_value (
  id              TEXT NOT NULL PRIMARY KEY,
  submission_id   TEXT NOT NULL REFERENCES form_submission(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  field_type      TEXT NOT NULL,
  value_text      TEXT,
  value_number    REAL,
  value_boolean   INTEGER,
  UNIQUE(submission_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_frv_submission   ON form_response_value(submission_id);
CREATE INDEX IF NOT EXISTS idx_frv_field_text   ON form_response_value(field_key, value_text);
CREATE INDEX IF NOT EXISTS idx_frv_field_number ON form_response_value(field_key, value_number);

-- ============================================================
-- Shift Trades
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_trade (
  id                      TEXT NOT NULL PRIMARY KEY,

  -- The shift being offered (or portion of it) — NULL for coverage_request
  offering_assignment_id  TEXT REFERENCES shift_assignment(id) ON DELETE CASCADE,
  offering_staff_id       TEXT REFERENCES staff_member(id) ON DELETE CASCADE,
  offering_schedule_id    TEXT REFERENCES schedule(id) ON DELETE CASCADE,
  offering_start_datetime TEXT,
  offering_end_datetime   TEXT,

  -- The shift given in return (NULL for open board posts and giveaways pre-acceptance)
  receiving_assignment_id  TEXT REFERENCES shift_assignment(id) ON DELETE SET NULL,
  receiving_staff_id       TEXT REFERENCES staff_member(id) ON DELETE SET NULL,
  receiving_schedule_id    TEXT REFERENCES schedule(id) ON DELETE SET NULL,
  receiving_start_datetime TEXT,
  receiving_end_datetime   TEXT,

  -- Coverage request fields (NULL for swap/giveaway)
  coverage_schedule_id    TEXT REFERENCES schedule(id) ON DELETE CASCADE,
  coverage_position_id    TEXT REFERENCES position(id) ON DELETE SET NULL,
  coverage_position_name  TEXT,
  coverage_start_datetime TEXT,
  coverage_end_datetime   TEXT,
  coverage_notes          TEXT,
  created_by_staff_id     TEXT REFERENCES staff_member(id),

  trade_type       TEXT NOT NULL DEFAULT 'swap',
  status           TEXT NOT NULL DEFAULT 'pending_acceptance',
  is_open_board    INTEGER NOT NULL DEFAULT 0,
  reason           TEXT,
  denial_reason    TEXT,

  accepted_by      TEXT,
  accepted_at      TEXT,
  reviewer_id      TEXT,
  reviewed_at      TEXT,

  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  expires_at       TEXT,

  CHECK (trade_type IN ('swap', 'giveaway', 'coverage_request')),
  CHECK (status IN (
    'pending_acceptance', 'pending_approval',
    'approved', 'denied', 'withdrawn', 'expired', 'cancelled_system'
  ))
);

CREATE INDEX IF NOT EXISTS idx_shift_trade_offering_staff  ON shift_trade(offering_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_trade_receiving_staff  ON shift_trade(receiving_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_trade_status           ON shift_trade(status);
CREATE INDEX IF NOT EXISTS idx_shift_trade_open_board       ON shift_trade(is_open_board, status);
CREATE INDEX IF NOT EXISTS idx_shift_trade_offering_assign  ON shift_trade(offering_assignment_id);
CREATE INDEX IF NOT EXISTS idx_shift_trade_coverage_sched   ON shift_trade(coverage_schedule_id, status);

-- ============================================================
-- Coverage Applications (for coverage_request trades)
-- ============================================================

CREATE TABLE IF NOT EXISTS coverage_application (
  id              TEXT NOT NULL PRIMARY KEY,
  trade_id        TEXT NOT NULL REFERENCES shift_trade(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (status IN ('pending', 'selected', 'not_selected', 'withdrawn'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_app_trade_staff ON coverage_application(trade_id, staff_member_id);
CREATE INDEX IF NOT EXISTS idx_coverage_app_trade ON coverage_application(trade_id, status);

-- ============================================================
-- Notifications (per-org, per-user)
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
  id         TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL,                -- soft ref to D1 user
  type       TEXT NOT NULL DEFAULT 'info', -- info | warning | success | action_required
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,                         -- relative URL path
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CHECK (type IN ('info', 'warning', 'success', 'action_required'))
);

CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notification(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_user_date ON notification(user_id, created_at DESC);

-- ============================================================
-- Notification Preferences (per-org, per-user, per-category)
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preference (
  id         TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL,                -- soft ref to D1 user
  category   TEXT NOT NULL,                -- schedule_change | shift_trade | time_off | cert_expiration | general
  email      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, category),
  CHECK (category IN ('schedule_change', 'shift_trade', 'time_off', 'cert_expiration', 'general'))
);

CREATE INDEX IF NOT EXISTS idx_notification_pref_user ON notification_preference(user_id);
