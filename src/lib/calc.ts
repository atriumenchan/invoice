import type { InvoiceState } from '../types';

export function fmt2(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function threeDigits(n: number): string {
  let s = '';
  if (n >= 100) {
    s += ONES[Math.floor(n / 100)] + ' Hundred';
    n = n % 100;
    if (n) s += ' ';
  }
  if (n > 0) s += twoDigits(n);
  return s;
}

function indianWords(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

function intlWords(n: number): string {
  if (n === 0) return 'Zero';
  const billion = Math.floor(n / 1000000000); n %= 1000000000;
  const million = Math.floor(n / 1000000); n %= 1000000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (billion) parts.push(threeDigits(billion) + ' Billion');
  if (million) parts.push(threeDigits(million) + ' Million');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

const CURRENCY_WORDS: Record<string, string> = {
  INR: 'Indian Rupees',
  USD: 'US Dollars',
  GBP: 'British Pounds',
  EUR: 'Euros',
  AED: 'UAE Dirhams',
};

export function amountInWords(total: number, currency: string): string {
  const whole = Math.floor(total);
  const cur = currency.toUpperCase();
  const words = cur === 'INR' ? indianWords(whole) : intlWords(whole);
  const curName = CURRENCY_WORDS[cur] || cur;
  return `${curName} ${words} Only.`;
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxable: number;
  gstRate: number;
  gstAmt: number;
  total: number;
}

export function computeTotals(s: InvoiceState): Totals {
  const subtotal = s.items.reduce((sum, it) => sum + (it.qty || 0) * (it.rate || 0), 0);
  const discount = s.discount || 0;
  const taxable = subtotal - discount;
  const gstRate = s.gstRate || 0;
  const gstAmt = s.taxEnabled ? taxable * (gstRate / 100) : 0;
  return { subtotal, discount, taxable, gstRate, gstAmt, total: taxable + gstAmt };
}
