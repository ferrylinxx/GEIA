-- ============================================
-- AGENTS SYSTEM (Agentes Personalizados)
-- ============================================

-- Tabla para agentes personalizados
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Configuración del agente
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  color TEXT DEFAULT '#8B5CF6', -- Color hex para UI
  
  -- Configuración de IA
  model_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  temperature DECIMAL(3, 2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  
  -- Herramientas habilitadas
  tools_enabled JSONB DEFAULT '{
    "rag": false,
    "web_search": false,
    "db_query": false,
    "image_generation": false,
    "code_interpreter": false
  }'::jsonb,
  
  -- Configuración de RAG específica
  rag_config JSONB DEFAULT '{
    "mode": "assisted",
    "cite_mode": true,
    "project_id": null
  }'::jsonb,
  
  -- Metadata
  is_public BOOLEAN DEFAULT false, -- Si otros usuarios pueden usar este agente
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para agents
CREATE INDEX IF NOT EXISTS idx_agents_user ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_public ON public.agents(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_agents_active ON public.agents(is_active) WHERE is_active = true;

-- Tabla para workflows automatizados
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Configuración del workflow
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger (qué inicia el workflow)
  trigger_type TEXT NOT NULL, -- 'schedule', 'webhook', 'file_upload', 'message_keyword'
  trigger_config JSONB DEFAULT '{}'::jsonb,
  
  -- Steps (pasos del workflow)
  steps JSONB DEFAULT '[]'::jsonb, -- Array de steps con tipo y configuración
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para workflows
CREATE INDEX IF NOT EXISTS idx_workflows_user ON public.workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON public.workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflows_next_run ON public.workflows(next_run_at) WHERE is_active = true;

-- Tabla para logs de ejecución de workflows
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
  
  -- Resultado de la ejecución
  status TEXT NOT NULL, -- 'running', 'success', 'failed'
  steps_completed INTEGER DEFAULT 0,
  steps_total INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Datos de entrada/salida
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Índices para workflow_runs
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started ON public.workflow_runs(started_at DESC);

-- RLS Policies
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- Users can manage own agents
CREATE POLICY "Users can view own agents"
  ON public.agents FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own agents"
  ON public.agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents"
  ON public.agents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents"
  ON public.agents FOR DELETE
  USING (auth.uid() = user_id);

-- Users can manage own workflows
CREATE POLICY "Users can manage own workflows"
  ON public.workflows FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own workflow_runs"
  ON public.workflow_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows
      WHERE workflows.id = workflow_runs.workflow_id
      AND workflows.user_id = auth.uid()
    )
  );

-- Admins can view all
CREATE POLICY "Admins can view all agents"
  ON public.agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Comentarios
COMMENT ON TABLE public.agents IS 'Agentes de IA personalizados por usuario';
COMMENT ON TABLE public.workflows IS 'Workflows automatizados';
COMMENT ON TABLE public.workflow_runs IS 'Historial de ejecuciones de workflows';

