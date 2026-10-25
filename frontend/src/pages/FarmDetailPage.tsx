import { ArrowLeft, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Api, type RecordKind, type RecordMap } from '../api/endpoints';
import type { Assessment, Farm, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EnvLines } from '../components/charts';
import FarmForm from '../components/FarmForm';
import { RECORD_FORMS } from '../components/recordForms.registry';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Modal, Notice, PageHeader, Pager, Spinner, StatusBadge, SuccessToast, Table } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { daysAgo, fmtDate, fmtDateTime, fmtNum, humanize } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { AlertList } from './AlertsPage';
import { ScreeningHistory } from './ScreeningPage';

const TABS = ['overview', 'vaccinations', 'mortality', 'hygiene', 'visitors', 'environment', 'assessments', 'screening'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview', vaccinations: 'Vaccinations', mortality: 'Mortality', hygiene: 'Hygiene', visitors: 'Visitors',
  environment: 'Environment', assessments: 'Assessments', screening: 'Screening history',
};

export default function FarmDetailPage() {
  const farmId = Number(useParams().farmId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const farm = useAsync(() => Api.farm(farmId), [farmId, version]);
  const closeToast = useCallback(() => setToast(null), []);

  if (!Number.isFinite(farmId)) return <ErrorState error={new Error('Invalid farm identifier.')} />;
  if (farm.loading && !farm.data) return <Spinner />;
  if (farm.error) return <ErrorState error={farm.error} onRetry={farm.reload} />;
  const f = farm.data!;
  const canEdit = user!.role !== 'veterinarian' || f.veterinarian?.id === user!.id;

  const runAssessment = async () => {
    setBusy(true); setActionError(null);
    try {
      const r = await Api.assess(f.id);
      setToast(`Assessment complete: ${humanize(r.assessment.status)}${r.assessment.score !== null ? ` (score ${r.assessment.score})` : ''}. ${r.alerts_created} new alert(s), ${r.alerts_updated} existing alert(s) updated.`);
      setVersion((v) => v + 1);
    } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await Api.deleteFarm(f.id); navigate('/farms', { replace: true }); } catch (e) { setActionError(errorMessage(e)); setDeleting(false); } finally { setBusy(false); }
  };

  return (
    <div>
      <Link to="/farms" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="h-4 w-4" aria-hidden /> All farms</Link>
      <PageHeader
        title={f.name}
        subtitle={<>{humanize(f.farm_type)} farm · {[f.village, f.taluk, f.district].filter(Boolean).join(', ')} {f.is_demo && <Badge>fictional demo farm</Badge>}</>}
        actions={<>
          <Button onClick={runAssessment} loading={busy}><ShieldCheck className="h-4 w-4" aria-hidden /> Run biosecurity assessment</Button>
          {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Edit farm</Button>}
          {user!.role === 'admin' && <Button variant="danger" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</Button>}
        </>}
      />
      {actionError && <div className="mb-4"><ErrorState error={new Error(actionError)} /></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Info label="Pigs" value={fmtNum(f.pig_count)} />
        <Info label="Poultry" value={fmtNum(f.poultry_count)} />
        <Info label="Owner" value={f.owner?.full_name ?? 'Not recorded'} />
        <Info label="Veterinarian" value={f.veterinarian?.full_name ?? 'Unassigned'} />
        <Info label="Latest assessment" value={<StatusBadge value={f.latest_status} />} />
      </div>

      <div role="tablist" aria-label="Farm sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? 'border-brand-600 text-brand-800' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {TAB_LABEL[t]}{t === 'overview' && f.open_alerts > 0 && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 text-xs text-red-700">{f.open_alerts}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" key={`${tab}-${version}`}>
        {tab === 'overview' && <Overview farm={f} onChanged={() => setVersion((v) => v + 1)} />}
        {(['vaccinations', 'mortality', 'hygiene', 'visitors', 'environment'] as const).includes(tab as RecordKind) &&
          <RecordsTab farm={f} kind={tab as RecordKind} user={user!} onChanged={(m) => setToast(m)} />}
        {tab === 'assessments' && <AssessmentHistory farmId={f.id} />}
        {tab === 'screening' && <Card title="Animal-health screening history for this farm"><ScreeningHistory farmId={f.id} /></Card>}
      </div>

      <Modal open={editing} title="Edit farm" onClose={() => setEditing(false)} wide>
        <FarmForm farm={f} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setToast('Farm updated.'); setVersion((v) => v + 1); }} />
      </Modal>
      <ConfirmDialog open={deleting} title="Delete farm?" busy={busy} onCancel={() => setDeleting(false)} onConfirm={doDelete}
        message={<>This permanently deletes <strong>{f.name}</strong> and all of its vaccination, mortality, hygiene, visitor, environmental, assessment, alert and screening records. This cannot be undone.</>} />
      <SuccessToast message={toast} onClose={closeToast} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"><p className="text-xs text-stone-500">{label}</p><div className="mt-0.5 text-sm font-medium">{value}</div></div>;
}

