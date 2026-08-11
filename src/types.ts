export interface LineItem {
  id: string;
  desc: string;
  period: string;
  sac: string;
  qty: number;
  rate: number;
}

export type SignMode = 'type' | 'upload';

export type EntityRegion = 'IN' | 'UK' | 'US';

export type InvoiceStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'sent' | 'paid' | 'overdue' | 'void';

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface Charge {
  id: string;
  label: string;
  kind: 'percent' | 'flat';
  value: number;
}

export interface InvoiceState {
  invoiceId: string | null;
  issuerId: string | null;
  clientId: string | null;
  bankId: string | null;
  invPrefix: string;
  status: InvoiceStatus;
  entity: EntityRegion;
  docTitle: string;
  invNo: string;
  invDate: string;
  dueDate: string;
  currency: string;
  showBadge: boolean;
  badgeText: string;
  showDueDate: boolean;
  showBank: boolean;
  showNotes: boolean;
  showWords: boolean;
  showSignature: boolean;
  showFooter: boolean;

  showGstin: boolean;
  showSac: boolean;
  showQty: boolean;
  showDiscount: boolean;
  charges: Charge[];

  byName: string;
  bySub: string;
  byAddress: string;
  byGstin: string;
  bySac: string;
  byCustom: CustomField[];
  /** custom uploaded logo (data URI); falls back to the default ADMEXO mark when null */
  logoImage: string | null;

  toName: string;
  toAttn: string;
  toPhone: string;
  toEmail: string;
  toAddress: string;
  toGstin: string;
  toCustom: CustomField[];

  items: LineItem[];
  notes: string[];

  bankBenef: string;
  bankName: string;
  bankAcType: string;
  bankAcNo: string;
  bankIfsc: string;
  bankRef: string;
  bankCustom: CustomField[];

  discount: number;

  signMode: SignMode;
  signFont: string;
  signName: string;
  signTitle: string;
  signImage: string | null;

  footCompany: string;
  footRegions: string;
  footWeb: string;
}
