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
  status: string;
  currency: string | null;
  total: number;
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

/* ---------- invoice numbering ---------- */
export async function nextInvoiceNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number', { p_prefix: prefix });
  if (error) throw error;
  return data as string;
}

/* ---------- invoices ---------- */
export async function saveInvoiceToCloud(s: InvoiceState): Promise<{ id: string; invoice_no: string }> {
  const user_id = await uid();
  const t = computeTotals(s);
  const invoice_no = s.invoiceId ? s.invNo : await nextInvoiceNumber(s.invPrefix || 'INV');
  const stateToStore = s.invoiceId ? s : { ...s, invNo: invoice_no };
  const row = {
    user_id,
    invoice_no,
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
    const { error } = await supabase.from('invoices').update(row).eq('id', s.invoiceId);
    if (error) throw error;
    return { id: s.invoiceId, invoice_no };
  }
  const { data, error } = await supabase.from('invoices').insert(row).select('id').single();
  if (error) throw error;
  return { id: data.id as string, invoice_no };
}

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, status, currency, total, created_at, state')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as InvoiceRow[];
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
