-- Migration number: 0002 	 2026-03-13T17:43:47.593Z
-- Phase 5: Drop org-scoped tables migrated to Durable Objects.
-- D1 retains: auth tables, user_profile, organization (routing), org_membership (auth index),
-- form_template + form_template_version (system templates).

-- Drop in reverse dependency order to avoid FK constraint issues

-- Forms: submissions and response values (org-scoped)
DROP TABLE IF EXISTS form_response_value;
DROP TABLE IF EXISTS form_submission;

-- Asset management
DROP TABLE IF EXISTS asset_audit_log;
DROP TABLE IF EXISTS asset_inspection_schedule;
DROP TABLE IF EXISTS asset_location;
DROP TABLE IF EXISTS asset;

-- Schedule requirements
DROP TABLE IF EXISTS schedule_requirement;

-- Scheduling constraints
DROP TABLE IF EXISTS staff_constraint;

-- Platoon management
DROP TABLE IF EXISTS platoon_membership;
DROP TABLE IF EXISTS platoon;

-- Scheduling
DROP TABLE IF EXISTS shift_assignment;
DROP TABLE IF EXISTS schedule;

-- Staff management
DROP TABLE IF EXISTS staff_certification;
DROP TABLE IF EXISTS staff_audit_log;
DROP TABLE IF EXISTS staff_invitation;

-- Positions and qualifications
DROP TABLE IF EXISTS position_cert_requirement;
DROP TABLE IF EXISTS position;

-- Staff member
DROP TABLE IF EXISTS staff_member;

-- Qualifications base tables
DROP TABLE IF EXISTS cert_level;
DROP TABLE IF EXISTS cert_type;
DROP TABLE IF EXISTS rank;

-- Stations
DROP TABLE IF EXISTS station;

-- Slim organization: remove schedule_day_start (now in DO org_settings)
ALTER TABLE organization DROP COLUMN schedule_day_start;
