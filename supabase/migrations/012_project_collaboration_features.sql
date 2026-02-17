-- ============================================
-- Project collaboration, sharing and advanced organization
-- ============================================

-- Project members with role-based access
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- Share links for projects (token + optional password + expiration)
CREATE TABLE IF NOT EXISTS public.project_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat folders specific to projects
CREATE TABLE IF NOT EXISTS public.project_chat_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- Extra file lifecycle data
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS file_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replaced_from_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reindexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_requested_at TIMESTAMPTZ;

-- Conversation folder assignment inside a project
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS project_folder_id UUID REFERENCES public.project_chat_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_project ON public.project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_token ON public.project_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_project_chat_folders_project ON public.project_chat_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_folder ON public.conversations(project_folder_id);

-- ============================================
-- Permission helper functions
-- ============================================
CREATE OR REPLACE FUNCTION public.project_role_for(
  p_project_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
  member_role TEXT;
BEGIN
  IF p_project_id IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.user_id INTO owner_id
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF owner_id = p_user_id THEN
    RETURN 'owner';
  END IF;

  SELECT pm.role INTO member_role
  FROM public.project_members pm
  WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id
  LIMIT 1;

  RETURN member_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_has_role(
  p_project_id UUID,
  p_min_role TEXT DEFAULT 'viewer',
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_current_weight INT;
  v_required_weight INT;
BEGIN
  v_role := public.project_role_for(p_project_id, p_user_id);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  v_current_weight := CASE v_role
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 0
  END;

  v_required_weight := CASE COALESCE(p_min_role, 'viewer')
    WHEN 'owner' THEN 4
    WHEN 'admin' THEN 3
    WHEN 'editor' THEN 2
    WHEN 'viewer' THEN 1
    ELSE 1
  END;

  RETURN v_current_weight >= v_required_weight;
END;
$$;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_folders ENABLE ROW LEVEL SECURITY;

-- Project members
CREATE POLICY "Project members can view member list" ON public.project_members
  FOR SELECT
  USING (
    public.project_has_role(project_id, 'viewer', auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Project owner/admin can insert members" ON public.project_members
  FOR INSERT
  WITH CHECK (public.project_has_role(project_id, 'admin', auth.uid()));

CREATE POLICY "Project owner/admin can update members" ON public.project_members
  FOR UPDATE
  USING (public.project_has_role(project_id, 'admin', auth.uid()));

CREATE POLICY "Project owner/admin can delete members" ON public.project_members
  FOR DELETE
  USING (public.project_has_role(project_id, 'admin', auth.uid()));

-- Project shares
CREATE POLICY "Project owner/admin can read shares" ON public.project_shares
  FOR SELECT
  USING (public.project_has_role(project_id, 'admin', auth.uid()));

CREATE POLICY "Project owner/admin can create shares" ON public.project_shares
  FOR INSERT
  WITH CHECK (public.project_has_role(project_id, 'admin', auth.uid()));

CREATE POLICY "Project owner/admin can update shares" ON public.project_shares
  FOR UPDATE
  USING (public.project_has_role(project_id, 'admin', auth.uid()));

CREATE POLICY "Project owner/admin can delete shares" ON public.project_shares
  FOR DELETE
  USING (public.project_has_role(project_id, 'admin', auth.uid()));

-- Project chat folders
CREATE POLICY "Project members can view chat folders" ON public.project_chat_folders
  FOR SELECT
  USING (public.project_has_role(project_id, 'viewer', auth.uid()));

CREATE POLICY "Project editors can manage chat folders" ON public.project_chat_folders
  FOR ALL
  USING (public.project_has_role(project_id, 'editor', auth.uid()))
  WITH CHECK (public.project_has_role(project_id, 'editor', auth.uid()));

-- Existing tables: extra member access
CREATE POLICY "Project members can view projects" ON public.projects
  FOR SELECT
  USING (public.project_has_role(id, 'viewer', auth.uid()));

CREATE POLICY "Project admins can update projects" ON public.projects
  FOR UPDATE
  USING (public.project_has_role(id, 'admin', auth.uid()));

CREATE POLICY "Project members can view project conversations" ON public.conversations
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'viewer', auth.uid())
  );

CREATE POLICY "Project editors can insert project conversations" ON public.conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR public.project_has_role(project_id, 'editor', auth.uid())
    )
  );

CREATE POLICY "Project editors can update project conversations" ON public.conversations
  FOR UPDATE
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );

CREATE POLICY "Project editors can delete project conversations" ON public.conversations
  FOR DELETE
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );

CREATE POLICY "Project members can view project messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.project_id IS NOT NULL
        AND public.project_has_role(c.project_id, 'viewer', auth.uid())
    )
  );

CREATE POLICY "Project editors can insert project messages" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.project_id IS NULL
          OR public.project_has_role(c.project_id, 'editor', auth.uid())
        )
    )
  );

CREATE POLICY "Project editors can update project messages" ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.project_id IS NOT NULL
        AND public.project_has_role(c.project_id, 'editor', auth.uid())
    )
  );

CREATE POLICY "Project members can view project files" ON public.files
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'viewer', auth.uid())
  );

CREATE POLICY "Project editors can insert project files" ON public.files
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR public.project_has_role(project_id, 'editor', auth.uid())
    )
  );

CREATE POLICY "Project editors can update project files" ON public.files
  FOR UPDATE
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );

CREATE POLICY "Project editors can delete project files" ON public.files
  FOR DELETE
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );

CREATE POLICY "Project members can view project chunks" ON public.file_chunks
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'viewer', auth.uid())
  );

CREATE POLICY "Project editors can insert project chunks" ON public.file_chunks
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      project_id IS NULL
      OR public.project_has_role(project_id, 'editor', auth.uid())
    )
  );

CREATE POLICY "Project editors can delete project chunks" ON public.file_chunks
  FOR DELETE
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );

CREATE POLICY "Project members can view project memories" ON public.memories
  FOR SELECT
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'viewer', auth.uid())
  );

CREATE POLICY "Project editors can manage project memories" ON public.memories
  FOR ALL
  USING (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  )
  WITH CHECK (
    project_id IS NOT NULL
    AND public.project_has_role(project_id, 'editor', auth.uid())
  );
