import { useCallback, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { EntityRegion, InvoiceState, LineItem } from '../types';
import { DEFAULT_SIGN_STYLE, writeStampLast } from '../lib/stampPrefs';
import type { InvoiceRow } from '../lib/db';

/** @deprecated Invoice drafts are stored in Supabase, not the browser. Kept to clear leftover keys. */
export const STORAGE_KEY = 'admexo-invoice-v2';

/** e.g. 'AUG26' — used for placeholder numbers before cloud save */
const monthStamp = () => {
  const d = new Date();
  return `${d.toLocaleString('en', { month: 'short' }).toUpperCase()}${String(d.getFullYear()).slice(2)}`;
};

const newItem = (): LineItem => ({
  id: crypto.randomUUID(),
  desc: 'New service',
  period: '',
  sac: '',
  qty: 1,
  rate: 0,
});

const DEFAULT_STATE: InvoiceState = {
  invoiceId: null,
  issuerId: null,
  clientId: null,
  bankId: null,
  invPrefix: 'BG-IN',
  status: 'draft',
  createdByEmail: null,
  entity: 'IN',
  docTitle: 'TAX INVOICE',
  invNo: `#BG-IN-${monthStamp()}-0001`,
  invDate: '10 Apr 2026',
  dueDate: '17 Apr 2026',
  currency: 'INR',
  showBadge: true,
  badgeText: 'PAYMENT DUE IN 7 DAYS',
  showDueDate: true,
  showBank: true,
  showNotes: true,
  showWords: true,
  showSignature: false,
  showStamp: true,
  stampOpacity: 46,
  stampRotate: 0,
  stampFontSize: 30,
  signFontSize: 38,
  showFooter: true,

  showGstin: true,
  showSac: true,
  showQty: true,
  showDiscount: true,
  charges: [{ id: 'gst', label: 'GST', kind: 'percent', value: 18 }],

  byName: 'Betelgeuse Global',
  bySub: 'ADMEXO',
  byAddress: '2101, E-Square, Sector 96, Noida, U.P. 201304, India',
  byGstin: '09CBJPM0018A1Z6',
  bySac: '998361',
  byCustom: [],

  toName: 'Collegedunia Web Pvt Ltd',
  toAttn: 'Abhishek Agrawal',
  toPhone: '+91 97172 07755',
  toEmail: 'accounts@collegedunia.com',
  toAddress: '4th Floor, 418-419, AIHP Signature Tower, Udyog Vihar Phase IV, Gurugram, Haryana 122015',
  toGstin: '06AAFCC5173J1ZK',
  toCustom: [],

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
  bankRef: `BG-IN-${monthStamp()}-0001`,
  bankCustom: [],

  discount: 0,

  signMode: 'type',
  signFont: "'Great Vibes',cursive",
  signName: 'Rohan Thakur',
  signTitle: 'Authorized Signatory',
  signImage: null,
  stampImage: null,

  footCompany: 'ADMEXO',
  footRegions: 'USA | DUBAI | INDIA | UK',
  footWeb: 'admexo.com',
};

const ENTITY_PRESETS: Record<EntityRegion, Partial<InvoiceState>> = {
  IN: { currency: 'INR', showGstin: true, showSac: true, charges: [{ id: 'gst', label: 'GST', kind: 'percent', value: 18 }] },
  UK: { currency: 'GBP', showGstin: true, showSac: false, charges: [{ id: 'vat', label: 'VAT', kind: 'percent', value: 20 }] },
  US: { currency: 'USD', showGstin: false, showSac: false, charges: [] },
};

function newInvoiceState(): InvoiceState {
  return hydrateInvoiceState(null, { applyStampDefaults: true });
}

/** Fill missing fields from defaults. Stamp defaults apply only for brand-new invoices. */
export function hydrateInvoiceState(
  partial?: Partial<InvoiceState> | null,
  opts?: { applyStampDefaults?: boolean }
): InvoiceState {
  const stamp = opts?.applyStampDefaults === false ? {} : DEFAULT_SIGN_STYLE;
  return { ...DEFAULT_STATE, ...stamp, ...(partial ?? {}) };
}

export function useInvoice() {
  const [state, setState] = useState<InvoiceState>(newInvoiceState);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const update = useCallback(<K extends keyof InvoiceState>(key: K, value: InvoiceState[K]) => {
    setState((s) => {
      const next = { ...s, [key]: value };
      if (
        key === 'stampOpacity' ||
        key === 'stampRotate' ||
        key === 'stampFontSize' ||
        key === 'signFontSize'
      ) {
        writeStampLast({
          stampOpacity: next.stampOpacity,
          stampRotate: next.stampRotate,
          stampFontSize: next.stampFontSize,
          signFontSize: next.signFontSize,
        });
      }
      return next;
    });
    setDirty(true);
  }, []);

  const updateSilent = useCallback(<K extends keyof InvoiceState>(key: K, value: InvoiceState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const replaceState = useCallback((next: InvoiceState) => {
    setState(next);
    setDirty(true);
  }, []);

  const applyEntity = useCallback((entity: EntityRegion) => {
    setState((s) => ({ ...s, entity, ...ENTITY_PRESETS[entity] }));
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

  /* ---------- cloud hydrate ---------- */
  const markClean = useCallback(() => {
    setDirty(false);
    setSavedAt(new Date());
  }, []);

  const loadRemote = useCallback((row: InvoiceRow) => {
    setState(hydrateInvoiceState(
      {
        ...row.state,
        invoiceId: row.id,
        invNo: row.invoice_no,
        status: row.status as InvoiceState['status'],
        createdByEmail: row.created_by_email,
      },
      { applyStampDefaults: false }
    ));
    setDirty(false);
    setSavedAt(row.updated_at ? new Date(row.updated_at) : new Date());
  }, []);

  const applyRemoteIfClean = useCallback((row: InvoiceRow) => {
    if (dirtyRef.current) return;
    loadRemote(row);
  }, [loadRemote]);

  const resetToNew = useCallback(() => {
    setState(newInvoiceState());
    setDirty(false);
    setSavedAt(null);
  }, []);

  const loadTemplate = useCallback((partial: Partial<InvoiceState>) => {
    setState(hydrateInvoiceState({ ...partial, invoiceId: null, status: 'draft' }, { applyStampDefaults: false }));
    setDirty(true);
    setSavedAt(null);
  }, []);

  /* ---------- PDF export (unchanged logic) ---------- */
  const downloadPDF = useCallback(async () => {
    const node = previewRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        onclone: (_doc, cloned) => {
          /* Force wordmark text styles so PDF never gets the gradient-as-box artifact */
          const ad = cloned.querySelector<HTMLElement>('.logo-word .ad');
          if (ad) {
            ad.style.background = 'none';
            ad.style.setProperty('-webkit-background-clip', 'border-box');
            ad.style.backgroundClip = 'border-box';
            ad.style.setProperty('-webkit-text-fill-color', '#8a5cf5');
            ad.style.color = '#8a5cf5';
          }
          const mexo = cloned.querySelector<HTMLElement>('.logo-word .mexo');
          if (mexo) {
            mexo.style.setProperty('-webkit-text-fill-color', '#15182b');
            mexo.style.color = '#15182b';
          }
          const block = cloned.querySelector<HTMLElement>('.logo-block');
          if (block) block.style.gap = '18px';
          const word = cloned.querySelector<HTMLElement>('.logo-word');
          if (word) {
            word.style.marginLeft = '2px';
            /* html2canvas has incomplete text-layout support for custom
               line-height with web fonts: it consistently renders this
               wordmark ~8.5px lower than real browsers do, even though
               the live preview is pixel-perfect. Compensate only for the
               PDF capture (verified empirically against the icon mark). */
            word.style.transform = 'translateY(-8.5px)';
          }
          /* html2canvas blend-mode support is patchy — keep the see-through
             stamp/signature overlay via opacity only in the PDF clone. */
          cloned.querySelectorAll<HTMLElement>('.stamp, .sig .name, .sig img').forEach((el) => {
            el.style.mixBlendMode = 'normal';
          });
        },
      });
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
    updateSilent,
    replaceState,
    applyEntity,
    items: { add: addItem, remove: removeItem, duplicate: duplicateItem, update: updateItem, reorder: reorderItems },
    notes: { add: addNote, remove: removeNote, update: updateNote },
    dirty,
    savedAt,
    markClean,
    loadRemote,
    applyRemoteIfClean,
    resetToNew,
    loadTemplate,
    downloading,
    previewRef,
    downloadPDF,
  };
}

export type InvoiceApi = ReturnType<typeof useInvoice>;
