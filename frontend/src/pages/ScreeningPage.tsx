import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Api } from '../api/endpoints';
import type { ModelStatus, Screening } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Notice, PageHeader, Pager, Spinner, Table } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { fmtDateTime, humanize } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const num = (label: string, min: number, max: number, int = false) => {
  let s = z.coerce.number({ invalid_type_error: `${label} is required` }).min(min, `${label}: minimum ${min}`).max(max, `${label}: maximum ${max}`);
  if (int) s = s.int('Whole numbers only');
  return s;
};
const schema = z.object({
  species: z.string().min(1, 'Choose a species'),
  farm_id: z.string().optional(),
  animal_identifier: z.string().trim().max(60).optional(),
  body_temperature_c: num('Temperature', 30, 45),
  heart_rate_bpm: num('Heart rate', 20, 300, true),
  respiratory_rate_bpm: num('Respiratory rate', 4, 150, true),
  activity_level: num('Activity level', 0, 100, true),
  symptoms: z.array(z.string()),
});
type Form = z.infer<typeof schema>;

export default function ScreeningPage() {
  const status = useAsync(() => Api.modelStatus(), []);
  const [historyVersion, setHistoryVersion] = useState(0);
  return (
    <div>
      <PageHeader title="Animal-health screening" subtitle="Exploratory screening with a reused machine-learning model. Not a diagnostic tool." />
      <div className="mb-6"><Notice>
        <strong>Read before use:</strong> the model was trained only on synthetic (computer-generated) data and has not been validated on real animals.
        Outputs are uncalibrated model scores, not disease probabilities, and do not establish a diagnosis. Poultry is not supported.
        If an animal appears unwell, contact the assigned veterinarian.
      </Notice></div>
      {status.loading ? <Spinner label="Loading model status…" /> : status.error ? <ErrorState error={status.error} onRetry={status.reload} /> : !status.data!.available ? (
        <Card title="Screening model unavailable">
          <p className="text-sm text-stone-700">The model artifacts could not be loaded, so no screening can be performed. No substitute predictions are generated.</p>
          <p className="mt-2 rounded bg-stone-100 p-2 font-mono text-xs text-stone-600">{status.data!.error}</p>
        </Card>
      ) : (
        <ScreeningForm status={status.data!} onDone={() => setHistoryVersion((v) => v + 1)} />
      )}
      <div className="mt-6"><Card title="Screening history"><ScreeningHistory key={historyVersion} /></Card></div>
    </div>
  );
}

function ScreeningForm({ status, onDone }: { status: ModelStatus; onDone: () => void }) {
  const farms = useAsync(() => Api.farms({ limit: 200 }), []);
  const [result, setResult] = useState<Screening | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const species = status.enabled_species[0] ?? '';
  const ranges = status.training_vital_ranges[species] ?? null;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { species, symptoms: [], body_temperature_c: 39.2, heart_rate_bpm: 70, respiratory_rate_bpm: 15, activity_level: 90, farm_id: '', animal_identifier: '' },
  });
  const eligibleFarms = farms.data?.items.filter((f) => f.farm_type !== 'poultry') ?? [];

  const onSubmit = async (f: Form) => {
    setServerError(null); setResult(null);
    try {
      const r = await Api.screen({ ...f, farm_id: f.farm_id ? Number(f.farm_id) : null, animal_identifier: f.animal_identifier || null });
      setResult(r); onDone();
    } catch (e) { setServerError(errorMessage(e)); }
  };
  const hint = (k: string) => (ranges?.[k] ? `Training range for ${species}: ${ranges[k][0]}–${ranges[k][1]}` : undefined);
  const cls = (bad: unknown) => (bad ? 'input input-error' : 'input');

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card title="Screening request" className="lg:col-span-3">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
          <Field label="Species" htmlFor="species" error={errors.species?.message} hint={`Labels the model has seen for ${species}: ${(status.labels_by_enabled_species[species] ?? []).join(', ')}.`}>
            <select id="species" className="input" {...register('species')}>
              {status.enabled_species.map((s) => <option key={s} value={s}>{s}</option>)}
              {status.unsupported_species.map((u) => <option key={u.species} disabled>{u.species} — not supported</option>)}
            </select>
          </Field>
          <Field label="Farm (optional)" htmlFor="farm_id" hint="Links the record to a farm you can access. Poultry-only farms are excluded.">
            <select id="farm_id" className="input" {...register('farm_id')}>
              <option value="">— not linked —</option>
              {eligibleFarms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Animal ID / tag (optional)" htmlFor="animal_identifier"><input id="animal_identifier" className="input" {...register('animal_identifier')} /></Field>
          <div />
          <Field label="Body temperature (°C)" htmlFor="t" error={errors.body_temperature_c?.message} hint={hint('Body_Temperature')}><input id="t" type="number" step="0.1" className={cls(errors.body_temperature_c)} {...register('body_temperature_c')} /></Field>
          <Field label="Heart rate (beats/min)" htmlFor="hr" error={errors.heart_rate_bpm?.message} hint={hint('Heart_Rate')}><input id="hr" type="number" className={cls(errors.heart_rate_bpm)} {...register('heart_rate_bpm')} /></Field>
          <Field label="Respiratory rate (breaths/min)" htmlFor="rr" error={errors.respiratory_rate_bpm?.message} hint={hint('Respiratory_Rate')}><input id="rr" type="number" className={cls(errors.respiratory_rate_bpm)} {...register('respiratory_rate_bpm')} /></Field>
          <Field label="Activity level (0 = immobile, 100 = fully active)" htmlFor="act" error={errors.activity_level?.message} hint={hint('Activity_Level')}><input id="act" type="number" className={cls(errors.activity_level)} {...register('activity_level')} /></Field>
          <fieldset className="sm:col-span-2">
            <legend className="label">Observed symptoms (as defined by the original model)</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {status.symptoms.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm"><input type="checkbox" value={s} className="h-4 w-4 rounded border-stone-300 text-brand-600" {...register('symptoms')} /> {humanize(s.toLowerCase())}</label>
              ))}
            </div>
          </fieldset>
          {serverError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={isSubmitting}><Stethoscope className="h-4 w-4" aria-hidden /> Run screening</Button></div>
        </form>
      </Card>
      <div className="lg:col-span-2">
        {result ? <ScreeningResult s={result} /> : (
          <Card title="Result"><EmptyState title="No screening run yet" hint="Results are stored with a timestamp, your user account and the optional farm link." /></Card>
        )}
        <details className="mt-4 text-xs text-stone-500">
          <summary className="cursor-pointer">Model details and historical training metrics</summary>
          <p className="mt-2">Version {status.model_version}. Historical metrics recorded by the original project on a synthetic hold-out set:{' '}
            {status.historical_training_metrics ? `accuracy ${Number(status.historical_training_metrics.accuracy).toFixed(3)}, macro-F1 ${Number(status.historical_training_metrics.macro_f1).toFixed(3)} (${status.historical_training_metrics.rows} synthetic rows)` : 'not available'}.
            These describe agreement with the data generator, not clinical accuracy.</p>
          <ul className="mt-2 list-disc pl-5">{status.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      </div>
    </div>
  );
}

