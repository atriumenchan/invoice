import { supabase } from './supabase';
import { computeTotals, fmt2, amountInWords } from './calc';
import type { InvoiceState } from '../types';

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  score: number;
  verdict: 'ready' | 'needs_fixes';
  issues: ReviewIssue[];
}

function buildPayload(s: InvoiceState) {
  const t = computeTotals(s);
  return {
    invoice_no: s.invNo,
    doc_title: s.docTitle,
    issue_date: s.invDate,
    due_date: s.showDueDate ? s.dueDate : null,
    currency: s.currency,
    entity_region: s.entity,
    seller: {
      name: s.byName,
      sub: s.bySub,
      address: s.byAddress,
      gstin: s.showGstin ? s.byGstin : null,
      sac_hsn: s.showSac ? s.bySac : null,
      extra: s.byCustom,
    },
    client: {
      name: s.toName,
      attn: s.toAttn,
      phone: s.toPhone,
      email: s.toEmail,
      address: s.toAddress,
      gstin: s.showGstin ? s.toGstin : null,
      extra: s.toCustom,
    },
    items: s.items.map((i) => ({
      description: i.desc,
      period: i.period,
      qty: s.showQty ? i.qty : 1,
      rate: i.rate,
      amount: (s.showQty ? i.qty || 0 : 1) * (i.rate || 0),
    })),
    subtotal: t.subtotal,
    discount: s.showDiscount ? t.discount : 0,
    charges: t.chargeRows.map((c) => ({ label: c.label, kind: c.kind, value: c.value, amount: c.amt })),
    total: t.total,
    total_display: `${s.currency} ${fmt2(t.total)}`,
    amount_in_words: s.showWords ? amountInWords(t.total, s.currency) : null,
    bank_shown: s.showBank,
    notes: s.showNotes ? s.notes : [],
    signature_name: s.showSignature ? s.signName : null,
  };
}

export async function reviewInvoice(state: InvoiceState): Promise<ReviewResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const r = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ invoiceId: state.invoiceId, invoice: buildPayload(state) }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || `Review failed (${r.status})`);
  return json as ReviewResult;
}
