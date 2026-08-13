import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export const inputCls =
  'h-12 w-full rounded-xl border border-[#E8ECF4] bg-[#F7F8F9] px-3.5 text-[14px] text-slate-900 ' +
  'shadow-[inset_0_1px_2px_rgba(16,24,40,0.03)] placeholder:text-slate-400 transition-all duration-150 ' +
  'hover:border-slate-300 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/15 ' +
  'focus:shadow-[0_4px_14px_-4px_rgba(124,108,240,0.3)]';

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

interface EyeChipProps {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}

/** Compact visibility toggle — controls whether a field/column appears on the invoice. */
export function EyeChip({ label, on, onToggle }: EyeChipProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      title={on ? `Hide ${label} on invoice` : `Show ${label} on invoice`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 active:scale-[0.97]',
        on
          ? 'bg-brand/10 text-brand-deep hover:bg-brand/15'
          : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-500'
      )}
    >
      {on ? <Eye size={12} /> : <EyeOff size={12} />}
      {label}
    </button>
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

export function MiniStepper({
  icon,
  value,
  suffix,
  step,
  min,
  max,
  onChange,
  label,
}: {
  icon: ReactNode;
  value: number;
  suffix: string;
  step: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const bump = (dir: -1 | 1) => {
    const next = Math.round(value + dir * step);
    onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <div className="flex items-center gap-0.5 text-slate-400" title={label}>
      {icon}
      <button
        type="button"
        aria-label={`${label} down`}
        onClick={() => bump(-1)}
        className="flex h-4 w-4 items-center justify-center rounded hover:bg-slate-200 hover:text-slate-700"
      >
        <Minus size={9} strokeWidth={2.6} />
      </button>
      <span className="min-w-[2.15rem] text-center text-[10px] font-medium tabular-nums text-slate-500">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label={`${label} up`}
        onClick={() => bump(1)}
        className="flex h-4 w-4 items-center justify-center rounded hover:bg-slate-200 hover:text-slate-700"
      >
        <Plus size={9} strokeWidth={2.6} />
      </button>
    </div>
  );
}
