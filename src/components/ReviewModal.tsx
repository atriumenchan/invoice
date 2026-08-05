import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import type { ReviewResult } from '../lib/ai';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  loading: boolean;
  review: ReviewResult | null;
  error: string | null;
  onClose: () => void;
  onProceed?: () => void;
  proceedLabel?: string;
}

const SEVERITY = {
  error: { icon: XCircle, cls: 'bg-rose-50 text-rose-600 border-rose-100' },
  warning: { icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  info: { icon: Info, cls: 'bg-sky-50 text-sky-600 border-sky-100' },
} as const;

export function ReviewModal({ open, loading, review, error, onClose, onProceed, proceedLabel = 'Send anyway' }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-bold text-slate-900">AI Invoice Review</h2>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center py-10 text-slate-500">
              <Loader2 size={22} className="animate-spin text-brand" />
              <p className="mt-3 text-[13px] font-medium">DeepSeek is proofreading the invoice…</p>
            </div>
          ) : error ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">{error}</p>
          ) : review ? (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full text-[15px] font-bold',
                    review.verdict === 'ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  )}
                >
                  {review.score}
                </span>
                <div>
                  <p className="text-[14px] font-bold text-slate-900">
                    {review.verdict === 'ready' ? 'Ready to go' : 'Needs a few fixes'}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {review.issues.length === 0 ? 'No issues found' : `${review.issues.length} issue${review.issues.length > 1 ? 's' : ''} found`}
                  </p>
                </div>
              </div>

              {review.issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">
                  <CheckCircle2 size={15} /> Everything checks out — totals, tax fields, dates and wording.
                </div>
              ) : (
                <div className="space-y-2">
                  {review.issues.map((issue, i) => {
                    const s = SEVERITY[issue.severity] ?? SEVERITY.info;
                    return (
                      <div key={i} className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5', s.cls)}>
                        <s.icon size={15} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold uppercase tracking-wide opacity-70">{issue.field}</p>
                          <p className="text-[13px] font-medium leading-snug text-slate-800">{issue.message}</p>
                          {issue.suggestion && (
                            <p className="mt-0.5 text-[12px] text-slate-500">Fix: {issue.suggestion}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-[#E8ECF4] bg-white py-2.5 text-[13px] font-bold text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            {review && review.issues.length > 0 ? 'Fix first' : 'Close'}
          </button>
          {onProceed && !loading && (
            <button
              type="button"
              onClick={onProceed}
              className="flex-1 rounded-full bg-gradient-to-r from-brand-deep to-brand py-2.5 text-[13px] font-bold text-white shadow-md shadow-brand/20 transition-all duration-150 hover:shadow-lg active:scale-[0.99]"
            >
              {proceedLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
