import { createContext, useContext, useMemo, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';

export type AppRole = 'admin' | 'worker' | 'user';

export function roleHomePath(role: AppRole | null): string {
  if (role === 'admin') return '/admin';
  if (role === 'worker') return '/worker';
  return '/dashboard';
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  roles: AppRole[];
  role: AppRole | null;
  authError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  roles: [],
  role: null,
  authError: null,
  loading: true,
  signIn: async () => ({ error: 'Auth not initialized' }),
  signUp: async () => ({ error: 'Auth not initialized' }),
  signOut: async () => {},
  hasRole: () => false,
});

export function AuthProviderStatic({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextType>(() => ({
    session: null,
    user: null,
    profile: null,
    roles: [],
    role: null,
    authError: null,
    loading: false,
    signIn: async () => ({ error: 'Authentication unavailable' }),
    signUp: async () => ({ error: 'Authentication unavailable' }),
    signOut: async () => {},
    hasRole: () => false,
  }), []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
