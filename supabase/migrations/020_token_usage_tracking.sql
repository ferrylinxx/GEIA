-- ============================================
-- TOKEN USAGE TRACKING
-- ============================================

-- Tabla para registrar el consumo de tokens por usuario
CREATE TABLE IF NOT EXISTS public.token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON public.token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON public.token_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_conversation_id ON public.token_usage(conversation_id);

-- Vista agregada para estadísticas por usuario
-- Nota: stats_by_model removido debido a limitación de PostgreSQL con agregados anidados
CREATE OR REPLACE VIEW public.user_token_stats AS
SELECT
  user_id,
  COUNT(*) as total_requests,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  MAX(created_at) as last_usage_at
FROM public.token_usage
GROUP BY user_id;

-- RLS Policies
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden ver solo su propio consumo
CREATE POLICY "Users can view own token usage"
  ON public.token_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Solo el sistema puede insertar registros (via service role)
CREATE POLICY "Service role can insert token usage"
  ON public.token_usage
  FOR INSERT
  WITH CHECK (true);

-- Los admins pueden ver todo
CREATE POLICY "Admins can view all token usage"
  ON public.token_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger para actualizar updated_at en user_activity_events cuando hay nuevo consumo
-- Esto permite notificaciones realtime
CREATE OR REPLACE FUNCTION notify_token_usage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar evento de actividad para trigger realtime
  INSERT INTO public.user_activity_events (user_id, sequence, updated_at)
  VALUES (NEW.user_id, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET sequence = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
      updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER token_usage_notify
  AFTER INSERT ON public.token_usage
  FOR EACH ROW
  EXECUTE FUNCTION notify_token_usage_change();

-- Comentarios para documentación
COMMENT ON TABLE public.token_usage IS 'Registro de consumo de tokens por usuario y conversación';
COMMENT ON COLUMN public.token_usage.prompt_tokens IS 'Tokens usados en el prompt (entrada)';
COMMENT ON COLUMN public.token_usage.completion_tokens IS 'Tokens generados en la respuesta (salida)';
COMMENT ON COLUMN public.token_usage.total_tokens IS 'Total de tokens (prompt + completion)';
COMMENT ON COLUMN public.token_usage.cost_usd IS 'Costo estimado en USD basado en el modelo';

