-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v7
-- Keep approval in sync: member saves cannot undo approved status.
-- Always copy invoices.status into state.status. Run this alone.
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

  if old.status = 'approved' then
    new.status := 'approved';
  elsif new.status = 'approved' then
    raise exception 'Only admin can approve invoices';
  end if;

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Only admin can reject invoices';
  end if;

  if jsonb_typeof(new.state) = 'object' then
    new.state := jsonb_set(new.state, '{status}', to_jsonb(new.status::text));
  end if;

  return new;
end;
$$;
