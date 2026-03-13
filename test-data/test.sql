-- Test / Demo Data
-- Apply after migrations: wrangler d1 execute scheduler-auth --local --file=test-data/test.sql

-- ============================================================
-- Users
-- ============================================================

-- admin@testorg.com / test1234 — verified system admin
INSERT INTO user (id, email, password_hash, verified, failed_attempts, lock_until, is_system_admin, created_at)
VALUES (
  'user-admin-testorg-0001',
  'admin@testorg.com',
  'VXtLFLVC6LstHkuCzn2GU97jXVo7PD/4uIyXzmQYmp1VTMS/+uPK5hDgsP6I1euCktYKG8oqqkEIVkezj9tjbw==',
  1,
  0,
  NULL,
  1,
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO user_profile (user_id, display_name, phone_number, avatar_key, updated_at)
VALUES (
  'user-admin-testorg-0001',
  'System Admin',
  NULL,
  NULL,
  '2026-01-01T00:00:00.000Z'
);

-- owner@testorg.com / test1234 — verified regular user
INSERT INTO user (id, email, password_hash, verified, failed_attempts, lock_until, is_system_admin, created_at)
VALUES (
  'user-owner-testorg-0001',
  'owner@testorg.com',
  'iEHsiK45AROFkCJMA4N2iKLbcR6nIgXLCBxsVkqvM/GmW4y3Ih+bYJfaj18M1XhCWP5UVyqFt1huiRUGMQwJSQ==',
  1,
  0,
  NULL,
  0,
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO user_profile (user_id, display_name, phone_number, avatar_key, updated_at)
VALUES (
  'user-owner-testorg-0001',
  'Org Owner',
  NULL,
  NULL,
  '2026-01-01T00:00:00.000Z'
);

-- ============================================================
-- Organizations
-- ============================================================

INSERT INTO organization (id, slug, name, plan, status, schedule_day_start, created_at)
VALUES (
  'org-testorg-0001',
  'test-organization',
  'Test Organization',
  'free',
  'active',
  '07:00',
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO org_membership (id, org_id, user_id, role, status, joined_at)
VALUES (
  'mem-owner-testorg-0001',
  'org-testorg-0001',
  'user-owner-testorg-0001',
  'owner',
  'active',
  '2026-01-01T00:00:00.000Z'
);

-- ============================================================
-- Cert Types & Levels
-- ============================================================

INSERT INTO cert_type (id, org_id, name, description, is_leveled, created_at, updated_at)
VALUES (
  'certtype-testorg-ems',
  'org-testorg-0001',
  'EMS',
  'Emergency Medical Services certification',
  1,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES
  ('certlevel-ems-0001', 'certtype-testorg-ems', 'EMR',        1, '2026-01-01T00:00:00.000Z'),
  ('certlevel-ems-0002', 'certtype-testorg-ems', 'EMT',        2, '2026-01-01T00:00:00.000Z'),
  ('certlevel-ems-0003', 'certtype-testorg-ems', 'AEMT',       3, '2026-01-01T00:00:00.000Z'),
  ('certlevel-ems-0004', 'certtype-testorg-ems', 'Paramedic',  4, '2026-01-01T00:00:00.000Z');

INSERT INTO cert_type (id, org_id, name, description, is_leveled, created_at, updated_at)
VALUES (
  'certtype-testorg-ff',
  'org-testorg-0001',
  'Firefighter',
  'Firefighter certification',
  1,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT INTO cert_level (id, cert_type_id, name, level_order, created_at) VALUES
  ('certlevel-ff-0001', 'certtype-testorg-ff', 'Firefighter 1', 1, '2026-01-01T00:00:00.000Z'),
  ('certlevel-ff-0002', 'certtype-testorg-ff', 'Firefighter 2', 2, '2026-01-01T00:00:00.000Z');

-- ============================================================
-- Ranks
-- ============================================================

INSERT INTO rank (id, org_id, name, sort_order, created_at, updated_at) VALUES
  ('rank-testorg-0001', 'org-testorg-0001', 'Paid on Call', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('rank-testorg-0002', 'org-testorg-0001', 'Part Time',    2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('rank-testorg-0003', 'org-testorg-0001', 'Full Time',    3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('rank-testorg-0004', 'org-testorg-0001', 'Lieutenant',   4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('rank-testorg-0005', 'org-testorg-0001', 'Captain',      5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('rank-testorg-0006', 'org-testorg-0001', 'Chief',        6, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- ============================================================
-- Positions
-- ============================================================

INSERT INTO position (id, org_id, name, description, min_rank_id, sort_order, created_at, updated_at) VALUES
  ('pos-testorg-0001', 'org-testorg-0001', 'Firefighter',    NULL, 'rank-testorg-0002', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('pos-testorg-0002', 'org-testorg-0001', 'Sr Firefighter', NULL, 'rank-testorg-0002', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('pos-testorg-0003', 'org-testorg-0001', 'Driver/Operator', NULL, 'rank-testorg-0002', 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('pos-testorg-0004', 'org-testorg-0001', 'Lieutenant',     NULL, 'rank-testorg-0003', 3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('pos-testorg-0005', 'org-testorg-0001', 'Captain',        NULL, 'rank-testorg-0004', 4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO position_cert_requirement (id, position_id, cert_type_id, min_cert_level_id, created_at) VALUES
  ('pcr-testorg-0001', 'pos-testorg-0001', 'certtype-testorg-ff', 'certlevel-ff-0001', '2026-01-01T00:00:00.000Z'),
  ('pcr-testorg-0002', 'pos-testorg-0002', 'certtype-testorg-ff', 'certlevel-ff-0001', '2026-01-01T00:00:00.000Z'),
  ('pcr-testorg-0003', 'pos-testorg-0004', 'certtype-testorg-ff', 'certlevel-ff-0002', '2026-01-01T00:00:00.000Z'),
  ('pcr-testorg-0004', 'pos-testorg-0005', 'certtype-testorg-ff', 'certlevel-ff-0002', '2026-01-01T00:00:00.000Z');

-- ============================================================
-- Stations
-- ============================================================

INSERT INTO station (id, org_id, name, code, address, status, sort_order, created_at, updated_at)
VALUES (
  'station-testorg-0001',
  'org-testorg-0001',
  'Station 1',
  'STA-1',
  NULL,
  'active',
  0,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

-- ============================================================
-- Staff Members
-- ============================================================

INSERT INTO staff_member (id, org_id, user_id, name, email, phone, role, status, added_by, rank_id, position_id, created_at, updated_at) VALUES
  (
    'staff-testorg-alpha-captain',
    'org-testorg-0001',
    NULL,
    'Alpha Captain',
    'alpha.captain@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0005',
    'pos-testorg-0005',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'staff-testorg-beta-captain',
    'org-testorg-0001',
    NULL,
    'Beta Captain',
    'beta.captain@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0005',
    'pos-testorg-0005',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'staff-testorg-charlie-captain',
    'org-testorg-0001',
    NULL,
    'Charlie Captain',
    'charlie.captain@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0005',
    'pos-testorg-0005',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  );

INSERT INTO staff_member (id, org_id, user_id, name, email, phone, role, status, added_by, rank_id, position_id, created_at, updated_at) VALUES
  (
    'staff-testorg-alpha-lieutenant',
    'org-testorg-0001',
    NULL,
    'Alpha Lieutenant',
    'alpha.lieutenant@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0004',
    'pos-testorg-0004',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'staff-testorg-beta-lieutenant',
    'org-testorg-0001',
    NULL,
    'Beta Lieutenant',
    'beta.lieutenant@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0004',
    'pos-testorg-0004',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'staff-testorg-charlie-lieutenant',
    'org-testorg-0001',
    NULL,
    'Charlie Lieutenant',
    'charlie.lieutenant@testorg.com',
    NULL,
    'manager',
    'roster_only',
    'user-owner-testorg-0001',
    'rank-testorg-0004',
    'pos-testorg-0004',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  );

-- Firefighter 2 certifications for captains and lieutenants
INSERT INTO staff_certification (id, org_id, staff_member_id, cert_type_id, cert_level_id, issued_at, expires_at, cert_number, notes, status, added_by, created_at, updated_at) VALUES
  ('cert-alpha-captain-ff',    'org-testorg-0001', 'staff-testorg-alpha-captain',    'certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('cert-beta-captain-ff',     'org-testorg-0001', 'staff-testorg-beta-captain',     'certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('cert-charlie-captain-ff',  'org-testorg-0001', 'staff-testorg-charlie-captain',  'certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('cert-alpha-lt-ff',         'org-testorg-0001', 'staff-testorg-alpha-lieutenant', 'certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('cert-beta-lt-ff',          'org-testorg-0001', 'staff-testorg-beta-lieutenant',  'certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('cert-charlie-lt-ff',       'org-testorg-0001', 'staff-testorg-charlie-lieutenant','certtype-testorg-ff', 'certlevel-ff-0002', '2020-01-01', NULL, NULL, NULL, 'active', 'user-owner-testorg-0001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- ============================================================
-- Platoons (3-platoon rotating 24-hr shifts, every 3 days)
-- shift_start_time/end_time both 07:00 = crosses midnight (24-hr shift)
-- ============================================================

INSERT INTO platoon (id, org_id, name, shift_label, rrules, start_date, shift_start_time, shift_end_time, description, color, created_at, updated_at) VALUES
  (
    'platoon-testorg-a',
    'org-testorg-0001',
    'A Shift',
    'A Shift',
    '[{"rrule":"FREQ=DAILY;INTERVAL=3","startOffset":0}]',
    '2026-01-01',
    '07:00',
    '07:00',
    NULL,
    '#2563eb',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'platoon-testorg-b',
    'org-testorg-0001',
    'B Shift',
    'B Shift',
    '[{"rrule":"FREQ=DAILY;INTERVAL=3","startOffset":1}]',
    '2026-01-01',
    '07:00',
    '07:00',
    NULL,
    '#dc2626',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'platoon-testorg-c',
    'org-testorg-0001',
    'C Shift',
    'C Shift',
    '[{"rrule":"FREQ=DAILY;INTERVAL=3","startOffset":2}]',
    '2026-01-01',
    '07:00',
    '07:00',
    NULL,
    '#16a34a',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  );
