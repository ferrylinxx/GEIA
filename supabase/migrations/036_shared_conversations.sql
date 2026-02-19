-- ============================================
-- SHARED CONVERSATIONS (Colaboración)
-- ============================================

-- Tabla para participantes de conversaciones compartidas
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rol del participante
  role TEXT DEFAULT 'viewer', -- 'owner', 'editor', 'viewer'
  
  -- Permisos
  can_read BOOLEAN DEFAULT true,
  can_write BOOLEAN DEFAULT false,
  can_invite BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  last_read_at TIMESTAMPTZ,
  
  -- Invitación
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(conversation_id, user_id)
);

-- Índices para conversation_participants
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_active ON public.conversation_participants(is_active) WHERE is_active = true;

-- Tabla para typing indicators (quién está escribiendo)
CREATE TABLE IF NOT EXISTS public.conversation_typing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '10 seconds'),
  
  UNIQUE(conversation_id, user_id)
);

-- Índices para conversation_typing
CREATE INDEX IF NOT EXISTS idx_conv_typing_conv ON public.conversation_typing(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_typing_expires ON public.conversation_typing(expires_at);

-- Tabla para reacciones a mensajes
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  emoji TEXT NOT NULL, -- '👍', '❤️', '😂', etc.
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(message_id, user_id, emoji)
);

-- Índices para message_reactions
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);

-- Tabla para comentarios en mensajes (threads)
CREATE TABLE IF NOT EXISTS public.message_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  content TEXT NOT NULL,
  
  -- Thread
  parent_comment_id UUID REFERENCES public.message_comments(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para message_comments
CREATE INDEX IF NOT EXISTS idx_message_comments_message ON public.message_comments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_comments_user ON public.message_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_message_comments_parent ON public.message_comments(parent_comment_id);

-- Tabla para menciones en conversaciones
CREATE TABLE IF NOT EXISTS public.conversation_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  mentioned_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para conversation_mentions
CREATE INDEX IF NOT EXISTS idx_conv_mentions_user ON public.conversation_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_conv_mentions_unread ON public.conversation_mentions(mentioned_user_id, is_read) WHERE is_read = false;

-- RLS Policies
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_typing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_mentions ENABLE ROW LEVEL SECURITY;

-- Participants can view participants of their conversations
CREATE POLICY "Users can view conversation_participants"
  ON public.conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.is_active = true
    )
  );

-- Owners and editors can invite participants
CREATE POLICY "Users can invite conversation_participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.can_invite = true
    )
  );

-- Users can manage own typing indicators
CREATE POLICY "Users can manage own typing"
  ON public.conversation_typing FOR ALL
  USING (auth.uid() = user_id);

-- Participants can view typing indicators
CREATE POLICY "Participants can view typing"
  ON public.conversation_typing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_typing.conversation_id
      AND cp.user_id = auth.uid()
      AND cp.is_active = true
    )
  );

-- Users can manage reactions
CREATE POLICY "Users can manage own reactions"
  ON public.message_reactions FOR ALL
  USING (auth.uid() = user_id);

-- Users can manage comments
CREATE POLICY "Users can manage own comments"
  ON public.message_comments FOR ALL
  USING (auth.uid() = user_id);

-- Users can view own mentions
CREATE POLICY "Users can view own mentions"
  ON public.conversation_mentions FOR SELECT
  USING (auth.uid() = mentioned_user_id);

-- Función para limpiar typing indicators expirados
CREATE OR REPLACE FUNCTION cleanup_expired_typing()
RETURNS void AS $$
BEGIN
  DELETE FROM public.conversation_typing
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE public.conversation_participants IS 'Participantes de conversaciones compartidas';
COMMENT ON TABLE public.conversation_typing IS 'Indicadores de "está escribiendo..."';
COMMENT ON TABLE public.message_reactions IS 'Reacciones emoji a mensajes';
COMMENT ON TABLE public.message_comments IS 'Comentarios/threads en mensajes';
COMMENT ON TABLE public.conversation_mentions IS 'Menciones @usuario en conversaciones';