function Overview({ farm, onChanged }: { farm: Farm; onChanged: () => void }) {
  const latest = useAsync(() => Api.assessments(farm.id), [farm.id]);
  const a = latest.data?.items[0];
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <Card title="Latest biosecurity assessment">
          {latest.loading ? <Spinner /> : latest.error ? <ErrorState error={latest.error} onRetry={latest.reload} /> : !a ? (
            <EmptyState title="Not assessed yet" hint="Use “Run biosecurity assessment” to evaluate the farm's records against the configured rules." />
          ) : <AssessmentView a={a} />}
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card title="Active alerts"><AlertList farmId={farm.id} compact onChanged={onChanged} /></Card>
      </div>
    </div>
  );
}

export function AssessmentView({ a }: { a: Assessment }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge value={a.status} />
        {a.score !== null && <span className="text-stone-600">Score <strong>{a.score}</strong> / 100</span>}
        <span className="text-xs text-stone-400">{fmtDateTime(a.assessed_at)} · rules {a.rules_version}</span>
      </div>
      <p className="text-xs text-stone-500">The score summarises recorded biosecurity gaps under provisional rules. It is not a probability of disease.</p>
      <Section title="Triggered rules">
        {a.triggered_rules.length === 0 ? <p className="text-stone-500">No rule was triggered.</p> : (
          <ul className="space-y-2">{a.triggered_rules.map((t) => (
            <li key={t.code} className="rounded-md border border-stone-200 p-2.5">
              <div className="flex items-center gap-2"><StatusBadge value={t.severity} /><span className="font-medium">{t.title}</span><span className="ml-auto text-xs text-stone-400">weight {t.weight}</span></div>
              <p className="mt-1 text-stone-600">{t.detail}</p>
            </li>))}</ul>
        )}
      </Section>
      <Section title="Recommended follow-up"><Bullets items={a.recommendations} /></Section>
      {a.observations.length > 0 && <Section title="Supporting observations"><Bullets items={a.observations} /></Section>}
      {a.data_quality_warnings.length > 0 && <Section title="Data-quality warnings"><Notice><Bullets items={a.data_quality_warnings} /></Notice></Section>}
      <details className="text-xs text-stone-500"><summary className="cursor-pointer">Limitations</summary><Bullets items={a.limitations} /></details>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h3>{children}</div>
);
const Bullets = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

