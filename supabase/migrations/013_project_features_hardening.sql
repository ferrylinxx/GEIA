-- ============================================
-- Project features hardening / compatibility
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

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

CREATE TABLE IF NOT EXISTS public.project_chat_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS project_folder_id UUID REFERENCES public.project_chat_folders(id) ON DELETE SET NULL;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS file_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replaced_from_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reindexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_project ON public.project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_token ON public.project_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_project_chat_folders_project ON public.project_chat_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_folder ON public.conversations(project_folder_id);

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

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_folders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'proj_members_select_members') THEN
    CREATE POLICY proj_members_select_members ON public.project_members
      FOR SELECT
      USING (public.project_has_role(project_id, 'viewer', auth.uid()) OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'proj_members_insert_members') THEN
    CREATE POLICY proj_members_insert_members ON public.project_members
      FOR INSERT
      WITH CHECK (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'proj_members_update_members') THEN
    CREATE POLICY proj_members_update_members ON public.project_members
      FOR UPDATE
      USING (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_members' AND policyname = 'proj_members_delete_members') THEN
    CREATE POLICY proj_members_delete_members ON public.project_members
      FOR DELETE
      USING (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_shares' AND policyname = 'proj_shares_select') THEN
    CREATE POLICY proj_shares_select ON public.project_shares
      FOR SELECT
      USING (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_shares' AND policyname = 'proj_shares_insert') THEN
    CREATE POLICY proj_shares_insert ON public.project_shares
      FOR INSERT
      WITH CHECK (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_shares' AND policyname = 'proj_shares_update') THEN
    CREATE POLICY proj_shares_update ON public.project_shares
      FOR UPDATE
      USING (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_shares' AND policyname = 'proj_shares_delete') THEN
    CREATE POLICY proj_shares_delete ON public.project_shares
      FOR DELETE
      USING (public.project_has_role(project_id, 'admin', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_chat_folders' AND policyname = 'proj_folders_select') THEN
    CREATE POLICY proj_folders_select ON public.project_chat_folders
      FOR SELECT
      USING (public.project_has_role(project_id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_chat_folders' AND policyname = 'proj_folders_all') THEN
    CREATE POLICY proj_folders_all ON public.project_chat_folders
      FOR ALL
      USING (public.project_has_role(project_id, 'editor', auth.uid()))
      WITH CHECK (public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'proj_projects_select_shared') THEN
    CREATE POLICY proj_projects_select_shared ON public.projects
      FOR SELECT
      USING (public.project_has_role(id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'proj_projects_update_shared') THEN
    CREATE POLICY proj_projects_update_shared ON public.projects
      FOR UPDATE
      USING (public.project_has_role(id, 'admin', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'proj_conversations_select') THEN
    CREATE POLICY proj_conversations_select ON public.conversations
      FOR SELECT
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'proj_conversations_insert') THEN
    CREATE POLICY proj_conversations_insert ON public.conversations
      FOR INSERT
      WITH CHECK (auth.uid() = user_id AND (project_id IS NULL OR public.project_has_role(project_id, 'editor', auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'proj_conversations_update') THEN
    CREATE POLICY proj_conversations_update ON public.conversations
      FOR UPDATE
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'proj_conversations_delete') THEN
    CREATE POLICY proj_conversations_delete ON public.conversations
      FOR DELETE
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'proj_messages_select') THEN
    CREATE POLICY proj_messages_select ON public.messages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id = conversation_id
            AND c.project_id IS NOT NULL
            AND public.project_has_role(c.project_id, 'viewer', auth.uid())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'proj_messages_insert') THEN
    CREATE POLICY proj_messages_insert ON public.messages
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id = conversation_id
            AND (c.project_id IS NULL OR public.project_has_role(c.project_id, 'editor', auth.uid()))
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'files' AND policyname = 'proj_files_select') THEN
    CREATE POLICY proj_files_select ON public.files
      FOR SELECT
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'files' AND policyname = 'proj_files_insert') THEN
    CREATE POLICY proj_files_insert ON public.files
      FOR INSERT
      WITH CHECK (auth.uid() = user_id AND (project_id IS NULL OR public.project_has_role(project_id, 'editor', auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'files' AND policyname = 'proj_files_update') THEN
    CREATE POLICY proj_files_update ON public.files
      FOR UPDATE
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'files' AND policyname = 'proj_files_delete') THEN
    CREATE POLICY proj_files_delete ON public.files
      FOR DELETE
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'file_chunks' AND policyname = 'proj_chunks_select') THEN
    CREATE POLICY proj_chunks_select ON public.file_chunks
      FOR SELECT
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'file_chunks' AND policyname = 'proj_chunks_insert') THEN
    CREATE POLICY proj_chunks_insert ON public.file_chunks
      FOR INSERT
      WITH CHECK (auth.uid() = user_id AND (project_id IS NULL OR public.project_has_role(project_id, 'editor', auth.uid())));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'memories' AND policyname = 'proj_memories_select') THEN
    CREATE POLICY proj_memories_select ON public.memories
      FOR SELECT
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'viewer', auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'memories' AND policyname = 'proj_memories_all') THEN
    CREATE POLICY proj_memories_all ON public.memories
      FOR ALL
      USING (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()))
      WITH CHECK (project_id IS NOT NULL AND public.project_has_role(project_id, 'editor', auth.uid()));
  END IF;
END $$;
