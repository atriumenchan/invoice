import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN as string | undefined;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID as string | undefined;
const WHATSAPP_TO = (process.env.WHATSAPP_TO || '918586862674').replace(/[^\d]/g, '');
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME as string | undefined;
const WHATSAPP_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/[^\d]/g, '');
}

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

function textBody(payload: {
  invoice_no: string;
  sender: string;
  client: string;
  total: string;
}) {
  return [
    'ADMEXO invoice waiting for approval',
    '',
    `Invoice: ${payload.invoice_no}`,
    `From: ${payload.sender}`,
    `Client: ${payload.client}`,
    `Total: ${payload.total}`,
    '',
    'Open the dashboard Approvals tab to review, save, or approve.',
  ].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) {
    return res.status(200).json({ sent: false, skipped: true, reason: 'WhatsApp is not configured' });
  }

  const body = req.body ?? {};
  const payload = {
    invoice_no: String(body.invoice_no || 'unknown').slice(0, 80),
    sender: String(body.sender || user.email || 'a teammate').slice(0, 120),
    client: String(body.client || 'No client').slice(0, 120),
    total: String(body.total || '').slice(0, 80),
  };

  const message = WHATSAPP_TEMPLATE_NAME
    ? {
        messaging_product: 'whatsapp',
        to: WHATSAPP_TO,
        type: 'template',
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: payload.invoice_no || '-' },
                { type: 'text', text: payload.sender || '-' },
                { type: 'text', text: payload.client || '-' },
                { type: 'text', text: payload.total || '-' },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: WHATSAPP_TO,
        type: 'text',
        text: { preview_url: false, body: textBody(payload) },
      };

  const r = await fetch(`https://graph.facebook.com/v21.0/${digitsOnly(WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('WhatsApp notify failed', r.status, json);
    return res.status(502).json({
      sent: false,
      error: json?.error?.message || `WhatsApp error ${r.status}`,
    });
  }

  return res.status(200).json({ sent: true });
}
