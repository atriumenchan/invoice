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

drop policy if exists "profiles own" on public.profiles;
drop policy if exists "issuers own" on public.issuers;
drop policy if exists "clients own" on public.clients;
drop policy if exists "bank_accounts own" on public.bank_accounts;
drop policy if exists "service_items own" on public.service_items;
drop policy if exists "invoice_sequences own" on public.invoice_sequences;
drop policy if exists "invoices own" on public.invoices;
drop policy if exists "templates own" on public.templates;
drop policy if exists "ai_reviews own" on public.ai_reviews;

create policy "profiles own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

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

-- Shared stamp/signature style (opacity, rotation, font sizes) is upserted
-- by /api/sign-prefs using the service role; no extra SQL required.

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
drop policy if exists "invoices select" on public.invoices;
drop policy if exists "invoices insert" on public.invoices;
drop policy if exists "invoices update" on public.invoices;
drop policy if exists "invoices delete" on public.invoices;

create policy "invoices select" on public.invoices
  for select using (auth.uid() = user_id or public.is_admin());

create policy "invoices insert" on public.invoices
  for insert with check (auth.uid() = user_id);

create policy "invoices update" on public.invoices
  for update using (auth.uid() = user_id or public.is_admin());

create policy "invoices delete" on public.invoices
  for delete using (auth.uid() = user_id or public.is_admin());

-- ================================================================
-- MIGRATION v3 — centralized invoice numbers going forward
-- Existing duplicate numbers are LEFT UNCHANGED.
-- New numbers (and number *changes*) cannot collide with any invoice.
-- The live app also enforces this via /api/invoice-number.
-- ================================================================

create or replace function public.prevent_new_duplicate_invoice_no()
returns trigger
language plpgsql
as $$
begin
  -- Updating an invoice that already has this number: leave it alone,
  -- even if another older invoice shares the same number.
  if tg_op = 'update' and lower(new.invoice_no) = lower(old.invoice_no) then
    return new;
  end if;
  if exists (
    select 1 from public.invoices
    where lower(invoice_no) = lower(new.invoice_no)
      and id is distinct from new.id
  ) then
    raise exception 'Invoice number already used: %', new.invoice_no
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_no_new_duplicates on public.invoices;
create trigger invoices_no_new_duplicates
  before insert or update of invoice_no on public.invoices
  for each row execute function public.prevent_new_duplicate_invoice_no();

-- ================================================================
-- Seed: the two ADMEXO issuers (runs for the user who executes it
-- only if they are logged in — otherwise seed later from the app)
-- ================================================================
-- Example (replace with your own auth user id):
-- insert into public.issuers (user_id, name, code, brand, address, region, currency, inv_prefix, tax_id_label, tax_id, sac_hsn, footer_regions, footer_web)
-- values
--   ('<your-user-uuid>', 'Betelgeuse Global', 'BG',  'ADMEXO', '2101, E-Square, Sector 96, Noida, U.P. 201304, India', 'IN', 'INR', 'BG-IN',  'GSTIN', '09CBJPM0018A1Z6', '998361', 'USA | DUBAI | INDIA | UK', 'admexo.com'),
--   ('<your-user-uuid>', 'ADMEXO',            'ADX', null,     '2101, E-Square, Sector 96, Noida, U.P. 201304, India', 'IN', 'INR', 'ADX-IN', 'GSTIN', '09CBJPM0018A1Z6', '998361', 'USA | DUBAI | INDIA | UK', 'admexo.com');

-- ================================================================
-- MIGRATION v4 — company-wide source of truth + edit rules
-- IF YOUR DATABASE ALREADY EXISTS: do not run the whole file.
-- Copy ONLY from this comment down to the end, paste into a new
-- SQL query, and Run. That is what you need right now.
-- ================================================================

alter table public.invoices add column if not exists last_edited_by text;

