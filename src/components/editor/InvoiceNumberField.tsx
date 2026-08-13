import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { checkInvoiceNumberAvailable } from '../../lib/db';
import { Field } from './Field';

/**
 * Live check against every invoice in the company. Existing invoices
 * that already have this number are allowed to keep it; new or changed
 * numbers that collide show the next free one (001 → 002).
 */
export function InvoiceNumberField({
  value,
  invoiceId,
  signedIn,
  onChange,
}: {
  value: string;
  invoiceId: string | null;
  signedIn: boolean;
  onChange: (next: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const number = value.trim();
    if (!signedIn || !number || number.startsWith('#')) {
      setStatus('idle');
      setSuggestion(null);
      return;
    }
    const id = ++requestId.current;
    setStatus('checking');
    const t = setTimeout(async () => {
      try {
        const result = await checkInvoiceNumberAvailable(number, invoiceId);
        if (requestId.current !== id) return;
        if (result.available) {
          setStatus('ok');
          setSuggestion(null);
        } else {
          setStatus('taken');
          setSuggestion(result.suggestion);
        }
      } catch {
        if (requestId.current === id) setStatus('idle');
      }
    }, 500);
    return () => clearTimeout(t);
  }, [value, invoiceId, signedIn]);

  return (
    <div>
      <Field label="Invoice number" value={value} onChange={(e) => onChange(e.target.value)} />
      {status === 'checking' && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 size={11} className="animate-spin" /> Checking all invoices…
        </p>
      )}
      {status === 'ok' && (
        <p className="mt-1.5 text-[11px] font-medium text-emerald-600">Available</p>
      )}
      {status === 'taken' && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5">
          <p className="text-[11.5px] font-semibold text-rose-600">Invoice number already used — please edit it</p>
          {suggestion && (
            <button
              type="button"
              onClick={() => onChange(suggestion)}
              className="shrink-0 text-[11.5px] font-bold text-rose-700 underline underline-offset-2 hover:text-rose-800"
            >
              Use {suggestion}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
