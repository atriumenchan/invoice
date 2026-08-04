import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthContext';
import { inputCls } from '../components/editor/Field';

export default function LoginPage() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice('Account created. If email confirmation is enabled, check your inbox — otherwise you are signed in.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E8ECF4] bg-white p-8 shadow-[0_8px_30px_rgba(16,24,40,0.08)]">
        <h1 className="text-[18px] font-bold tracking-tight text-slate-900">Invoice Builder</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {mode === 'signin' ? 'Sign in to your workspace' : 'Create your account'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-slate-500">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-slate-500">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-600">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-600">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0e1a3d] py-2.5 text-[14px] font-bold text-white transition-all duration-150 hover:bg-[#16255a] active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 w-full text-center text-[12.5px] font-semibold text-brand-deep hover:underline"
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
