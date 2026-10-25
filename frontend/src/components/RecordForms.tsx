import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormRegister, type UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { Api, type RecordKind, type RecordMap } from '../api/endpoints';
import type { Farm } from '../api/types';
import { speciesFor } from '../lib/constants';
import { isoDate, localDateTimeInput } from '../lib/format';
import { Button, Field } from './ui';
import { errorMessage } from '../lib/errors';

const today = () => isoDate(new Date());
const optText = (max: number) => z.string().trim().max(max).optional();
const notFuture = (v: string) => !v || v <= today();
const optNum = (min: number, max: number, label: string) =>
  z.union([z.literal(''), z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(min, `${label}: minimum ${min}`).max(max, `${label}: maximum ${max}`)]).optional();
const toNull = (v: unknown) => (v === '' || v === undefined ? null : v);
const toIso = (local: string) => new Date(local).toISOString();

/** Shared submit/serverside-error plumbing for every record form. */
function useRecordSubmit<K extends RecordKind, F extends FieldValues>(
  farm: Farm, kind: K, existing: RecordMap[K] | undefined, setError: UseFormSetError<F>, onSaved: () => void,
) {
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = async (body: Record<string, unknown>) => {
    setServerError(null);
    try {
      if (existing) await Api.updateRecord(farm.id, kind, existing.id, body);
      else await Api.createRecord(farm.id, kind, body);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) e.fieldErrors.forEach((fe) => fe.field && setError(fe.field as Path<F>, { message: fe.message }));
      setServerError(errorMessage(e));
    }
  };
  return { serverError, submit };
}

function Footer({ busy, serverError, onCancel, editing }: { busy: boolean; serverError: string | null; onCancel: () => void; editing: boolean }) {
  return (
    <>
      {serverError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy}>{editing ? 'Save changes' : 'Add record'}</Button>
      </div>
    </>
  );
}

function Check<F extends FieldValues>({ name, label, register }: { name: Path<F>; label: string; register: UseFormRegister<F> }) {
  return (
    <label className="flex items-center gap-2 text-sm text-stone-700">
      <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500" {...register(name)} /> {label}
    </label>
  );
}

function Notes<F extends FieldValues>({ register }: { register: UseFormRegister<F> }) {
  return (
    <div className="sm:col-span-2">
      <Field label="Notes (optional)" htmlFor="notes"><textarea id="notes" rows={2} className="input" {...register('notes' as Path<F>)} /></Field>
    </div>
  );
}

export interface FormProps<K extends RecordKind> { farm: Farm; existing?: RecordMap[K]; onSaved: () => void; onCancel: () => void }
const cls = (bad: unknown) => (bad ? 'input input-error' : 'input');

// ------------------------------------------------------------------ vaccination
const vaxSchema = z.object({
  species: z.enum(['pig', 'poultry']),
  vaccine_name: z.string().trim().min(2, 'At least 2 characters').max(120),
  target_disease: optText(120),
  status: z.enum(['scheduled', 'completed', 'missed']),
  due_on: z.string().optional(),
  administered_on: z.string().optional().refine((v) => !v || notFuture(v), 'Cannot be in the future'),
  animals_covered: z.coerce.number().int().min(0, 'Cannot be negative'),
  batch_number: optText(60),
  notes: optText(2000),
}).superRefine((v, ctx) => {
  if (v.status === 'completed' && !v.administered_on) ctx.addIssue({ path: ['administered_on'], code: 'custom', message: 'Required for a completed vaccination' });
  if (v.status !== 'completed' && !v.due_on) ctx.addIssue({ path: ['due_on'], code: 'custom', message: 'Required for a scheduled or missed vaccination' });
});
type VaxForm = z.infer<typeof vaxSchema>;

