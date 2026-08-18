import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import {
  Building2,
  Check,
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
  Send,
  Settings,
  Sparkles,
  Trash2,
  User,
  Droplets,
  RotateCw,
  Type,
  X,
} from 'lucide-react';
import type { EntityRegion, InvoiceState, InvoiceStatus } from '../../types';
import type { InvoiceApi } from '../../state/useInvoice';
import { computeTotals, fmt2 } from '../../lib/calc';
import { useAuth } from '../../state/AuthContext';
import {
  ensureDefaultIssuers,
  listBanks,
  listClients,
  saveBank,
  saveClient,
  saveInvoiceToCloud,
  saveTemplate,
  nextInvoiceNumber,
  InvoiceNumberTakenError,
  notifyApprovalSubmitted,
  setInvoiceStatus,
  assignInvoiceNumber,
  type BankRow,
  type ClientRow,
  type IssuerRow,
} from '../../lib/db';
import {
  canChangeInvoiceNumber,
  canDownloadPdf,
  canEditInvoiceContent,
  canSaveAndApprove,
  canSubmitForApproval,
  isAdminEmail,
  lockReason,
  ownerApprovedEditDisclaimer,
} from '../../lib/permissions';
import { SectionCard } from './SectionCard';
import { EyeChip, Field, MiniStepper, Select, Switch, TextArea } from './Field';
import { ReviewModal } from '../ReviewModal';
import { reviewInvoice, type ReviewResult } from '../../lib/ai';
import { LineItemsSection } from './LineItemsSection';
import { SignatureSection, StampUpload } from './SignatureSection';
import { InvoiceNumberField } from './InvoiceNumberField';
import { CustomFields } from './CustomFields';
import { ChargesEditor } from './ChargesEditor';
import { fetchSignStyleCloud, saveSignStyleCloud } from '../../lib/stampPrefs';

