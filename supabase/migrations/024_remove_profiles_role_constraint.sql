-- ============================================
-- Remove role CHECK constraint from profiles table
-- This allows any role name from the roles table
-- ============================================

-- Drop existing constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- The role column will now accept any TEXT value
-- This allows it to match role names from the roles table
-- which can be custom roles created by admins

