-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v10
-- Templates are private. Share with a teammate; they accept from
-- Notifications, then a copy appears under their Templates.
-- Run this alone in the SQL editor.
-- ================================================================

drop policy if exists "templates read" on public.templates;
drop policy if exists "templates write" on public.templates;
drop policy if exists "templates update" on public.templates;
drop policy if exists "templates delete" on public.templates;
drop policy if exists "templates select own" on public.templates;
drop policy if exists "templates insert own" on public.templates;
drop policy if exists "templates update own" on public.templates;
drop policy if exists "templates delete own" on public.templates;

create policy "templates select own" on public.templates
  for select using (auth.uid() = user_id);
create policy "templates insert own" on public.templates
  for insert with check (auth.uid() = user_id);
create policy "templates update own" on public.templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates delete own" on public.templates
  for delete using (auth.uid() = user_id or public.is_admin());

create table if not exists public.template_shares (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  template_name text not null,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  from_email text not null,
  to_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create unique index if not exists template_shares_pending_uniq
  on public.template_shares (template_id, lower(to_email))
  where status = 'pending';

alter table public.template_shares enable row level security;

drop policy if exists "template_shares select" on public.template_shares;
drop policy if exists "template_shares insert" on public.template_shares;
drop policy if exists "template_shares update" on public.template_shares;

create policy "template_shares select" on public.template_shares
  for select using (
    auth.uid() = from_user_id
    or lower(to_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "template_shares insert" on public.template_shares
  for insert with check (
    auth.uid() = from_user_id
    and exists (select 1 from public.templates t where t.id = template_id and t.user_id = auth.uid())
  );

create policy "template_shares update" on public.template_shares
  for update using (lower(to_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(to_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.accept_template_share(p_share_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.template_shares;
  v_tpl public.templates;
  v_new_id uuid;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_share from public.template_shares where id = p_share_id;
  if v_share.id is null then
    raise exception 'Share not found';
  end if;
  if lower(v_share.to_email) is distinct from v_email then
    raise exception 'This share is not for your account';
  end if;
  if v_share.status is distinct from 'pending' then
    raise exception 'This share was already %', v_share.status;
  end if;

  select * into v_tpl from public.templates where id = v_share.template_id;
  if v_tpl.id is null then
    raise exception 'The original template was deleted';
  end if;

  insert into public.templates (user_id, name, issuer_id, state)
  values (auth.uid(), v_tpl.name, v_tpl.issuer_id, v_tpl.state)
  returning id into v_new_id;

  update public.template_shares
     set status = 'accepted'
   where id = p_share_id;

  return v_new_id;
end;
$$;

grant execute on function public.accept_template_share(uuid) to authenticated;
