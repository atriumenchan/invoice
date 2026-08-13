import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  FilePlus2,
  FileText,
  LayoutTemplate,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../state/AuthContext';
import { STORAGE_KEY } from '../state/useInvoice';
import { supabase } from '../lib/supabase';
import {
  cloneTemplateAsInvoice,
  deleteInvoice,
  deleteTemplate,
  invoiceNeedsApproval,
  listInvoices,
  listTemplates,
  renameInvoice,
  renameTemplate,
  setInvoiceStatus,
  type InvoiceRow,
  type TemplateRow,
} from '../lib/db';
import { cn } from '../lib/utils';
import type { InvoiceStatus } from '../types';
import { inputCls } from '../components/editor/Field';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-blue-50 text-blue-600',
  approved: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-rose-50 text-rose-600',
  sent: 'bg-blue-50 text-blue-600',
  paid: 'bg-emerald-50 text-emerald-600',
  overdue: 'bg-rose-50 text-rose-600',
  void: 'bg-slate-100 text-slate-400',
};

interface ManagedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

type Tab = 'invoices' | 'approvals' | 'templates' | 'users';

export default function DashboardPage() {
  const { session, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [approvalUser, setApprovalUser] = useState('all');

  const pendingInvoices = useMemo(
    () =>
      invoices
        .filter((r) => invoiceNeedsApproval(r))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [invoices]
  );

  const pendingSenders = useMemo(() => {
    const emails = [...new Set(pendingInvoices.map((r) => r.created_by_email).filter(Boolean) as string[])];
    emails.sort();
    return emails;
  }, [pendingInvoices]);

  const filteredPending = useMemo(
    () => (approvalUser === 'all' ? pendingInvoices : pendingInvoices.filter((r) => r.created_by_email === approvalUser)),
    [pendingInvoices, approvalUser]
  );

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<InvoiceStatus, number>> = {};
    for (const row of invoices) counts[row.status as InvoiceStatus] = (counts[row.status as InvoiceStatus] ?? 0) + 1;
    return counts;
  }, [invoices]);

  const filteredInvoices = useMemo(
    () => (statusFilter === 'all' ? invoices : invoices.filter((r) => r.status === statusFilter)),
    [invoices, statusFilter]
  );

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
      JSON.stringify({
        ...row.state,
        invoiceId: row.id,
        invNo: row.invoice_no,
        status: row.status as InvoiceStatus,
        createdByEmail: row.created_by_email,
      })
    );
    navigate('/');
  };

  const cloneTemplate = async (row: TemplateRow) => {
    try {
      await cloneTemplateAsInvoice(row, invoices.map((i) => i.title ?? ''));
      await load();
      setTab('invoices');
    } catch (e) {
      alert('Could not clone: ' + (e as Error).message);
    }
  };

  const renameInvoiceRow = async (row: InvoiceRow) => {
    const title = window.prompt('Invoice name', row.title ?? row.invoice_no);
    if (!title || title === row.title) return;
    await renameInvoice(row.id, title);
    load();
  };

  const renameTemplateRow = async (row: TemplateRow) => {
    const name = window.prompt('Template name', row.name);
    if (!name || name === row.name) return;
    await renameTemplate(row.id, name);
    load();
  };

  const moderate = async (row: InvoiceRow, status: 'approved' | 'rejected') => {
    await setInvoiceStatus(row.id, status);
    load();
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

  const renderInvoiceCard = (row: InvoiceRow) => (
    <div
      key={row.id}
      className="flex items-center gap-3 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-slate-900">
          {row.title || row.invoice_no}
          <span className="ml-2 text-[12px] font-medium text-slate-400">{row.invoice_no}</span>
        </p>
        <p className="truncate text-[12px] text-slate-500">
          {row.state?.toName || 'No client'} · {new Date(row.created_at).toLocaleDateString()}
          {isAdmin && row.created_by_email ? ` · ${row.created_by_email}` : ''}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize',
          STATUS_STYLES[row.status] ?? STATUS_STYLES.draft
        )}
      >
        {invoiceNeedsApproval(row) ? 'waiting for approval' : row.status}
      </span>
      <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-slate-900">
        {row.currency} {Number(row.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
      {isAdmin && invoiceNeedsApproval(row) && (
        <>
          <button
            type="button"
            title="Approve"
            onClick={() => moderate(row, 'approved')}
            className="icon-btn bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            title="Reject"
            onClick={() => moderate(row, 'rejected')}
            className="icon-btn bg-rose-50 text-rose-500 hover:bg-rose-100"
          >
            <X size={14} />
          </button>
        </>
      )}
      <button type="button" title="Rename" onClick={() => renameInvoiceRow(row)} className="icon-btn">
        <Pencil size={14} />
      </button>
      <button type="button" title="Open in builder" onClick={() => openInvoice(row)} className="icon-btn">
        <FileText size={14} />
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
  );

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
          {(
            [
              'invoices',
              ...(isAdmin ? (['approvals'] as const) : []),
              'templates',
              ...(isAdmin ? (['users'] as const) : []),
            ] as const
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold capitalize transition-all duration-150',
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t === 'invoices' ? 'All' : t}
              {t === 'approvals' && pendingInvoices.length > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10.5px] font-bold text-white">
                  {pendingInvoices.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">{error}</p>
        ) : tab === 'users' && isAdmin ? (
          <UsersPanel />
        ) : tab === 'approvals' && isAdmin ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label="All"
                count={pendingInvoices.length}
                active={approvalUser === 'all'}
                onClick={() => setApprovalUser('all')}
              />
              <select
                value={approvalUser === 'all' ? '' : approvalUser}
                onChange={(e) => setApprovalUser(e.target.value || 'all')}
                className={cn(inputCls, 'h-9 max-w-xs py-0 text-[12.5px]')}
              >
                <option value="">Filter by user who sent it</option>
                {pendingSenders.map((email) => (
                  <option key={email} value={email}>
                    {email} ({pendingInvoices.filter((r) => r.created_by_email === email).length})
                  </option>
                ))}
              </select>
            </div>
            {filteredPending.length === 0 ? (
              <EmptyState
                icon={<Clock size={20} />}
                title={pendingInvoices.length === 0 ? 'All caught up' : 'No invoices from this user'}
                desc="Invoices sent for approval will show up here."
              />
            ) : (
              <div className="space-y-2.5">{filteredPending.map((row) => renderInvoiceCard(row))}</div>
            )}
          </div>
        ) : tab === 'invoices' ? (
          invoices.length === 0 ? (
            <EmptyState
              icon={<FileText size={20} />}
              title="No invoices yet"
              desc="Create one in the builder and hit Save invoice — it will appear here."
            />
          ) : (
            <div className="space-y-3">
              {!isAdmin && pendingInvoices.length > 0 && statusFilter === 'all' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className="w-full rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-left text-[13px] font-semibold text-blue-700"
                >
                  {pendingInvoices.length} invoice{pendingInvoices.length === 1 ? '' : 's'} waiting for approval — view
                </button>
              )}
              <div className="flex flex-wrap gap-1.5">
                <FilterChip label="All" count={invoices.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                {(Object.keys(STATUS_STYLES) as InvoiceStatus[])
                  .filter((s) => statusCounts[s])
                  .map((s) => (
                    <FilterChip
                      key={s}
                      label={s === 'pending' ? 'waiting for approval' : s}
                      count={statusCounts[s] ?? 0}
                      active={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    />
                  ))}
              </div>
              {filteredInvoices.length === 0 ? (
                <EmptyState icon={<FileText size={20} />} title="No invoices in this filter" desc="Try a different status." />
              ) : (
                <div className="space-y-2.5">{filteredInvoices.map((row) => renderInvoiceCard(row))}</div>
              )}
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
                <button
                  type="button"
                  title="Clone as new invoice"
                  onClick={() => cloneTemplate(row)}
                  className="icon-btn bg-brand/5 text-brand hover:bg-brand/10"
                >
                  <Copy size={14} />
                </button>
                <button type="button" title="Rename" onClick={() => renameTemplateRow(row)} className="icon-btn">
                  <Pencil size={14} />
                </button>
                <button type="button" title="Use template" onClick={() => openTemplate(row)} className="icon-btn">
                  <FileText size={14} />
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

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] font-semibold capitalize transition-all duration-150',
        active
          ? 'border-brand bg-brand/10 text-brand-deep'
          : 'border-[#E8ECF4] bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      )}
    >
      {label} <span className="text-slate-400">{count}</span>
    </button>
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

function UsersPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const call = useCallback(async (method: 'GET' | 'POST', body?: object) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not signed in');
    const r = await fetch('/api/users', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || `Request failed (${r.status})`);
    return json;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const json = await call('GET');
      setUsers(json.users);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingUsers(false);
    }
  }, [call]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const createUser = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const json = await call('POST', { email, password });
      setMsg(`Account created for ${json.email} — share the password with them.`);
      setEmail('');
      setPassword('');
      loadUsers();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E8ECF4] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        <h3 className="flex items-center gap-2 text-[14px] font-bold text-slate-900">
          <UserPlus size={15} className="text-brand" /> Create user account
        </h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            type="email"
            placeholder="user@admexo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(inputCls, 'max-w-xs flex-1')}
          />
          <input
            type="text"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(inputCls, 'max-w-xs flex-1')}
          />
          <button
            type="button"
            onClick={createUser}
            disabled={busy || !email || password.length < 6}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0e1a3d] px-4 text-[13px] font-bold text-white transition-all duration-150 hover:bg-[#16255a] active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Create
          </button>
        </div>
        {msg && <p className="mt-2 text-[12.5px] font-semibold text-emerald-600">{msg}</p>}
        {err && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{err}</p>}
      </div>

      {loadingUsers ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-brand" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-2xl border border-[#E8ECF4] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <Users size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-slate-900">{u.email}</p>
                <p className="text-[12px] text-slate-500">
                  Created {new Date(u.created_at).toLocaleDateString()}
                  {u.last_sign_in_at ? ` · last sign-in ${new Date(u.last_sign_in_at).toLocaleDateString()}` : ' · never signed in'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
