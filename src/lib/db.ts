import { supabase } from './supabase';
import { computeTotals } from './calc';
import type { CustomField, EntityRegion, InvoiceState, InvoiceStatus } from '../types';
import { hydrateInvoiceState } from '../state/useInvoice';
import { isAdminEmail } from './permissions';

export { isAdminEmail };

export interface IssuerRow {
  id: string;
  name: string;
  code: string;
  brand: string | null;
  address: string | null;
  region: EntityRegion;
  currency: string;
  inv_prefix: string;
  tax_id_label: string | null;
  tax_id: string | null;
  sac_hsn: string | null;
  footer_regions: string | null;
  footer_web: string | null;
  custom_fields: CustomField[];
}

export interface ClientRow {
  id: string;
  name: string;
  attn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  custom_fields: CustomField[];
}

export interface BankRow {
  id: string;
  label: string | null;
  beneficiary: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_no: string | null;
  ifsc_swift: string | null;
  custom_fields: CustomField[];
  is_default: boolean;
}

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  title: string | null;
  status: string;
  currency: string | null;
  total: number;
  created_by_email: string | null;
  created_at: string;
  updated_at?: string;
  last_edited_by?: string | null;
  state: InvoiceState;
}

export interface TemplateRow {
  id: string;
  name: string;
  created_at: string;
  state: InvoiceState;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  return data.user.id;
}

/* ---------- issuers ---------- */
export async function listIssuers(): Promise<IssuerRow[]> {
  const { data, error } = await supabase.from('issuers').select('*').order('created_at');
  if (error) throw error;
  return data as IssuerRow[];
}

export async function ensureDefaultIssuers(): Promise<IssuerRow[]> {
  const existing = await listIssuers();
  if (existing.length) return existing;
  const user_id = await uid();
  const base = {
    user_id,
    address: '2101, E-Square, Sector 96, Noida, U.P. 201304, India',
    region: 'IN',
    currency: 'INR',
    tax_id_label: 'GSTIN',
    tax_id: '09CBJPM0018A1Z6',
    sac_hsn: '998361',
    footer_regions: 'USA | DUBAI | INDIA | UK',
    footer_web: 'admexo.com',
  };
  const { error } = await supabase.from('issuers').insert([
    { ...base, name: 'Betelgeuse Global', code: 'BG', brand: 'ADMEXO', inv_prefix: 'BG-IN' },
    { ...base, name: 'ADMEXO', code: 'ADX', brand: null, inv_prefix: 'ADX-IN' },
  ]);
  if (error) throw error;
  return listIssuers();
}

/* ---------- clients ---------- */
export async function listClients(): Promise<ClientRow[]> {
  const { data, error } = await supabase.from('clients').select('*').order('name');
  if (error) throw error;
  return data as ClientRow[];
}

