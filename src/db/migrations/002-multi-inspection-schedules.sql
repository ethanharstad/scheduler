-- Migration: Multi-inspection schedules
-- Replaces single per-asset inspection model with many-to-many
-- schedule-based inspections backed by form templates.

-- 1. Drop old inspection table and index
DROP TABLE IF EXISTS asset_inspection;
DROP INDEX IF EXISTS idx_inspection_asset;
DROP INDEX IF EXISTS idx_inspection_inspector;

-- 2. Remove single-schedule columns from asset table
ALTER TABLE asset DROP COLUMN inspection_interval_days;
ALTER TABLE asset DROP COLUMN inspection_recurrence_rule;
ALTER TABLE asset DROP COLUMN next_inspection_due;
DROP INDEX IF EXISTS idx_asset_inspection_due;

-- 3. Create new inspection schedule table
CREATE TABLE IF NOT EXISTS asset_inspection_schedule (
  id                        TEXT NOT NULL PRIMARY KEY,
  org_id                    TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_ais_asset ON asset_inspection_schedule(org_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_ais_due   ON asset_inspection_schedule(org_id, next_inspection_due)
  WHERE next_inspection_due IS NOT NULL AND is_active = 1;

-- 4. Add schedule_id to form_submission
ALTER TABLE form_submission ADD COLUMN schedule_id TEXT REFERENCES asset_inspection_schedule(id) ON DELETE SET NULL;

-- 5. Recreate asset_audit_log with updated CHECK constraint
--    (SQLite cannot alter CHECK constraints in-place)
DROP INDEX IF EXISTS idx_audit_asset;
DROP INDEX IF EXISTS idx_audit_actor;
DROP TABLE IF EXISTS asset_audit_log;

CREATE TABLE asset_audit_log (
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
