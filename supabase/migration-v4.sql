-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v4 ONLY
-- Run this file by itself in: Supabase → SQL Editor → New query → Run
-- Do not run schema.sql. This assumes v1–v3 are already applied.
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
drop policy if exists "issuers update" on public.issuers;
drop policy if exists "issuers delete" on public.issuers;
drop policy if exists "clients read" on public.clients;
drop policy if exists "clients write" on public.clients;
drop policy if exists "clients update" on public.clients;
drop policy if exists "clients delete" on public.clients;
drop policy if exists "bank_accounts read" on public.bank_accounts;
drop policy if exists "bank_accounts write" on public.bank_accounts;
drop policy if exists "bank_accounts update" on public.bank_accounts;
drop policy if exists "bank_accounts delete" on public.bank_accounts;
drop policy if exists "templates read" on public.templates;
drop policy if exists "templates write" on public.templates;
drop policy if exists "templates update" on public.templates;
drop policy if exists "templates delete" on public.templates;
drop policy if exists "service_items read" on public.service_items;
drop policy if exists "service_items write" on public.service_items;
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
