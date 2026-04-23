import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { AuthContext, type AuthContextType, type AppRole } from './AuthContext';
import { hasSupabaseEnv, supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

const DEFAULT_ROLE: AppRole = 'user';

const normalizeRole = (value: string | null | undefined): AppRole => {
  if (!value) return DEFAULT_ROLE;
  const lower = value.toLowerCase().trim();
  if (lower === 'admin' || lower === 'worker' || lower === 'user') return lower;
  if (lower === 'citizen') return 'user';
  return DEFAULT_ROLE;
};

export default function AuthProviderSupabase({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const initialSyncDoneRef = useRef(false);
  const fetchIdRef = useRef(0); // guard against stale concurrent fetches

  /**
   * Fetch role from profiles table — ALWAYS fresh, NEVER cached.
   * Queries by BOTH `id` and `user_id` for maximum compatibility.
   */
  const fetchUserData = useCallback(async (userId: string) => {
    const thisId = ++fetchIdRef.current; // stamp this fetch

    console.log('[Auth] fetchUserData START for', userId);

    // Reset role state so UI shows "loading" not stale role
    setRole(null);
    setRoles([]);
    setAuthError(null);

    try {
      // Try user_id first (FK to auth.users), fallback to id
      let profileData: Tables<'profiles'> | null = null;

      const { data: byUserId, error: err1 } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (byUserId) {
        profileData = byUserId;
      } else {
        // Fallback: some setups use id = auth.uid()
        const { data: byId, error: err2 } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        profileData = byId;
      }

      // Guard: if a newer fetch started, discard this result
      if (fetchIdRef.current !== thisId) {
        console.log('[Auth] fetchUserData STALE — discarding', { thisId, current: fetchIdRef.current });
        return;
      }

      if (!profileData) {
        console.warn('[Auth] Profile not found for', userId, '— using default role');
        setProfile(null);
        setRole(DEFAULT_ROLE);
        setRoles([DEFAULT_ROLE]);
        return;
      }

      const resolvedRole = normalizeRole(
        (profileData as Tables<'profiles'> & { role?: string }).role
      );

      setProfile(profileData);
      setRole(resolvedRole);
      setRoles([resolvedRole]);

      console.log('[Auth] ✅ Role from DB:', resolvedRole, '| email:', profileData.email);
    } catch (err) {
      if (fetchIdRef.current !== thisId) return; // stale
      console.error('[Auth] Profile fetch FAILED:', err);
      setRole(DEFAULT_ROLE);
      setRoles([DEFAULT_ROLE]);
      setAuthError('Unable to load profile. Using default role.');
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const handleSession = (nextSession: Session | null, eventName?: string) => {
      if (!mounted) return;
      console.log('[Auth] handleSession:', eventName ?? 'initial', nextSession?.user?.email ?? 'no-user');

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      // Release UI on FIRST sync
      if (!initialSyncDoneRef.current) {
        setLoading(false);
        initialSyncDoneRef.current = true;
      }

      // ALWAYS fetch fresh role (non-blocking)
      if (nextSession?.user) {
        void fetchUserData(nextSession.user.id);
      } else {
        setProfile(null);
        setRoles([]);
        setRole(null);
        setAuthError(null);
      }
    };

    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      handleSession(data.session, 'getSession');
    });

    // Real-time auth listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[Auth] onAuthStateChange event:', event);
      handleSession(s, event);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  // ─── Auth Actions ──────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string) => {
    // Reset before login so no stale role persists
    setRole(null);
    setRoles([]);
    setProfile(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setRole(null);
    setAuthError(null);
    initialSyncDoneRef.current = false;
  }, []);

  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);

  // ─── Context Value ──────────────────────────────────────────────

  const value = useMemo<AuthContextType>(
    () => ({ session, user, profile, roles, role, authError, loading, signIn, signUp, signOut, hasRole }),
    [session, user, profile, roles, role, authError, loading, signIn, signUp, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}