export function EditorPanel({ inv }: { inv: InvoiceApi }) {
  const {
    state,
    update,
    updateSilent,
    applyEntity,
    items,
    notes,
    dirty,
    savedAt,
    markClean,
    downloading,
    downloadPDF,
  } = inv;
  const { total } = computeTotals(state);
  const { session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const downloadQueryOnce = useRef(false);
  const access = {
    isAdmin,
    status: state.status,
    ownerEmail: state.createdByEmail,
    currentEmail: session?.user.email,
    invoiceId: state.invoiceId,
  };
  const canEdit = canEditInvoiceContent(access);
  const canNumber = canChangeInvoiceNumber(access);
  const ownerDisclaimer = ownerApprovedEditDisclaimer(access);
  const needsReapproval = Boolean(ownerDisclaimer && dirty);
  const canDownload = canDownloadPdf(access) && !needsReapproval;
  const lockedMsg = lockReason(access);
  const isAdminOwn = isAdminEmail(state.createdByEmail) || (!state.createdByEmail && isAdmin);
  const [issuers, setIssuers] = useState<IssuerRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const styleCloudReady = useRef(false);

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
    if (!canDownload) {
      alert('Download is available after this invoice is approved.');
      return;
    }
    try {
      await downloadPDF();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  useEffect(() => {
    if (params.get('download') !== '1') return;
    if (downloadQueryOnce.current) return;
    if (!canDownload) return;
    downloadQueryOnce.current = true;
    const t = window.setTimeout(() => {
      void onDownload();
      const next = new URLSearchParams(params);
      next.delete('download');
      setParams(next, { replace: true });
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDownload, params, state.invoiceId]);

  useEffect(() => {
    if (!session) return;
    if (state.invoiceId) return;
    if (!state.createdByEmail && session.user.email) {
      updateSilent('createdByEmail', session.user.email);
    }
  }, [session, state.invoiceId, state.createdByEmail, updateSilent]);

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

  useEffect(() => {
    if (!session || state.invoiceId) return;
    let cancelled = false;
    fetchSignStyleCloud()
      .then((prefs) => {
        if (cancelled || !prefs) return;
        updateSilent('stampOpacity', prefs.stampOpacity);
        updateSilent('stampRotate', prefs.stampRotate);
        updateSilent('stampFontSize', prefs.stampFontSize);
        updateSilent('signFontSize', prefs.signFontSize);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) styleCloudReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [session, state.invoiceId, updateSilent]);

  useEffect(() => {
    if (!session || !canEdit) return;
    if (state.invoiceId && !styleCloudReady.current) return;
    const prefs = {
      stampOpacity: state.stampOpacity,
      stampRotate: state.stampRotate,
      stampFontSize: state.stampFontSize,
      signFontSize: state.signFontSize,
    };
    const t = setTimeout(() => {
      saveSignStyleCloud(prefs).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [session, canEdit, state.invoiceId, state.stampOpacity, state.stampRotate, state.stampFontSize, state.signFontSize]);

  /* New invoices get the next free company-wide number (BG-IN-0004 if 0003 exists). */
  useEffect(() => {
    if (!session || state.invoiceId) return;
    let cancelled = false;
    nextInvoiceNumber(state.invPrefix || 'INV')
      .then((n) => {
        if (!cancelled) updateSilent('invNo', n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, state.invoiceId, state.invPrefix]);

  /* Cloud auto-save writes the full invoice to Supabase so admin edits are canonical. */
  const stateRef = useRef(state);
  stateRef.current = state;
  const baselineRef = useRef('');
  const contentKey = (s: InvoiceState) => JSON.stringify({ ...s, status: undefined });

  useEffect(() => {
    baselineRef.current = contentKey(stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.invoiceId]);

  useEffect(() => {
    if (!session || !dirty || !canEdit) return;
    if (contentKey(state) === baselineRef.current) return;
    const t = setTimeout(async () => {
      const s = stateRef.current;
      if (contentKey(s) === baselineRef.current) return;
      try {
        const saved = await saveInvoiceToCloud(s);
        applySaved(s, saved, session.user.email);
      } catch (e) {
        console.error('Auto-save failed', e);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, dirty, canEdit, state]);

  const flash = (msg: string) => {
    setCloudMsg(msg);
    setTimeout(() => setCloudMsg(null), 4000);
  };

  const applySaved = (
    s: InvoiceState,
    saved: { id: string; invoice_no: string; status: InvoiceStatus },
    email?: string | null
  ) => {
    baselineRef.current = contentKey({ ...s, invoiceId: saved.id, invNo: saved.invoice_no, status: saved.status });
    if (saved.id !== s.invoiceId) updateSilent('invoiceId', saved.id);
    if (saved.invoice_no !== s.invNo) updateSilent('invNo', saved.invoice_no);
    if (saved.status !== s.status) updateSilent('status', saved.status);
    if (!s.createdByEmail && email) updateSilent('createdByEmail', email);
    markClean();
    if (!s.invoiceId && saved.id) navigate(`/invoice/${saved.id}`, { replace: true });
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

  const onSaveInvoice = async (opts?: { approve?: boolean; reject?: boolean; submit?: boolean }) => {
    if (!session) return;
    if (!canEdit && !opts?.approve && !opts?.reject) return;
    setCloudBusy(true);
    try {
      const saved = await saveInvoiceToCloud(state, opts);
      applySaved(state, saved, session.user.email);
      if (opts?.approve) flash(`Saved and approved as ${saved.invoice_no}`);
      else if (opts?.reject) flash('Sent back — the creator can edit and resubmit');
      else if (opts?.submit) {
        flash(`Sent for approval as ${saved.invoice_no}`);
        const t = computeTotals(state);
        void notifyApprovalSubmitted({
          invoice_no: saved.invoice_no,
          sender: session.user.email || 'a teammate',
          client: state.toName || 'No client',
          total: `${state.currency} ${fmt2(t.total)}`,
        }).catch((err) => console.error('WhatsApp notify failed', err));
      } else if (saved.status === 'draft' && state.status === 'approved') {
        flash('Saved as draft — send for approval again before it can be downloaded');
      } else flash(`Saved ${saved.invoice_no} — everyone will see this version`);
    } catch (e) {
      if (opts?.approve && e instanceof InvoiceNumberTakenError && state.invoiceId) {
        const next = e.suggestion ?? state.invNo;
        const chosen = window.prompt(
          `Invoice number "${state.invNo}" is already used on another invoice. Change it before approving:`,
          next
        );
        if (!chosen) return;
        try {
          await assignInvoiceNumber(state.invoiceId, chosen.trim());
          await setInvoiceStatus(state.invoiceId, 'approved');
          applySaved(state, { id: state.invoiceId, invoice_no: chosen.trim(), status: 'approved' }, session.user.email);
          flash(`Saved and approved as ${chosen.trim()}`);
        } catch (err) {
          alert((err as Error).message);
        }
        return;
      }
      if (!handleNumberError(e)) alert('Could not save invoice: ' + (e as Error).message);
    } finally {
      setCloudBusy(false);
    }
  };

  const sendForApproval = async () => {
    await onSaveInvoice({ submit: true });
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
        void onSaveInvoice();
      } else if (e.key === 'enter') {
        e.preventDefault();
        onDownload();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canEdit, session, state]);

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
        {lockedMsg && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">{lockedMsg}</p>
        )}
        {ownerDisclaimer && (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
            {needsReapproval
              ? 'Download is off. Send this invoice for approval again before anyone on the team can download it.'
              : ownerDisclaimer}
          </p>
        )}
        {isAdmin && state.invoiceId && !isAdminOwn && (
          <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-600">
            Reviewing {state.createdByEmail || 'team'} invoice. Save writes this version for everyone. Save & approve locks it in.
          </p>
        )}
        <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0 disabled:opacity-80">
        <Accordion.Root type="multiple" defaultValue={[]} className="space-y-4">
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
              disabled={!canNumber}
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
                <EyeChip label="GSTIN" on={state.showGstin} onToggle={(v) => update('showGstin', v)} />
              </div>
              {state.showGstin && (
                <Field label="GSTIN" value={state.byGstin} onChange={(e) => update('byGstin', e.target.value)} />
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
            <Field label="Name" value={state.toAttn} onChange={(e) => update('toAttn', e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Phone" value={state.toPhone} onChange={(e) => update('toPhone', e.target.value)} />
              <Field label="Email" type="email" value={state.toEmail} onChange={(e) => update('toEmail', e.target.value)} />
            </div>
            <TextArea label="Address" value={state.toAddress} onChange={(e) => update('toAddress', e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-slate-500">Tax ID</span>
              <div className="flex gap-1.5">
                <EyeChip label="GSTIN" on={state.showGstin} onToggle={(v) => update('showGstin', v)} />
                <EyeChip label="SAC/HSN" on={state.showSac} onToggle={(v) => update('showSac', v)} />
              </div>
            </div>
            {state.showGstin && (
              <Field label="GSTIN" value={state.toGstin} onChange={(e) => update('toGstin', e.target.value)} />
            )}
            {state.showSac && (
              <Field label="SAC/HSN" value={state.bySac} onChange={(e) => update('bySac', e.target.value)} />
            )}
            <CustomFields fields={state.toCustom} onChange={(f) => update('toCustom', f)} />
          </SectionCard>

          <SectionCard value="items" icon={Package} title="Line Items" description="Services & products being billed" accent="purple" complete={state.items.length > 0 && state.items.every((i) => i.desc)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-slate-500">Columns</span>
              <EyeChip label="Qty" on={state.showQty} onToggle={(v) => update('showQty', v)} />
            </div>
            <LineItemsSection items={state.items} showQty={state.showQty} currency={state.currency} ops={items} />
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
              {state.showSignature && (
                <div className="flex items-center justify-end gap-2.5 px-1 pb-0.5">
                  <MiniStepper
                    label="Signature size"
                    icon={<Type size={10} strokeWidth={2.2} />}
                    value={state.signFontSize}
                    suffix=""
                    step={2}
                    min={18}
                    max={72}
                    onChange={(n) => update('signFontSize', n)}
                  />
                </div>
              )}
              <Switch label="Stamp" checked={state.showStamp} onChange={(v) => update('showStamp', v)} />
              {state.showStamp && (
                <div className="space-y-2 px-1 pb-1.5">
                  <StampUpload state={state} update={update} />
                  <div className="flex items-center justify-end gap-2.5">
                  <MiniStepper
                    label="Stamp opacity"
                    icon={<Droplets size={10} strokeWidth={2.2} />}
                    value={state.stampOpacity}
                    suffix="%"
                    step={5}
                    min={0}
                    max={100}
                    onChange={(n) => update('stampOpacity', n)}
                  />
                  <MiniStepper
                    label="Stamp angle"
                    icon={<RotateCw size={10} strokeWidth={2.2} />}
                    value={state.stampRotate}
                    suffix="°"
                    step={1}
                    min={-45}
                    max={45}
                    onChange={(n) => update('stampRotate', n)}
                  />
                  <MiniStepper
                    label="Stamp size"
                    icon={<Type size={10} strokeWidth={2.2} />}
                    value={state.stampFontSize}
                    suffix=""
                    step={2}
                    min={16}
                    max={56}
                    onChange={(n) => update('stampFontSize', n)}
                  />
                  </div>
                </div>
              )}
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
        </fieldset>
      </div>

      {/* sticky action bar */}
      <div className="border-t border-[#E8ECF4] bg-white/90 px-3.5 py-3 backdrop-blur-xl">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total</p>
            <p className="mt-1 truncate text-[17px] font-bold tabular-nums leading-tight text-slate-900">
              {state.currency} {fmt2(total)}
            </p>
          </div>
          {session ? (
            <div
              className={
                'rounded-2xl px-3 py-2.5 ' +
                (needsReapproval || state.status === 'draft'
                  ? 'bg-slate-50'
                  : state.status === 'approved'
                    ? 'bg-emerald-50'
                    : state.status === 'pending'
                      ? 'bg-blue-50'
                      : state.status === 'rejected'
                        ? 'bg-rose-50'
                        : 'bg-slate-50')
              }
            >
              <p
                className={
                  'text-[10px] font-semibold uppercase tracking-[0.14em] ' +
                  (needsReapproval
                    ? 'text-amber-500'
                    : state.status === 'approved'
                      ? 'text-emerald-500'
                      : state.status === 'pending'
                        ? 'text-blue-500'
                        : state.status === 'rejected'
                          ? 'text-rose-400'
                          : 'text-slate-400')
                }
              >
                Status
              </p>
              <p
                className={
                  'mt-1 text-[13px] font-bold leading-tight ' +
                  (needsReapproval
                    ? 'text-amber-800'
                    : state.status === 'approved'
                      ? 'text-emerald-700'
                      : state.status === 'pending'
                        ? 'text-blue-700'
                        : state.status === 'rejected'
                          ? 'text-rose-700'
                          : 'text-slate-600')
                }
              >
                {needsReapproval
                  ? 'Needs approval again'
                  : state.status === 'approved'
                    ? 'Approved'
                    : state.status === 'rejected'
                      ? 'Sent back'
                      : state.status === 'pending'
                        ? 'Waiting for approval'
                        : 'Draft'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</p>
              <p className="mt-1 text-[13px] font-bold text-slate-600">Draft</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5">
          {session && (
            <>
              <button
                type="button"
                onClick={onSaveTemplate}
                disabled={cloudBusy}
                aria-label="Save as template"
                className="icon-action"
              >
                <LayoutTemplate size={15} />
                <span className="icon-tip">Save as template</span>
              </button>
              <button
                type="button"
                onClick={() => runReview()}
                disabled={cloudBusy}
                aria-label="AI review"
                className="icon-action text-brand-deep"
              >
                <Sparkles size={15} />
                <span className="icon-tip">AI review</span>
              </button>
            </>
          )}
          {session && canEdit && (
            <button
              type="button"
              onClick={() => onSaveInvoice()}
              disabled={cloudBusy}
              aria-label="Save"
              className="icon-action"
            >
              <Save size={15} />
              <span className="icon-tip">{cloudBusy ? 'Saving…' : 'Save'}</span>
            </button>
          )}
          {session && (canSubmitForApproval(access) || needsReapproval) && (
            <button
              type="button"
              onClick={sendForApproval}
              disabled={cloudBusy}
              aria-label="Send for approval"
              className="icon-action bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
            >
              <Send size={15} />
              <span className="icon-tip">{cloudBusy ? 'Sending…' : 'Send for approval'}</span>
            </button>
          )}
          {session && canSaveAndApprove(access) && (
            <>
              <button
                type="button"
                onClick={() => onSaveInvoice({ reject: true })}
                disabled={cloudBusy}
                aria-label="Send back"
                className="icon-action bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
              >
                <X size={15} />
                <span className="icon-tip">Send back</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveInvoice({ approve: true })}
                disabled={cloudBusy}
                aria-label="Save and approve"
                className="icon-action bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
              >
                <Check size={15} />
                <span className="icon-tip">{cloudBusy ? 'Saving…' : 'Save & approve'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading || !canDownload}
            aria-label="Download PDF"
            className="icon-action bg-gradient-to-r from-brand-deep to-brand text-white shadow-sm shadow-brand/20 hover:text-white"
          >
            <Download size={15} />
            <span className="icon-tip">
              {downloading ? 'Generating…' : canDownload ? 'Download PDF' : 'Available after approval'}
            </span>
          </button>
        </div>
        {cloudMsg && (
          <p className="mt-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-center text-[11px] font-semibold text-emerald-600">
            {cloudMsg}
          </p>
        )}
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