export function VaccinationForm({ farm, existing, onSaved, onCancel }: FormProps<'vaccinations'>) {
  const sp = speciesFor(farm);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<VaxForm>({
    resolver: zodResolver(vaxSchema),
    defaultValues: {
      species: existing?.species ?? sp[0], vaccine_name: existing?.vaccine_name ?? '', target_disease: existing?.target_disease ?? '',
      status: existing?.status ?? 'completed', due_on: existing?.due_on ?? '', administered_on: existing?.administered_on ?? today(),
      animals_covered: existing?.animals_covered ?? 0, batch_number: existing?.batch_number ?? '', notes: existing?.notes ?? '',
    },
  });
  const { serverError, submit } = useRecordSubmit(farm, 'vaccinations', existing, setError, onSaved);
  const status = watch('status');
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((f) => submit({
      ...f, target_disease: toNull(f.target_disease), batch_number: toNull(f.batch_number), notes: toNull(f.notes),
      due_on: toNull(f.due_on), administered_on: status === 'completed' ? toNull(f.administered_on) : null,
    }))}>
      <Field label="Species" htmlFor="species"><select id="species" className="input" {...register('species')}>{sp.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      <Field label="Status" htmlFor="status"><select id="status" className="input" {...register('status')}>
        <option value="completed">Completed</option><option value="scheduled">Scheduled</option><option value="missed">Missed</option></select></Field>
      <Field label="Vaccine" htmlFor="vaccine_name" error={errors.vaccine_name?.message}><input id="vaccine_name" className={cls(errors.vaccine_name)} {...register('vaccine_name')} /></Field>
      <Field label="Target disease (optional)" htmlFor="target_disease"><input id="target_disease" className="input" {...register('target_disease')} /></Field>
      <Field label={status === 'completed' ? 'Due date (optional)' : 'Due date'} htmlFor="due_on" error={errors.due_on?.message}><input id="due_on" type="date" className={cls(errors.due_on)} {...register('due_on')} /></Field>
      {status === 'completed' && <Field label="Date administered" htmlFor="administered_on" error={errors.administered_on?.message}><input id="administered_on" type="date" max={today()} className={cls(errors.administered_on)} {...register('administered_on')} /></Field>}
      <Field label="Animals covered" htmlFor="animals_covered" error={errors.animals_covered?.message}><input id="animals_covered" type="number" min={0} className={cls(errors.animals_covered)} {...register('animals_covered')} /></Field>
      <Field label="Batch number (optional)" htmlFor="batch_number"><input id="batch_number" className="input" {...register('batch_number')} /></Field>
      <Notes register={register} />
      <Footer busy={isSubmitting} serverError={serverError} onCancel={onCancel} editing={!!existing} />
    </form>
  );
}

// -------------------------------------------------------------------- mortality
const mortSchema = z.object({
  species: z.enum(['pig', 'poultry']),
  observed_on: z.string().min(1, 'Required').refine(notFuture, 'Cannot be in the future'),
  count: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative'),
  suspected_cause: optText(160),
  notes: optText(2000),
});
type MortForm = z.infer<typeof mortSchema>;

export function MortalityForm({ farm, existing, onSaved, onCancel }: FormProps<'mortality'>) {
  const sp = speciesFor(farm);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<MortForm>({
    resolver: zodResolver(mortSchema),
    defaultValues: { species: existing?.species ?? sp[0], observed_on: existing?.observed_on ?? today(), count: existing?.count ?? 0,
      suspected_cause: existing?.suspected_cause ?? '', notes: existing?.notes ?? '' },
  });
  const { serverError, submit } = useRecordSubmit(farm, 'mortality', existing, setError, onSaved);
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((f) => submit({ ...f, suspected_cause: toNull(f.suspected_cause), notes: toNull(f.notes) }))}>
      <Field label="Species" htmlFor="species"><select id="species" className="input" {...register('species')}>{sp.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      <Field label="Date observed" htmlFor="observed_on" error={errors.observed_on?.message}><input id="observed_on" type="date" max={today()} className={cls(errors.observed_on)} {...register('observed_on')} /></Field>
      <Field label="Number of deaths" htmlFor="count" error={errors.count?.message} hint="Enter 0 to record a nil report (no deaths observed).">
        <input id="count" type="number" min={0} className={cls(errors.count)} {...register('count')} /></Field>
      <Field label="Suspected cause (optional)" htmlFor="suspected_cause" hint="An observation only — not a diagnosis."><input id="suspected_cause" className="input" {...register('suspected_cause')} /></Field>
      <Notes register={register} />
      <Footer busy={isSubmitting} serverError={serverError} onCancel={onCancel} editing={!!existing} />
    </form>
  );
}

