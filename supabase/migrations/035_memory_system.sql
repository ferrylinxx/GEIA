-- ============================================
-- LONG-TERM MEMORY SYSTEM
-- ============================================

-- Extender tabla de memories existente con nuevas capacidades
-- (La tabla memories ya existe, solo agregamos campos)

-- Tabla para categorías de memoria
CREATE TABLE IF NOT EXISTS public.memory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8B5CF6',
  icon TEXT DEFAULT '🧠',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, name)
);

-- Índices para memory_categories
CREATE INDEX IF NOT EXISTS idx_memory_categories_user ON public.memory_categories(user_id);

-- Tabla para relaciones entre memorias
CREATE TABLE IF NOT EXISTS public.memory_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  to_memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  
  relation_type TEXT NOT NULL, -- 'related_to', 'contradicts', 'updates', 'supports'
  strength DECIMAL(3, 2) DEFAULT 1.0, -- 0.0 a 1.0
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(from_memory_id, to_memory_id, relation_type)
);

-- Índices para memory_relations
CREATE INDEX IF NOT EXISTS idx_memory_relations_from ON public.memory_relations(from_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_relations_to ON public.memory_relations(to_memory_id);

-- Tabla para accesos a memorias (para ranking)
CREATE TABLE IF NOT EXISTS public.memory_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id UUID REFERENCES public.memories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  
  access_type TEXT NOT NULL, -- 'retrieved', 'used', 'updated'
  relevance_score DECIMAL(5, 4), -- Score de relevancia cuando fue recuperada
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para memory_access_log
CREATE INDEX IF NOT EXISTS idx_memory_access_memory ON public.memory_access_log(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_access_user ON public.memory_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_access_created ON public.memory_access_log(created_at DESC);

-- Tabla para configuración de memoria por usuario
CREATE TABLE IF NOT EXISTS public.memory_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Configuración de retención
  auto_forget_enabled BOOLEAN DEFAULT false,
  auto_forget_days INTEGER DEFAULT 90, -- Olvidar memorias no usadas en X días
  
  -- Configuración de categorización automática
  auto_categorize BOOLEAN DEFAULT true,
  
  -- Configuración de privacidad
  share_memories_with_agents BOOLEAN DEFAULT true,
  
  -- Límites
  max_memories INTEGER DEFAULT 1000,
  
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vista agregada para estadísticas de memoria
CREATE OR REPLACE VIEW public.memory_stats AS
SELECT
  m.user_id,
  COUNT(DISTINCT m.id) as total_memories,
  COUNT(DISTINCT CASE WHEN m.scope = 'user' THEN m.id END) as user_memories,
  COUNT(DISTINCT CASE WHEN m.scope = 'conversation' THEN m.id END) as conversation_memories,
  COUNT(DISTINCT CASE WHEN m.scope = 'project' THEN m.id END) as project_memories,
  COUNT(DISTINCT mal.id) as total_accesses,
  MAX(mal.created_at) as last_access_at,
  AVG(mal.relevance_score) as avg_relevance_score
FROM public.memories m
LEFT JOIN public.memory_access_log mal ON m.id = mal.memory_id
GROUP BY m.user_id;

-- RLS Policies
ALTER TABLE public.memory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_settings ENABLE ROW LEVEL SECURITY;

-- Users can manage own memory categories
CREATE POLICY "Users can manage own memory_categories"
  ON public.memory_categories FOR ALL
  USING (auth.uid() = user_id);

-- Users can manage own memory relations
CREATE POLICY "Users can manage own memory_relations"
  ON public.memory_relations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.memories
      WHERE memories.id = memory_relations.from_memory_id
      AND memories.user_id = auth.uid()
    )
  );

-- Users can view own memory access log
CREATE POLICY "Users can view own memory_access_log"
  ON public.memory_access_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service can insert memory access log
CREATE POLICY "Service can insert memory_access_log"
  ON public.memory_access_log FOR INSERT
  WITH CHECK (true);

-- Users can manage own memory settings
CREATE POLICY "Users can manage own memory_settings"
  ON public.memory_settings FOR ALL
  USING (auth.uid() = user_id);

-- Función para limpiar memorias antiguas
CREATE OR REPLACE FUNCTION cleanup_old_memories()
RETURNS void AS $$
BEGIN
  -- Eliminar memorias no accedidas en X días (según configuración del usuario)
  DELETE FROM public.memories m
  WHERE EXISTS (
    SELECT 1 FROM public.memory_settings ms
    WHERE ms.user_id = m.user_id
    AND ms.auto_forget_enabled = true
    AND m.created_at < NOW() - (ms.auto_forget_days || ' days')::INTERVAL
    AND NOT EXISTS (
      SELECT 1 FROM public.memory_access_log mal
      WHERE mal.memory_id = m.id
      AND mal.created_at > NOW() - (ms.auto_forget_days || ' days')::INTERVAL
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE public.memory_categories IS 'Categorías personalizadas para organizar memorias';
COMMENT ON TABLE public.memory_relations IS 'Relaciones entre memorias (grafo de conocimiento)';
COMMENT ON TABLE public.memory_access_log IS 'Log de accesos a memorias para ranking';
COMMENT ON TABLE public.memory_settings IS 'Configuración de memoria por usuario';
COMMENT ON VIEW public.memory_stats IS 'Estadísticas agregadas de memorias por usuario';

