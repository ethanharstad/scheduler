-- Scheduler — D1 Schema (reference snapshot)
-- This file reflects the current cumulative schema for reference and local bootstrapping.
-- It is NOT the apply target. Schema changes are applied via wrangler-managed migrations:
--   migrations/  — incremental migration files (source of truth for applying changes)
--   npm run migrate:local   — apply unapplied migrations to local D1
--   npm run migrate:remote  — apply unapplied migrations to production D1
-- When adding a new migration, ALSO update this file to reflect the final schema state.
-- All datetimes: ISO 8601 TEXT. Booleans: INTEGER 0/1. PKs: crypto.randomUUID().
-- Tables are dependency-ordered: referenced tables are created before referencing tables.
--
-- NOTE: All org-scoped data (staff, stations, qualifications, schedules, assets, forms,
-- platoons, constraints) now lives in per-org Cloudflare Durable Objects. See src/do/schema.sql
-- for the DO-internal schema. D1 retains only cross-org/auth tables below.

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
-- Organization & Membership — routing/auth index
-- Full org settings live in DO org_settings table.
-- ============================================================

CREATE TABLE IF NOT EXISTS organization (
  id         TEXT NOT NULL PRIMARY KEY,              -- crypto.randomUUID()
  slug       TEXT NOT NULL UNIQUE,                   -- 2-50 chars, lowercase [a-z0-9-], globally unique URL handle
  name       TEXT NOT NULL,                          -- 2-100 chars, display name (kept for cross-org listing)
  plan       TEXT NOT NULL DEFAULT 'free',           -- 'free' (Phase 8 adds more)
  status     TEXT NOT NULL DEFAULT 'active',         -- 'active' (deletion deferred to future feature)
  created_at TEXT NOT NULL                           -- ISO 8601
);

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
-- Invitation Token Index — maps token → org_id for public lookups
-- Full invitation data lives in per-org Durable Objects.
-- ============================================================

CREATE TABLE IF NOT EXISTS invitation_token_index (
  token   TEXT NOT NULL PRIMARY KEY,
  org_id  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE
);

-- ============================================================
-- Form Templates — system templates only (org templates in DO)
-- ============================================================

CREATE TABLE IF NOT EXISTS form_template (
  id              TEXT NOT NULL PRIMARY KEY,
  org_id          TEXT REFERENCES organization(id) ON DELETE CASCADE,  -- NULL for system templates
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL,                                       -- 'equipment_inspection' | 'property_inspection' | 'medication' | 'custom'
  is_system       INTEGER NOT NULL DEFAULT 0,                          -- 1 = built-in starter template
  status          TEXT NOT NULL DEFAULT 'draft',                       -- 'draft' | 'published' | 'archived'
  created_by      TEXT,                                                -- user_id or NULL for system templates
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (category IN ('equipment_inspection', 'property_inspection', 'medication', 'custom')),
  CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_form_template_org ON form_template(org_id, status);

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
