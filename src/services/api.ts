import { hasSupabaseEnv, supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';

const API_TIMEOUT_MS = 15000;
const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://127.0.0.1:8000';

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    }),
  ]);
}

export async function getIssues() {
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false }));
  if (error) throw error;
  return data;
}

export async function getAdminIssues(_accessToken?: string) {
  // Query Supabase directly — no backend dependency
  const start = performance.now();
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .select('*')
    .order('created_at', { ascending: false }));

  console.info(`[Admin Issues] Query took ${Math.round(performance.now() - start)}ms, count: ${data?.length ?? 0}`);
  if (error) throw error;
  return data;
}

export async function getIssueById(id: string) {
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .select('*')
    .eq('id', id)
    .single());
  if (error) throw error;
  return data;
}

export async function getUserIssues(userId: string) {
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }));
  if (error) throw error;
  return data;
}

export async function getWorkerIssues(workerId: string, profileId?: string) {
  const ids = profileId && profileId !== workerId ? [workerId, profileId] : [workerId];

  const { data, error } = await withTimeout(supabase
    .from('issues')
    .select('*')
    .in('assigned_worker_id', ids)
    .order('created_at', { ascending: false }));
  if (error) throw error;
  return data;
}

export async function createIssue(issue: TablesInsert<'issues'>) {
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .insert(issue)
    .select()
    .single());
  if (error) throw error;
  return data;
}

export async function updateIssue(id: string, updates: Partial<Tables<'issues'>>) {
  const { data, error } = await withTimeout(supabase
    .from('issues')
    .update(updates)
    .eq('id', id)
    .select()
    .single());
  if (error) throw error;
  return data;
}

export async function assignIssue(issueId: string, workerId: string, accessToken: string) {
  const response = await withTimeout(fetch(`${AI_SERVICE_URL}/admin/issues/${issueId}/assign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ worker_id: workerId, status: 'assigned' }),
  }));

  if (!response.ok) {
    let detail = 'Failed to assign worker';
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep generic error when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function reportIssue(payload: {
  title?: string;
  image_url: string;
  description: string;
  latitude: number;
  longitude: number;
}, accessToken: string) {
  console.info('[Issue Submit] Sending report request', {
    endpoint: `${AI_SERVICE_URL}/issues/report`,
    hasAccessToken: Boolean(accessToken),
    hasImageUrl: Boolean(payload.image_url),
  });

  if (!accessToken) {
    throw new Error('Authentication required: missing access token');
  }

  const response = await withTimeout(fetch(`${AI_SERVICE_URL}/issues/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  }));

  console.info('[Issue Submit] Report response received', {
    ok: response.ok,
    status: response.status,
  });

  if (!response.ok) {
    let detail = 'Failed to report issue';
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep generic error when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function workerUpdateStatus(payload: {
  issue_id: string;
  worker_status: 'in_progress' | 'work_done';
  after_image_url?: string;
}, accessToken: string) {
  const response = await withTimeout(fetch(`${AI_SERVICE_URL}/worker/update-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  }));

  if (!response.ok) {
    let detail = 'Failed to update worker status';
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep generic error when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function adminUpdateStatus(payload: {
  issue_id: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';
}, accessToken: string) {
  const response = await withTimeout(fetch(`${AI_SERVICE_URL}/admin/update-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  }));

  if (!response.ok) {
    let detail = 'Failed to update admin status';
    try {
      const body = await response.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep generic error when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export async function uploadIssueImage(file: File, userId: string) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await withTimeout(supabase.storage
    .from('issue-images')
    .upload(fileName, file));
  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('issue-images')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export async function getNotifications(userId: string) {
  const { data, error } = await withTimeout(supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }));
  if (error) throw error;
  return data;
}

export async function markNotificationRead(id: string) {
  const { error } = await withTimeout(supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id));
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await withTimeout(supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false));
  if (error) throw error;
}

export async function createNotification(notification: TablesInsert<'notifications'>) {
  const { error } = await withTimeout(supabase
    .from('notifications')
    .insert(notification));
  if (error) throw error;
}

export async function sendResolutionToUser(issue: Tables<'issues'>) {
  const message = `✅ Your issue "${(issue.title || issue.description).slice(0, 60)}" has been resolved. Click to view the Before & After comparison.`;
  await createNotification({
    user_id: issue.user_id,
    message,
    issue_id: issue.id,
  });
}

export async function getProfiles() {
  const { data, error } = await withTimeout(supabase
    .from('profiles')
    .select('*'));
  if (error) throw error;
  return data;
}

export async function getWorkers() {
  // Single query — profiles.role is the source of truth
  const { data, error } = await withTimeout(supabase
    .from('profiles')
    .select('*')
    .eq('role', 'worker') as PromiseLike<any>);
  if (error) throw error;
  return data as import('@/integrations/supabase/types').Tables<'profiles'>[];
}

export async function getDepartments() {
  const { data, error } = await withTimeout(supabase
    .from('departments')
    .select('*'));
  if (error) throw error;
  return data;
}

export async function getStats() {
  if (!hasSupabaseEnv) {
    return { totalReported: 0, resolved: 0, inProgress: 0, pending: 0 };
  }

  const [
    totalRes,
    resolvedRes,
    inProgressRes,
    pendingRes,
  ] = await Promise.all([
    withTimeout(supabase.from('issues').select('*', { count: 'exact', head: true }) as any) as Promise<{ error: any; count: number | null }>,
    withTimeout(supabase.from('issues').select('*', { count: 'exact', head: true }).eq('status', 'resolved') as any) as Promise<{ error: any; count: number | null }>,
    withTimeout(supabase.from('issues').select('*', { count: 'exact', head: true }).eq('status', 'in_progress') as any) as Promise<{ error: any; count: number | null }>,
    withTimeout(supabase.from('issues').select('*', { count: 'exact', head: true }).eq('status', 'pending') as any) as Promise<{ error: any; count: number | null }>,
  ]);

  if (totalRes.error) throw totalRes.error;
  if (resolvedRes.error) throw resolvedRes.error;
  if (inProgressRes.error) throw inProgressRes.error;
  if (pendingRes.error) throw pendingRes.error;

  return {
    totalReported: totalRes.count ?? 0,
    resolved: resolvedRes.count ?? 0,
    inProgress: inProgressRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  };
}
