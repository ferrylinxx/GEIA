-- ============================================
-- ADMIN FEATURES: User Management Extensions
-- ============================================

-- ============================================
-- 1. USER SUSPENSION/BAN
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_suspended ON public.profiles(suspended) WHERE suspended = true;

-- ============================================
-- 2. USER GROUPS/TEAMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_members_group ON public.user_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON public.user_group_members(user_id);

-- ============================================
-- 3. USER INVITATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.user_groups(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON public.user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON public.user_invitations(status);

-- ============================================
-- 4. ADMIN NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'group', 'all')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_group_id UUID REFERENCES public.user_groups(id) ON DELETE CASCADE,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_by JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_target_user ON public.admin_notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_target_group ON public.admin_notifications(target_group_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_sent_at ON public.admin_notifications(sent_at DESC);

-- ============================================
-- 5. ADMIN AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

-- ============================================
-- 6. USER IMPERSONATION SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON public.admin_impersonation_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target ON public.admin_impersonation_sessions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_token ON public.admin_impersonation_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_impersonation_active ON public.admin_impersonation_sessions(is_active) WHERE is_active = true;

-- ============================================
-- RLS POLICIES
-- ============================================

-- User Groups: Only admins can manage
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage groups" ON public.user_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- User Group Members: Admins can manage, users can view their own
ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage group members" ON public.user_group_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can view their own group memberships" ON public.user_group_members FOR SELECT USING (
  user_id = auth.uid()
);

-- User Invitations: Only admins
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage invitations" ON public.user_invitations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Admin Notifications: Users can view their own, admins can manage all
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their notifications" ON public.admin_notifications FOR SELECT USING (
  target_type = 'all' OR 
  (target_type = 'user' AND target_user_id = auth.uid()) OR
  (target_type = 'group' AND EXISTS (
    SELECT 1 FROM public.user_group_members WHERE group_id = target_group_id AND user_id = auth.uid()
  ))
);
CREATE POLICY "Admins can manage notifications" ON public.admin_notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Audit Log: Only admins can view
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit log" ON public.admin_audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Impersonation Sessions: Only admins
ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage impersonation" ON public.admin_impersonation_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

