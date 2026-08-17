-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v9
-- Do not treat extra jsonb keys as an owner edit.
-- Owner un-approval happens only when the app saves status = draft.
-- Run this alone in the SQL editor.
-- ================================================================

create or replace function public.enforce_invoice_edit_rules()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  new.created_by_email := old.created_by_email;

  if public.is_admin() then
    if jsonb_typeof(new.state) = 'object' then
      new.state := jsonb_set(new.state, '{status}', to_jsonb(new.status::text));
    end if;
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

  if old.status = 'approved' then
    if new.status not in ('draft', 'pending', 'approved') then
      new.status := 'approved';
    end if;
  end if;

  if jsonb_typeof(new.state) = 'object' then
    new.state := jsonb_set(new.state, '{status}', to_jsonb(new.status::text));
  end if;

  return new;
end;
$$;
