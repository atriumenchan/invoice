import { supabase, supabaseConfigured } from './supabase';

export const DEFAULT_STAMP_OPACITY = 46;
export const DEFAULT_STAMP_ROTATE = 0;
export const DEFAULT_STAMP_FONT = 30;
export const DEFAULT_SIGN_FONT = 38;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export interface SignStyle {
  stampOpacity: number;
  stampRotate: number;
  stampFontSize: number;
  signFontSize: number;
}

export const DEFAULT_SIGN_STYLE: SignStyle = {
  stampOpacity: DEFAULT_STAMP_OPACITY,
  stampRotate: DEFAULT_STAMP_ROTATE,
  stampFontSize: DEFAULT_STAMP_FONT,
  signFontSize: DEFAULT_SIGN_FONT,
};

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

export function normalizeSignStyle(raw: Partial<SignStyle> | null | undefined): SignStyle {
  return {
    stampOpacity: num(raw?.stampOpacity, DEFAULT_STAMP_OPACITY, 0, 100),
    stampRotate: num(raw?.stampRotate, DEFAULT_STAMP_ROTATE, -90, 90),
    stampFontSize: num(raw?.stampFontSize, DEFAULT_STAMP_FONT, 16, 56),
    signFontSize: num(raw?.signFontSize, DEFAULT_SIGN_FONT, 18, 72),
  };
}

export function readStampLast(): SignStyle {
  return { ...DEFAULT_SIGN_STYLE };
}

export function writeStampLast(_prefs: SignStyle) {
  /* Sign style is stored in Supabase (sign-prefs) and on each invoice. */
}

async function authHeader(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

export async function fetchSignStyleCloud(): Promise<SignStyle | null> {
  const auth = await authHeader();
  if (!auth) return null;
  const r = await fetch('/api/sign-prefs', { headers: { Authorization: auth } });
  if (!r.ok) return null;
  const json = await r.json();
  return normalizeSignStyle(json);
}

export async function saveSignStyleCloud(prefs: SignStyle): Promise<void> {
  const auth = await authHeader();
  if (!auth) return;
  const body = normalizeSignStyle(prefs);
  await fetch('/api/sign-prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
}
