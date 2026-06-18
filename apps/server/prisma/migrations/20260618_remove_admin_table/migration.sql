-- DropAdminTable: Remove admins table and AdminRole enum
-- This migration removes the admin concept from the system.
-- All devices are now equal - no admin bypass for wallet ownership checks.

-- Drop admins table
DROP TABLE IF EXISTS "admins";

-- Drop AdminRole enum
DROP TYPE IF EXISTS "AdminRole";
