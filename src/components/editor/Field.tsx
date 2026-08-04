import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

export const inputCls =
  'h-10 w-full rounded-lg border border-[#E8ECF4] bg-slate-50/60 px-3 text-[14px] text-slate-900 ' +
  'placeholder:text-slate-400 transition-all duration-150 hover:border-slate-300 ' +
  'focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10';

const labelCls = 'mb-1.5 block text-[12.5px] font-medium text-slate-500';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Field({ label, className, ...props }: FieldProps) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input className={cn(inputCls, className)} {...props} />
    </label>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, className, ...props }: TextAreaProps) {
  const area = (
    <textarea
      className={cn(inputCls, 'h-auto min-h-[64px] resize-y py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
  if (!label) return area;
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {area}
    </label>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select className={cn(inputCls, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
    </label>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg px-1.5 py-2 text-[13px] font-medium text-slate-700 transition-colors duration-150 hover:bg-[#F5F7FB]"
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-brand' : 'bg-slate-200'
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-150',
            checked ? 'left-[19px]' : 'left-[3px]'
          )}
        />
      </span>
    </button>
  );
}
