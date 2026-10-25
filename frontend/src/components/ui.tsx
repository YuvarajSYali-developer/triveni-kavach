import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { errorMessage } from '../lib/errors';
import { humanize } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'border border-stone-200 bg-white text-stone-700 shadow-sm hover:border-stone-300 hover:bg-stone-50 disabled:text-stone-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
};

export function Button({
  variant = 'primary', loading, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200/80 bg-white shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3.5">
          {title && <h2 className="font-display text-[15px] font-semibold text-stone-900">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  green: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  gray: 'bg-stone-100 text-stone-600 ring-stone-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
} as const;
export type Tone = keyof typeof TONES;
const DOT: Record<Tone, string> = { green: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500', gray: 'bg-stone-400', blue: 'bg-sky-500', violet: 'bg-violet-500' };

export function Badge({ tone = 'gray', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden />}
      {children}
    </span>
  );
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
  if (!value) return <Badge dot>Not assessed</Badge>;
  return <Badge dot tone={STATUS_TONES[value] ?? 'gray'}>{STATUS_TEXT[value] ?? humanize(value)}</Badge>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-stone-500">
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
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-red-100"><AlertTriangle className="h-4 w-4" aria-hidden /></span>
        <div className="flex-1">
          <p className="font-medium">{errorMessage(error)}</p>
          <p className="mt-0.5 text-red-700/90">{hint}</p>
        </div>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} className="!py-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Inbox className="h-6 w-6" aria-hidden /></span>
      <p className="font-display text-sm font-semibold text-stone-800">{title}</p>
      {hint && <p className="max-w-md text-sm text-stone-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'blue' | 'green'; children: ReactNode }) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-sky-200 bg-sky-50 text-sky-900',
    green: 'border-brand-200 bg-brand-50 text-brand-900',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function SuccessToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-md animate-fade-up items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lift">
      <CheckCircle2 className="h-5 w-5 flex-none text-brand-400" aria-hidden /> <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="ml-2 rounded p-0.5 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-900/50 p-4 backdrop-blur-sm sm:p-10">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`w-full animate-fade-up ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white shadow-lift`}>
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
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
      <div className="mt-6 flex justify-end gap-2">
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
      {error && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export type Accent = 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'teal';
const ACCENTS: Record<Accent, string> = {
  green: 'bg-brand-50 text-brand-600', blue: 'bg-sky-50 text-sky-600', amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600', violet: 'bg-violet-50 text-violet-600', teal: 'bg-teal-50 text-teal-600',
};

export function StatCard({ label, value, hint, tone = 'default', icon, accent = 'green' }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'warn' | 'danger'; icon?: ReactNode; accent?: Accent;
}) {
  const bar = tone === 'danger' ? 'before:bg-red-500' : tone === 'warn' ? 'before:bg-amber-400' : 'before:bg-transparent';
  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200/80 bg-white p-4 shadow-card transition hover:shadow-lift before:absolute before:inset-x-0 before:top-0 before:h-1 ${bar}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-stone-500">{label}</p>
        {icon && <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${ACCENTS[accent]}`}>{icon}</span>}
      </div>
      <p className="mt-1 font-display text-[28px] font-bold leading-tight text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-100">
        <thead className="bg-stone-50/80"><tr>{head}</tr></thead>
        {!empty && <tbody className="divide-y divide-stone-100 [&>tr]:transition-colors [&>tr:hover]:bg-brand-50/40">{children}</tbody>}
      </table>
    </div>
  );
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
        <Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
