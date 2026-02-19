-- ============================================
-- ANALYTICS SYSTEM
-- ============================================

-- Tabla para métricas agregadas diarias
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Métricas de uso
  total_messages INTEGER DEFAULT 0,
  total_conversations INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  
  -- Métricas por modelo
  models_used JSONB DEFAULT '[]'::jsonb,
  
  -- Métricas de herramientas
  rag_uses INTEGER DEFAULT 0,
  web_search_uses INTEGER DEFAULT 0,
  db_query_uses INTEGER DEFAULT 0,
  image_gen_uses INTEGER DEFAULT 0,
  
  -- Tiempo de uso
  active_minutes INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(date, user_id)
);

-- Índices para analytics_daily
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON public.analytics_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user ON public.analytics_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date_user ON public.analytics_daily(date DESC, user_id);

-- Tabla para eventos de analytics en tiempo real
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'message_sent', 'conversation_created', 'tool_used', etc.
  event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at DESC);

-- Vista agregada para dashboard
CREATE OR REPLACE VIEW public.analytics_dashboard AS
SELECT
  user_id,
  COUNT(DISTINCT date) as active_days,
  SUM(total_messages) as total_messages,
  SUM(total_conversations) as total_conversations,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_usd) as total_cost_usd,
  SUM(rag_uses) as total_rag_uses,
  SUM(web_search_uses) as total_web_search_uses,
  SUM(db_query_uses) as total_db_query_uses,
  SUM(image_gen_uses) as total_image_gen_uses,
  SUM(active_minutes) as total_active_minutes,
  MAX(date) as last_active_date
FROM public.analytics_daily
GROUP BY user_id;

-- RLS Policies
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can view own analytics
CREATE POLICY "Users can view own analytics_daily"
  ON public.analytics_daily FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own analytics_events"
  ON public.analytics_events FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all analytics
CREATE POLICY "Admins can view all analytics_daily"
  ON public.analytics_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all analytics_events"
  ON public.analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can insert/update
CREATE POLICY "Service can manage analytics_daily"
  ON public.analytics_daily FOR ALL
  USING (true);

CREATE POLICY "Service can manage analytics_events"
  ON public.analytics_events FOR ALL
  USING (true);

-- Función para actualizar métricas diarias
CREATE OR REPLACE FUNCTION update_daily_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar o insertar métricas del día
  INSERT INTO public.analytics_daily (date, user_id, total_messages)
  VALUES (CURRENT_DATE, NEW.user_id, 1)
  ON CONFLICT (date, user_id) DO UPDATE
  SET total_messages = analytics_daily.total_messages + 1,
      updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar analytics cuando se crea un mensaje
CREATE TRIGGER messages_analytics_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.role = 'user')
  EXECUTE FUNCTION update_daily_analytics();

-- Comentarios
COMMENT ON TABLE public.analytics_daily IS 'Métricas agregadas por día y usuario';
COMMENT ON TABLE public.analytics_events IS 'Eventos de analytics en tiempo real';
COMMENT ON VIEW public.analytics_dashboard IS 'Vista agregada para dashboard de analytics';

