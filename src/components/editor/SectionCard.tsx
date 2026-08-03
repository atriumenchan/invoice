import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface SectionCardProps {
  value: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}

export function SectionCard({ value, icon: Icon, title, description, children }: SectionCardProps) {
  return (
    <Accordion.Item
      value={value}
      className="overflow-hidden rounded-2xl border border-[#E8ECF4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(16,24,40,0.08)]"
    >
      <Accordion.Header>
        <Accordion.Trigger className="group flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors duration-150 group-hover:bg-brand/15">
            <Icon size={17} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold text-slate-900">{title}</span>
            <span className="block truncate text-[12px] text-slate-500">{description}</span>
          </span>
          <ChevronDown
            size={16}
            className="shrink-0 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-[accordion-up_200ms_ease-out] data-[state=open]:animate-[accordion-down_200ms_ease-out]">
        <div className="space-y-3 border-t border-[#E8ECF4] px-4 py-4">{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
