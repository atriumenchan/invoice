import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { STORAGE_KEY } from './useInvoice';

function clearLegacyInvoiceCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('admexo-auth-uid');
    localStorage.removeItem('admexo-sign-style');
    localStorage.removeItem('admexo-stamp-last');
  } catch {
    /* storage unavailable */
  }
}

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ session: null, loading: true, isAdmin: false, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      clearLegacyInvoiceCache();
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      clearLegacyInvoiceCache();
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    // Source of truth is the database (public.is_admin()), same check the
    // RLS policies use — this avoids drift with a client-side env var.
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        const adminEmail = ((import.meta.env.VITE_ADMIN_EMAIL as string) ?? '').toLowerCase();
        setIsAdmin(!!adminEmail && (session.user.email ?? '').toLowerCase() === adminEmail);
        return;
      }
      setIsAdmin(!!data);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearLegacyInvoiceCache();
  };

  return <Ctx.Provider value={{ session, loading, isAdmin, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
