import { useEffect } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {
  Building2,
  Download,
  FileText,
  Landmark,
  NotebookPen,
  Package,
  PenTool,
  Plus,
  Receipt,
  Settings,
  Trash2,
  User,
} from 'lucide-react';
import type { InvoiceApi } from '../../state/useInvoice';
import { computeTotals, fmt2 } from '../../lib/calc';
import { SectionCard } from './SectionCard';
import { Field, Switch, TextArea } from './Field';
import { LineItemsSection } from './LineItemsSection';
import { SignatureSection } from './SignatureSection';

export function EditorPanel({ inv }: { inv: InvoiceApi }) {
  const { state, update, items, notes, dirty, savedAt, saveNow, downloading, downloadPDF } = inv;
  const { total, gstRate } = computeTotals(state);

  /* keyboard shortcuts: Ctrl/Cmd+S save · Ctrl/Cmd+Enter download */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        saveNow();
      } else if (e.key === 'enter') {
        e.preventDefault();
        downloadPDF();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveNow, downloadPDF]);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-[#E8ECF4] px-4 pb-3.5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900">Invoice Builder</h1>
            <p className="mt-0.5 text-[12px] text-slate-500">Design invoices that get paid faster</p>
          </div>
          {dirty ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {savedAt ? 'Saved' : 'Auto-save on'}
            </span>
          )}
        </div>
      </div>

      {/* scrollable sections */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Accordion.Root type="multiple" defaultValue={['invoice', 'seller', 'items']} className="space-y-3">
          <SectionCard value="invoice" icon={FileText} title="Invoice Details" description="Number, dates, currency & badge">
            <Field label="Document title" value={state.docTitle} onChange={(e) => update('docTitle', e.target.value)} />
            <Field label="Invoice number" value={state.invNo} onChange={(e) => update('invNo', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Invoice date" value={state.invDate} onChange={(e) => update('invDate', e.target.value)} />
              <Field label="Due date" value={state.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
            </div>
            <Field label="Currency" value={state.currency} onChange={(e) => update('currency', e.target.value)} />
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Payment-due badge" checked={state.showBadge} onChange={(v) => update('showBadge', v)} />
              {state.showBadge && (
                <div className="px-1.5 pb-1.5">
                  <Field label="Badge text" value={state.badgeText} onChange={(e) => update('badgeText', e.target.value)} />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard value="seller" icon={Building2} title="Seller" description="Who is issuing this invoice">
            <Field label="Entity name" value={state.byName} onChange={(e) => update('byName', e.target.value)} />
            <Field label="Sub-line (e.g. brand)" value={state.bySub} onChange={(e) => update('bySub', e.target.value)} />
            <TextArea label="Address" value={state.byAddress} onChange={(e) => update('byAddress', e.target.value)} />
            {state.taxEnabled && (
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="GSTIN" value={state.byGstin} onChange={(e) => update('byGstin', e.target.value)} />
                <Field label="SAC/HSN" value={state.bySac} onChange={(e) => update('bySac', e.target.value)} />
              </div>
            )}
          </SectionCard>

          <SectionCard value="client" icon={User} title="Client" description="Who is being billed">
            <Field label="Company name" value={state.toName} onChange={(e) => update('toName', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Attn" value={state.toAttn} onChange={(e) => update('toAttn', e.target.value)} />
              <Field label="Phone" value={state.toPhone} onChange={(e) => update('toPhone', e.target.value)} />
            </div>
            <Field label="Email" type="email" value={state.toEmail} onChange={(e) => update('toEmail', e.target.value)} />
            <TextArea label="Address" value={state.toAddress} onChange={(e) => update('toAddress', e.target.value)} />
            {state.taxEnabled && (
              <Field label="GSTIN" value={state.toGstin} onChange={(e) => update('toGstin', e.target.value)} />
            )}
          </SectionCard>

          <SectionCard value="items" icon={Package} title="Line Items" description="Services & products being billed">
            <LineItemsSection items={state.items} taxOn={state.taxEnabled} currency={state.currency} ops={items} />
          </SectionCard>

          <SectionCard value="payment" icon={Landmark} title="Payment Details" description="Bank transfer information">
            <Field label="Beneficiary" value={state.bankBenef} onChange={(e) => update('bankBenef', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Bank" value={state.bankName} onChange={(e) => update('bankName', e.target.value)} />
              <Field label="Account type" value={state.bankAcType} onChange={(e) => update('bankAcType', e.target.value)} />
            </div>
            <Field label="Account no." value={state.bankAcNo} onChange={(e) => update('bankAcNo', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="IFSC / SWIFT" value={state.bankIfsc} onChange={(e) => update('bankIfsc', e.target.value)} />
              <Field label="Payment ref" value={state.bankRef} onChange={(e) => update('bankRef', e.target.value)} />
            </div>
          </SectionCard>

          <SectionCard value="taxes" icon={Receipt} title="Taxes" description="GST / SAC-HSN settings">
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Include GST / SAC-HSN fields (India)" checked={state.taxEnabled} onChange={(v) => update('taxEnabled', v)} />
            </div>
            {state.taxEnabled && (
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Tax label" value={state.gstLabel} onChange={(e) => update('gstLabel', e.target.value)} />
                <Field label="Rate %" type="number" min={0} step={0.01} value={state.gstRate} onChange={(e) => update('gstRate', parseFloat(e.target.value) || 0)} />
              </div>
            )}
            <Field label="Discount amount" type="number" min={0} step={0.01} value={state.discount} onChange={(e) => update('discount', parseFloat(e.target.value) || 0)} />
          </SectionCard>

          <SectionCard value="notes" icon={NotebookPen} title="Notes" description="Payment terms shown on the invoice">
            {state.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <TextArea
                  value={n}
                  onChange={(e) => notes.update(i, e.target.value)}
                  className="min-h-[52px] flex-1"
                />
                <button
                  type="button"
                  title="Delete note"
                  onClick={() => notes.remove(i)}
                  className="icon-btn mt-1.5 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={notes.add} className="pill-add">
              <Plus size={15} /> Add Note
            </button>
          </SectionCard>

          <SectionCard value="signature" icon={PenTool} title="Signature" description="Type with a font or upload an image">
            <SignatureSection state={state} update={update} />
          </SectionCard>

          <SectionCard value="footer" icon={Settings} title="Footer" description="Company line at the page bottom">
            <Field label="Company" value={state.footCompany} onChange={(e) => update('footCompany', e.target.value)} />
            <Field label="Regions" value={state.footRegions} onChange={(e) => update('footRegions', e.target.value)} />
            <Field label="Website" value={state.footWeb} onChange={(e) => update('footWeb', e.target.value)} />
          </SectionCard>
        </Accordion.Root>
      </div>

      {/* sticky download bar */}
      <div className="border-t border-[#E8ECF4] bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-500">
            Total{state.taxEnabled ? ` (incl. ${state.gstLabel} ${gstRate}%)` : ''}
          </span>
          <span className="text-[15px] font-bold tabular-nums text-slate-900">
            {state.currency} {fmt2(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={downloadPDF}
          disabled={downloading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0e1a3d] py-3 text-[14px] font-bold text-white shadow-lg shadow-[#0e1a3d]/20 transition-all duration-150 hover:bg-[#16255a] hover:shadow-xl active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          <Download size={16} />
          {downloading ? 'Generating…' : 'Download PDF'}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Ctrl+S save · Ctrl+Enter download
        </p>
      </div>
    </div>
  );
}
