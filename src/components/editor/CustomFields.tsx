import { Plus, Trash2 } from 'lucide-react';
import type { CustomField } from '../../types';
import { cn } from '../../lib/utils';
import { inputCls } from './Field';

/**
 * Display-only custom fields (label + value), e.g. "PIN Code: 201304".
 * Rendered on the invoice inside the section they belong to.
 * For anything that must be calculated into the total, use ChargesEditor.
 */
export function CustomFields({
  fields,
  onChange,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
}) {
  const add = () => onChange([...fields, { id: crypto.randomUUID(), label: '', value: '' }]);
  const update = (id: string, key: 'label' | 'value', v: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [key]: v } : f)));
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.id} className="flex items-center gap-2">
          <input
            className={cn(inputCls, 'h-9 flex-1 text-[13px]')}
            placeholder="Label (e.g. PIN Code)"
            value={f.label}
            onChange={(e) => update(f.id, 'label', e.target.value)}
          />
          <input
            className={cn(inputCls, 'h-9 flex-1 text-[13px]')}
            placeholder="Value"
            value={f.value}
            onChange={(e) => update(f.id, 'value', e.target.value)}
          />
          <button
            type="button"
            title="Remove field"
            onClick={() => remove(f.id)}
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
        <Plus size={13} /> Add custom field
      </button>
    </div>
  );
}
