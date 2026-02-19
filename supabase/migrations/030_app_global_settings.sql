-- ============================================
-- GLOBAL APP SETTINGS
-- Configuración global de la aplicación (tema, sonidos, etc.)
-- ============================================

-- Tabla para configuración global de la app
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para búsquedas rápidas por key
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);

-- RLS: Todos pueden leer, solo admins pueden escribir
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app settings" ON public.app_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage app settings" ON public.app_settings
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Insertar configuración por defecto
INSERT INTO public.app_settings (key, value) VALUES
  ('active_theme', '{"slug": "liquid-glass", "name": "Liquid Glass"}'::jsonb),
  ('notification_sound', '{"sound_url": null, "duration_seconds": 5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

