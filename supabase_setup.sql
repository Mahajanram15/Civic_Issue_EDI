-- ============================================================================
-- Civic Issue Reporting System - FULL RESET + REBUILD (Authoritative)
-- Run this in Supabase SQL Editor when schema/policies are inconsistent.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 0) Drop dependent triggers/functions/policies safely
-- --------------------------------------------------------------------------

DROP TRIGGER IF EXISTS enforce_issue_update_permissions_trigger ON public.issues;
DROP TRIGGER IF EXISTS update_issues_updated_at ON public.issues;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP FUNCTION IF EXISTS public.enforce_issue_update_permissions() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;

-- --------------------------------------------------------------------------
-- 1) Drop tables in required order
-- --------------------------------------------------------------------------

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.issues CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

-- Drop legacy enums if they exist.
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.issue_type CASCADE;
DROP TYPE IF EXISTS public.issue_status CASCADE;
DROP TYPE IF EXISTS public.urgency_level CASCADE;

-- --------------------------------------------------------------------------
-- 2) Recreate core tables
-- --------------------------------------------------------------------------

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'worker', 'user')),
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('citizen', 'admin', 'worker')),
  UNIQUE(user_id, role)
);

CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Issue Report',
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,

  -- Admin-controlled final status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'in_progress', 'resolved', 'rejected')),

  -- Worker intermediate status
  worker_status TEXT
    CHECK (worker_status IN ('in_progress', 'work_done') OR worker_status IS NULL),

  assigned_worker_id UUID REFERENCES auth.users(id),

  -- AI fields (nullable by design because AI runs asynchronously)
  issue_type TEXT CHECK (issue_type IN ('pothole', 'garbage', 'broken_streetlight', 'water_leak', 'road_damage', 'other') OR issue_type IS NULL),
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical') OR urgency IS NULL),
  department TEXT,
  priority_score INTEGER CHECK (priority_score BETWEEN 0 AND 100 OR priority_score IS NULL),
  ai_confidence DOUBLE PRECISION,
  ai_keywords TEXT[],
  ai_sentiment TEXT,

  resolution_image_url TEXT,
  verified_by_admin BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  duplicate_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  issue_id UUID REFERENCES public.issues(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 3) Enable RLS
-- --------------------------------------------------------------------------

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 4) Helper function for role checks
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- --------------------------------------------------------------------------
-- 5) RLS policies
-- --------------------------------------------------------------------------

-- Departments
CREATE POLICY "Departments are viewable by authenticated users"
  ON public.departments FOR SELECT TO authenticated USING (true);

-- Profiles
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Issues read
CREATE POLICY "Citizens can view own issues"
  ON public.issues FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid())
  );

-- Issues insert (citizen and admin/system users acting as owner)
CREATE POLICY "Authenticated users can create own issues"
  ON public.issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Issues update by admin (status + assignment authority)
CREATE POLICY "Admins can update issues"
  ON public.issues FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Issues update by worker (assigned tasks)
CREATE POLICY "Workers can update assigned issues"
  ON public.issues FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid());

-- Notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users and admins/workers can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'worker')
  );

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- 6) Trigger: enforce worker can only update worker_status
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_issue_update_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- service role updates (backend) are allowed
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'worker') THEN
    -- Worker can change worker_status AND resolution_image_url (proof upload)
    IF (NEW.status IS DISTINCT FROM OLD.status)
      OR (NEW.assigned_worker_id IS DISTINCT FROM OLD.assigned_worker_id)
      OR (NEW.title IS DISTINCT FROM OLD.title)
      OR (NEW.description IS DISTINCT FROM OLD.description)
      OR (NEW.image_url IS DISTINCT FROM OLD.image_url)
      OR (NEW.latitude IS DISTINCT FROM OLD.latitude)
      OR (NEW.longitude IS DISTINCT FROM OLD.longitude)
      OR (NEW.issue_type IS DISTINCT FROM OLD.issue_type)
      OR (NEW.urgency IS DISTINCT FROM OLD.urgency)
      OR (NEW.department IS DISTINCT FROM OLD.department)
      OR (NEW.priority_score IS DISTINCT FROM OLD.priority_score)
      OR (NEW.ai_confidence IS DISTINCT FROM OLD.ai_confidence)
      OR (NEW.ai_keywords IS DISTINCT FROM OLD.ai_keywords)
      OR (NEW.ai_sentiment IS DISTINCT FROM OLD.ai_sentiment)
      OR (NEW.user_id IS DISTINCT FROM OLD.user_id)
      OR (NEW.duplicate_group_id IS DISTINCT FROM OLD.duplicate_group_id)
      OR (NEW.verified_by_admin IS DISTINCT FROM OLD.verified_by_admin)
      OR (NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
      RAISE EXCEPTION 'Workers can only update worker_status and resolution_image_url';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_issue_update_permissions_trigger
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_issue_update_permissions();

-- --------------------------------------------------------------------------
-- 7) updated_at triggers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------------------
-- 8) Profile + role creation on signup
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'citizen');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------------
-- 9) Realtime
-- --------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- --------------------------------------------------------------------------
-- 10) Storage + seed data
-- --------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-images', 'issue-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view issue images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload issue images" ON storage.objects;

CREATE POLICY "Anyone can view issue images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'issue-images');

CREATE POLICY "Authenticated users can upload issue images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'issue-images');

INSERT INTO public.departments (name)
VALUES
  ('Roads Department'),
  ('Waste Management'),
  ('Electricity Department'),
  ('Water Supply Department'),
  ('General Services')
ON CONFLICT (name) DO NOTHING;

COMMIT;
