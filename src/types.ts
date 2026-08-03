export interface LineItem {
  id: string;
  desc: string;
  period: string;
  sac: string;
  qty: number;
  rate: number;
}

export type SignMode = 'type' | 'upload';

export interface InvoiceState {
  docTitle: string;
  invNo: string;
  invDate: string;
  dueDate: string;
  currency: string;
  showBadge: boolean;
  badgeText: string;

  taxEnabled: boolean;
  gstLabel: string;
  gstRate: number;

  byName: string;
  bySub: string;
  byAddress: string;
  byGstin: string;
  bySac: string;

  toName: string;
  toAttn: string;
  toPhone: string;
  toEmail: string;
  toAddress: string;
  toGstin: string;

  items: LineItem[];
  notes: string[];

  bankBenef: string;
  bankName: string;
  bankAcType: string;
  bankAcNo: string;
  bankIfsc: string;
  bankRef: string;

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