function AssessmentHistory({ farmId }: { farmId: number }) {
  const { data, error, loading, reload } = useAsync(() => Api.assessments(farmId), [farmId]);
  const [open, setOpen] = useState<Assessment | null>(null);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.items.length) return <Card><EmptyState title="No assessments yet" /></Card>;
  return (
    <Card title={`Assessment history (${data.total})`}>
      <Table head={<><th className="th">Assessed</th><th className="th">Status</th><th className="th text-right">Score</th><th className="th">Triggered rules</th><th className="th" /></>}>
        {data.items.map((a) => (
          <tr key={a.id}>
            <td className="td">{fmtDateTime(a.assessed_at)}</td><td className="td"><StatusBadge value={a.status} /></td>
            <td className="td text-right">{a.score ?? '—'}</td><td className="td">{a.triggered_rules.map((t) => t.title).join('; ') || 'None'}</td>
            <td className="td"><Button variant="ghost" className="!py-1" onClick={() => setOpen(a)}>Details</Button></td>
          </tr>
        ))}
      </Table>
      <Modal open={!!open} title="Assessment details" onClose={() => setOpen(null)} wide>{open && <AssessmentView a={open} />}</Modal>
    </Card>
  );
}

// ------------------------------------------------------------------ record tabs
type Col<T> = { label: string; render: (r: T) => ReactNode; right?: boolean };
const yes = (b: boolean) => (b ? 'Yes' : <span className="font-medium text-red-700">No</span>);
const COLUMNS: { [K in RecordKind]: Col<RecordMap[K]>[] } = {
  vaccinations: [
    { label: 'Vaccine', render: (r) => <><span className="font-medium">{r.vaccine_name}</span>{r.target_disease && <span className="block text-xs text-stone-500">{r.target_disease}</span>}</> },
    { label: 'Species', render: (r) => humanize(r.species) },
    { label: 'Status', render: (r) => <StatusBadge value={r.status === 'scheduled' && r.due_on && r.due_on < daysAgo(0) ? 'overdue' : r.status} /> },
    { label: 'Due', render: (r) => fmtDate(r.due_on) },
    { label: 'Administered', render: (r) => fmtDate(r.administered_on) },
    { label: 'Animals', render: (r) => fmtNum(r.animals_covered), right: true },
  ],
  mortality: [
    { label: 'Date', render: (r) => fmtDate(r.observed_on) },
    { label: 'Species', render: (r) => humanize(r.species) },
    { label: 'Deaths', render: (r) => (r.count === 0 ? <span className="text-stone-500">0 (nil report)</span> : <strong>{r.count}</strong>), right: true },
    { label: 'Suspected cause', render: (r) => r.suspected_cause ?? '—' },
  ],
  hygiene: [
    { label: 'Date', render: (r) => fmtDate(r.inspected_on) },
    { label: 'Result', render: (r) => <StatusBadge value={r.result} /> },
    { label: 'Footbath', render: (r) => yes(r.footbath_maintained) },
    { label: 'Cleaned', render: (r) => yes(r.shed_cleaned) },
    { label: 'Disinfected', render: (r) => yes(r.disinfectant_applied) },
    { label: 'Waste', render: (r) => yes(r.waste_disposed_properly) },
    { label: 'PPE', render: (r) => yes(r.protective_clothing_available) },
  ],
  visitors: [
    { label: 'Entry', render: (r) => fmtDateTime(r.entry_time) },
    { label: 'Visitor', render: (r) => <><span className="font-medium">{r.visitor_name}</span><span className="block text-xs text-stone-500">{r.purpose}</span></> },
    { label: 'Precautions', render: (r) => (r.precautions_complete ? <StatusBadge value="pass" /> : <Badge tone="red">Incomplete</Badge>) },
    { label: 'Other farm < 48 h', render: (r) => (r.visited_other_farm_48h ? <Badge tone="amber">Yes</Badge> : 'No') },
  ],
  environment: [
    { label: 'Observed', render: (r) => fmtDateTime(r.observed_at) },
    { label: 'Source', render: (r) => <StatusBadge value={r.source} /> },
    { label: 'Temp °C', render: (r) => fmtNum(r.temperature_c, 1), right: true },
    { label: 'RH %', render: (r) => fmtNum(r.relative_humidity_pct, 1), right: true },
    { label: 'NH₃ ppm', render: (r) => fmtNum(r.ammonia_ppm, 1), right: true },
    { label: 'Shed', render: (r) => r.shed_label ?? '—' },
  ],
};
const LABEL: Record<RecordKind, string> = {
  vaccinations: 'vaccination record', mortality: 'mortality record', hygiene: 'hygiene inspection', visitors: 'visitor entry', environment: 'environmental reading',
};
const FILTERS: Partial<Record<RecordKind, { name: string; options: [string, string][] }>> = {
  vaccinations: { name: 'status', options: [['', 'All statuses'], ['scheduled', 'Scheduled'], ['completed', 'Completed'], ['missed', 'Missed']] },
  hygiene: { name: 'status', options: [['', 'All results'], ['pass', 'Pass'], ['fail', 'Fail']] },
  environment: { name: 'source', options: [['', 'All sources'], ['manual', 'Manual'], ['simulated', 'Simulated']] },
};
const LIMIT = 50;

