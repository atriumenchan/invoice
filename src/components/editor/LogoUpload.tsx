import { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { InvoiceState } from '../../types';
import type { InvoiceApi } from '../../state/useInvoice';

export function LogoUpload({
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
    reader.onload = (e) => update('logoImage', e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
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
      {state.logoImage ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#E8ECF4] bg-slate-50/60 p-3">
          <img src={state.logoImage} alt="logo" className="h-10 max-w-[130px] object-contain" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-500">
            Custom logo uploaded
          </span>
          <button
            type="button"
            title="Remove logo"
            onClick={() => update('logoImage', null)}
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
          <Upload size={15} /> Upload logo
        </button>
      )}
      <p className="mt-1.5 text-[11px] text-slate-400">
        {state.logoImage ? 'Replaces the default ADMEXO mark on this invoice.' : 'Transparent PNG works best · defaults to the ADMEXO mark'}
      </p>
    </div>
  );
}
