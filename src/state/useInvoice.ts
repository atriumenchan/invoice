import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { InvoiceState, LineItem } from '../types';

const STORAGE_KEY = 'admexo-invoice-v2';

const newItem = (): LineItem => ({
  id: crypto.randomUUID(),
  desc: 'New service',
  period: '',
  sac: '',
  qty: 1,
  rate: 0,
});

const DEFAULT_STATE: InvoiceState = {
  docTitle: 'TAX INVOICE',
  invNo: '#ADS-APR26-001',
  invDate: '10 Apr 2026',
  dueDate: '17 Apr 2026',
  currency: 'INR',
  showBadge: true,
  badgeText: 'PAYMENT DUE IN 7 DAYS',

  taxEnabled: true,
  gstLabel: 'GST',
  gstRate: 18,

  byName: 'Betelgeuse Global',
  bySub: 'ADMEXO',
  byAddress: '2101, E-Square, Sector 96, Noida, U.P. 201304, India',
  byGstin: '09CBJPM0018A1Z6',
  bySac: '998361',

  toName: 'Collegedunia Web Pvt Ltd',
  toAttn: 'Abhishek Agrawal',
  toPhone: '+91 97172 07755',
  toEmail: 'accounts@collegedunia.com',
  toAddress: '4th Floor, 418-419, AIHP Signature Tower, Udyog Vihar Phase IV, Gurugram, Haryana 122015',
  toGstin: '06AAFCC5173J1ZK',

  items: [
    { id: crypto.randomUUID(), desc: 'Marketing Services', period: 'Service period: March 2026', sac: '998361', qty: 1, rate: 30000 },
  ],
  notes: [
    'Payment is due within 7 calendar days from the invoice date.',
    'Please quote the invoice number in the payment reference.',
    'This is a computer-generated invoice; no physical signature is required.',
  ],

  bankBenef: 'Betelgeuse Global',
  bankName: 'HDFC Bank',
  bankAcType: 'Current',
  bankAcNo: '99998899114411',
  bankIfsc: 'HDFC0000088',
  bankRef: 'ADS-APR26-001',

  discount: 0,

  signMode: 'type',
  signFont: "'Great Vibes',cursive",
  signName: 'Rohan Thakur',
  signTitle: 'Authorized Signatory',
  signImage: null,

  footCompany: 'ADMEXO',
  footRegions: 'USA | DUBAI | INDIA | UK',
  footWeb: 'admexo.com',
};

function loadInitial(): InvoiceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    /* ignore corrupt cache */
  }
  return DEFAULT_STATE;
}

export function useInvoice() {
  const [state, setState] = useState<InvoiceState>(loadInitial);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const update = useCallback(<K extends keyof InvoiceState>(key: K, value: InvoiceState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }, []);

  /* ---------- items ---------- */
  const addItem = useCallback(() => {
    setState((s) => ({ ...s, items: [...s.items, newItem()] }));
    setDirty(true);
  }, []);
  const removeItem = useCallback((id: string) => {
    setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));
    setDirty(true);
  }, []);
  const duplicateItem = useCallback((id: string) => {
    setState((s) => {
      const idx = s.items.findIndex((it) => it.id === id);
      if (idx === -1) return s;
      const copy = { ...s.items[idx], id: crypto.randomUUID() };
      const items = [...s.items];
      items.splice(idx + 1, 0, copy);
      return { ...s, items };
    });
    setDirty(true);
  }, []);
  const updateItem = useCallback((id: string, field: keyof LineItem, value: string | number) => {
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    }));
    setDirty(true);
  }, []);
  const reorderItems = useCallback((items: LineItem[]) => {
    setState((s) => ({ ...s, items }));
    setDirty(true);
  }, []);

  /* ---------- notes ---------- */
  const addNote = useCallback(() => {
    setState((s) => ({ ...s, notes: [...s.notes, 'New note'] }));
    setDirty(true);
  }, []);
  const removeNote = useCallback((index: number) => {
    setState((s) => ({ ...s, notes: s.notes.filter((_, i) => i !== index) }));
    setDirty(true);
  }, []);
  const updateNote = useCallback((index: number, value: string) => {
    setState((s) => ({ ...s, notes: s.notes.map((n, i) => (i === index ? value : n)) }));
    setDirty(true);
  }, []);

  /* ---------- autosave ---------- */
  const saveNow = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / unavailable */
    }
    setDirty(false);
    setSavedAt(new Date());
  }, [state]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(saveNow, 800);
    return () => clearTimeout(t);
  }, [state, dirty, saveNow]);

  /* ---------- PDF export (unchanged logic) ---------- */
  const downloadPDF = useCallback(async () => {
    const node = previewRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(node, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, 'PNG', (pageWidth - w) / 2, 0, w, h);
      const invNo = (state.invNo || 'invoice').replace(/[^a-zA-Z0-9-]/g, '');
      pdf.save(`Invoice-${invNo}.pdf`);
    } catch (e) {
      alert('PDF generation failed: ' + (e as Error).message);
    } finally {
      setDownloading(false);
    }
  }, [state.invNo, downloading]);

  return {
    state,
    update,
    items: { add: addItem, remove: removeItem, duplicate: duplicateItem, update: updateItem, reorder: reorderItems },
    notes: { add: addNote, remove: removeNote, update: updateNote },
    dirty,
    savedAt,
    saveNow,
    downloading,
    previewRef,
    downloadPDF,
  };
}

export type InvoiceApi = ReturnType<typeof useInvoice>;
