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
  invoiceId?: string | null;
}

function isOwner(ctx: AccessCtx): boolean {
  const me = (ctx.currentEmail || '').toLowerCase();
  if (!me) return false;
  if (!ctx.invoiceId) return true;
  const owner = (ctx.ownerEmail || '').toLowerCase();
  return Boolean(owner) && owner === me;
}

/** Creator and admin can always edit. Only void is locked. */
export function canEditInvoiceContent(ctx: AccessCtx): boolean {
  if (ctx.status === 'void') return false;
  return ctx.isAdmin || isOwner(ctx);
}

export function canChangeInvoiceNumber(ctx: AccessCtx): boolean {
  return canEditInvoiceContent(ctx);
}

export function canSubmitForApproval(ctx: AccessCtx): boolean {
  if (ctx.isAdmin) return false;
  if (!canEditInvoiceContent(ctx)) return false;
  return ctx.status === 'draft' || ctx.status === 'rejected';
}

export function canSaveAndApprove(ctx: AccessCtx): boolean {
  if (!ctx.isAdmin) return false;
  if (isAdminEmail(ctx.ownerEmail)) return false;
  return ctx.status !== 'approved' && ctx.status !== 'void';
}

export function canRejectInvoice(ctx: AccessCtx): boolean {
  return canSaveAndApprove(ctx);
}

/** Team can download only while the invoice is approved. */
export function canDownloadPdf(ctx: AccessCtx): boolean {
  if (ctx.status === 'void') return false;
  if (ctx.isAdmin) return true;
  return ctx.status === 'approved';
}

export function canDeleteInvoice(ctx: AccessCtx): boolean {
  if (ctx.status === 'void') return false;
  return ctx.isAdmin || isOwner(ctx);
}

export function lockReason(ctx: AccessCtx): string | null {
  if (canEditInvoiceContent(ctx)) return null;
  if (ctx.status === 'void') return 'This invoice is voided.';
  return 'Only the person who created this invoice (or admin) can edit it.';
}

/** Shown to the creator (not admin) on an approved invoice before they change it. */
export function ownerApprovedEditDisclaimer(ctx: AccessCtx): string | null {
  if (ctx.isAdmin) return null;
  if (ctx.status !== 'approved') return null;
  if (!ctx.invoiceId) return null;
  const me = (ctx.currentEmail || '').toLowerCase();
  const owner = (ctx.ownerEmail || '').toLowerCase();
  if (!me || owner !== me) return null;
  return 'This invoice is approved. If you edit it, you will need to send it for approval again before it can be downloaded.';
}
