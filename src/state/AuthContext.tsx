import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { STORAGE_KEY } from './useInvoice';

const LAST_UID_KEY = 'admexo-auth-uid';

/**
 * Multiple people can sign in on the same shared browser. The builder's
 * draft (including invoiceId) lives in localStorage keyed by a fixed
 * constant, so if we don't clear it when the signed-in account changes,
 * user B can silently inherit user A's draft — including a stale
 * invoiceId that belongs to A. Saves/submits then hit RLS on B's session
 * and no-op instead of creating B's own invoice, so B's submission
 * "disappears". Clearing the draft on account switch prevents this.
 */
function guardAgainstAccountSwitch(uidNow: string | null) {
  try {
    const prevUid = localStorage.getItem(LAST_UID_KEY);
    if (uidNow) {
      if (prevUid && prevUid !== uidNow) {
        localStorage.removeItem(STORAGE_KEY);
      }
      localStorage.setItem(LAST_UID_KEY, uidNow);
    } else {
      localStorage.removeItem(LAST_UID_KEY);
    }
  } catch {
    /* storage unavailable — nothing we can do */
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
      guardAgainstAccountSwitch(data.session?.user.id ?? null);
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      guardAgainstAccountSwitch(s?.user.id ?? null);
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
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_UID_KEY);
    } catch {
      /* storage unavailable — nothing we can do */
    }
  };

  return <Ctx.Provider value={{ session, loading, isAdmin, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
