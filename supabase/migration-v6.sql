-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v6
-- Simple rule: the creator can always edit their own invoice
-- (including after approval). Only void is locked.
-- Members still cannot approve or reject. Run this alone in SQL Editor.
-- ================================================================

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

  if old.status = 'void' then
    raise exception 'This invoice is voided and cannot be edited';
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'Only admin can approve invoices';
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Only admin can reject invoices';
  end if;

  return new;
end;
$$;