function RecordsTab<K extends RecordKind>({ farm, kind, user, onChanged }: { farm: Farm; kind: K; user: User; onChanged: (msg: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<{ existing?: RecordMap[K] } | null>(null);
  const [toDelete, setToDelete] = useState<RecordMap[K] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const filterDef = FILTERS[kind];
  const { data, error, loading, reload } = useAsync(
    () => Api.records(farm.id, kind, { date_from: from || undefined, date_to: to || undefined, limit: LIMIT, offset, ...(filterDef && filter ? { [filterDef.name]: filter } : {}) }),
    [farm.id, kind, from, to, filter, offset],
  );
  const canModify = (r: RecordMap[K]) =>
    user.role === 'admin' || (user.role === 'veterinarian' && farm.veterinarian?.id === user.id) || r.recorded_by_id === user.id;
  const FormComp = RECORD_FORMS[kind] as (p: { farm: Farm; existing?: RecordMap[K]; onSaved: () => void; onCancel: () => void }) => ReactNode;
  const cols = COLUMNS[kind] as Col<RecordMap[K]>[];

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true); setErr(null);
    try { await Api.deleteRecord(farm.id, kind, toDelete.id); setToDelete(null); onChanged(`Deleted ${LABEL[kind]}.`); reload(); }
    catch (e) { setErr(errorMessage(e)); setToDelete(null); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {kind === 'environment' && <EnvironmentPanel farm={farm} onSimulated={(m) => { onChanged(m); reload(); }} />}
      <Card title={`${humanize(kind)}${data ? ` (${data.total})` : ''}`}
        actions={<Button onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden /> Add {LABEL[kind]}</Button>}>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-stone-500">From<input type="date" className="input mt-0.5 !py-1" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} /></label>
          <label className="text-xs text-stone-500">To<input type="date" className="input mt-0.5 !py-1" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} /></label>
          {filterDef && (
            <select aria-label="Filter" className="input !w-auto !py-1" value={filter} onChange={(e) => { setFilter(e.target.value); setOffset(0); }}>
              {filterDef.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {(from || to || filter) && <Button variant="ghost" className="!py-1" onClick={() => { setFrom(''); setTo(''); setFilter(''); }}>Clear</Button>}
        </div>
        {err && <div className="mb-3"><ErrorState error={new Error(err)} /></div>}
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : !data?.items.length ? (
          <EmptyState title={`No ${humanize(kind).toLowerCase()} records${from || to || filter ? ' match these filters' : ' yet'}`} hint={kind === 'mortality' ? 'Record zero deaths as a nil report so the assessment knows mortality is being monitored.' : undefined} />
        ) : (
          <>
            <Table head={<>{cols.map((c) => <th key={c.label} className={`th ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}<th className="th">Notes</th><th className="th"><span className="sr-only">Actions</span></th></>}>
              {data.items.map((r) => (
                <tr key={r.id}>
                  {cols.map((c) => <td key={c.label} className={`td ${c.right ? 'text-right' : ''}`}>{c.render(r)}</td>)}
                  <td className="td max-w-xs truncate text-xs text-stone-500" title={r.notes ?? ''}>{r.notes ?? ''}</td>
                  <td className="td whitespace-nowrap text-right">
                    {canModify(r) && <>
                      <button className="rounded p-1 text-stone-500 hover:bg-stone-100" aria-label="Edit" onClick={() => setForm({ existing: r })}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </Table>
            <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <Modal open={!!form} title={`${form?.existing ? 'Edit' : 'Add'} ${LABEL[kind]}`} onClose={() => setForm(null)} wide>
        {form && <FormComp farm={farm} existing={form.existing} onCancel={() => setForm(null)}
          onSaved={() => { setForm(null); onChanged(`${form.existing ? 'Updated' : 'Added'} ${LABEL[kind]}.`); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!toDelete} title={`Delete ${LABEL[kind]}?`} busy={busy} onCancel={() => setToDelete(null)} onConfirm={remove}
        message="This record will be permanently removed. Re-run the assessment afterwards if it affected an alert." />
    </div>
  );
}

function EnvironmentPanel({ farm, onSimulated }: { farm: Farm; onSimulated: (msg: string) => void }) {
  const [days, setDays] = useState(7);
  const [simOpen, setSimOpen] = useState(false);
  const [excursion, setExcursion] = useState(false);
  const [hours, setHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const series = useAsync(() => Api.records(farm.id, 'environment', { date_from: daysAgo(days - 1), limit: 1000 }), [farm.id, days]);
  const rows = (series.data?.items ?? []).slice().reverse().map((r) => ({
    t: fmtDateTime(r.observed_at), temperature_c: r.temperature_c, relative_humidity_pct: r.relative_humidity_pct, ammonia_ppm: r.ammonia_ppm,
  }));
  const sources = new Set(series.data?.items.map((r) => r.source));

  const simulate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await Api.simulate(farm.id, { hours, interval_minutes: 60, include_excursion: excursion });
      setSimOpen(false); onSimulated(`Generated ${r.stored} SIMULATED readings.`); series.reload();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Card title="Environmental monitoring"
      actions={<div className="flex items-center gap-2">
        <select aria-label="Period" className="input !w-auto !py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={2}>Last 2 days</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
        </select>
        <Button variant="secondary" onClick={() => setSimOpen(true)}><Sparkles className="h-4 w-4" aria-hidden /> Simulate telemetry</Button>
      </div>}>
      {sources.has('simulated') && <div className="mb-3"><Notice>This period contains <strong>simulated</strong> values generated by the software simulator. They are demonstration data, not sensor measurements.</Notice></div>}
      {series.error ? <ErrorState error={series.error} onRetry={series.reload} /> : series.loading ? <Spinner /> :
        <EnvLines rows={rows} empty="No readings in this period. Add a manual reading or generate simulated telemetry." />}
      <p className="mt-2 text-xs text-stone-500">Provisional reference ranges used by the rules: temperature 10–32 °C, humidity 40–80 %, ammonia ≤ 25 ppm (engineering placeholders pending expert review).</p>
      <Modal open={simOpen} title="Generate simulated telemetry" onClose={() => setSimOpen(false)}>
        <div className="space-y-4 text-sm">
          <Notice tone="blue">The simulator creates synthetic hourly readings stored with source <strong>simulated</strong>. No physical device is involved.</Notice>
          <label className="block"><span className="label">Hours of data</span>
            <input type="number" min={1} max={336} className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={excursion} onChange={(e) => setExcursion(e.target.checked)} className="h-4 w-4 rounded border-stone-300 text-brand-600" /> Include an out-of-range excursion (to demonstrate the rule)</label>
          {err && <p role="alert" className="text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSimOpen(false)}>Cancel</Button>
            <Button onClick={simulate} loading={busy} disabled={hours < 1 || hours > 336}>Generate</Button></div>
        </div>
      </Modal>
    </Card>
  );
}
