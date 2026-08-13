-- ================================================================
-- ADMEXO Invoice Builder — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ================================================================
--
-- AFTER RUNNING, also configure email redirect:
--   Authentication → URL Configuration
--     Site URL:        https://<your-app>.vercel.app
--     Redirect URLs:   https://<your-app>.vercel.app/**
--                      http://localhost:5174/**
-- ================================================================

-- ---------- profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  default_issuer_id uuid,
  created_at timestamptz not null default now()
);

-- auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- issuers (Betelgeuse / Admexo × region) ----------
create table if not exists public.issuers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,                     -- 'Betelgeuse Global' | 'ADMEXO'
  code text not null,                     -- 'BG' | 'ADX'  (drives invoice numbering)
  brand text,                             -- sub-line shown on invoice
  address text,
  region text not null check (region in ('IN', 'UK', 'US')),
  currency text not null,                 -- 'INR' | 'GBP' | 'USD'
  inv_prefix text not null,               -- e.g. 'BG-IN' | 'ADX-UK'
  tax_id_label text,                      -- 'GSTIN' | 'VAT' | 'EIN'
  tax_id text,
  sac_hsn text,
  logo_url text,
  footer_regions text,
  footer_web text,
  custom_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, inv_prefix)
);

-- ---------- clients ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  attn text,
  phone text,
  email text,
  address text,
  tax_id text,
  custom_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- bank accounts ----------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issuer_id uuid references public.issuers (id) on delete set null,
  label text,                             -- 'HDFC Current' (picker display)
  beneficiary text,
  bank_name text,
  account_type text,
  account_no text,
  ifsc_swift text,
  custom_fields jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- service catalog (reusable line items) ----------
create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  period text,
  sac_hsn text,
  qty numeric not null default 1,
  rate numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- invoice numbering (per issuer, atomic) ----------
create table if not exists public.invoice_sequences (
  user_id uuid not null references auth.users (id) on delete cascade,
  inv_prefix text not null,               -- 'BG-IN' | 'ADX-UK' | ...
  seq bigint not null default 0,
  primary key (user_id, inv_prefix)
);

-- Atomically increments and returns the next invoice number, e.g. 'BG-IN-0007'.
-- Callable from the app:  supabase.rpc('next_invoice_number', { p_prefix: 'BG-IN' })
create or replace function public.next_invoice_number(p_prefix text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_seq bigint;
  v_stamp text := upper(to_char(now(), 'MONYY'));  -- e.g. 'AUG26'
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.invoice_sequences (user_id, inv_prefix, seq)
  values (v_uid, p_prefix, 1)
  on conflict (user_id, inv_prefix)
  do update set seq = public.invoice_sequences.seq + 1
  returning seq into v_seq;

  -- e.g. BG-IN-AUG26-0007 : sequence keeps counting across months
  return p_prefix || '-' || v_stamp || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number(text) from public;
grant execute on function public.next_invoice_number(text) to authenticated;

-- ---------- invoices ----------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_no text not null,               -- from next_invoice_number()
  issuer_id uuid references public.issuers (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issue_date date,
  due_date date,
  currency text,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  charges_total numeric not null default 0,
  total numeric not null default 0,
  state jsonb not null,                   -- full editor state (round-trips into builder)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_no)
);

create index if not exists invoices_user_status_idx on public.invoices (user_id, status);
create index if not exists invoices_user_created_idx on public.invoices (user_id, created_at desc);

-- ---------- templates ----------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  issuer_id uuid references public.issuers (id) on delete set null,
  state jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- AI reviews (DeepSeek results per invoice) ----------
create table if not exists public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  model text,
  issues jsonb not null default '[]'::jsonb,   -- [{severity, section, message}]
  created_at timestamptz not null default now()
);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists templates_updated_at on public.templates;
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- ================================================================
-- Row Level Security — every user sees only their own rows
-- ================================================================
alter table public.profiles          enable row level security;
alter table public.issuers           enable row level security;
alter table public.clients           enable row level security;
alter table public.bank_accounts     enable row level security;
alter table public.service_items     enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoices          enable row level security;
alter table public.templates         enable row level security;
alter table public.ai_reviews        enable row level security;

