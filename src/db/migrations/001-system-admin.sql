ALTER TABLE user ADD COLUMN is_system_admin INTEGER NOT NULL DEFAULT 0;
-- Bootstrap first admin by email (update at deploy time)
-- UPDATE user SET is_system_admin = 1 WHERE email = 'REPLACE_WITH_ADMIN_EMAIL';
