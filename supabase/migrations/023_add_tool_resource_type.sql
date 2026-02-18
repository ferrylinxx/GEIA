-- ============================================
-- Add 'tool' to resource_type CHECK constraint
-- ============================================

-- Drop existing constraint
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_resource_type_check;

-- Add new constraint with 'tool' included
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_resource_type_check 
CHECK (resource_type IN (
  'network_drive',
  'model',
  'provider',
  'db_connection',
  'user_group',
  'channel',
  'project',
  'file',
  'agent',
  'tool',
  'admin_panel'
));

-- Update comment
COMMENT ON COLUMN public.role_permissions.resource_type IS 'Tipo de recurso: network_drive, model, provider, db_connection, user_group, channel, project, file, agent, tool, admin_panel';

