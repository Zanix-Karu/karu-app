import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import type { Profile } from '@karu/shared';
import { supabase } from './supabase';
import { api } from './api';

interface AuthState {
  /** undefined = still resolving the initial session */
  session: Session | null | undefined;
  profile: Profile | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: undefined,
  profile: null,
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await api<Profile>('/profiles/me'));
    } catch {
      // API down or profile missing — auth still works, role features degrade.
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadProfile(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refreshProfile: () => loadProfile(session ?? null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Gate a route behind a signed-in session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session === undefined) return null; // initial session still resolving
  if (!session) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

/** Gate a route behind the admin role (resolved server-side via the profile). */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  if (session === undefined) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return null; // profile loading
  if (profile.role !== 'admin') return <Navigate to="/search" replace />;
  return <>{children}</>;
}

/** Gate a route behind the vendor role. */
export function RequireVendor({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  if (session === undefined) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return null;
  if (profile.role !== 'vendor' && profile.role !== 'admin') {
    return <Navigate to="/profile" replace />;
  }
  return <>{children}</>;
}