function ScreeningResult({ s }: { s: Screening }) {
  return (
    <Card title="Result">
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Model output (highest score)</p>
          <p className="text-lg font-semibold">{s.top.label}</p>
          <p className="text-stone-600">Model score {s.top.model_score.toFixed(4)} {!s.top.observed_for_species_in_training && <Badge tone="red">not seen for {s.species} in training</Badge>}</p>
        </div>
        {s.alternatives.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Alternatives</p>
            <ul className="mt-1 space-y-1">{s.alternatives.map((a) => (
              <li key={a.label} className="flex items-center justify-between gap-2"><span>{a.label} {!a.observed_for_species_in_training && <Badge tone="red">not seen for {s.species}</Badge>}</span><span className="text-stone-500">{a.model_score.toFixed(4)}</span></li>
            ))}</ul>
          </div>
        )}
        <p className="text-xs text-stone-500">{s.score_note}</p>
        {s.warnings.length > 0 && (
          <Notice><p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden /> Warnings</p>
            <ul className="list-disc space-y-1 pl-5">{s.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>
        )}
        <Notice tone="blue">{s.recommendation}</Notice>
        <p className="text-xs text-stone-400">Saved as screening #{s.id} · {fmtDateTime(s.created_at)}</p>
      </div>
    </Card>
  );
}

const LIMIT = 20;
export function ScreeningHistory({ farmId }: { farmId?: number }) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<Screening | null>(null);
  const { data, error, loading, reload } = useAsync(() => Api.screenings({ farm_id: farmId, limit: LIMIT, offset }), [farmId, offset]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.items.length) return <EmptyState title="No screening records" />;
  return (
    <>
      <Table head={<><th className="th">When</th><th className="th">Species</th><th className="th">Animal</th><th className="th">Farm</th><th className="th">Model output</th><th className="th text-right">Score</th><th className="th">Warnings</th><th className="th" /></>}>
        {data.items.map((s) => (
          <tr key={s.id}>
            <td className="td">{fmtDateTime(s.created_at)}</td><td className="td">{s.species}</td><td className="td">{s.animal_identifier ?? '—'}</td>
            <td className="td">{s.farm_id ? <Link to={`/farms/${s.farm_id}`} className="text-brand-700 hover:underline">#{s.farm_id}</Link> : '—'}</td>
            <td className="td font-medium">{s.top.label}</td><td className="td text-right">{s.top.model_score.toFixed(4)}</td>
            <td className="td">{s.warnings.length ? <Badge tone="amber">{s.warnings.length}</Badge> : '—'}</td>
            <td className="td"><Button variant="ghost" className="!py-1" onClick={() => setOpen(s)}>Details</Button></td>
          </tr>
        ))}
      </Table>
      <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <ScreeningResult s={open} />
            <div className="mt-2 rounded-lg bg-white p-4 text-sm shadow">
              <p className="font-medium">Inputs</p>
              <p className="text-stone-600">Temp {String(open.inputs.body_temperature_c)} °C · HR {String(open.inputs.heart_rate_bpm)} · RR {String(open.inputs.respiratory_rate_bpm)} · activity {String(open.inputs.activity_level)}</p>
              <p className="text-stone-600">Symptoms: {open.inputs.symptoms?.length ? open.inputs.symptoms.map((x) => humanize(x.toLowerCase())).join(', ') : 'none'}</p>
              <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={() => setOpen(null)}>Close</Button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