// ---------------------------------------------------------------------- hygiene
const HYGIENE_ITEMS = [
  ['footbath_maintained', 'Footbath maintained at entry'],
  ['shed_cleaned', 'Shed cleaned'],
  ['disinfectant_applied', 'Disinfectant applied'],
  ['waste_disposed_properly', 'Waste / carcasses disposed properly'],
  ['protective_clothing_available', 'Protective clothing available'],
] as const;
const hygSchema = z.object({
  inspected_on: z.string().min(1, 'Required').refine(notFuture, 'Cannot be in the future'),
  footbath_maintained: z.boolean(), shed_cleaned: z.boolean(), disinfectant_applied: z.boolean(),
  waste_disposed_properly: z.boolean(), protective_clothing_available: z.boolean(),
  notes: optText(2000),
});
type HygForm = z.infer<typeof hygSchema>;

export function HygieneForm({ farm, existing, onSaved, onCancel }: FormProps<'hygiene'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<HygForm>({
    resolver: zodResolver(hygSchema),
    defaultValues: {
      inspected_on: existing?.inspected_on ?? today(), notes: existing?.notes ?? '',
      ...Object.fromEntries(HYGIENE_ITEMS.map(([k]) => [k, existing ? existing[k] : false])),
    } as HygForm,
  });
  const { serverError, submit } = useRecordSubmit(farm, 'hygiene', existing, setError, onSaved);
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((f) => submit({ ...f, notes: toNull(f.notes) }))}>
      <Field label="Inspection date" htmlFor="inspected_on" error={errors.inspected_on?.message}><input id="inspected_on" type="date" max={today()} className={cls(errors.inspected_on)} {...register('inspected_on')} /></Field>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="label">Checklist — the inspection passes only if every item is satisfied</legend>
        {HYGIENE_ITEMS.map(([k, label]) => <Check key={k} name={k} label={label} register={register} />)}
      </fieldset>
      <Notes register={register} />
      <Footer busy={isSubmitting} serverError={serverError} onCancel={onCancel} editing={!!existing} />
    </form>
  );
}

// --------------------------------------------------------------------- visitors
const visSchema = z.object({
  visitor_name: z.string().trim().min(2, 'At least 2 characters').max(120),
  purpose: z.string().trim().min(2, 'At least 2 characters').max(160),
  entry_time: z.string().min(1, 'Required'),
  exit_time: z.string().optional(),
  vehicle_disinfected: z.boolean(), footwear_changed: z.boolean(), hands_sanitised: z.boolean(), visited_other_farm_48h: z.boolean(),
  notes: optText(2000),
}).refine((v) => !v.exit_time || v.exit_time >= v.entry_time, { path: ['exit_time'], message: 'Exit cannot be before entry' });
type VisForm = z.infer<typeof visSchema>;

export function VisitorForm({ farm, existing, onSaved, onCancel }: FormProps<'visitors'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<VisForm>({
    resolver: zodResolver(visSchema),
    defaultValues: {
      visitor_name: existing?.visitor_name ?? '', purpose: existing?.purpose ?? '',
      entry_time: localDateTimeInput(existing ? new Date(existing.entry_time) : new Date()),
      exit_time: existing?.exit_time ? localDateTimeInput(new Date(existing.exit_time)) : '',
      vehicle_disinfected: existing?.vehicle_disinfected ?? false, footwear_changed: existing?.footwear_changed ?? false,
      hands_sanitised: existing?.hands_sanitised ?? false, visited_other_farm_48h: existing?.visited_other_farm_48h ?? false,
      notes: existing?.notes ?? '',
    },
  });
  const { serverError, submit } = useRecordSubmit(farm, 'visitors', existing, setError, onSaved);
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((f) => submit({
      ...f, entry_time: toIso(f.entry_time), exit_time: f.exit_time ? toIso(f.exit_time) : null, notes: toNull(f.notes),
    }))}>
      <Field label="Visitor name" htmlFor="visitor_name" error={errors.visitor_name?.message}><input id="visitor_name" className={cls(errors.visitor_name)} {...register('visitor_name')} /></Field>
      <Field label="Purpose" htmlFor="purpose" error={errors.purpose?.message}><input id="purpose" className={cls(errors.purpose)} {...register('purpose')} /></Field>
      <Field label="Entry time" htmlFor="entry_time" error={errors.entry_time?.message}><input id="entry_time" type="datetime-local" className={cls(errors.entry_time)} {...register('entry_time')} /></Field>
      <Field label="Exit time (optional)" htmlFor="exit_time" error={errors.exit_time?.message}><input id="exit_time" type="datetime-local" className={cls(errors.exit_time)} {...register('exit_time')} /></Field>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="label">Entry precautions</legend>
        <Check name="vehicle_disinfected" label="Vehicle disinfected" register={register} />
        <Check name="footwear_changed" label="Footwear changed / boot covers used" register={register} />
        <Check name="hands_sanitised" label="Hands sanitised" register={register} />
        <Check name="visited_other_farm_48h" label="Visitor was on another livestock farm in the last 48 hours" register={register} />
      </fieldset>
      <Notes register={register} />
      <Footer busy={isSubmitting} serverError={serverError} onCancel={onCancel} editing={!!existing} />
    </form>
  );
}

