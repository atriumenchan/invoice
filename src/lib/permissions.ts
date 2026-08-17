import type { InvoiceStatus } from '../types';

const ADMIN_EMAIL = ((import.meta.env.VITE_ADMIN_EMAIL as string) || 'ryan@admexo.com').toLowerCase();

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email || '').toLowerCase() === ADMIN_EMAIL;
}

export interface AccessCtx {
  isAdmin: boolean;
  status: InvoiceStatus;
  ownerEmail: string | null | undefined;
  currentEmail: string | null | undefined;
}

function isOwner(ctx: AccessCtx): boolean {
  const owner = (ctx.ownerEmail || '').toLowerCase();
  const me = (ctx.currentEmail || '').toLowerCase();
  if (!owner || !me) return false;
  return owner === me;
}

/** Admin and the invoice creator can both edit. Voided invoices stay locked. */
export function canEditInvoiceContent(ctx: AccessCtx): boolean {
  if (ctx.status === 'void') return false;
  if (ctx.isAdmin) return true;
  return isOwner(ctx);
}

export function canChangeInvoiceNumber(ctx: AccessCtx): boolean {
  return canEditInvoiceContent(ctx);
}

export function canSubmitForApproval(ctx: AccessCtx): boolean {
  if (ctx.isAdmin) return false;
  if (!isOwner(ctx)) return false;
  return ctx.status === 'draft' || ctx.status === 'rejected';
}

/** Admin saving a team invoice that still needs a decision. */
export function canSaveAndApprove(ctx: AccessCtx): boolean {
  if (!ctx.isAdmin) return false;
  if (isAdminEmail(ctx.ownerEmail)) return false;
  return ctx.status !== 'approved' && ctx.status !== 'void';
}

export function canRejectInvoice(ctx: AccessCtx): boolean {
  return canSaveAndApprove(ctx);
}

export function canDownloadPdf(ctx: AccessCtx): boolean {
  if (ctx.isAdmin) return true;
  return ctx.status === 'approved';
}

export function canDeleteInvoice(ctx: AccessCtx): boolean {
  if (ctx.isAdmin) return true;
  if (!isOwner(ctx)) return false;
  return ctx.status === 'draft' || ctx.status === 'rejected';
}

export function lockReason(ctx: AccessCtx): string | null {
  if (canEditInvoiceContent(ctx)) return null;
  if (ctx.status === 'void') return 'This invoice is voided and cannot be edited.';
  if (!isOwner(ctx) && !ctx.isAdmin) return 'You can only edit invoices you created.';
  return 'This invoice is locked.';
}
