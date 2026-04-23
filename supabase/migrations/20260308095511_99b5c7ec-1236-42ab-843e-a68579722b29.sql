
-- Fix overly permissive notifications INSERT policy
DROP POLICY "System can create notifications" ON public.notifications;

-- Only allow inserting notifications for oneself, or admins/workers for any user
CREATE POLICY "Users and admins can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'worker')
  );
