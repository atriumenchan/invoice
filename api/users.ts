import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || '').toLowerCase();

async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await anon.auth.getUser();
  if (!user || (user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      })),
    });
  }

  if (req.method === 'POST') {
    const { email, password } = req.body ?? {};
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email and a 6+ character password are required' });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ id: data.user.id, email: data.user.email });
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
