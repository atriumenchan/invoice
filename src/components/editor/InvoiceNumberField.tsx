import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { checkInvoiceNumberAvailable, suggestInvoiceNumber } from '../../lib/db';
import { Field } from './Field';

/**
 * Invoice numbers are centralized and globally unique (never reused,
 * like an employee ID) — this field checks availability against every
 * user's invoices as you type, and offers the nearest free number if
 * yours is already taken.
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
        const available = await checkInvoiceNumberAvailable(number, invoiceId);
        if (requestId.current !== id) return;
        if (available) {
          setStatus('ok');
          setSuggestion(null);
        } else {
          setStatus('taken');
          try {
            setSuggestion(await suggestInvoiceNumber(number, invoiceId));
          } catch {
            setSuggestion(null);
          }
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
          <Loader2 size={11} className="animate-spin" /> Checking availability…
        </p>
      )}
      {status === 'ok' && (
        <p className="mt-1.5 text-[11px] font-medium text-emerald-600">Available</p>
      )}
      {status === 'taken' && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5">
          <p className="text-[11.5px] font-semibold text-rose-600">Invoice number already used</p>
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
