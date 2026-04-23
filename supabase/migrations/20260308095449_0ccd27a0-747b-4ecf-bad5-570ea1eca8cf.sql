
-- Create enums
CREATE TYPE public.app_role AS ENUM ('citizen', 'admin', 'worker');
CREATE TYPE public.issue_type AS ENUM ('pothole', 'garbage', 'broken_streetlight', 'water_leak', 'road_damage', 'other');
CREATE TYPE public.issue_status AS ENUM ('pending', 'assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE public.urgency_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Create departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles per security best practices)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'citizen',
  UNIQUE(user_id, role)
);

-- Create issues table
CREATE TABLE public.issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  issue_type public.issue_type NOT NULL DEFAULT 'other',
  urgency public.urgency_level NOT NULL DEFAULT 'medium',
  department TEXT NOT NULL DEFAULT 'General Services',
  priority_score INTEGER NOT NULL DEFAULT 50,
  status public.issue_status NOT NULL DEFAULT 'pending',
  worker_status TEXT CHECK (worker_status IN ('in_progress', 'work_done') OR worker_status IS NULL),
  assigned_worker_id UUID REFERENCES auth.users(id),
  resolution_image_url TEXT,
  ai_confidence DOUBLE PRECISION,
  ai_keywords TEXT[],
  ai_sentiment TEXT,
  duplicate_group_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  issue_id UUID REFERENCES public.issues(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
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

-- Departments: readable by all authenticated users
CREATE POLICY "Departments are viewable by authenticated users"
  ON public.departments FOR SELECT TO authenticated USING (true);

-- Profiles: viewable by all authenticated, editable by own user
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- User roles: viewable by self and admins
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Issues: citizens see own, admins/workers see all or assigned
CREATE POLICY "Citizens can view own issues"
  ON public.issues FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid())
  );
CREATE POLICY "Authenticated users can create issues"
  ON public.issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update any issue"
  ON public.issues FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Workers can update assigned issue workflow"
  ON public.issues FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'worker') AND assigned_worker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_issue_update_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- Service-role style updates (no auth context) are allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'worker') THEN
    -- Worker is allowed to update only worker_status (and automatic updated_at).
    IF (NEW.status IS DISTINCT FROM OLD.status)
      OR (NEW.assigned_worker_id IS DISTINCT FROM OLD.assigned_worker_id)
      OR (NEW.issue_type IS DISTINCT FROM OLD.issue_type)
      OR (NEW.urgency IS DISTINCT FROM OLD.urgency)
      OR (NEW.department IS DISTINCT FROM OLD.department)
      OR (NEW.priority_score IS DISTINCT FROM OLD.priority_score)
      OR (NEW.ai_confidence IS DISTINCT FROM OLD.ai_confidence)
      OR (NEW.ai_keywords IS DISTINCT FROM OLD.ai_keywords)
      OR (NEW.ai_sentiment IS DISTINCT FROM OLD.ai_sentiment)
      OR (NEW.description IS DISTINCT FROM OLD.description)
      OR (NEW.image_url IS DISTINCT FROM OLD.image_url)
      OR (NEW.latitude IS DISTINCT FROM OLD.latitude)
      OR (NEW.longitude IS DISTINCT FROM OLD.longitude)
      OR (NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'Workers can only update worker_status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER enforce_issue_update_permissions_trigger
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_issue_update_permissions();

-- Notifications: users see own only
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
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

-- Enable realtime for issues and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Storage bucket for issue images
INSERT INTO storage.buckets (id, name, public) VALUES ('issue-images', 'issue-images', true);

CREATE POLICY "Anyone can view issue images"
  ON storage.objects FOR SELECT USING (bucket_id = 'issue-images');
CREATE POLICY "Authenticated users can upload issue images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'issue-images');

-- Insert default departments
INSERT INTO public.departments (name) VALUES
  ('Roads Department'),
  ('Waste Management'),
  ('Electricity Department'),
  ('Water Supply Department'),
  ('General Services');