-- Shared catalogs: every signed-in user sees the same issuers / clients /
-- banks / templates. Inserts still record who created the row.
drop policy if exists "issuers own" on public.issuers;
drop policy if exists "clients own" on public.clients;
drop policy if exists "bank_accounts own" on public.bank_accounts;
drop policy if exists "templates own" on public.templates;
drop policy if exists "service_items own" on public.service_items;
drop policy if exists "issuers read" on public.issuers;
drop policy if exists "issuers write" on public.issuers;
drop policy if exists "clients read" on public.clients;
drop policy if exists "clients write" on public.clients;
drop policy if exists "bank_accounts read" on public.bank_accounts;
drop policy if exists "bank_accounts write" on public.bank_accounts;
drop policy if exists "templates read" on public.templates;
drop policy if exists "templates write" on public.templates;
drop policy if exists "issuers update" on public.issuers;
drop policy if exists "issuers delete" on public.issuers;
drop policy if exists "clients update" on public.clients;
drop policy if exists "clients delete" on public.clients;
drop policy if exists "bank_accounts update" on public.bank_accounts;
drop policy if exists "bank_accounts delete" on public.bank_accounts;
drop policy if exists "templates update" on public.templates;
drop policy if exists "templates delete" on public.templates;
drop policy if exists "service_items update" on public.service_items;
drop policy if exists "service_items delete" on public.service_items;

create policy "issuers read" on public.issuers for select using (auth.uid() is not null);
create policy "issuers write" on public.issuers
  for insert with check (auth.uid() is not null);
create policy "issuers update" on public.issuers
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "issuers delete" on public.issuers
  for delete using (auth.uid() = user_id or public.is_admin());

create policy "clients read" on public.clients for select using (auth.uid() is not null);
create policy "clients write" on public.clients
  for insert with check (auth.uid() is not null);
create policy "clients update" on public.clients
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "clients delete" on public.clients
  for delete using (auth.uid() = user_id or public.is_admin());

create policy "bank_accounts read" on public.bank_accounts for select using (auth.uid() is not null);
create policy "bank_accounts write" on public.bank_accounts
  for insert with check (auth.uid() is not null);
create policy "bank_accounts update" on public.bank_accounts
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "bank_accounts delete" on public.bank_accounts
  for delete using (auth.uid() = user_id or public.is_admin());

create policy "templates read" on public.templates for select using (auth.uid() is not null);
create policy "templates write" on public.templates
  for insert with check (auth.uid() is not null);
create policy "templates update" on public.templates
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "templates delete" on public.templates
  for delete using (auth.uid() = user_id or public.is_admin());

create policy "service_items read" on public.service_items for select using (auth.uid() is not null);
create policy "service_items write" on public.service_items
  for insert with check (auth.uid() is not null);
create policy "service_items update" on public.service_items
  for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "service_items delete" on public.service_items
  for delete using (auth.uid() = user_id or public.is_admin());

drop policy if exists "invoices update" on public.invoices;
create policy "invoices update" on public.invoices
  for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- Who may change what:
--   admin  — edit any invoice; approve / reject; own invoices are auto-approved
--   member — create/edit own draft or rejected invoices; send for approval;
--            cannot edit pending or approved invoices (admin's copy is canonical)
create or replace function public.enforce_invoice_edit_rules()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  new.created_by_email := old.created_by_email;

  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is distinct from old.user_id then
    raise exception 'You can only update invoices you created';
  end if;

  if old.status in ('approved', 'void') then
    raise exception 'This invoice is locked after approval';
  end if;

  if old.status = 'pending' then
    raise exception 'This invoice is waiting for admin review and cannot be edited';
  end if;

  -- members may keep draft/rejected or submit (pending). Never approve.
  if new.status not in ('draft', 'pending', 'rejected') then
    raise exception 'Only admin can set this invoice status';
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Only admin can reject invoices';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_edit_rules on public.invoices;
create trigger invoices_edit_rules
  before update on public.invoices
  for each row execute function public.enforce_invoice_edit_rules();

-- Live updates so the creator sees admin edits without a refresh.
alter table public.invoices replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;
end $$;