-- profiles
create policy "profiles own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- generic own-rows policies
create policy "issuers own" on public.issuers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "clients own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "bank_accounts own" on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "service_items own" on public.service_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoice_sequences own" on public.invoice_sequences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoices own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "templates own" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ai_reviews own" on public.ai_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================================================================
-- MIGRATION v2 — super-admin approval workflow
-- Run ONLY this section if you already ran the file above.
-- ================================================================

-- invoices: approval workflow + display title + owner email
alter table public.invoices add column if not exists title text;
alter table public.invoices add column if not exists created_by_email text;
alter table public.invoices add column if not exists submitted_at timestamptz;
alter table public.invoices add column if not exists approved_at timestamptz;
alter table public.invoices add column if not exists approved_by text;

-- widen allowed statuses: draft → pending → approved / rejected
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'sent', 'paid', 'overdue', 'void'));

-- app config (who is the super admin)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;
-- no policies: only readable through the security-definer function below

insert into public.app_config (key, value)
values ('admin_email', 'ryan@admexo.com')
on conflict (key) do update set value = excluded.value;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) =
         lower(coalesce((select value from public.app_config where key = 'admin_email'), ''));
$$;

-- the client calls supabase.rpc('is_admin') directly, so it must be callable
grant execute on function public.is_admin() to authenticated, anon;

-- admin can see & moderate ALL invoices; owners keep full control of theirs
drop policy if exists "invoices own" on public.invoices;

create policy "invoices select" on public.invoices
  for select using (auth.uid() = user_id or public.is_admin());

create policy "invoices insert" on public.invoices
  for insert with check (auth.uid() = user_id);

create policy "invoices update" on public.invoices
  for update using (auth.uid() = user_id or public.is_admin());

create policy "invoices delete" on public.invoices
  for delete using (auth.uid() = user_id or public.is_admin());

-- ================================================================
-- MIGRATION v3 — centralized, globally-unique invoice numbering
-- Run ONLY this section if you already ran the sections above.
--
-- Problem this fixes: invoice numbers were only unique PER USER
-- (unique (user_id, invoice_no)), so two different people could both
-- have "BG-IN-AUG26-0001". This migration makes every invoice number
-- unique across the WHOLE company (like an employee ID — issued once,
-- never reused, from one shared counter), and adds a helper so the
-- app can (a) check availability before save, and (b) suggest the
-- nearest free number when someone types a number that's taken.
-- ================================================================

-- 1) De-duplicate any invoice numbers that collide across different
--    users (possible under the old per-user constraint) before we can
--    enforce a single global-unique constraint. Keeps the oldest
--    invoice untouched; renames newer collisions so nothing is lost —
--    review anything renamed "...-DUPn" afterwards and fix by hand.
with dupes as (
  select id, invoice_no,
         row_number() over (partition by lower(invoice_no) order by created_at) as rn
  from public.invoices
)
update public.invoices i
set invoice_no = i.invoice_no || '-DUP' || d.rn
from dupes d
where i.id = d.id and d.rn > 1;

-- 2) Replace the old per-user unique constraint with a global one.
alter table public.invoices drop constraint if exists invoices_user_id_invoice_no_key;
alter table public.invoices add constraint invoices_invoice_no_key unique (invoice_no);

-- 3) Centralized counter — one row per prefix, shared by every user.
create table if not exists public.invoice_counters (
  inv_prefix text primary key,
  seq bigint not null default 0
);
alter table public.invoice_counters enable row level security;
-- no direct policies: only reachable through the security-definer
-- functions below, same pattern as app_config/is_admin()

