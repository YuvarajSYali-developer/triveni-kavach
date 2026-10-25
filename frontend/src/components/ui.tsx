import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { errorMessage } from '../lib/errors';
import { humanize } from '../lib/format';


type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:text-stone-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-stone-600 hover:bg-stone-100',
};

export function Button({
  variant = 'primary', loading, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-stone-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-stone-800">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  green: 'bg-brand-50 text-brand-800 ring-brand-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  gray: 'bg-stone-100 text-stone-700 ring-stone-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  low: 'green', pass: 'green', completed: 'green', resolved: 'green', manual: 'blue',
  moderate: 'amber', medium: 'amber', acknowledged: 'amber', scheduled: 'blue', simulated: 'violet',
  high: 'red', fail: 'red', open: 'red', missed: 'red', overdue: 'red', device: 'gray',
  insufficient_data: 'gray', not_assessed: 'gray',
};
const STATUS_TEXT: Record<string, string> = { insufficient_data: 'Insufficient data', not_assessed: 'Not assessed' };

/** One badge vocabulary for risk status, severity, alert state, inspection result and data source. */
export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge>Not assessed</Badge>;
  return <Badge tone={STATUS_TONES[value] ?? 'gray'}>{STATUS_TEXT[value] ?? humanize(value)}</Badge>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const hint =
    status === 0 ? 'Start the backend (see README) and retry.'
      : status === 404 ? 'It may have been deleted, or you may not have access to it.'
        : status === 403 ? 'Ask a department administrator if you need access.'
          : 'Retry; if the problem continues, check the backend logs.';
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">{errorMessage(error)}</p>
          <p className="mt-1 text-red-700">{hint}</p>
        </div>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} className="!py-1">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Inbox className="h-8 w-8 text-stone-300" aria-hidden />
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-stone-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'blue' | 'green'; children: ReactNode }) {
  const cls = { amber: 'border-amber-200 bg-amber-50 text-amber-900', blue: 'border-sky-200 bg-sky-50 text-sky-900', green: 'border-brand-200 bg-brand-50 text-brand-900' }[tone];
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function SuccessToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md bg-brand-800 px-4 py-3 text-sm text-white shadow-lg">
      <CheckCircle2 className="h-4 w-4" aria-hidden /> {message}
      <button onClick={onClose} aria-label="Dismiss" className="ml-2 opacity-80 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:p-8">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy,
}: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="text-sm text-stone-600">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'warn' | 'danger'; icon?: ReactNode }) {
  const ring = tone === 'danger' ? 'border-red-200' : tone === 'warn' ? 'border-amber-200' : 'border-stone-200';
  return (
    <div className={`rounded-lg border ${ring} bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
        {icon && <span className="text-stone-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-200">
        <thead className="bg-stone-50"><tr>{head}</tr></thead>
        {!empty && <tbody className="divide-y divide-stone-100">{children}</tbody>}
      </table>
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
