-- ============================================
-- ADVANCED THEMES SYSTEM
-- ============================================

-- Tabla para temas personalizados por usuario
CREATE TABLE IF NOT EXISTS public.user_themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Información del tema
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false, -- Si otros usuarios pueden usar este tema
  
  -- Configuración de colores (CSS variables)
  colors JSONB DEFAULT '{
    "primary": "#8B5CF6",
    "secondary": "#EC4899",
    "accent": "#F59E0B",
    "background": "#0F172A",
    "surface": "#1E293B",
    "text": "#F1F5F9",
    "border": "#334155"
  }'::jsonb,
  
  -- Configuración de gradientes
  gradients JSONB DEFAULT '{
    "main": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "header": "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
    "sidebar": "linear-gradient(180deg, #667eea 0%, #764ba2 100%)"
  }'::jsonb,
  
  -- Efectos visuales
  effects JSONB DEFAULT '{
    "blur": 10,
    "opacity": 0.9,
    "shadow": "0 8px 32px rgba(0, 0, 0, 0.37)",
    "border_radius": 16,
    "animations": true,
    "particles": false,
    "fog": false,
    "glow": false
  }'::jsonb,
  
  -- Tipografía
  typography JSONB DEFAULT '{
    "font_family": "Inter, system-ui, sans-serif",
    "font_size_base": 16,
    "font_weight_normal": 400,
    "font_weight_bold": 600,
    "line_height": 1.5
  }'::jsonb,
  
  -- CSS personalizado (para usuarios avanzados)
  custom_css TEXT,
  
  -- Metadata
  usage_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para user_themes
CREATE INDEX IF NOT EXISTS idx_user_themes_user ON public.user_themes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_themes_public ON public.user_themes(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_user_themes_likes ON public.user_themes(likes_count DESC);

-- Tabla para likes de temas
CREATE TABLE IF NOT EXISTS public.theme_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  theme_id UUID REFERENCES public.user_themes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(theme_id, user_id)
);

-- Índices para theme_likes
CREATE INDEX IF NOT EXISTS idx_theme_likes_theme ON public.theme_likes(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_likes_user ON public.theme_likes(user_id);

-- RLS Policies
ALTER TABLE public.user_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_likes ENABLE ROW LEVEL SECURITY;

-- Users can view own themes and public themes
CREATE POLICY "Users can view accessible themes"
  ON public.user_themes FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own themes"
  ON public.user_themes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own themes"
  ON public.user_themes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own themes"
  ON public.user_themes FOR DELETE
  USING (auth.uid() = user_id);

-- Users can manage own likes
CREATE POLICY "Users can manage own theme_likes"
  ON public.theme_likes FOR ALL
  USING (auth.uid() = user_id);

-- Función para actualizar contador de likes
CREATE OR REPLACE FUNCTION update_theme_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_themes
    SET likes_count = likes_count + 1
    WHERE id = NEW.theme_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_themes
    SET likes_count = likes_count - 1
    WHERE id = OLD.theme_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar likes
CREATE TRIGGER theme_likes_count_trigger
  AFTER INSERT OR DELETE ON public.theme_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_theme_likes_count();

-- Comentarios
COMMENT ON TABLE public.user_themes IS 'Temas personalizados creados por usuarios';
COMMENT ON TABLE public.theme_likes IS 'Likes de temas por usuarios';

