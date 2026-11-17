import type { CustomField } from '../types';

/**
 * Saved payment profile shown in the bank picker and applied when the
 * ADMEXO issuer is selected.
 *
 * Account fields come from the company bank-details document. Leave
 * accountNo blank until those figures are known — an incomplete profile
 * is never written onto an invoice.
 */
export interface BankPreset {
  label: string;
  beneficiary: string;
  bankName: string;
  accountType: string;
  accountNo: string;
  ifsc: string;
  custom: CustomField[];
}

export const ADMEXO_BANK: BankPreset = {
  label: 'ADMEXO',
  beneficiary: 'ADMEXO',
  bankName: '',
  accountType: '',
  accountNo: '',
  ifsc: '',
  custom: [],
};

export function isAdmexoIssuer(issuer: {
  name?: string | null;
  code?: string | null;
  inv_prefix?: string | null;
}): boolean {
  const name = (issuer.name || '').trim().toLowerCase();
  const code = (issuer.code || '').trim().toLowerCase();
  const prefix = (issuer.inv_prefix || '').trim().toLowerCase();
  return name === 'admexo' || code === 'adx' || prefix === 'adx' || prefix.startsWith('adx-');
}

/** True when the profile is safe to print on an invoice. */
export function bankPresetReady(preset: BankPreset): boolean {
  return Boolean(preset.beneficiary.trim() && preset.bankName.trim() && preset.accountNo.trim() && preset.ifsc.trim());
}

export interface BankSnapshot {
  id: string;
  label: string | null;
  beneficiary: string | null;
  bank_name: string | null;
  account_type: string | null;
  account_no: string | null;
  ifsc_swift: string | null;
  custom_fields: CustomField[] | null;
}

export interface AppliedBank {
  id: string | null;
  beneficiary: string;
  bankName: string;
  accountType: string;
  accountNo: string;
  ifsc: string;
  custom: CustomField[];
}

function fromSnapshot(row: BankSnapshot): AppliedBank {
  return {
    id: row.id,
    beneficiary: row.beneficiary ?? '',
    bankName: row.bank_name ?? '',
    accountType: row.account_type ?? '',
    accountNo: row.account_no ?? '',
    ifsc: row.ifsc_swift ?? '',
    custom: row.custom_fields ?? [],
  };
}

function fromPreset(preset: BankPreset, id: string | null): AppliedBank {
  return {
    id,
    beneficiary: preset.beneficiary,
    bankName: preset.bankName,
    accountType: preset.accountType,
    accountNo: preset.accountNo,
    ifsc: preset.ifsc,
    custom: preset.custom,
  };
}

function isCompleteBank(bank: { accountNo: string; bankName: string; ifsc: string }): boolean {
  return Boolean(bank.accountNo.trim() && bank.bankName.trim() && bank.ifsc.trim());
}

/** Bank details to apply when the ADMEXO issuer is chosen. */
export function bankForAdmexoIssuer(banks: BankSnapshot[]): AppliedBank | null {
  const saved = banks.find((b) => (b.label || '').trim().toLowerCase() === ADMEXO_BANK.label.toLowerCase());
  if (saved) {
    const applied = fromSnapshot(saved);
    if (isCompleteBank(applied)) return applied;
  }
  if (!bankPresetReady(ADMEXO_BANK)) return null;
  return fromPreset(ADMEXO_BANK, saved?.id ?? null);
}

/** Picker / save label. The ADMEXO profile keeps that name. */
export function bankAccountLabel(beneficiary: string, bankName: string, existingLabel?: string | null): string {
  if ((existingLabel || '').trim().toLowerCase() === ADMEXO_BANK.label.toLowerCase()) return ADMEXO_BANK.label;
  if (beneficiary.trim().toLowerCase() === 'admexo') return ADMEXO_BANK.label;
  return bankName.trim() || 'Bank account';
}
