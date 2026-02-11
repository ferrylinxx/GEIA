-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON public.conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON public.files(project_id);
CREATE INDEX IF NOT EXISTS idx_file_chunks_file ON public.file_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_file_chunks_project ON public.file_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_user ON public.memories(user_id);

-- Vector index for similarity search (HNSW preferred for quality)
CREATE INDEX IF NOT EXISTS idx_file_chunks_embedding ON public.file_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================
-- RPC: match_file_chunks (semantic search)
-- ============================================
CREATE OR REPLACE FUNCTION public.match_file_chunks(
  p_project_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 8,
  p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  file_id UUID,
  chunk_index INT,
  page INT,
  content TEXT,
  content_hash TEXT,
  meta_json JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.file_id,
    fc.chunk_index,
    fc.page,
    fc.content,
    fc.content_hash,
    fc.meta_json,
    1 - (fc.embedding <=> p_query_embedding) AS similarity
  FROM public.file_chunks fc
  WHERE fc.project_id = p_project_id
    AND 1 - (fc.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY fc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================
-- RPC: search conversations / messages
-- ============================================
CREATE OR REPLACE FUNCTION public.search_conversations(
  p_user_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  conversation_id UUID,
  title TEXT,
  message_id UUID,
  message_content TEXT,
  message_role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    c.title,
    m.id AS message_id,
    m.content AS message_content,
    m.role AS message_role,
    m.created_at
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE c.user_id = p_user_id
    AND c.deleted_at IS NULL
    AND (
      c.title ILIKE '%' || p_query || '%'
      OR m.content ILIKE '%' || p_query || '%'
    )
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- Trigger: auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

