-- Seed: System Form Templates
-- These are built-in starter templates that orgs can clone and customize.

-- 1. Daily Apparatus Check
INSERT OR IGNORE INTO form_template (id, org_id, name, description, category, is_system, status, created_by, created_at, updated_at)
VALUES (
  'system-tpl-daily-apparatus-check',
  NULL,
  'Daily Apparatus Check',
  'Standard daily vehicle inspection checklist for fire apparatus. Covers exterior, interior, engine compartment, and emergency equipment.',
  'equipment_inspection',
  1,
  'published',
  NULL,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
VALUES (
  'system-ver-daily-apparatus-check-v1',
  'system-tpl-daily-apparatus-check',
  1,
  '[
    {"key":"exterior","type":"section_header","label":"Exterior","sortOrder":0},
    {"key":"lights_operational","type":"boolean","label":"All lights operational","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":1},
    {"key":"siren_operational","type":"boolean","label":"Siren operational","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":2},
    {"key":"body_damage","type":"boolean","label":"No visible body damage","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":3},
    {"key":"tire_condition","type":"select","label":"Tire condition","options":[{"label":"Good","value":"good"},{"label":"Fair","value":"fair"},{"label":"Poor","value":"poor"}],"required":true,"sortOrder":4},
    {"key":"engine","type":"section_header","label":"Engine Compartment","sortOrder":5},
    {"key":"oil_level","type":"boolean","label":"Oil level OK","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":6},
    {"key":"coolant_level","type":"boolean","label":"Coolant level OK","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":7},
    {"key":"battery_condition","type":"boolean","label":"Battery condition OK","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":8},
    {"key":"equipment","type":"section_header","label":"Emergency Equipment","sortOrder":9},
    {"key":"pump_operational","type":"boolean","label":"Pump operational","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":10},
    {"key":"hose_condition","type":"boolean","label":"Hose condition OK","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":11},
    {"key":"scba_bottles_full","type":"boolean","label":"SCBA bottles full","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":12},
    {"key":"overall_result","type":"select","label":"Overall result","options":[{"label":"Pass","value":"pass"},{"label":"Fail","value":"fail"}],"required":true,"sortOrder":13},
    {"key":"notes","type":"textarea","label":"Notes","description":"Describe any issues found","sortOrder":14,"condition":{"fieldKey":"overall_result","operator":"eq","value":"fail"}}
  ]',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

-- 2. Station Inspection
INSERT OR IGNORE INTO form_template (id, org_id, name, description, category, is_system, status, created_by, created_at, updated_at)
VALUES (
  'system-tpl-station-inspection',
  NULL,
  'Station Inspection',
  'Routine station walk-through covering HVAC, fire safety equipment, kitchen, bathrooms, and general condition.',
  'property_inspection',
  1,
  'published',
  NULL,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
VALUES (
  'system-ver-station-inspection-v1',
  'system-tpl-station-inspection',
  1,
  '[
    {"key":"fire_safety","type":"section_header","label":"Fire Safety","sortOrder":0},
    {"key":"fire_extinguishers","type":"repeating_group","label":"Fire Extinguishers","description":"Check each extinguisher in the station","minEntries":1,"sortOrder":1,"children":[
      {"key":"location","type":"text","label":"Location","required":true,"sortOrder":0},
      {"key":"expiration_date","type":"date","label":"Expiration date","required":true,"sortOrder":1},
      {"key":"pressure_ok","type":"boolean","label":"Pressure in green zone","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":2}
    ]},
    {"key":"smoke_detectors_ok","type":"boolean","label":"Smoke detectors operational","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":2},
    {"key":"exit_signs_ok","type":"boolean","label":"Exit signs illuminated","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":3},
    {"key":"facilities","type":"section_header","label":"Facilities","sortOrder":4},
    {"key":"hvac_operational","type":"boolean","label":"HVAC operational","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":5},
    {"key":"kitchen_clean","type":"boolean","label":"Kitchen clean and sanitary","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":6},
    {"key":"bathrooms_clean","type":"boolean","label":"Bathrooms clean and stocked","trueLabel":"Pass","falseLabel":"Fail","required":true,"sortOrder":7},
    {"key":"general_condition","type":"select","label":"General condition","options":[{"label":"Excellent","value":"excellent"},{"label":"Good","value":"good"},{"label":"Fair","value":"fair"},{"label":"Poor","value":"poor"}],"required":true,"sortOrder":8},
    {"key":"issues","type":"textarea","label":"Issues or maintenance needed","sortOrder":9}
  ]',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

-- 3. Controlled Substance Log
INSERT OR IGNORE INTO form_template (id, org_id, name, description, category, is_system, status, created_by, created_at, updated_at)
VALUES (
  'system-tpl-controlled-substance-log',
  NULL,
  'Controlled Substance Log',
  'Track controlled substance inventory counts, expiration dates, and any discrepancies.',
  'medication',
  1,
  'published',
  NULL,
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO form_template_version (id, template_id, version_number, fields_json, published_at, created_at)
VALUES (
  'system-ver-controlled-substance-log-v1',
  'system-tpl-controlled-substance-log',
  1,
  '[
    {"key":"medications","type":"repeating_group","label":"Medications","description":"Record each controlled substance","minEntries":1,"sortOrder":0,"children":[
      {"key":"medication_name","type":"text","label":"Medication name","required":true,"sortOrder":0,"placeholder":"e.g. Morphine Sulfate 10mg"},
      {"key":"expected_count","type":"number","label":"Expected count","required":true,"min":0,"sortOrder":1},
      {"key":"actual_count","type":"number","label":"Actual count","required":true,"min":0,"sortOrder":2},
      {"key":"expiration_date","type":"date","label":"Expiration date","required":true,"sortOrder":3},
      {"key":"discrepancy","type":"boolean","label":"Discrepancy noted","trueLabel":"Yes","falseLabel":"No","sortOrder":4}
    ]},
    {"key":"divider1","type":"divider","label":"","sortOrder":1},
    {"key":"all_accounted","type":"boolean","label":"All substances accounted for","trueLabel":"Yes","falseLabel":"No","required":true,"sortOrder":2},
    {"key":"notes","type":"textarea","label":"Notes","description":"Explain any discrepancies or concerns","sortOrder":3}
  ]',
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z'
);
