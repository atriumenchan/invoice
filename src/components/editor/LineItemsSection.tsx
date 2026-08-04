import { useState } from 'react';
import { AnimatePresence, Reorder, motion, useDragControls } from 'framer-motion';
import { ChevronDown, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { LineItem } from '../../types';
import type { InvoiceApi } from '../../state/useInvoice';
import { fmt2 } from '../../lib/calc';
import { cn } from '../../lib/utils';
import { Field, TextArea } from './Field';

interface Props {
  items: LineItem[];
  showSac: boolean;
  showQty: boolean;
  currency: string;
  ops: InvoiceApi['items'];
}

export function LineItemsSection({ items, showSac, showQty, currency, ops }: Props) {
  return (
    <div>
      <Reorder.Group axis="y" values={items} onReorder={ops.reorder} className="space-y-2.5">
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <ItemCard key={item.id} item={item} showSac={showSac} showQty={showQty} currency={currency} ops={ops} />
          ))}
        </div>
      </Reorder.Group>
      <button type="button" onClick={ops.add} className="pill-add mt-3">
        <Plus size={15} /> Add Line Item
      </button>
    </div>
  );
}

function ItemCard({
  item,
  showSac,
  showQty,
  currency,
  ops,
}: {
  item: LineItem;
  showSac: boolean;
  showQty: boolean;
  currency: string;
  ops: InvoiceApi['items'];
}) {
  const controls = useDragControls();
  const [open, setOpen] = useState(true);
  const amount = (showQty ? item.qty || 0 : 1) * (item.rate || 0);
  const numCols = 1 + (showSac ? 1 : 0) + (showQty ? 1 : 0);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-[#E8ECF4] bg-[#F8FAFC]"
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          title="Drag to reorder"
          className="cursor-grab touch-none rounded p-1 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
        >
          <GripVertical size={15} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">
          {item.desc || 'Untitled item'}
        </span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-500">
          {currency} {fmt2(amount)}
        </span>
        <button type="button" title="Duplicate" onClick={() => ops.duplicate(item.id)} className="icon-btn">
          <Copy size={13} />
        </button>
        <button
          type="button"
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((o) => !o)}
          className="icon-btn"
        >
          <ChevronDown size={14} className={cn('transition-transform duration-150', open && 'rotate-180')} />
        </button>
        <button
          type="button"
          title="Delete"
          onClick={() => ops.remove(item.id)}
          className="icon-btn hover:bg-rose-50 hover:text-rose-500"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 px-3 pb-3 pt-1">
              <TextArea
                label="Description"
                value={item.desc}
                onChange={(e) => ops.update(item.id, 'desc', e.target.value)}
                placeholder="e.g. Marketing Services"
                className="min-h-[44px]"
              />
              <Field
                label="Service period (optional)"
                value={item.period}
                onChange={(e) => ops.update(item.id, 'period', e.target.value)}
                placeholder="e.g. Service period: March 2026"
              />
              <div className={cn('grid gap-2', numCols === 3 ? 'grid-cols-3' : numCols === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                {showSac && (
                  <Field
                    label="SAC/HSN"
                    value={item.sac}
                    onChange={(e) => ops.update(item.id, 'sac', e.target.value)}
                  />
                )}
                {showQty && (
                  <Field
                    label="Qty"
                    type="number"
                    min={0}
                    step={1}
                    value={item.qty}
                    onChange={(e) => ops.update(item.id, 'qty', parseFloat(e.target.value) || 0)}
                  />
                )}
                <Field
                  label={showQty ? 'Rate' : 'Amount'}
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.rate}
                  onChange={(e) => ops.update(item.id, 'rate', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}
