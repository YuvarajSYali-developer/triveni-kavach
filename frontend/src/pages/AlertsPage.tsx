import { Check, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import type { Alert } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pager, Spinner, StatusBadge } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const LIMIT = 25;

export default function AlertsPage() {
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('');
  return (
    <div>
      <PageHeader title="Biosecurity alerts"
        subtitle="Raised only when a rule-based assessment runs. Repeated assessments update an existing alert instead of duplicating it." />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active (open + acknowledged)</option><option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="">All</option>
          </select>
          <select aria-label="Severity" className="input !w-auto" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
        <AlertList status={status} severity={severity} key={`${status}-${severity}`} />
      </Card>
    </div>
  );
}

export function AlertList({ farmId, status = 'active', severity = '', compact, onChanged }:
  { farmId?: number; status?: string; severity?: string; compact?: boolean; onChanged?: () => void }) {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [resolving, setResolving] = useState<Alert | null>(null);
  const [note, setNote] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => Api.alerts({
    farm_id: farmId, active: status === 'active' ? true : undefined, status: status && status !== 'active' ? status : undefined,
    severity: severity || undefined, limit: compact ? 10 : LIMIT, offset,
  }), [farmId, status, severity, offset]);
  const canResolve = user?.role === 'admin' || user?.role === 'veterinarian';

  const act = async (fn: () => Promise<unknown>, id: number) => {
    setBusyId(id); setErr(null);
    try { await fn(); reload(); onChanged?.(); return true; } catch (e) { setErr(errorMessage(e)); return false; } finally { setBusyId(null); }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.items.length) return <EmptyState title="No alerts" hint={status === 'active' ? 'No active alerts. Alerts appear after an assessment triggers a rule.' : undefined} />;

  return (
    <div>
      {err && <div className="mb-3"><ErrorState error={new Error(err)} /></div>}
      <ul className="divide-y divide-stone-100">
        {data.items.map((a) => (
          <li key={a.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={a.severity} /><span className="text-sm font-medium text-stone-900">{a.title}</span><StatusBadge value={a.status} />
                </div>
                <p className="mt-1 text-sm text-stone-600">{a.message}</p>
                <p className="mt-1 text-xs text-stone-400">
                  {!farmId && <><Link to={`/farms/${a.farm_id}`} className="text-brand-700 hover:underline">{a.farm_name}</Link> · </>}
                  first seen {fmtDateTime(a.first_seen_at)} · last seen {fmtDateTime(a.last_seen_at)}{a.occurrence_count > 1 && ` · seen in ${a.occurrence_count} assessments`}
                  {a.acknowledged_at && ` · acknowledged ${fmtDateTime(a.acknowledged_at)}`}
                  {a.resolved_at && ` · resolved ${fmtDateTime(a.resolved_at)}`}
                </p>
                {a.resolution_note && <p className="mt-1 text-xs text-stone-600">Resolution: {a.resolution_note}</p>}
              </div>
              <div className="flex gap-2">
                {a.status === 'open' && <Button variant="secondary" className="!py-1" loading={busyId === a.id} onClick={() => act(() => Api.acknowledge(a.id), a.id)}><Check className="h-4 w-4" aria-hidden /> Acknowledge</Button>}
                {a.status !== 'resolved' && canResolve && <Button variant="secondary" className="!py-1" onClick={() => { setResolving(a); setNote(''); }}><CheckCheck className="h-4 w-4" aria-hidden /> Resolve</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!compact && <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      <Modal open={!!resolving} title="Resolve alert" onClose={() => setResolving(null)}>
        <p className="text-sm text-stone-600">{resolving?.title} — {resolving?.farm_name}</p>
        <label className="mt-3 block"><span className="label">Resolution note (required)</span>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, and by whom?" /></label>
        <p className="mt-2 text-xs text-stone-500">If the underlying condition is still present, the next assessment will raise a new alert.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResolving(null)}>Cancel</Button>
          <Button disabled={note.trim().length < 3} loading={busyId === resolving?.id}
            onClick={async () => { if (resolving && await act(() => Api.resolve(resolving.id, note.trim()), resolving.id)) setResolving(null); }}>Mark resolved</Button>
        </div>
      </Modal>
    </div>
  );
}
