-- ============================================
-- FINE-TUNING SYSTEM
-- ============================================

-- Tabla para datasets de entrenamiento
CREATE TABLE IF NOT EXISTS public.fine_tuning_datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Información del dataset
  name TEXT NOT NULL,
  description TEXT,
  
  -- Datos de entrenamiento (formato JSONL)
  training_data JSONB DEFAULT '[]'::jsonb, -- Array de {messages: [...]}
  validation_data JSONB DEFAULT '[]'::jsonb,
  
  -- Estadísticas
  total_examples INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  
  -- Metadata
  file_url TEXT, -- URL del archivo JSONL subido
  file_size_bytes BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para fine_tuning_datasets
CREATE INDEX IF NOT EXISTS idx_ft_datasets_user ON public.fine_tuning_datasets(user_id);

-- Tabla para jobs de fine-tuning
CREATE TABLE IF NOT EXISTS public.fine_tuning_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.fine_tuning_datasets(id) ON DELETE SET NULL,
  
  -- Configuración del job
  base_model TEXT NOT NULL, -- 'gpt-4o-mini', 'gpt-3.5-turbo', etc.
  fine_tuned_model_name TEXT, -- Nombre personalizado para el modelo
  
  -- Hiperparámetros
  hyperparameters JSONB DEFAULT '{
    "n_epochs": 3,
    "batch_size": 1,
    "learning_rate_multiplier": 1.0
  }'::jsonb,
  
  -- Estado del job
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'succeeded', 'failed', 'cancelled'
  progress_percentage INTEGER DEFAULT 0,
  
  -- IDs externos (OpenAI, etc.)
  external_job_id TEXT,
  external_model_id TEXT,
  
  -- Resultados
  training_metrics JSONB DEFAULT '{}'::jsonb,
  validation_metrics JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  
  -- Costos
  estimated_cost_usd DECIMAL(10, 6),
  actual_cost_usd DECIMAL(10, 6),
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para fine_tuning_jobs
CREATE INDEX IF NOT EXISTS idx_ft_jobs_user ON public.fine_tuning_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ft_jobs_status ON public.fine_tuning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ft_jobs_external ON public.fine_tuning_jobs(external_job_id);

-- Tabla para modelos fine-tuned
CREATE TABLE IF NOT EXISTS public.fine_tuned_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.fine_tuning_jobs(id) ON DELETE SET NULL,
  
  -- Información del modelo
  name TEXT NOT NULL,
  description TEXT,
  base_model TEXT NOT NULL,
  
  -- IDs externos
  external_model_id TEXT NOT NULL UNIQUE,
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  
  -- Estadísticas de uso
  usage_count INTEGER DEFAULT 0,
  total_tokens_used BIGINT DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  
  -- Evaluación
  performance_metrics JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para fine_tuned_models
CREATE INDEX IF NOT EXISTS idx_ft_models_user ON public.fine_tuned_models(user_id);
CREATE INDEX IF NOT EXISTS idx_ft_models_active ON public.fine_tuned_models(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ft_models_external ON public.fine_tuned_models(external_model_id);

-- RLS Policies
ALTER TABLE public.fine_tuning_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_tuning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_tuned_models ENABLE ROW LEVEL SECURITY;

-- Users can manage own datasets
CREATE POLICY "Users can manage own ft_datasets"
  ON public.fine_tuning_datasets FOR ALL
  USING (auth.uid() = user_id);

-- Users can manage own jobs
CREATE POLICY "Users can manage own ft_jobs"
  ON public.fine_tuning_jobs FOR ALL
  USING (auth.uid() = user_id);

-- Users can view own models and public models
CREATE POLICY "Users can view accessible ft_models"
  ON public.fine_tuned_models FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can manage own ft_models"
  ON public.fine_tuned_models FOR INSERT, UPDATE, DELETE
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all ft_datasets"
  ON public.fine_tuning_datasets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Comentarios
COMMENT ON TABLE public.fine_tuning_datasets IS 'Datasets para entrenar modelos personalizados';
COMMENT ON TABLE public.fine_tuning_jobs IS 'Jobs de fine-tuning en progreso o completados';
COMMENT ON TABLE public.fine_tuned_models IS 'Modelos fine-tuned disponibles para usar';

