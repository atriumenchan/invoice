import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useInvoice } from '../state/useInvoice';
import { EditorPanel } from '../components/editor/EditorPanel';
import InvoicePreview from '../components/InvoicePreview';
import { getInvoice, getTemplate, type InvoiceRow } from '../lib/db';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../state/AuthContext';

export default function BuilderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const templateId = params.get('template');
  const navigate = useNavigate();
  const { session } = useAuth();
  const inv = useInvoice();
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(id || templateId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const key = id ? `inv:${id}` : templateId ? `tpl:${templateId}` : 'new';
    if (loadedKey.current === key) return;

    let cancelled = false;

    if (!id && !templateId) {
      if (loadedKey.current && loadedKey.current !== 'new') inv.resetToNew();
      loadedKey.current = 'new';
      setLoadingInvoice(false);
      setLoadError(null);
      return;
    }

    setLoadingInvoice(true);
    setLoadError(null);

    (async () => {
      try {
        if (id) {
          const row = await getInvoice(id);
          if (cancelled) return;
          inv.loadRemote(row);
          loadedKey.current = key;
        } else if (templateId) {
          const tpl = await getTemplate(templateId);
          if (cancelled) return;
          inv.loadTemplate(tpl.state);
          loadedKey.current = 'new';
          navigate('/', { replace: true });
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingInvoice(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, templateId, session]);

  useEffect(() => {
    if (!id || !supabaseConfigured) return;
    const channel = supabase
      .channel(`invoice-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          const next = payload.new as InvoiceRow | undefined;
          if (!next?.id || !next.state) return;
          inv.applyRemoteIfClean(next);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const tick = async () => {
      try {
        const row = await getInvoice(id);
        inv.applyRemoteIfClean(row);
      } catch {
        /* ignore transient fetch errors */
      }
    };
    const t = window.setInterval(tick, 4000);
    const onFocus = () => void tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadingInvoice) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <Loader2 size={24} className="animate-spin text-brand" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-6">
        <p className="text-[14px] font-semibold text-rose-600">{loadError}</p>
        <Link to="/dashboard" className="text-[13px] font-bold text-brand underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] max-md:flex-col">
      <aside className="flex w-[400px] shrink-0 flex-col border-r border-[#E8ECF4] bg-gradient-to-b from-[#FAFBFD] to-[#F3F6FB] max-md:h-1/2 max-md:w-full max-md:border-b max-md:border-r-0">
        <EditorPanel inv={inv} />
      </aside>
      <main className="flex flex-1 items-start justify-center overflow-auto bg-[#eef0f6] p-8">
        <InvoicePreview ref={inv.previewRef} state={inv.state} />
      </main>
    </div>
  );
}
