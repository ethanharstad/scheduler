-- Migration number: 0003 	 2026-03-13T18:06:14.828Z
-- Lightweight D1 index for public invitation-token lookups.
-- Full invitation data lives in per-org Durable Objects; this table
-- provides only the token → org_id mapping so the Worker knows which
-- DO to query without requiring authentication.

CREATE TABLE IF NOT EXISTS invitation_token_index (
  token   TEXT NOT NULL PRIMARY KEY,
  org_id  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE
);