export async function saveClient(s: InvoiceState): Promise<string> {
  const user_id = await uid();
  const row = {
    name: s.toName || 'Unnamed client',
    attn: s.toAttn,
    phone: s.toPhone,
    email: s.toEmail,
    address: s.toAddress,
    tax_id: s.toGstin,
    custom_fields: s.toCustom,
  };
  if (s.clientId) {
    const { error } = await supabase.from('clients').update(row).eq('id', s.clientId);
    if (error) throw error;
    return s.clientId;
  }
  const { data, error } = await supabase.from('clients').insert({ ...row, user_id }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/* ---------- bank accounts ---------- */
export async function listBanks(): Promise<BankRow[]> {
  const { data, error } = await supabase.from('bank_accounts').select('*').order('created_at');
  if (error) throw error;
  return data as BankRow[];
}

export async function saveBank(s: InvoiceState): Promise<string> {
  const user_id = await uid();
  const row = {
    label: s.bankName || 'Bank account',
    beneficiary: s.bankBenef,
    bank_name: s.bankName,
    account_type: s.bankAcType,
    account_no: s.bankAcNo,
    ifsc_swift: s.bankIfsc,
    custom_fields: s.bankCustom,
  };
  if (s.bankId) {
    const { error } = await supabase.from('bank_accounts').update(row).eq('id', s.bankId);
    if (error) throw error;
    return s.bankId;
  }
  const { data, error } = await supabase.from('bank_accounts').insert({ ...row, user_id }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/* ---------- invoice numbering (centralized across every user) ---------- */

export class InvoiceNumberTakenError extends Error {
  suggestion: string | null;
  constructor(number: string, suggestion: string | null) {
    super(
      suggestion
        ? `Invoice number "${number}" is already used. Next available is "${suggestion}" — edit it, then try again.`
        : `Invoice number "${number}" is already used. Please choose a different number.`
    );
    this.name = 'InvoiceNumberTakenError';
    this.suggestion = suggestion;
  }
}

export async function notifyApprovalSubmitted(payload: {
  invoice_no: string;
  sender: string;
  client: string;
  total: string;
}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  const r = await fetch('/api/notify-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `WhatsApp notify failed (${r.status})`);
}

async function numberingApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const r = await fetch('/api/invoice-number', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `Numbering check failed (${r.status})`);
  return json;
}

export async function nextInvoiceNumber(prefix: string): Promise<string> {
  const json = await numberingApi({ action: 'next', prefix });
  return json.number as string;
}

export async function checkInvoiceNumberAvailable(
  number: string,
  excludeId?: string | null,
  opts?: { strict?: boolean }
): Promise<{ available: boolean; suggestion: string | null; grandfathered: boolean }> {
  const json = await numberingApi({
    action: 'check',
    number,
    excludeId: excludeId ?? null,
    strict: Boolean(opts?.strict),
  });
  return {
    available: Boolean(json.available),
    suggestion: (json.suggestion as string | null) ?? null,
    grandfathered: Boolean(json.grandfathered),
  };
}

export async function suggestInvoiceNumber(number: string, excludeId?: string | null): Promise<string> {
  const json = await numberingApi({ action: 'suggest', number, excludeId: excludeId ?? null });
  return json.suggestion as string;
}

/** Blocks a number another invoice already has. Deleted invoices free the number (they are gone from the DB). */
export async function assertInvoiceNumberFree(
  number: string,
  excludeId?: string | null,
  opts?: { strict?: boolean }
): Promise<void> {
  const trimmed = number.trim().replace(/^#+/, '');
  if (!trimmed) return;
  const result = await checkInvoiceNumberAvailable(trimmed, excludeId, opts);
  if (!result.available) throw new InvoiceNumberTakenError(trimmed, result.suggestion);
}

function isDuplicateInvoiceNoError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '23505' || /already used/i.test(error.message ?? '');
}

async function duplicateInvoiceNoError(invoiceNo: string, excludeId: string | null): Promise<Error> {
  try {
    const suggestion = await suggestInvoiceNumber(invoiceNo, excludeId);
    return new InvoiceNumberTakenError(invoiceNo, suggestion);
  } catch {
    return new InvoiceNumberTakenError(invoiceNo, null);
  }
}

export function invoiceNeedsApproval(row: { status: string; created_by_email: string | null }): boolean {
  if (isAdminEmail(row.created_by_email)) return false;
  return row.status === 'pending';
}

/** Team invoices that were actually sent for approval (not drafts). */
export function invoiceCanBeModerated(row: { status: string; created_by_email: string | null }): boolean {
  if (isAdminEmail(row.created_by_email)) return false;
  return row.status === 'pending';
}
export type SaveInvoiceOpts = {
  title?: string;
  submit?: boolean;
  approve?: boolean;
  reject?: boolean;
};

function resolveSaveStatus(s: InvoiceState, saverEmail: string, opts?: SaveInvoiceOpts): InvoiceStatus {
  if (!isAdminEmail(saverEmail)) {
    if (opts?.submit) return 'pending';
    if (s.status === 'pending') return 'pending';
    if (s.status === 'rejected') return 'rejected';
    if (s.status === 'approved') return 'approved';
    return 'draft';
  }
  if (opts?.approve) return 'approved';
  if (opts?.reject) return 'rejected';
  if (!s.invoiceId) return 'approved';
  const owner = (s.createdByEmail || saverEmail).toLowerCase();
  if (isAdminEmail(owner)) return 'approved';
  return s.status;
}

export function rowToInvoiceState(row: InvoiceRow): InvoiceState {
  return hydrateInvoiceState(
    {
      ...row.state,
      invoiceId: row.id,
      invNo: row.invoice_no,
      status: row.status as InvoiceStatus,
      createdByEmail: row.created_by_email,
    },
    { applyStampDefaults: false }
  );
}

/* ---------- invoices ---------- */
export async function saveInvoiceToCloud(
  s: InvoiceState,
  opts?: SaveInvoiceOpts
): Promise<{ id: string; invoice_no: string; status: InvoiceStatus }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in');
  const user_id = auth.user.id;
  const saverEmail = auth.user.email ?? '';
  const t = computeTotals(s);
  const status = resolveSaveStatus(s, saverEmail, opts);

  let invoice_no: string;
  if (s.invoiceId) {
    invoice_no = (s.invNo || '').trim().replace(/^#+/, '');
    await assertInvoiceNumberFree(invoice_no, s.invoiceId, { strict: status === 'approved' || Boolean(opts?.approve) });
  } else {
    const manual = (s.invNo || '').trim();
    invoice_no = !manual || manual.startsWith('#') ? await nextInvoiceNumber(s.invPrefix || 'INV') : manual;
    await assertInvoiceNumberFree(invoice_no, null, { strict: true });
  }
  const createdByEmail = s.invoiceId ? s.createdByEmail : saverEmail || null;
  const stateToStore: InvoiceState = {
    ...s,
    invoiceId: s.invoiceId,
    invNo: invoice_no,
    status,
    createdByEmail,
  };
  const row: Record<string, unknown> = {
    invoice_no,
    title: opts?.title ?? s.toName ?? '',
    issuer_id: s.issuerId,
    client_id: s.clientId,
    status,
    currency: s.currency,
    subtotal: t.subtotal,
    discount: t.discount,
    charges_total: t.chargesTotal,
    total: t.total,
    state: stateToStore,
  };
  if (opts?.submit) row.submitted_at = new Date().toISOString();
  if (status === 'approved') {
    row.approved_at = new Date().toISOString();
    row.approved_by = saverEmail || null;
  }
  if (s.invoiceId) {
    const { data, error } = await supabase.from('invoices').update(row).eq('id', s.invoiceId).select('id');
    if (error) {
      if (isDuplicateInvoiceNoError(error)) throw await duplicateInvoiceNoError(invoice_no, s.invoiceId);
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error(
        'This invoice could not be updated — it may belong to a different account or have been deleted. Please start a new invoice.'
      );
    }
    return { id: s.invoiceId, invoice_no, status };
  }
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...row, user_id, created_by_email: saverEmail || null })
    .select('id')
    .single();
  if (error) {
    if (isDuplicateInvoiceNoError(error)) throw await duplicateInvoiceNoError(invoice_no, null);
    throw error;
  }
  return { id: data.id as string, invoice_no, status };
}

const INVOICE_COLUMNS =
  'id, invoice_no, title, status, currency, total, created_by_email, created_at, updated_at, state';

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase.from('invoices').select(INVOICE_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return data as InvoiceRow[];
}

export async function getInvoice(id: string): Promise<InvoiceRow> {
  const { data, error } = await supabase.from('invoices').select(INVOICE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Invoice not found');
  return data as InvoiceRow;
}

export async function getTemplate(id: string): Promise<TemplateRow> {
  const { data, error } = await supabase.from('templates').select('id, name, created_at, state').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Template not found');
  return data as TemplateRow;
}

/** Fetch the live status of a saved invoice (picks up admin approvals). */
export async function getInvoiceStatus(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('invoices').select('status').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.status as string) ?? null;
}

export async function assignInvoiceNumber(id: string, invoiceNo: string): Promise<void> {
  const number = invoiceNo.trim().replace(/^#+/, '');
  await assertInvoiceNumberFree(number, id, { strict: true });
  const { data: row, error: readError } = await supabase.from('invoices').select('state').eq('id', id).maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('Invoice not found');
  const state = { ...((row.state as InvoiceState) ?? {}), invNo: number };
  const { data, error } = await supabase.from('invoices').update({ invoice_no: number, state }).eq('id', id).select('id');
  if (error) {
    if (isDuplicateInvoiceNoError(error)) throw await duplicateInvoiceNoError(number, id);
    throw error;
  }
  if (!data || data.length === 0) throw new Error('Could not update the invoice number.');
}

export async function setInvoiceStatus(id: string, status: 'pending' | 'approved' | 'rejected' | 'draft'): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('invoices')
    .select('invoice_no, state')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error('Invoice not found');
  if (status === 'approved') {
    await assertInvoiceNumberFree(existing.invoice_no, id, { strict: true });
  }
  const { data: auth } = await supabase.auth.getUser();
  const editor = auth.user?.email ?? null;
  const state = {
    ...((existing.state as InvoiceState) ?? {}),
    status,
    invNo: existing.invoice_no,
    invoiceId: id,
  };
  const patch: Record<string, unknown> = { status, state };
  if (status === 'pending') patch.submitted_at = new Date().toISOString();
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = editor;
  }
  const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('This invoice could not be found or you do not have permission to update it.');
  }
}

export async function renameInvoice(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('invoices').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('templates').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Clone a template into the invoices list with "copy N" naming. */
export async function cloneTemplateAsInvoice(t: TemplateRow, existingTitles: string[]): Promise<InvoiceRow> {
  const base = t.name;
  let n = 1;
  let title = `${base} copy`;
  while (existingTitles.includes(title)) {
    n += 1;
    title = `${base} copy ${n}`;
  }
  const state: InvoiceState = hydrateInvoiceState({ ...t.state, invoiceId: null }, { applyStampDefaults: false });
  const { id, invoice_no, status } = await saveInvoiceToCloud(state, { title });
  return {
    id,
    invoice_no,
    title,
    status,
    currency: state.currency,
    total: computeTotals(state).total,
    created_by_email: null,
    created_at: new Date().toISOString(),
    state: { ...state, invNo: invoice_no, status, invoiceId: id },
  };
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- templates ---------- */
export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, name, created_at, state')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as TemplateRow[];
}

export async function saveTemplate(name: string, s: InvoiceState): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from('templates').insert({
    user_id,
    name,
    issuer_id: s.issuerId,
    state: { ...s, invoiceId: null },
  });
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}
