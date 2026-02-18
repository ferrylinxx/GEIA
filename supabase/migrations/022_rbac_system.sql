-- ============================================
-- RBAC (Role-Based Access Control) System
-- Sistema de roles y permisos granulares
-- ============================================

-- ============================================
-- 1. ROLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT false, -- Roles del sistema (admin, user) no se pueden eliminar
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);

-- ============================================
-- 2. USER_ROLES TABLE (Asignación de roles a usuarios)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role_id);

-- ============================================
-- 3. PERMISSIONS TABLE (Permisos granulares)
-- ============================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  
  -- Tipo de recurso
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'network_drive',
    'model',
    'provider',
    'db_connection',
    'user_group',
    'channel',
    'project',
    'file',
    'agent',
    'admin_panel'
  )),
  
  -- ID del recurso específico (NULL = todos los recursos de ese tipo)
  resource_id UUID,
  
  -- Acciones permitidas
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_share BOOLEAN DEFAULT false,
  can_admin BOOLEAN DEFAULT false, -- Permisos administrativos sobre el recurso
  
  -- Metadata adicional (para configuraciones específicas)
  meta_json JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Un rol no puede tener permisos duplicados para el mismo recurso
  UNIQUE(role_id, resource_type, resource_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource ON public.role_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_combined ON public.role_permissions(role_id, resource_type);

-- ============================================
-- 4. INSERTAR ROLES DEL SISTEMA
-- ============================================

-- Rol de administrador (acceso total)
INSERT INTO public.roles (name, description, is_system) 
VALUES ('admin', 'Administrador con acceso total al sistema', true)
ON CONFLICT (name) DO NOTHING;

-- Rol de usuario estándar (acceso básico)
INSERT INTO public.roles (name, description, is_system) 
VALUES ('user', 'Usuario estándar con acceso básico', true)
ON CONFLICT (name) DO NOTHING;

-- Rol de solo lectura
INSERT INTO public.roles (name, description, is_system) 
VALUES ('viewer', 'Usuario con permisos de solo lectura', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 5. MIGRAR USUARIOS EXISTENTES AL NUEVO SISTEMA
-- ============================================

-- Asignar rol 'admin' a usuarios que tienen role='admin' en profiles
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, r.id
FROM public.profiles p
CROSS JOIN public.roles r
WHERE p.role = 'admin' AND r.name = 'admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Asignar rol 'user' a usuarios que tienen role='user' en profiles
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, r.id
FROM public.profiles p
CROSS JOIN public.roles r
WHERE p.role = 'user' AND r.name = 'user'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ============================================
-- 6. FUNCIONES HELPER PARA VERIFICAR PERMISOS
-- ============================================

-- Función para verificar si un usuario tiene un permiso específico
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_action TEXT -- 'view', 'create', 'edit', 'delete', 'share', 'admin'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_permission BOOLEAN;
BEGIN
  -- Verificar si el usuario es admin (acceso total)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;
  
  -- Verificar permisos específicos del rol
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_user_id
      AND rp.resource_type = p_resource_type
      AND (rp.resource_id = p_resource_id OR rp.resource_id IS NULL) -- NULL = todos los recursos
      AND (
        (p_action = 'view' AND rp.can_view = true) OR
        (p_action = 'create' AND rp.can_create = true) OR
        (p_action = 'edit' AND rp.can_edit = true) OR
        (p_action = 'delete' AND rp.can_delete = true) OR
        (p_action = 'share' AND rp.can_share = true) OR
        (p_action = 'admin' AND rp.can_admin = true)
      )
  ) INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;
$$;

-- Función para obtener todos los recursos accesibles por un usuario
CREATE OR REPLACE FUNCTION public.get_user_accessible_resources(
  p_user_id UUID,
  p_resource_type TEXT,
  p_action TEXT DEFAULT 'view'
)
RETURNS TABLE (resource_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Si es admin, retornar todos los recursos
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  ) THEN
    RETURN QUERY
    CASE p_resource_type
      WHEN 'network_drive' THEN SELECT id FROM public.network_drives
      WHEN 'model' THEN SELECT id FROM public.model_configs
      WHEN 'provider' THEN SELECT id FROM public.ai_providers
      WHEN 'db_connection' THEN SELECT id FROM public.db_connections
      WHEN 'user_group' THEN SELECT id FROM public.user_groups
      WHEN 'project' THEN SELECT id FROM public.projects
      ELSE SELECT NULL::UUID WHERE false
    END;
    RETURN;
  END IF;

  -- Retornar recursos específicos según permisos del rol
  RETURN QUERY
  SELECT DISTINCT rp.resource_id
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role_id = rp.role_id
  WHERE ur.user_id = p_user_id
    AND rp.resource_type = p_resource_type
    AND rp.resource_id IS NOT NULL
    AND (
      (p_action = 'view' AND rp.can_view = true) OR
      (p_action = 'create' AND rp.can_create = true) OR
      (p_action = 'edit' AND rp.can_edit = true) OR
      (p_action = 'delete' AND rp.can_delete = true) OR
      (p_action = 'share' AND rp.can_share = true) OR
      (p_action = 'admin' AND rp.can_admin = true)
    );
END;
$$;

-- ============================================
-- 7. RLS POLICIES
-- ============================================

-- Roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver roles" ON public.roles
  FOR SELECT USING (true);

CREATE POLICY "Solo admins pueden crear roles" ON public.roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Solo admins pueden editar roles no-sistema" ON public.roles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND is_system = false
  );

CREATE POLICY "Solo admins pueden eliminar roles no-sistema" ON public.roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND is_system = false
  );

-- User_roles table
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver sus propios roles" ON public.user_roles
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Solo admins pueden asignar roles" ON public.user_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Solo admins pueden eliminar asignaciones de roles" ON public.user_roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Role_permissions table
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver permisos de sus roles" ON public.role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role_id = role_permissions.role_id
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Solo admins pueden gestionar permisos" ON public.role_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 8. TRIGGERS PARA UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 9. COMENTARIOS PARA DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE public.roles IS 'Roles del sistema para control de acceso basado en roles (RBAC)';
COMMENT ON TABLE public.user_roles IS 'Asignación de roles a usuarios';
COMMENT ON TABLE public.role_permissions IS 'Permisos granulares por rol y tipo de recurso';

COMMENT ON COLUMN public.role_permissions.resource_type IS 'Tipo de recurso: network_drive, model, provider, db_connection, user_group, channel, project, file, agent, admin_panel';
COMMENT ON COLUMN public.role_permissions.resource_id IS 'ID del recurso específico. NULL = aplica a todos los recursos de ese tipo';
COMMENT ON COLUMN public.role_permissions.can_view IS 'Permiso para ver/listar el recurso';
COMMENT ON COLUMN public.role_permissions.can_create IS 'Permiso para crear nuevos recursos de este tipo';
COMMENT ON COLUMN public.role_permissions.can_edit IS 'Permiso para editar el recurso';
COMMENT ON COLUMN public.role_permissions.can_delete IS 'Permiso para eliminar el recurso';
COMMENT ON COLUMN public.role_permissions.can_share IS 'Permiso para compartir el recurso con otros usuarios';
COMMENT ON COLUMN public.role_permissions.can_admin IS 'Permisos administrativos completos sobre el recurso';


