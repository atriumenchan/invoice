import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FilePlus2,
  FileText,
  LayoutTemplate,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { STORAGE_KEY } from '../state/useInvoice';
import {
  deleteInvoice,
  deleteTemplate,
  listInvoices,
  listTemplates,
  type InvoiceRow,
  type TemplateRow,
} from '../lib/db';
import { cn } from '../lib/utils';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-600',
  paid: 'bg-emerald-50 text-emerald-600',
  overdue: 'bg-rose-50 text-rose-600',
  void: 'bg-slate-100 text-slate-400',
};

export default function DashboardPage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'invoices' | 'templates'>('invoices');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvoices(await listInvoices());
      setTemplates(await listTemplates());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openInvoice = (row: InvoiceRow) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...row.state, invoiceId: row.id, invNo: row.invoice_no })
    );
    navigate('/');
  };

  const openTemplate = (row: TemplateRow) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...row.state, invoiceId: null }));
    navigate('/');
  };

  const newInvoice = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate('/');
  };

  const emailInvoice = (row: InvoiceRow) => {
    const subject = encodeURIComponent(`Invoice ${row.invoice_no}`);
    const body = encodeURIComponent(
      `Hi,\n\nPlease find invoice ${row.invoice_no} attached.\n\nTotal: ${row.currency ?? ''} ${Number(row.total).toLocaleString()}\n\nThanks`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const removeInvoice = async (row: InvoiceRow) => {
    if (!window.confirm(`Delete invoice ${row.invoice_no}? This cannot be undone.`)) return;
    await deleteInvoice(row.id);
    load();
  };

  const removeTemplate = async (row: TemplateRow) => {
    if (!window.confirm(`Delete template “${row.name}”?`)) return;
    await deleteTemplate(row.id);
    load();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-[#E8ECF4] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link to="/" className="icon-btn" title="Back to builder">
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="truncate text-[12px] text-slate-500">{session?.user.email}</p>
          </div>
          <button
            type="button"
            onClick={newInvoice}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0e1a3d] px-4 py-2 text-[12.5px] font-bold text-white transition-all duration-150 hover:bg-[#16255a] active:scale-[0.98]"
          >
            <FilePlus2 size={14} /> New invoice
          </button>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="icon-btn border border-[#E8ECF4] bg-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 inline-flex rounded-full bg-slate-100 p-1">
          {(['invoices', 'templates'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full px-4 py-1.5 text-[13px] font-semibold capitalize transition-all duration-150',
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">{error}</p>
        ) : tab === 'invoices' ? (
          invoices.length === 0 ? (
            <EmptyState
              icon={<FileText size={20} />}
              title="No invoices yet"
              desc="Create one in the builder and hit Save invoice — it will appear here."
            />
          ) : (
            <div className="space-y-2.5">
              {invoices.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">{row.invoice_no}</p>
                    <p className="truncate text-[12px] text-slate-500">
                      {row.state?.toName || 'No client'} · {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize',
                      STATUS_STYLES[row.status] ?? STATUS_STYLES.draft
                    )}
                  >
                    {row.status}
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-slate-900">
                    {row.currency} {Number(row.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <button type="button" title="Open in builder" onClick={() => openInvoice(row)} className="icon-btn">
                    <Pencil size={14} />
                  </button>
                  <button type="button" title="Email invoice" onClick={() => emailInvoice(row)} className="icon-btn">
                    <Mail size={14} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => removeInvoice(row)}
                    className="icon-btn hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate size={20} />}
            title="No templates yet"
            desc="In the builder, use Save as template to reuse an invoice layout."
          />
        ) : (
          <div className="space-y-2.5">
            {templates.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <LayoutTemplate size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-900">{row.name}</p>
                  <p className="truncate text-[12px] text-slate-500">
                    {row.state?.byName || ''} · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button type="button" title="Use template" onClick={() => openTemplate(row)} className="icon-btn">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => removeTemplate(row)}
                  className="icon-btn hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#E8ECF4] bg-white py-16">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">{icon}</span>
      <h3 className="mt-3 text-[15px] font-bold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-xs text-center text-[13px] text-slate-500">{desc}</p>
    </div>
  );
}
