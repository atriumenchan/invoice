import { supabase } from './supabase';
import { computeTotals } from './calc';
import type { CustomField, EntityRegion, InvoiceState } from '../types';

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
    user_id,
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
  const { data, error } = await supabase.from('clients').insert(row).select('id').single();
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
    user_id,
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
  const { data, error } = await supabase.from('bank_accounts').insert(row).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/* ---------- invoice numbering (centralized & globally unique) ---------- */

/**
 * Atomically allocates the next free invoice number for a prefix. The
 * server-side function skips over any number that's already used by
 * ANY user (not just the caller), so numbers are a single, centralized
 * sequence — never reused, exactly like an employee ID.
 */
export async function nextInvoiceNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number', { p_prefix: prefix });
  if (error) throw error;
  return data as string;
}

/** True if `number` is free to use (globally, across every user's invoices). */
export async function checkInvoiceNumberAvailable(number: string, excludeId?: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_invoice_number', {
    p_number: number,
    p_exclude_id: excludeId ?? null,
  });
  if (error) throw error;
  return data as boolean;
}

/** Finds the nearest free number after `number` (same prefix/pattern, numeric suffix + 1, + 2, ...). */
export async function suggestInvoiceNumber(number: string, excludeId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('suggest_invoice_number', {
    p_number: number,
    p_exclude_id: excludeId ?? null,
  });
  if (error) throw error;
  return data as string;
}

function isDuplicateInvoiceNoError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '23505' && /invoice_no/i.test(error.message ?? '');
}

async function duplicateInvoiceNoError(invoiceNo: string, excludeId: string | null): Promise<Error> {
  try {
    const suggestion = await suggestInvoiceNumber(invoiceNo, excludeId);
    return new Error(`Invoice number "${invoiceNo}" is already used. Try "${suggestion}" instead.`);
  } catch {
    return new Error(`Invoice number "${invoiceNo}" is already used. Please choose a different number.`);
  }
}

/* ---------- invoices ---------- */
export async function saveInvoiceToCloud(s: InvoiceState, opts?: { title?: string }): Promise<{ id: string; invoice_no: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in');
  const user_id = auth.user.id;
  const t = computeTotals(s);

  let invoice_no: string;
  if (s.invoiceId) {
    invoice_no = s.invNo;
  } else {
    // the untouched default placeholder always starts with '#' — anything
    // else means the user deliberately typed their own number, so respect it
    const manual = (s.invNo || '').trim();
    invoice_no = !manual || manual.startsWith('#') ? await nextInvoiceNumber(s.invPrefix || 'INV') : manual;
  }
  const stateToStore = s.invoiceId ? s : { ...s, invNo: invoice_no };
  const row = {
    invoice_no,
    title: opts?.title ?? s.toName ?? '',
    issuer_id: s.issuerId,
    client_id: s.clientId,
    status: s.status,
    currency: s.currency,
    subtotal: t.subtotal,
    discount: t.discount,
    charges_total: t.chargesTotal,
    total: t.total,
    state: stateToStore,
  };
  if (s.invoiceId) {
    // never touch user_id / created_by_email on update — an admin editing
    // someone else's invoice must not take ownership of it
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
    return { id: s.invoiceId, invoice_no };
  }
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...row, user_id, created_by_email: auth.user.email ?? null })
    .select('id')
    .single();
  if (error) {
    if (isDuplicateInvoiceNoError(error)) throw await duplicateInvoiceNoError(invoice_no, null);
    throw error;
  }
  return { id: data.id as string, invoice_no };
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, title, status, currency, total, created_by_email, created_at, state')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InvoiceRow[];
}

/** Fetch the live status of a saved invoice (picks up admin approvals). */
export async function getInvoiceStatus(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('invoices').select('status').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.status as string) ?? null;
}

export async function setInvoiceStatus(id: string, status: 'pending' | 'approved' | 'rejected' | 'draft'): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === 'pending') patch.submitted_at = new Date().toISOString();
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
    const { data } = await supabase.auth.getUser();
    patch.approved_by = data.user?.email ?? null;
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
  const state: InvoiceState = { ...t.state, invoiceId: null, status: 'draft' };
  const { id, invoice_no } = await saveInvoiceToCloud(state, { title });
  return {
    id,
    invoice_no,
    title,
    status: 'draft',
    currency: state.currency,
    total: computeTotals(state).total,
    created_by_email: null,
    created_at: new Date().toISOString(),
    state: { ...state, invNo: invoice_no },
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
