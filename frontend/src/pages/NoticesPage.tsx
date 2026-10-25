import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { Api } from '../api/endpoints';
import type { OutbreakNotice } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { SourceLink } from '../components/external';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pager, Spinner, StatusBadge, SuccessToast, Table } from '../components/ui';
import { HAVERI_TALUKS } from '../lib/constants';
import { errorMessage } from '../lib/errors';
import { fmtDate, humanize, isoDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const LIMIT = 25;

export default function NoticesPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('active');
  const [district, setDistrict] = useState('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<{ notice?: OutbreakNotice } | null>(null);
  const [deleting, setDeleting] = useState<OutbreakNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { data, error, loading, reload } = useAsync(
    () => Api.outbreaks({ status: status || undefined, district: district || undefined, limit: LIMIT, offset }), [status, district, offset],
  );
  const canAdd = user?.role === 'admin' || user?.role === 'veterinarian';
  const canEdit = (n: OutbreakNotice) => user?.role === 'admin' || n.created_by_id === user?.id;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setErr(null);
    try { await Api.deleteOutbreak(deleting.id); setToast('Notice deleted.'); reload(); } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); setDeleting(null); }
  };

  return (
    <div>
      <PageHeader title="Official disease notices"
        subtitle="Outbreaks reported by government authorities. Each entry links to the official source it was taken from."
        actions={canAdd && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" aria-hidden /> Add notice</Button>} />
      <div className="mb-4"><Notice tone="blue">
        These notices are entered by department staff from official publications (for example state animal husbandry department orders
        or national outbreak reports). The system does not detect or predict outbreaks. Always confirm details at the linked source.
      </Notice></div>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select aria-label="Status" className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
            <option value="active">Active</option><option value="closed">Closed</option><option value="">All</option>
          </select>
          <input aria-label="District" placeholder="Filter by district" className="input !w-56" value={district}
            onChange={(e) => { setDistrict(e.target.value); setOffset(0); }} />
        </div>
        {err && <div className="mb-3"><ErrorState error={new Error(err)} /></div>}
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data?.items.length ? (
          <EmptyState title="No notices" hint={canAdd ? 'Add a notice when an authority publishes an outbreak report for a district.' : 'No official notices have been recorded for this filter.'} />
        ) : (
          <>
            <Table head={<><th className="th">Disease</th><th className="th">Species</th><th className="th">Location</th><th className="th">Reported</th><th className="th">Status</th><th className="th">Source</th><th className="th" /></>}>
              {data.items.map((n) => (
                <tr key={n.id}>
                  <td className="td font-medium">{n.disease}{n.reference && <span className="block text-xs font-normal text-stone-500">Ref. {n.reference}</span>}</td>
                  <td className="td">{n.species === 'both' ? 'Pig & poultry' : humanize(n.species)}</td>
                  <td className="td">{[n.taluk, n.district, n.state].filter(Boolean).join(', ')}</td>
                  <td className="td whitespace-nowrap">{fmtDate(n.reported_on)}{n.closed_on && <span className="block text-xs text-stone-500">closed {fmtDate(n.closed_on)}</span>}</td>
                  <td className="td"><StatusBadge value={n.status === 'active' ? 'open' : 'resolved'} /></td>
                  <td className="td text-xs"><SourceLink name={n.source_name} url={n.source_url} /></td>
                  <td className="td whitespace-nowrap text-right">
                    {canEdit(n) && <button className="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Edit" onClick={() => setEditing({ notice: n })}><Pencil className="h-4 w-4" /></button>}
                    {user?.role === 'admin' && <button className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete" onClick={() => setDeleting(n)}><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </Table>
            <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <Modal open={!!editing} title={editing?.notice ? 'Edit notice' : 'Add official notice'} onClose={() => setEditing(null)} wide>
        {editing && <NoticeForm notice={editing.notice} onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); setToast('Notice saved.'); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!deleting} title="Delete notice?" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}
        message="Prefer marking a notice as closed, which keeps the record. Deleting removes it permanently." />
      <SuccessToast message={toast} onClose={closeToast} />
    </div>
  );
}

const today = () => isoDate(new Date());
const schema = z.object({
  disease: z.string().trim().min(2, 'Required').max(160),
  species: z.enum(['pig', 'poultry', 'both']),
  state: z.string().trim().min(2, 'Required').max(80),
  district: z.string().trim().min(2, 'Required').max(80),
  taluk: z.string().trim().max(80).optional(),
  reported_on: z.string().min(1, 'Required').refine((v) => v <= today(), 'Cannot be in the future'),
  status: z.enum(['active', 'closed']),
  closed_on: z.string().optional(),
  source_name: z.string().trim().min(3, 'Name the publishing authority').max(200),
  source_url: z.string().trim().url('Enter the full link (https://…) to the official notice').max(500),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((v, ctx) => {
  if (v.status === 'closed' && !v.closed_on) ctx.addIssue({ path: ['closed_on'], code: 'custom', message: 'Required for a closed notice' });
  if (v.closed_on && v.closed_on < v.reported_on) ctx.addIssue({ path: ['closed_on'], code: 'custom', message: 'Cannot be before the reported date' });
});
type Form = z.infer<typeof schema>;

function NoticeForm({ notice, onSaved, onCancel }: { notice?: OutbreakNotice; onSaved: () => void; onCancel: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      disease: notice?.disease ?? '', species: notice?.species ?? 'pig', state: notice?.state ?? 'Karnataka',
      district: notice?.district ?? 'Haveri', taluk: notice?.taluk ?? '', reported_on: notice?.reported_on ?? today(),
      status: notice?.status ?? 'active', closed_on: notice?.closed_on ?? '', source_name: notice?.source_name ?? '',
      source_url: notice?.source_url ?? '', reference: notice?.reference ?? '', notes: notice?.notes ?? '',
    },
  });
  const status = watch('status');
  const onSubmit = async (f: Form) => {
    setServerError(null);
    const body = { ...f, taluk: f.taluk || null, reference: f.reference || null, notes: f.notes || null,
      closed_on: f.status === 'closed' ? f.closed_on || null : null };
    try {
      if (notice) await Api.updateOutbreak(notice.id, body); else await Api.createOutbreak(body);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) e.fieldErrors.forEach((fe) => fe.field && setError(fe.field as keyof Form, { message: fe.message }));
      setServerError(errorMessage(e));
    }
  };
  const cls = (bad: unknown) => (bad ? 'input input-error' : 'input');
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Disease (as named in the notice)" htmlFor="disease" error={errors.disease?.message}><input id="disease" className={cls(errors.disease)} {...register('disease')} /></Field>
      <Field label="Species affected" htmlFor="species"><select id="species" className="input" {...register('species')}>
        <option value="pig">Pig</option><option value="poultry">Poultry</option><option value="both">Pig and poultry</option></select></Field>
      <Field label="State" htmlFor="state" error={errors.state?.message}><input id="state" className={cls(errors.state)} {...register('state')} /></Field>
      <Field label="District" htmlFor="district" error={errors.district?.message}><input id="district" className={cls(errors.district)} {...register('district')} /></Field>
      <Field label="Taluk (optional)" htmlFor="taluk"><input id="taluk" list="notice-taluks" className="input" {...register('taluk')} />
        <datalist id="notice-taluks">{HAVERI_TALUKS.map((t) => <option key={t} value={t} />)}</datalist></Field>
      <Field label="Date reported by the authority" htmlFor="reported_on" error={errors.reported_on?.message}><input id="reported_on" type="date" max={today()} className={cls(errors.reported_on)} {...register('reported_on')} /></Field>
      <Field label="Status" htmlFor="status"><select id="status" className="input" {...register('status')}><option value="active">Active</option><option value="closed">Closed (lifted)</option></select></Field>
      {status === 'closed' ? <Field label="Date closed" htmlFor="closed_on" error={errors.closed_on?.message}><input id="closed_on" type="date" max={today()} className={cls(errors.closed_on)} {...register('closed_on')} /></Field> : <div />}
      <Field label="Source (publishing authority)" htmlFor="source_name" error={errors.source_name?.message}><input id="source_name" className={cls(errors.source_name)} {...register('source_name')} /></Field>
      <Field label="Link to the official notice" htmlFor="source_url" error={errors.source_url?.message}><input id="source_url" type="url" placeholder="https://" className={cls(errors.source_url)} {...register('source_url')} /></Field>
      <Field label="Order / bulletin number (optional)" htmlFor="reference"><input id="reference" className="input" {...register('reference')} /></Field>
      <div className="sm:col-span-2"><Field label="Notes (optional)" htmlFor="notes"><textarea id="notes" rows={2} className="input" {...register('notes')} /></Field></div>
      {serverError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={isSubmitting}>Save notice</Button></div>
    </form>
  );
}
