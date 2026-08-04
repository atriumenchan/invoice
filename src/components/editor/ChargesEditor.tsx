import { Plus, Trash2 } from 'lucide-react';
import type { Charge } from '../../types';
import { cn } from '../../lib/utils';
import { inputCls } from './Field';

/**
 * Computed charges (GST, VAT, cess, service fee...).
 * kind 'percent' → calculated on the discounted subtotal.
 * kind 'flat'    → added as a fixed amount.
 * Every row lands in the invoice summary and the payable total.
 */
export function ChargesEditor({
  charges,
  onChange,
}: {
  charges: Charge[];
  onChange: (charges: Charge[]) => void;
}) {
  const add = () =>
    onChange([...charges, { id: crypto.randomUUID(), label: '', kind: 'percent', value: 0 }]);
  const update = <K extends keyof Charge>(id: string, key: K, v: Charge[K]) =>
    onChange(charges.map((c) => (c.id === id ? { ...c, [key]: v } : c)));
  const remove = (id: string) => onChange(charges.filter((c) => c.id !== id));

  return (
    <div className="space-y-2">
      {charges.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <input
            className={cn(inputCls, 'h-9 min-w-0 flex-1 text-[13px]')}
            placeholder="Label (e.g. GST, VAT, Cess)"
            value={c.label}
            onChange={(e) => update(c.id, 'label', e.target.value)}
          />
          <div className="flex shrink-0 rounded-full bg-slate-100 p-0.5">
            {(['percent', 'flat'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                title={kind === 'percent' ? 'Percentage of subtotal' : 'Flat amount'}
                onClick={() => update(c.id, 'kind', kind)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-bold transition-all duration-150',
                  c.kind === kind ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {kind === 'percent' ? '%' : 'Amt'}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={0}
            step={0.01}
            className={cn(inputCls, 'h-9 w-[76px] shrink-0 text-[13px] tabular-nums')}
            placeholder="0"
            value={c.value}
            onChange={(e) => update(c.id, 'value', parseFloat(e.target.value) || 0)}
          />
          <button
            type="button"
            title="Remove charge"
            onClick={() => remove(c.id)}
            className="icon-btn shrink-0 hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-brand-deep transition-colors duration-150 hover:bg-brand/10"
      >
        <Plus size={13} /> Add tax or charge
      </button>
    </div>
  );
}
