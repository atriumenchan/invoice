import type { CustomField } from '../types';

/**
 * ADMEXO LLC Mercury account (Choice Financial Group).
 * Domestic ACH/wires and USD international wires use this same account.
 * The foreign-currency page is an intermediary route and is not stored here.
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
  beneficiary: 'ADMEXO LLC',
  bankName: 'Choice Financial Group',
  accountType: 'Checking',
  accountNo: '202585555238',
  ifsc: 'CHFGUS44021',
  custom: [
    { id: 'aba', label: 'ABA routing number', value: '091311229' },
    { id: 'bank-address', label: 'Bank address', value: '4501 23rd Avenue S, Fargo, ND 58104, USA' },
    { id: 'benef-address', label: 'Beneficiary address', value: '5830 East 2nd Street, Casper, WY 82609, USA' },
  ],
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
  if (bankPresetReady(ADMEXO_BANK)) return fromPreset(ADMEXO_BANK, saved?.id ?? null);
  if (!saved) return null;
  const applied = fromSnapshot(saved);
  return isCompleteBank(applied) ? applied : null;
}

function isAdmexoBeneficiary(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === 'admexo' || n.startsWith('admexo ');
}

/** Picker / save label. The ADMEXO profile keeps that name. */
export function bankAccountLabel(beneficiary: string, bankName: string, existingLabel?: string | null): string {
  if ((existingLabel || '').trim().toLowerCase() === ADMEXO_BANK.label.toLowerCase()) return ADMEXO_BANK.label;
  if (isAdmexoBeneficiary(beneficiary)) return ADMEXO_BANK.label;
  return bankName.trim() || 'Bank account';
}
