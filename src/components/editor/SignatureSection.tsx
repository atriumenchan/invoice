import { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { InvoiceState, SignMode } from '../../types';
import type { InvoiceApi } from '../../state/useInvoice';
import { cn } from '../../lib/utils';
import { Field, Select } from './Field';

const FONTS = [
  { name: 'Great Vibes', value: "'Great Vibes',cursive" },
  { name: 'Dancing Script', value: "'Dancing Script',cursive" },
  { name: 'Caveat', value: "'Caveat',cursive" },
  { name: 'Pacifico', value: "'Pacifico',cursive" },
  { name: 'Sacramento', value: "'Sacramento',cursive" },
  { name: 'Allura', value: "'Allura',cursive" },
];

const MODES: { value: SignMode; label: string }[] = [
  { value: 'type', label: 'Type' },
  { value: 'upload', label: 'Upload' },
];

export function SignatureSection({
  state,
  update,
}: {
  state: InvoiceState;
  update: InvoiceApi['update'];
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => update('signImage', e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex rounded-full bg-slate-100 p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => update('signMode', m.value)}
            className={cn(
              'flex-1 rounded-full py-1.5 text-[12.5px] font-semibold transition-all duration-150',
              state.signMode === m.value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {state.signMode === 'type' ? (
        <Select
          label="Handwriting font"
          value={state.signFont}
          onChange={(e) => update('signFont', e.target.value)}
        >
          {FONTS.map((f) => (
            <option key={f.name} value={f.value} style={{ fontFamily: f.value }}>
              {f.name}
            </option>
          ))}
        </Select>
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {state.signImage ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#E8ECF4] bg-slate-50/60 p-3">
              <img src={state.signImage} alt="signature" className="h-10 max-w-[130px] object-contain" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-500">
                Signature uploaded
              </span>
              <button
                type="button"
                title="Remove signature"
                onClick={() => update('signImage', null)}
                className="icon-btn hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 py-5 text-[13px] font-medium text-slate-500 transition-colors duration-150 hover:border-brand hover:text-brand"
            >
              <Upload size={15} /> Upload signature image
            </button>
          )}
          <p className="mt-1.5 text-[11px] text-slate-400">Transparent PNG works best</p>
        </div>
      )}

      <Field
        label="Signer name"
        value={state.signName}
        onChange={(e) => update('signName', e.target.value)}
      />
      <Field
        label="Title"
        value={state.signTitle}
        onChange={(e) => update('signTitle', e.target.value)}
      />
    </div>
  );
}
