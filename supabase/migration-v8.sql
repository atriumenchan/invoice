-- ================================================================
-- ADMEXO Invoice Builder — MIGRATION v8
-- Admin edits keep an invoice approved.
-- Owner edits to an approved invoice body turn it back to draft
-- (download off until they send for approval again).
-- Rename / title-only updates stay approved. Run this alone.
-- ================================================================

create or replace function public.enforce_invoice_edit_rules()
returns trigger
language plpgsql
as $$
declare
  old_body jsonb;
  new_body jsonb;
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

  old_body := case when jsonb_typeof(old.state) = 'object' then old.state - 'status' else '{}'::jsonb end;
  new_body := case when jsonb_typeof(new.state) = 'object' then new.state - 'status' else '{}'::jsonb end;

  if old.status = 'approved' then
    if new.status = 'pending' then
      null;
    elsif old_body is distinct from new_body then
      new.status := 'draft';
    else
      new.status := 'approved';
    end if;
  end if;

  if jsonb_typeof(new.state) = 'object' then
    new.state := jsonb_set(new.state, '{status}', to_jsonb(new.status::text));
  end if;

  return new;
end;
$$;
