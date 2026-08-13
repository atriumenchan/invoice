import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

async function requireUser(req: VercelRequest) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await anon.auth.getUser();
  return user ?? null;
}

function normalizeInvoiceNo(value: string): string {
  return value.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
}

function trailingDigits(value: string): { prefix: string; n: number; width: number } | null {
  const m = value.trim().replace(/^#+/, '').match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], n: parseInt(m[2], 10), width: m[2].length };
}

function usedSet(numbers: { id: string; invoice_no: string }[], excludeId: string | null) {
  const set = new Set<string>();
  for (const row of numbers) {
    if (excludeId && row.id === excludeId) continue;
    set.add(normalizeInvoiceNo(row.invoice_no));
  }
  return set;
}

function suggestFrom(number: string, used: Set<string>): string {
  const parsed = trailingDigits(number.trim());
  const base = parsed ?? { prefix: number.trim().replace(/-+$/, '') + '-', n: 0, width: 4 };
  let n = base.n;
  const width = Math.max(base.width, 4);
  for (let i = 0; i < 10000; i++) {
    n += 1;
    const candidate = `${base.prefix}${String(n).padStart(width, '0')}`;
    if (!used.has(normalizeInvoiceNo(candidate))) return candidate;
  }
  throw new Error('Could not find a free invoice number');
}

function nextForPrefix(prefix: string, rows: { invoice_no: string }[]): string {
  const p = prefix.trim() || 'INV';
  const lower = normalizeInvoiceNo(p);
  let max = 0;
  let width = 4;
  for (const row of rows) {
    const no = row.invoice_no.trim().replace(/^#+/, '');
    if (!normalizeInvoiceNo(no).startsWith(lower)) continue;
    const parsed = trailingDigits(no);
    if (!parsed) continue;
    if (parsed.n > max) max = parsed.n;
    if (parsed.width > width) width = parsed.width;
  }
  return `${p}-${String(max + 1).padStart(width, '0')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Numbering service is not configured' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.from('invoices').select('id, invoice_no');
  if (error) return res.status(500).json({ error: error.message });
  const rows = (data ?? []) as { id: string; invoice_no: string }[];

  const body = req.body ?? {};
  const action = body.action as string;
  const excludeId = (body.excludeId as string | null) ?? null;

  if (action === 'check') {
    const number = String(body.number ?? '').trim().replace(/^#+/, '');
    if (!number) return res.status(400).json({ error: 'Missing number' });
    const self = excludeId ? rows.find((r) => r.id === excludeId) : undefined;
    if (self && normalizeInvoiceNo(self.invoice_no) === normalizeInvoiceNo(number)) {
      return res.status(200).json({ available: true, grandfathered: true, suggestion: null });
    }
    const used = usedSet(rows, excludeId);
    const available = !used.has(normalizeInvoiceNo(number));
    return res.status(200).json({
      available,
      grandfathered: false,
      suggestion: available ? null : suggestFrom(number, used),
    });
  }

  if (action === 'suggest') {
    const number = String(body.number ?? '').trim();
    if (!number) return res.status(400).json({ error: 'Missing number' });
    return res.status(200).json({ suggestion: suggestFrom(number, usedSet(rows, excludeId)) });
  }

  if (action === 'next') {
    const prefix = String(body.prefix ?? 'INV').trim() || 'INV';
    return res.status(200).json({ number: nextForPrefix(prefix, rows) });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
