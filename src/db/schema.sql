-- User Authentication System — D1 Schema
-- Apply: wrangler d1 execute scheduler-auth --local --file=src/db/schema.sql
-- All datetimes: ISO 8601 TEXT. Booleans: INTEGER 0/1. PKs: crypto.randomUUID().

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

-- Organization & Membership (003-create-org)
CREATE TABLE IF NOT EXISTS organization (
  id         TEXT NOT NULL PRIMARY KEY,              -- crypto.randomUUID()
  slug       TEXT NOT NULL UNIQUE,                   -- 2-50 chars, lowercase [a-z0-9-], globally unique URL handle
  name       TEXT NOT NULL,                          -- 2-100 chars, display name
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

-- Staff Member Management (005-staff-management)

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

  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_member_org_email
  ON staff_member(org_id, email) WHERE email IS NOT NULL;
CREATE        INDEX IF NOT EXISTS idx_staff_member_org    ON staff_member(org_id);
CREATE        INDEX IF NOT EXISTS idx_staff_member_user   ON staff_member(user_id) WHERE user_id IS NOT NULL;

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

-- User Profile (002-user-profile)
CREATE TABLE IF NOT EXISTS user_profile (
  user_id      TEXT NOT NULL PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,           -- required; editable; defaults to email local-part
  phone_number TEXT,                    -- optional; loosely validated international format or NULL
  avatar_key   TEXT,                    -- R2 object key ("profile-photos/<user_id>") or NULL
  updated_at   TEXT NOT NULL            -- ISO 8601
);
