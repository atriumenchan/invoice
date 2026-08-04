import * as Accordion from '@radix-ui/react-accordion';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type Accent = 'indigo' | 'sky' | 'emerald' | 'purple' | 'cyan' | 'amber' | 'pink' | 'violet' | 'slate';

const ACCENTS: Record<Accent, { border: string; icon: string; tint: string }> = {
  indigo:  { border: 'border-l-indigo-400',  icon: 'bg-gradient-to-br from-indigo-500/15 to-indigo-400/5 text-indigo-600',   tint: 'bg-indigo-50/50' },
  sky:     { border: 'border-l-sky-400',     icon: 'bg-gradient-to-br from-sky-500/15 to-sky-400/5 text-sky-600',           tint: 'bg-sky-50/50' },
  emerald: { border: 'border-l-emerald-400', icon: 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/5 text-emerald-600', tint: 'bg-emerald-50/50' },
  purple:  { border: 'border-l-purple-400',  icon: 'bg-gradient-to-br from-purple-500/15 to-purple-400/5 text-purple-600',   tint: 'bg-purple-50/50' },
  cyan:    { border: 'border-l-cyan-400',    icon: 'bg-gradient-to-br from-cyan-500/15 to-cyan-400/5 text-cyan-600',         tint: 'bg-cyan-50/50' },
  amber:   { border: 'border-l-amber-400',   icon: 'bg-gradient-to-br from-amber-500/15 to-amber-400/5 text-amber-600',      tint: 'bg-amber-50/50' },
  pink:    { border: 'border-l-pink-400',    icon: 'bg-gradient-to-br from-pink-500/15 to-pink-400/5 text-pink-600',         tint: 'bg-pink-50/50' },
  violet:  { border: 'border-l-violet-400',  icon: 'bg-gradient-to-br from-violet-500/15 to-violet-400/5 text-violet-600',   tint: 'bg-violet-50/50' },
  slate:   { border: 'border-l-slate-400',   icon: 'bg-gradient-to-br from-slate-500/15 to-slate-400/5 text-slate-600',      tint: 'bg-slate-100/60' },
};

interface SectionCardProps {
  value: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  accent?: Accent;
  complete?: boolean;
  children: ReactNode;
}

export function SectionCard({
  value,
  icon: Icon,
  title,
  description,
  accent = 'slate',
  complete,
  children,
}: SectionCardProps) {
  const a = ACCENTS[accent];
  return (
    <Accordion.Item
      value={value}
      className={cn(
        'overflow-hidden rounded-[20px] border border-[#E8ECF4] border-l-4 bg-white',
        'shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150',
        'hover:-translate-y-px hover:shadow-[0_10px_28px_-10px_rgba(16,24,40,0.14)]',
        a.border
      )}
    >
      <Accordion.Header>
        <Accordion.Trigger className={cn('group flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors duration-150', a.tint)}>
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.08)] transition-transform duration-150 group-hover:scale-105',
              a.icon
            )}
          >
            <Icon size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold tracking-tight text-slate-900">{title}</span>
            {description && (
              <span className="mt-0.5 block truncate text-[12px] text-slate-500">{description}</span>
            )}
          </span>
          {complete && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600" title="Complete">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
          <ChevronDown
            size={16}
            className="shrink-0 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="acc-content overflow-hidden">
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
