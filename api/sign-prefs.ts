import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const KEY = 'sign_style';

const DEFAULTS = {
  stampOpacity: 46,
  stampRotate: 0,
  stampFontSize: 30,
  signFontSize: 38,
};

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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

function parseStyle(raw: unknown) {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  return {
    stampOpacity: num(obj.stampOpacity, DEFAULTS.stampOpacity, 0, 100),
    stampRotate: num(obj.stampRotate, DEFAULTS.stampRotate, -90, 90),
    stampFontSize: num(obj.stampFontSize, DEFAULTS.stampFontSize, 16, 56),
    signFontSize: num(obj.signFontSize, DEFAULTS.signFontSize, 18, 72),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Prefs service is not configured' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await admin.from('app_config').select('value').eq('key', KEY).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(parseStyle(data?.value ?? null));
  }

  const style = parseStyle(req.body);
  const { error } = await admin.from('app_config').upsert({ key: KEY, value: JSON.stringify(style) });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(style);
}