-- 4) Atomically allocate the next free number for a prefix. Skips over
--    any number that's already used by ANYONE, so it self-heals even
--    if manual entries or old per-user data left gaps/collisions.
create or replace function public.next_invoice_number(p_prefix text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_stamp text := upper(to_char(now(), 'MONYY'));  -- e.g. 'AUG26'
  v_seq bigint;
  v_candidate text;
  v_guard int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    p_prefix := 'INV';
  end if;

  insert into public.invoice_counters (inv_prefix, seq)
  values (p_prefix, 0)
  on conflict (inv_prefix) do nothing;

  loop
    update public.invoice_counters
      set seq = seq + 1
      where inv_prefix = p_prefix
      returning seq into v_seq;

    v_candidate := p_prefix || '-' || v_stamp || '-' || lpad(v_seq::text, 4, '0');

    exit when not exists (
      select 1 from public.invoices where lower(invoice_no) = lower(v_candidate)
    );

    v_guard := v_guard + 1;
    if v_guard > 10000 then
      raise exception 'Could not allocate a free invoice number for prefix %', p_prefix;
    end if;
  end loop;

  return v_candidate;
end;
$$;

revoke all on function public.next_invoice_number(text) from public;
grant execute on function public.next_invoice_number(text) to authenticated;

-- 5) Availability check — callable by ANY signed-in user (not just the
--    owner) so the editor can validate a manually-typed number against
--    the whole company's invoices, without exposing whose it is.
create or replace function public.check_invoice_number(p_number text, p_exclude_id uuid default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.invoices
    where lower(invoice_no) = lower(p_number)
      and (p_exclude_id is null or id <> p_exclude_id)
  );
$$;

revoke all on function public.check_invoice_number(text, uuid) from public;
grant execute on function public.check_invoice_number(text, uuid) to authenticated;

-- 6) Suggest the nearest free number after a taken one, preserving its
--    prefix/pattern and incrementing the trailing numeric run
--    ("BG-IN-AUG26-0007" -> "BG-IN-AUG26-0008" -> ... first free one).
create or replace function public.suggest_invoice_number(p_number text, p_exclude_id uuid default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prefix text;
  v_num text;
  v_len int;
  v_n bigint;
  v_candidate text;
  v_guard int := 0;
begin
  v_num := substring(p_number from '(\d+)$');
  if v_num is null then
    v_prefix := p_number || '-';
    v_num := '0000';
  else
    v_prefix := left(p_number, length(p_number) - length(v_num));
  end if;
  v_len := length(v_num);
  v_n := v_num::bigint;

  loop
    v_n := v_n + 1;
    v_candidate := v_prefix || lpad(v_n::text, v_len, '0');
    exit when not exists (
      select 1 from public.invoices
      where lower(invoice_no) = lower(v_candidate)
        and (p_exclude_id is null or id <> p_exclude_id)
    );
    v_guard := v_guard + 1;
    if v_guard > 10000 then
      raise exception 'Could not find a free invoice number near %', p_number;
    end if;
  end loop;

  return v_candidate;
end;
$$;

revoke all on function public.suggest_invoice_number(text, uuid) from public;
grant execute on function public.suggest_invoice_number(text, uuid) to authenticated;

-- ================================================================
-- Seed: the two ADMEXO issuers (runs for the user who executes it
-- only if they are logged in — otherwise seed later from the app)
-- ================================================================
-- Example (replace with your own auth user id):
-- insert into public.issuers (user_id, name, code, brand, address, region, currency, inv_prefix, tax_id_label, tax_id, sac_hsn, footer_regions, footer_web)
-- values
--   ('<your-user-uuid>', 'Betelgeuse Global', 'BG',  'ADMEXO', '2101, E-Square, Sector 96, Noida, U.P. 201304, India', 'IN', 'INR', 'BG-IN',  'GSTIN', '09CBJPM0018A1Z6', '998361', 'USA | DUBAI | INDIA | UK', 'admexo.com'),
--   ('<your-user-uuid>', 'ADMEXO',            'ADX', null,     '2101, E-Square, Sector 96, Noida, U.P. 201304, India', 'IN', 'INR', 'ADX-IN', 'GSTIN', '09CBJPM0018A1Z6', '998361', 'USA | DUBAI | INDIA | UK', 'admexo.com');
