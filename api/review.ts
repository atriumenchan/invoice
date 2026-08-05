import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY as string;

/**
 * Knowledge base — everything the reviewer is allowed to know and check.
 * Keep this tight: the model must only do what is listed here.
 */
const SYSTEM_PROMPT = `You are a billing QA reviewer for ADMEXO (marketing services agency) invoices issued by "Betelgeuse Global" (prefix BG-IN) or "ADMEXO" (prefix ADX-IN), 2101 E-Square, Sector 96, Noida, U.P. 201304, India.

COMPANY FACTS (knowledge base):
- Indian entity GSTIN: 09CBJPM0018A1Z6 (15-char format: 2 digits + 10-char PAN + 1 char + Z + 1 char)
- SAC/HSN for marketing & advertising services: 998361 (6 digits)
- Indian B2B services: GST 18% is standard. UK: VAT 20%. US: no tax line.
- Currencies: INR (India), GBP (UK), USD (US). Currency must match the region preset.

CHECK ONLY THESE THINGS (nothing else):
1. completeness — invoice number, issue date, seller name/address, client name, at least one line item, total > 0
2. formats — GSTIN 15-char alphanumeric when shown; SAC/HSN 6 digits when shown; email looks valid when present
3. math — line amount = qty x rate; subtotal = sum of lines; discount reduces subtotal; percent charges apply on (subtotal - discount); total = taxable + charges; amount in words matches the total
4. dates — due date should be on/after issue date when both exist
5. tone — line item descriptions and notes are professional client-facing English; no placeholders ("e.g.", "lorem", "test"), no ALL-CAPS descriptions, no typos you are confident about
6. consistency — currency used everywhere matches; issuer tax fields match its region

RULES:
- Do NOT invent legal advice, do NOT comment on pricing levels, do NOT suggest new charges.
- Only flag things you are confident about from the data given.
- Respond with STRICT JSON only, no markdown, no prose:
{"score": <0-100>, "verdict": "ready" | "needs_fixes", "issues": [{"severity": "error" | "warning" | "info", "field": "<short field name>", "message": "<what is wrong, max 15 words>", "suggestion": "<one-line fix>"}]}
- verdict "ready" requires score >= 90 and zero "error" issues. Max 8 issues, ordered by severity. If perfect, issues = [].`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Invalid session' });

  const invoice = req.body?.invoice;
  if (!invoice) return res.status(400).json({ error: 'Missing invoice payload' });

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Review this invoice data and return the JSON verdict:\n${JSON.stringify(invoice)}` },
        ],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `DeepSeek error ${r.status}: ${text.slice(0, 300)}` });
    }

    const data = await r.json();
    const content: string = data.choices?.[0]?.message?.content ?? '{}';
    let review;
    try {
      review = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      review = m ? JSON.parse(m[0]) : { score: 0, verdict: 'needs_fixes', issues: [{ severity: 'error', field: 'review', message: 'Could not parse AI response', suggestion: 'Try again' }] };
    }

    supabase
      .from('ai_reviews')
      .insert({ user_id: user.id, invoice_id: req.body?.invoiceId ?? null, model: 'deepseek-chat', issues: review.issues ?? [] })
      .then(() => undefined);

    return res.status(200).json(review);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}
