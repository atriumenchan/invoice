import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import {
  Building2,
  Download,
  FileText,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  NotebookPen,
  Package,
  PenTool,
  Plus,
  Receipt,
  Save,
  Settings,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import type { EntityRegion, InvoiceState, InvoiceStatus } from '../../types';
import type { InvoiceApi } from '../../state/useInvoice';
import { computeTotals, fmt2 } from '../../lib/calc';
import { useAuth } from '../../state/AuthContext';
import {
  ensureDefaultIssuers,
  listBanks,
  listClients,
  listIssuers,
  saveBank,
  saveClient,
  saveInvoiceToCloud,
  saveTemplate,
  nextInvoiceNumber,
  assertInvoiceNumberFree,
  InvoiceNumberTakenError,
  type BankRow,
  type ClientRow,
  type IssuerRow,
} from '../../lib/db';
import { SectionCard } from './SectionCard';
import { EyeChip, Field, Select, Switch, TextArea } from './Field';
import { ReviewModal } from '../ReviewModal';
import { reviewInvoice, type ReviewResult } from '../../lib/ai';
import { getInvoiceStatus } from '../../lib/db';
import { LineItemsSection } from './LineItemsSection';
import { SignatureSection } from './SignatureSection';
import { InvoiceNumberField } from './InvoiceNumberField';
import { CustomFields } from './CustomFields';
import { ChargesEditor } from './ChargesEditor';

export function EditorPanel({ inv }: { inv: InvoiceApi }) {
  const { state, update, applyEntity, items, notes, dirty, savedAt, saveNow, downloading, downloadPDF } = inv;
  const { total } = computeTotals(state);
  const { session, isAdmin } = useAuth();
  const [issuers, setIssuers] = useState<IssuerRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const canDownload = isAdmin || state.status === 'approved';
  const runReview = async () => {
    setReviewOpen(true);
    setReviewLoading(true);
    setReview(null);
    setReviewError(null);
    try {
      setReview(await reviewInvoice(state));
    } catch (e) {
      setReviewError((e as Error).message);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleNumberError = (e: unknown) => {
    if (e instanceof InvoiceNumberTakenError) {
      if (e.suggestion) update('invNo', e.suggestion);
      alert(e.message);
      return true;
    }
    return false;
  };

  const onDownload = async () => {
    try {
      await assertInvoiceNumberFree(state.invNo, state.invoiceId, { strict: true });
      await downloadPDF();
    } catch (e) {
      if (!handleNumberError(e)) alert((e as Error).message);
    }
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        setIssuers(await ensureDefaultIssuers());
        setClients(await listClients());
        setBanks(await listBanks());
      } catch (e) {
        console.error('Failed to load saved records', e);
      }
    })();
  }, [session]);

  /* New invoices get the next free company-wide number (BG-IN-0004 if 0003 exists). */
  useEffect(() => {
    if (!session || state.invoiceId) return;
    let cancelled = false;
    nextInvoiceNumber(state.invPrefix || 'INV')
      .then((n) => {
        if (!cancelled) update('invNo', n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, state.invoiceId, state.invPrefix]);

  /* pull the live status so admin approvals show up for the creator */
  useEffect(() => {
    if (!session || !state.invoiceId) return;
    getInvoiceStatus(state.invoiceId)
      .then((live) => {
        if (live && live !== state.status) update('status', live as InvoiceStatus);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, state.invoiceId]);

  /* real-time cloud auto-save for non-admins once the invoice exists */
  const stateRef = useRef(state);
  stateRef.current = state;
  const baselineRef = useRef('');
  const contentKey = (s: InvoiceState) => JSON.stringify({ ...s, status: undefined });

  useEffect(() => {
    baselineRef.current = contentKey(stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.invoiceId]);

  useEffect(() => {
    if (!session || isAdmin || !state.invoiceId) return;
    if (contentKey(state) === baselineRef.current) return;
    const t = setTimeout(async () => {
      const s = stateRef.current;
      if (contentKey(s) === baselineRef.current) return;
      try {
        const { status } = await saveInvoiceToCloud(s);
        baselineRef.current = contentKey(s);
        if (status !== s.status) update('status', status);
      } catch (e) {
        console.error('Auto-save failed', e);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isAdmin, state]);

  const flash = (msg: string) => {
    setCloudMsg(msg);
    setTimeout(() => setCloudMsg(null), 4000);
  };

  const applyIssuer = (id: string) => {
    const i = issuers.find((x) => x.id === id);
    if (!i) {
      update('issuerId', null);
      return;
    }
    update('issuerId', i.id);
    update('invPrefix', i.inv_prefix);
    update('byName', i.name);
    update('bySub', i.brand ?? '');
    update('byAddress', i.address ?? '');
    update('byGstin', i.tax_id ?? '');
    update('bySac', i.sac_hsn ?? '');
    update('byCustom', i.custom_fields ?? []);
    update('footRegions', i.footer_regions ?? '');
    update('footWeb', i.footer_web ?? '');
    applyEntity(i.region);
  };

  const applyClient = (id: string) => {
    if (!id) {
      update('clientId', null);
      return;
    }
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    update('clientId', c.id);
    update('toName', c.name);
    update('toAttn', c.attn ?? '');
    update('toPhone', c.phone ?? '');
    update('toEmail', c.email ?? '');
    update('toAddress', c.address ?? '');
    update('toGstin', c.tax_id ?? '');
    update('toCustom', c.custom_fields ?? []);
  };

  const applyBank = (id: string) => {
    if (!id) {
      update('bankId', null);
      return;
    }
    const b = banks.find((x) => x.id === id);
    if (!b) return;
    update('bankId', b.id);
    update('bankBenef', b.beneficiary ?? '');
    update('bankName', b.bank_name ?? '');
    update('bankAcType', b.account_type ?? '');
    update('bankAcNo', b.account_no ?? '');
    update('bankIfsc', b.ifsc_swift ?? '');
    update('bankCustom', b.custom_fields ?? []);
  };

  const onSaveClient = async () => {
    try {
      const id = await saveClient(state);
      update('clientId', id);
      setClients(await listClients());
      flash('Client saved');
    } catch (e) {
      alert('Could not save client: ' + (e as Error).message);
    }
  };

  const onSaveBank = async () => {
    try {
      const id = await saveBank(state);
      update('bankId', id);
      setBanks(await listBanks());
      flash('Bank account saved');
    } catch (e) {
      alert('Could not save bank account: ' + (e as Error).message);
    }
  };

  const onSaveInvoice = async () => {
    setCloudBusy(true);
    try {
      const { id, invoice_no, status } = await saveInvoiceToCloud(state);
      update('invoiceId', id);
      update('invNo', invoice_no);
      update('status', status);
      if (!state.createdByEmail && session?.user.email) update('createdByEmail', session.user.email);
      flash(`Saved as ${invoice_no}`);
    } catch (e) {
      if (!handleNumberError(e)) alert('Could not save invoice: ' + (e as Error).message);
    } finally {
      setCloudBusy(false);
    }
  };

  const onSaveTemplate = async () => {
    const name = window.prompt('Template name', `${state.byName || 'Invoice'} template`);
    if (!name) return;
    setCloudBusy(true);
    try {
      await saveTemplate(name, state);
      flash(`Template “${name}” saved`);
    } catch (e) {
      alert('Could not save template: ' + (e as Error).message);
    } finally {
      setCloudBusy(false);
    }
  };

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
        onDownload();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveNow, downloadPDF]);

  return (
    <div className="flex h-full flex-col">
      {/* floating glass toolbar */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-[0_6px_24px_-8px_rgba(16,24,40,0.12)] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Link
              to="/dashboard"
              title="Open dashboard"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8ECF4] bg-white text-slate-500 shadow-sm transition-all duration-150 hover:border-brand hover:text-brand"
            >
              <LayoutDashboard size={16} />
            </Link>
            <div>
              <h1 className="text-[16px] font-bold tracking-tight text-slate-900">Invoice Builder</h1>
              <p className="mt-0.5 text-[12px] text-slate-500">Design invoices that get paid faster</p>
            </div>
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
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <Accordion.Root type="multiple" defaultValue={['invoice', 'seller', 'items']} className="space-y-4">
          <SectionCard value="invoice" icon={FileText} title="Invoice Details" description="Entity, number, dates, currency & badge" accent="indigo" complete={Boolean(state.invNo && state.invDate)}>
            {session && issuers.length > 0 && (
              <Select label="Issuer" value={state.issuerId ?? ''} onChange={(e) => applyIssuer(e.target.value)}>
                <option value="">— Select issuer —</option>
                {issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.inv_prefix}
                  </option>
                ))}
              </Select>
            )}
            <Select
              label="Entity / Region"
              value={state.entity}
              onChange={(e) => applyEntity(e.target.value as EntityRegion)}
            >
              <option value="IN">India — GST · INR</option>
              <option value="UK">United Kingdom — VAT · GBP</option>
              <option value="US">United States — No tax · USD</option>
            </Select>
            <Field label="Document title" value={state.docTitle} onChange={(e) => update('docTitle', e.target.value)} />
            <InvoiceNumberField
              value={state.invNo}
              invoiceId={state.invoiceId}
              signedIn={Boolean(session)}
              strict={isAdmin}
              onChange={(v) => update('invNo', v)}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Invoice date" value={state.invDate} onChange={(e) => update('invDate', e.target.value)} />
              <Field label="Due date" value={state.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
            </div>
            <Field label="Currency" value={state.currency} onChange={(e) => update('currency', e.target.value)} />
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Show due date" checked={state.showDueDate} onChange={(v) => update('showDueDate', v)} />
              <Switch label="Payment-due badge" checked={state.showBadge} onChange={(v) => update('showBadge', v)} />
              {state.showBadge && (
                <div className="px-1.5 pb-1.5">
                  <Field label="Badge text" value={state.badgeText} onChange={(e) => update('badgeText', e.target.value)} />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard value="seller" icon={Building2} title="Seller" description="Who is issuing this invoice" accent="sky" complete={Boolean(state.byName && state.byAddress)}>
            <Field label="Entity name" value={state.byName} onChange={(e) => update('byName', e.target.value)} />
            <Field label="Sub-line (e.g. brand)" value={state.bySub} onChange={(e) => update('bySub', e.target.value)} />
            <TextArea label="Address" value={state.byAddress} onChange={(e) => update('byAddress', e.target.value)} />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-slate-500">Tax fields</span>
                <div className="flex gap-1.5">
                  <EyeChip label="GSTIN" on={state.showGstin} onToggle={(v) => update('showGstin', v)} />
                  <EyeChip label="SAC/HSN" on={state.showSac} onToggle={(v) => update('showSac', v)} />
                </div>
              </div>
              {(state.showGstin || state.showSac) && (
                <div className="grid grid-cols-2 gap-2.5">
                  {state.showGstin && (
                    <Field label="GSTIN" value={state.byGstin} onChange={(e) => update('byGstin', e.target.value)} />
                  )}
                  {state.showSac && (
                    <Field label="SAC/HSN" value={state.bySac} onChange={(e) => update('bySac', e.target.value)} />
                  )}
                </div>
              )}
            </div>
            <CustomFields fields={state.byCustom} onChange={(f) => update('byCustom', f)} />
          </SectionCard>

          <SectionCard value="client" icon={User} title="Client" description="Who is being billed" accent="emerald" complete={Boolean(state.toName)}>
            {session && (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Select label="Saved clients" value={state.clientId ?? ''} onChange={(e) => applyClient(e.target.value)}>
                    <option value="">— New / manual —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={onSaveClient}
                  title="Save current details as a client"
                  className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#E8ECF4] bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors duration-150 hover:border-brand hover:text-brand"
                >
                  <Save size={13} /> Save
                </button>
              </div>
            )}
            <Field label="Company name" value={state.toName} onChange={(e) => update('toName', e.target.value)} />
            <Field label="Attn" value={state.toAttn} onChange={(e) => update('toAttn', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Phone" value={state.toPhone} onChange={(e) => update('toPhone', e.target.value)} />
              <Field label="Email" type="email" value={state.toEmail} onChange={(e) => update('toEmail', e.target.value)} />
            </div>
            <TextArea label="Address" value={state.toAddress} onChange={(e) => update('toAddress', e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-slate-500">Tax ID</span>
              <EyeChip label="GSTIN" on={state.showGstin} onToggle={(v) => update('showGstin', v)} />
            </div>
            {state.showGstin && (
              <Field label="GSTIN" value={state.toGstin} onChange={(e) => update('toGstin', e.target.value)} />
            )}
            <CustomFields fields={state.toCustom} onChange={(f) => update('toCustom', f)} />
          </SectionCard>

          <SectionCard value="items" icon={Package} title="Line Items" description="Services & products being billed" accent="purple" complete={state.items.length > 0 && state.items.every((i) => i.desc)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-slate-500">Columns</span>
              <div className="flex gap-1.5">
                <EyeChip label="SAC/HSN" on={state.showSac} onToggle={(v) => update('showSac', v)} />
                <EyeChip label="Qty" on={state.showQty} onToggle={(v) => update('showQty', v)} />
              </div>
            </div>
            <LineItemsSection items={state.items} showSac={state.showSac} showQty={state.showQty} currency={state.currency} ops={items} />
          </SectionCard>

          <SectionCard value="payment" icon={Landmark} title="Payment Details" description="Bank transfer information" accent="cyan" complete={Boolean(state.bankAcNo)}>
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Show bank details on invoice" checked={state.showBank} onChange={(v) => update('showBank', v)} />
            </div>
            {session && (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Select label="Saved bank accounts" value={state.bankId ?? ''} onChange={(e) => applyBank(e.target.value)}>
                    <option value="">— New / manual —</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>{b.label || b.bank_name || 'Bank account'}</option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={onSaveBank}
                  title="Save current details as a bank account"
                  className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#E8ECF4] bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors duration-150 hover:border-brand hover:text-brand"
                >
                  <Save size={13} /> Save
                </button>
              </div>
            )}
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
            <CustomFields fields={state.bankCustom} onChange={(f) => update('bankCustom', f)} />
          </SectionCard>

          <SectionCard value="taxes" icon={Receipt} title="Taxes & Charges" description="Calculated into the payable total" accent="amber" complete={state.charges.length > 0}>
            <ChargesEditor charges={state.charges} onChange={(c) => update('charges', c)} />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-slate-500">Discount</span>
                <EyeChip label="Discount" on={state.showDiscount} onToggle={(v) => update('showDiscount', v)} />
              </div>
              {state.showDiscount && (
                <Field label="Discount amount" type="number" min={0} step={0.01} value={state.discount} onChange={(e) => update('discount', parseFloat(e.target.value) || 0)} />
              )}
            </div>
          </SectionCard>

          <SectionCard value="notes" icon={NotebookPen} title="Notes" description="Payment terms shown on the invoice" accent="pink" complete={state.notes.length > 0}>
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Show notes on invoice" checked={state.showNotes} onChange={(v) => update('showNotes', v)} />
              <Switch label="Show amount in words" checked={state.showWords} onChange={(v) => update('showWords', v)} />
            </div>
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

          <SectionCard value="signature" icon={PenTool} title="Signature" description="Type with a font or upload an image" accent="violet" complete={Boolean(state.signName || state.signImage)}>
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Show signature on invoice" checked={state.showSignature} onChange={(v) => update('showSignature', v)} />
            </div>
            <SignatureSection state={state} update={update} />
          </SectionCard>

          <SectionCard value="footer" icon={Settings} title="Footer" description="Company line at the page bottom" accent="slate" complete={Boolean(state.footCompany)}>
            <div className="rounded-xl border border-[#E8ECF4] bg-slate-50/50 px-2.5 py-1.5">
              <Switch label="Show footer on invoice" checked={state.showFooter} onChange={(v) => update('showFooter', v)} />
            </div>
            <Field label="Company" value={state.footCompany} onChange={(e) => update('footCompany', e.target.value)} />
            <Field label="Regions" value={state.footRegions} onChange={(e) => update('footRegions', e.target.value)} />
            <Field label="Website" value={state.footWeb} onChange={(e) => update('footWeb', e.target.value)} />
          </SectionCard>
        </Accordion.Root>
      </div>

      {/* sticky download bar */}
      <div className="border-t border-[#E8ECF4] bg-white/80 px-4 py-3.5 backdrop-blur-xl">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-500">Total</span>
          <span className="text-[15px] font-bold tabular-nums text-slate-900">
            {state.currency} {fmt2(total)}
          </span>
        </div>
        {session && !isAdmin && (
          <div className="mb-2.5 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-[12px] font-medium text-slate-500">Approval</span>
            <span
              className={
                'rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ' +
                (state.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-600'
                  : state.status === 'pending'
                    ? 'bg-blue-100 text-blue-600'
                    : state.status === 'rejected'
                      ? 'bg-rose-100 text-rose-600'
                      : 'bg-slate-200 text-slate-500')
              }
            >
              {state.status === 'approved'
                ? 'approved'
                : state.status === 'rejected'
                  ? 'rejected'
                  : 'waiting for approval'}
            </span>
          </div>
        )}
        {session && (
          <div className="mb-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSaveInvoice}
              disabled={cloudBusy}
              title={state.invoiceId ? `Update ${state.invNo}` : 'Save invoice'}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E8ECF4] bg-white text-[12px] font-semibold text-slate-600 transition-all duration-150 hover:border-brand hover:text-brand active:scale-[0.97] disabled:opacity-60"
            >
              <Save size={14} />
              <span className="truncate">{cloudBusy ? 'Saving…' : state.invoiceId ? 'Update' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={onSaveTemplate}
              disabled={cloudBusy}
              title="Save as template"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8ECF4] bg-white text-slate-500 transition-all duration-150 hover:border-brand hover:text-brand active:scale-[0.97] disabled:opacity-60"
            >
              <LayoutTemplate size={15} />
            </button>
            <button
              type="button"
              onClick={() => runReview()}
              disabled={cloudBusy}
              title="AI Review"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/5 text-brand-deep transition-all duration-150 hover:bg-brand/10 active:scale-[0.97] disabled:opacity-60"
            >
              <Sparkles size={15} />
            </button>
          </div>
        )}
        {cloudMsg && (
          <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-center text-[12px] font-semibold text-emerald-600">
            {cloudMsg}
          </p>
        )}
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || !canDownload}
          title={canDownload ? undefined : 'Waiting for admin approval'}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-deep to-brand py-3 text-[14px] font-bold text-white shadow-lg shadow-brand/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/30 active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <Download size={16} />
          {downloading ? 'Generating…' : canDownload ? 'Download PDF' : 'Awaiting approval'}
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Ctrl+S save · Ctrl+Enter download
        </p>
      </div>

      <ReviewModal
        open={reviewOpen}
        loading={reviewLoading}
        review={review}
        error={reviewError}
        onClose={() => setReviewOpen(false)}
      />
    </div>
  );
}