// ------------------------------------------------------------------ environment
const envSchema = z.object({
  observed_at: z.string().min(1, 'Required'),
  shed_label: optText(60),
  temperature_c: optNum(-10, 60, 'Temperature'),
  relative_humidity_pct: optNum(0, 100, 'Humidity'),
  ammonia_ppm: optNum(0, 500, 'Ammonia'),
  notes: optText(2000),
}).refine((v) => [v.temperature_c, v.relative_humidity_pct, v.ammonia_ppm].some((x) => x !== '' && x !== undefined),
  { path: ['temperature_c'], message: 'Enter at least one reading' })
  .refine((v) => new Date(v.observed_at).getTime() <= Date.now() + 5 * 60000, { path: ['observed_at'], message: 'Cannot be in the future' });
type EnvForm = z.infer<typeof envSchema>;

export function EnvironmentForm({ farm, existing, onSaved, onCancel }: FormProps<'environment'>) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<EnvForm>({
    resolver: zodResolver(envSchema),
    defaultValues: {
      observed_at: localDateTimeInput(existing ? new Date(existing.observed_at) : new Date()), shed_label: existing?.shed_label ?? '',
      temperature_c: existing?.temperature_c ?? '', relative_humidity_pct: existing?.relative_humidity_pct ?? '',
      ammonia_ppm: existing?.ammonia_ppm ?? '', notes: existing?.notes ?? '',
    },
  });
  const { serverError, submit } = useRecordSubmit(farm, 'environment', existing, setError, onSaved);
  return (
    <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((f) => submit({
      observed_at: toIso(f.observed_at), shed_label: toNull(f.shed_label), source: 'manual',
      temperature_c: toNull(f.temperature_c), relative_humidity_pct: toNull(f.relative_humidity_pct), ammonia_ppm: toNull(f.ammonia_ppm), notes: toNull(f.notes),
    }))}>
      <p className="sm:col-span-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">This reading will be stored with source <strong>manual</strong> (entered by a person).</p>
      <Field label="Observed at" htmlFor="observed_at" error={errors.observed_at?.message}><input id="observed_at" type="datetime-local" className={cls(errors.observed_at)} {...register('observed_at')} /></Field>
      <Field label="Shed / location (optional)" htmlFor="shed_label"><input id="shed_label" className="input" {...register('shed_label')} /></Field>
      <Field label="Temperature (°C)" htmlFor="temperature_c" error={errors.temperature_c?.message}><input id="temperature_c" type="number" step="0.1" className={cls(errors.temperature_c)} {...register('temperature_c')} /></Field>
      <Field label="Relative humidity (%)" htmlFor="relative_humidity_pct" error={errors.relative_humidity_pct?.message}><input id="relative_humidity_pct" type="number" step="0.1" className={cls(errors.relative_humidity_pct)} {...register('relative_humidity_pct')} /></Field>
      <Field label="Ammonia (ppm, optional)" htmlFor="ammonia_ppm" error={errors.ammonia_ppm?.message}><input id="ammonia_ppm" type="number" step="0.1" className={cls(errors.ammonia_ppm)} {...register('ammonia_ppm')} /></Field>
      <Notes register={register} />
      <Footer busy={isSubmitting} serverError={serverError} onCancel={onCancel} editing={!!existing} />
    </form>
  );
}
