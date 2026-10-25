import { zodResolver } from '@hookform/resolvers/zod';
import { Database, FileUp, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { Api } from '../api/endpoints';
import type { DataGovPreview, ImportResult, LivestockStat } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { SERIES, SimpleBars } from '../components/charts';
import { SourceLink } from '../components/external';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner, SuccessToast, Table } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { fmtNum } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export default function StatisticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [state, setState] = useState('');
  const [year, setYear] = useState('');
  const [dialog, setDialog] = useState<'manual' | 'csv' | 'datagov' | null>(null);
  const [deleting, setDeleting] = useState<LivestockStat | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { data, error, loading, reload } = useAsync(() => Api.livestockStats(), []);
  const items = useMemo(() => data?.items ?? [], [data]);
  const states = useMemo(() => [...new Set(items.map((i) => i.state))].sort(), [items]);
  const years = useMemo(() => [...new Set(items.map((i) => i.reference_year))].sort((a, b) => b - a), [items]);
  const rows = items.filter((i) => (!state || i.state === state) && (!year || i.reference_year === Number(year)));
  const chart = (species: 'pig' | 'poultry') =>
    rows.filter((r) => r.species === species).sort((a, b) => b.population - a.population).slice(0, 15)
      .map((r) => ({ district: r.district, population: r.population }));
  const singleYear = new Set(rows.map((r) => r.reference_year)).size === 1;

  const done = (msg: string) => { setDialog(null); setToast(msg); reload(); };
  const remove = async () => {
    if (!deleting) return;
    try { await Api.deleteLivestockStat(deleting.id); setToast('Deleted.'); reload(); } catch (e) { setToast(errorMessage(e)); } finally { setDeleting(null); }
  };

  return (
    <div>
      <PageHeader title="Livestock statistics" subtitle="Official district-level pig and poultry populations, each with its source and reference year."
        actions={isAdmin && <>
          <Button variant="secondary" onClick={() => setDialog('datagov')}><Database className="h-4 w-4" aria-hidden /> Import from data.gov.in</Button>
          <Button variant="secondary" onClick={() => setDialog('csv')}><FileUp className="h-4 w-4" aria-hidden /> Import CSV</Button>
          <Button onClick={() => setDialog('manual')}><Plus className="h-4 w-4" aria-hidden /> Add figure</Button>
        </>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Spinner /> : !items.length ? (
        <Card><EmptyState title="No official statistics loaded yet"
          hint={isAdmin ? 'Import district figures from data.gov.in or a CSV prepared from the published Livestock Census tables, or enter them one by one. Always record the source.' : 'An administrator has not imported official statistics yet.'} /></Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <select aria-label="State" className="input !w-auto" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select aria-label="Reference year" className="input !w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          {!singleYear && <Notice>The selection mixes reference years; choose one year to compare districts fairly.</Notice>}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Pig population by district (top 15)"><SimpleBars rows={chart('pig')} x="district" y="population" yLabel="Pigs" color={SERIES.pig} empty="No pig figures for this selection." /></Card>
            <Card title="Poultry population by district (top 15)"><SimpleBars rows={chart('poultry')} x="district" y="population" yLabel="Poultry" color={SERIES.poultry} empty="No poultry figures for this selection." /></Card>
          </div>
          <Card title={`Figures (${rows.length})`}>
            <Table head={<><th className="th">District</th><th className="th">State</th><th className="th">Species</th><th className="th text-right">Population</th><th className="th">Year</th><th className="th">Source</th><th className="th">Entered via</th>{isAdmin && <th className="th" />}</>}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td">{r.district}</td><td className="td">{r.state}</td><td className="td capitalize">{r.species}</td>
                  <td className="td text-right">{fmtNum(r.population)}</td><td className="td">{r.reference_year}</td>
                  <td className="td text-xs"><SourceLink name={r.source_name} url={r.source_url} /></td>
                  <td className="td"><Badge>{r.import_method}</Badge></td>
                  {isAdmin && <td className="td text-right"><button className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
      <Modal open={dialog === 'manual'} title="Add an official figure" onClose={() => setDialog(null)} wide>
        <ManualForm onCancel={() => setDialog(null)} onSaved={() => done('Figure saved.')} />
      </Modal>
      <Modal open={dialog === 'csv'} title="Import statistics from CSV" onClose={() => setDialog(null)} wide>
        <CsvImport onCancel={() => setDialog(null)} onDone={(r) => done(`Imported: ${r.created} new, ${r.updated} updated, ${r.skipped.length} skipped.`)} />
      </Modal>
      <Modal open={dialog === 'datagov'} title="Import from data.gov.in" onClose={() => setDialog(null)} wide>
        <DataGovImport onCancel={() => setDialog(null)} onDone={(r) => done(`Imported: ${r.created} new, ${r.updated} updated, ${r.skipped.length} skipped.`)} />
      </Modal>
      <ConfirmDialog open={!!deleting} title="Delete figure?" onCancel={() => setDeleting(null)} onConfirm={remove}
        message={`${deleting?.district} ${deleting?.species} (${deleting?.reference_year}) will be removed.`} />
      <SuccessToast message={toast} onClose={closeToast} />
    </div>
  );
}

const thisYear = new Date().getFullYear();
const manualSchema = z.object({
  state: z.string().trim().min(2, 'Required').max(80),
  district: z.string().trim().min(2, 'Required').max(80),
  species: z.enum(['pig', 'poultry']),
  population: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative'),
  reference_year: z.coerce.number().int().min(1950).max(thisYear, 'Cannot be in the future'),
  source_name: z.string().trim().min(3, 'Name the publication, e.g. 20th Livestock Census').max(200),
  source_url: z.string().trim().url('Enter the full link (https://…)').max(500),
});
type ManualFormValues = z.infer<typeof manualSchema>;

function ManualForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<ManualFormValues>({
    resolver: zodResolver(manualSchema), defaultValues: { state: 'Karnataka', species: 'pig', reference_year: 2019 },
  });
  const submit = async (f: ManualFormValues) => {
    setServerError(null);
    try { await Api.createLivestockStat(f); onSaved(); } catch (e) {
      if (e instanceof ApiError) e.fieldErrors.forEach((fe) => fe.field && setError(fe.field as keyof ManualFormValues, { message: fe.message }));
      setServerError(errorMessage(e));
    }
  };
  const cls = (bad: unknown) => (bad ? 'input input-error' : 'input');
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
      <Field label="State" htmlFor="st" error={errors.state?.message}><input id="st" className={cls(errors.state)} {...register('state')} /></Field>
      <Field label="District" htmlFor="di" error={errors.district?.message}><input id="di" className={cls(errors.district)} {...register('district')} /></Field>
      <Field label="Species" htmlFor="sp"><select id="sp" className="input" {...register('species')}><option value="pig">Pig</option><option value="poultry">Poultry</option></select></Field>
      <Field label="Population" htmlFor="po" error={errors.population?.message}><input id="po" type="number" min={0} className={cls(errors.population)} {...register('population')} /></Field>
      <Field label="Reference year" htmlFor="yr" error={errors.reference_year?.message}><input id="yr" type="number" className={cls(errors.reference_year)} {...register('reference_year')} /></Field>
      <Field label="Source publication" htmlFor="sn" error={errors.source_name?.message}><input id="sn" className={cls(errors.source_name)} {...register('source_name')} /></Field>
      <div className="sm:col-span-2"><Field label="Link to the source" htmlFor="su" error={errors.source_url?.message}><input id="su" type="url" placeholder="https://" className={cls(errors.source_url)} {...register('source_url')} /></Field></div>
      {serverError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={isSubmitting}>Save</Button></div>
    </form>
  );
}

function CsvImport({ onDone, onCancel }: { onDone: (r: ImportResult) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try { const r = await Api.importLivestockCsv(file); setResult(r); if (!r.skipped.length) onDone(r); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4 text-sm">
      <p>UTF-8 CSV with this header row (one row per district and species):</p>
      <pre className="overflow-x-auto rounded bg-stone-100 p-2 text-xs">state,district,species,population,reference_year,source_name,source_url</pre>
      <p className="text-stone-600"><code>species</code> is <code>pig</code> or <code>poultry</code>. Prepare it from the published census tables and put the link to the table you used in <code>source_url</code>. Existing figures with the same district, species, year and source are updated.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
      {err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">{err}</p>}
      {result && (
        <Notice>Imported {result.created} new and {result.updated} updated. Skipped {result.skipped.length}:
          <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul></Notice>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={result ? () => onDone(result) : onCancel}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && <Button onClick={run} loading={busy} disabled={!file}>Import</Button>}
      </div>
    </div>
  );
}

function DataGovImport({ onDone, onCancel }: { onDone: (r: ImportResult) => void; onCancel: () => void }) {
  const status = useAsync(() => Api.dataGovStatus(), []);
  const [resourceId, setResourceId] = useState('');
  const [preview, setPreview] = useState<DataGovPreview | null>(null);
  const [map, setMap] = useState({ state_field: '', district_field: '', pig_field: '', poultry_field: '', state_filter: 'Karnataka', reference_year: '2019', source_name: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const loadPreview = async () => {
    setBusy(true); setErr(null); setPreview(null);
    try {
      const p = await Api.dataGovPreview(resourceId.trim());
      setPreview(p);
      setMap((m) => ({ ...m, source_name: m.source_name || p.title || '' }));
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const runImport = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await Api.dataGovImport({ resource_id: resourceId.trim(), ...map, pig_field: map.pig_field || null,
        poultry_field: map.poultry_field || null, state_filter: map.state_filter || null, reference_year: Number(map.reference_year) });
      setResult(r);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  if (status.loading) return <Spinner />;
  if (status.data && !status.data.configured) {
    return (
      <div className="space-y-3 text-sm">
        <Notice>The server has no data.gov.in API key. Register free at data.gov.in, generate an API key under “My Account”, and set it as <code>DATA_GOV_IN_API_KEY</code> on the backend (see docs/deployment.md).</Notice>
        <div className="flex justify-end"><Button variant="secondary" onClick={onCancel}>Close</Button></div>
      </div>
    );
  }
  const fieldSelect = (key: keyof typeof map, label: string, optional = false) => (
    <Field label={label} htmlFor={key}>
      <select id={key} className="input" value={map[key]} onChange={(e) => setMap({ ...map, [key]: e.target.value })}>
        <option value="">{optional ? '— not imported —' : '— choose a field —'}</option>
        {preview?.fields.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.id})</option>)}
      </select>
    </Field>
  );
  const ready = map.state_field && map.district_field && (map.pig_field || map.poultry_field) && map.source_name.length >= 3 && /^\d{4}$/.test(map.reference_year);

  return (
    <div className="space-y-4 text-sm">
      <p className="text-stone-600">1. Find a district-wise livestock dataset on data.gov.in and copy its <strong>resource ID</strong> from the API tab of the resource page.</p>
      <div className="flex gap-2">
        <input aria-label="Resource ID" className="input" placeholder="e.g. 1a2b3c4d-…" value={resourceId} onChange={(e) => setResourceId(e.target.value)} />
        <Button onClick={loadPreview} loading={busy && !preview} disabled={resourceId.trim().length < 8}>Preview</Button>
      </div>
      {preview && (
        <>
          <Notice tone="blue"><strong>{preview.title ?? 'Untitled resource'}</strong> — {preview.total ?? '?'} records. <a href={preview.source_url} target="_blank" rel="noopener noreferrer" className="underline">Open on data.gov.in</a></Notice>
          <div className="max-h-40 overflow-auto rounded border border-stone-200">
            <table className="min-w-full text-xs"><thead><tr>{preview.fields.map((f) => <th key={f.id} className="th">{f.id}</th>)}</tr></thead>
              <tbody>{preview.sample_records.map((r, i) => <tr key={i}>{preview.fields.map((f) => <td key={f.id} className="td">{String(r[f.id] ?? '')}</td>)}</tr>)}</tbody></table>
          </div>
          <p className="text-stone-600">2. Match the dataset's columns. Values that are not whole numbers are skipped and listed — never estimated.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldSelect('state_field', 'State column')}
            {fieldSelect('district_field', 'District column')}
            {fieldSelect('pig_field', 'Pig population column', true)}
            {fieldSelect('poultry_field', 'Poultry population column', true)}
            <Field label="Only this state (optional)" htmlFor="sf"><input id="sf" className="input" value={map.state_filter} onChange={(e) => setMap({ ...map, state_filter: e.target.value })} /></Field>
            <Field label="Reference year of the data" htmlFor="ry"><input id="ry" className="input" value={map.reference_year} onChange={(e) => setMap({ ...map, reference_year: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Source name to record" htmlFor="sn2"><input id="sn2" className="input" value={map.source_name} onChange={(e) => setMap({ ...map, source_name: e.target.value })} /></Field></div>
          </div>
        </>
      )}
      {err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">{err}</p>}
      {result && (
        <Notice>Imported {result.created} new and {result.updated} updated; skipped {result.skipped.length}.
          {result.skipped.length > 0 && <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}</Notice>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={result ? () => onDone(result) : onCancel}>{result ? 'Close' : 'Cancel'}</Button>
        {preview && !result && <Button onClick={runImport} loading={busy} disabled={!ready}>Import</Button>}
      </div>
    </div>
  );
}
