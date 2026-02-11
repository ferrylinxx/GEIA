-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  settings_json JSONB DEFAULT '{}'::jsonb,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  custom_instructions_enabled BOOLEAN DEFAULT false,
  custom_instructions_what TEXT DEFAULT '',
  custom_instructions_how TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PROJECTS / WORKSPACES
-- ============================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  memory_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FOLDERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TAGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT DEFAULT 'Nuevo chat',
  pinned BOOLEAN DEFAULT false,
  favorite BOOLEAN DEFAULT false,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  model_default TEXT DEFAULT 'gpt-4o-mini',
  rag_mode TEXT DEFAULT 'off' CHECK (rag_mode IN ('off', 'assisted', 'strict')),
  cite_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  forked_from_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL
);

-- ============================================
-- CONVERSATION_TAGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, tag_id)
);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT DEFAULT '',
  parent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  branch_id UUID,
  attachments_json JSONB DEFAULT '[]'::jsonb,
  sources_json JSONB DEFAULT '[]'::jsonb,
  edited_at TIMESTAMPTZ,
  edit_version INT DEFAULT 1,
  active_version_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- MESSAGE_EDITS
-- ============================================
CREATE TABLE IF NOT EXISTS public.message_edits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  edited_at TIMESTAMPTZ DEFAULT now(),
  editor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ============================================
-- MESSAGE_VERSIONS (for AI regeneration)
-- ============================================
CREATE TABLE IF NOT EXISTS public.message_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  version_index INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  model TEXT,
  meta_json JSONB DEFAULT '{}'::jsonb,
  sources_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FILES
-- ============================================
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT,
  size BIGINT DEFAULT 0,
  meta_json JSONB DEFAULT '{}'::jsonb,
  ingest_status TEXT DEFAULT 'none' CHECK (ingest_status IN ('none','queued','processing','done','failed')),
  ingest_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FILE_CHUNKS (RAG with pgvector)
-- ============================================
CREATE TABLE IF NOT EXISTS public.file_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page INT,
  content TEXT NOT NULL,
  content_hash TEXT,
  embedding vector(1536),
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- MEMORIES
-- ============================================
CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  scope TEXT DEFAULT 'user' CHECK (scope IN ('user', 'project', 'conversation')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

