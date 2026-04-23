-- ============================================================================
-- Migration: Issue Resolution Verification System
-- Run this in Supabase SQL Editor. Safe for existing data.
-- ============================================================================

BEGIN;

-- 1) Add new columns (idempotent)
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS verified_by_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2) Recreate the trigger function to allow workers to also update resolution_image_url
CREATE OR REPLACE FUNCTION public.enforce_issue_update_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- service role updates (backend) are allowed
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'worker') THEN
    -- Worker can change worker_status AND resolution_image_url (for proof upload)
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

COMMIT;
