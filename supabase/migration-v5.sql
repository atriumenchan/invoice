-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v5
-- Creator and admin may both edit a pending invoice.
-- Members still cannot approve. Run this alone in SQL Editor.
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

  if old.status in ('void') then
    raise exception 'This invoice is voided and cannot be edited';
  end if;

  -- members may keep current status, or submit (pending). Never approve/reject.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'Only admin can approve invoices';
  end if;

  if new.status not in ('draft', 'pending', 'rejected', 'approved') then
    raise exception 'Only admin can set this invoice status';
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Only admin can reject invoices';
  end if;

  return new;
end;
$$;
