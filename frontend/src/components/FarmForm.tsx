import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { Api } from '../api/endpoints';
import type { Farm, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { HAVERI_TALUKS } from '../lib/constants';
import { useAsync } from '../lib/useAsync';
import { Button, Field } from './ui';
import { errorMessage } from '../lib/errors';

const count = z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative');
const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(150),
  farm_type: z.enum(['pig', 'poultry', 'mixed']),
  district: z.string().trim().min(2, 'Required').max(80),
  taluk: z.string().trim().min(2, 'Required').max(80),
  village: z.string().trim().max(120).optional(),
  pig_count: count,
  poultry_count: count,
  contact_phone: z.string().trim().regex(/^(\+?[0-9][0-9 -]{6,18})?$/, 'Digits, spaces or dashes only').optional(),
  owner_id: z.string().optional(),
  veterinarian_id: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.farm_type === 'pig' && v.poultry_count > 0) ctx.addIssue({ path: ['poultry_count'], code: 'custom', message: "A pig farm cannot record poultry; choose 'mixed'." });
  if (v.farm_type === 'poultry' && v.pig_count > 0) ctx.addIssue({ path: ['pig_count'], code: 'custom', message: "A poultry farm cannot record pigs; choose 'mixed'." });
});
type Form = z.infer<typeof schema>;

export default function FarmForm({ farm, onSaved, onCancel }: { farm?: Farm; onSaved: (f: Farm) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const people = useAsync<User[]>(() => (isAdmin ? Api.users() : Promise.resolve([])), [isAdmin]);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: farm?.name ?? '', farm_type: farm?.farm_type ?? 'pig', district: farm?.district ?? 'Haveri', taluk: farm?.taluk ?? '',
      village: farm?.village ?? '', pig_count: farm?.pig_count ?? 0, poultry_count: farm?.poultry_count ?? 0,
      contact_phone: farm?.contact_phone ?? '', owner_id: farm?.owner ? String(farm.owner.id) : '',
      veterinarian_id: farm?.veterinarian ? String(farm.veterinarian.id) : '',
    },
  });
  const type = watch('farm_type');

  const onSubmit = async (f: Form) => {
    setServerError(null);
    const body: Record<string, unknown> = {
      name: f.name, farm_type: f.farm_type, district: f.district, taluk: f.taluk, village: f.village || null,
      pig_count: f.farm_type === 'poultry' ? 0 : f.pig_count, poultry_count: f.farm_type === 'pig' ? 0 : f.poultry_count,
      contact_phone: f.contact_phone || null,
    };
    if (isAdmin) {
      body.owner_id = f.owner_id ? Number(f.owner_id) : null;
      body.veterinarian_id = f.veterinarian_id ? Number(f.veterinarian_id) : null;
    }
    try {
      onSaved(farm ? await Api.updateFarm(farm.id, body) : await Api.createFarm(body));
    } catch (e) {
      if (e instanceof ApiError) e.fieldErrors.forEach((fe) => fe.field && setError(fe.field as keyof Form, { message: fe.message }));
      setServerError(errorMessage(e));
    }
  };

  const err = (k: keyof Form) => (errors[k] ? 'input input-error' : 'input');
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Farm name" htmlFor="name" error={errors.name?.message}><input id="name" className={err('name')} {...register('name')} /></Field></div>
      <Field label="Farm type" htmlFor="farm_type" error={errors.farm_type?.message}>
        <select id="farm_type" className="input" {...register('farm_type')}>
          <option value="pig">Pig</option><option value="poultry">Poultry</option><option value="mixed">Mixed (pig and poultry)</option>
        </select>
      </Field>
      <Field label="District" htmlFor="district" error={errors.district?.message}><input id="district" className={err('district')} {...register('district')} /></Field>
      <Field label="Taluk" htmlFor="taluk" error={errors.taluk?.message} hint="Administrative location only; no GPS coordinates are stored.">
        <input id="taluk" list="taluks" className={err('taluk')} {...register('taluk')} />
        <datalist id="taluks">{HAVERI_TALUKS.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field label="Village (optional)" htmlFor="village" error={errors.village?.message}><input id="village" className={err('village')} {...register('village')} /></Field>
      {type !== 'poultry' && <Field label="Pigs" htmlFor="pig_count" error={errors.pig_count?.message}><input id="pig_count" type="number" min={0} className={err('pig_count')} {...register('pig_count')} /></Field>}
      {type !== 'pig' && <Field label="Poultry" htmlFor="poultry_count" error={errors.poultry_count?.message}><input id="poultry_count" type="number" min={0} className={err('poultry_count')} {...register('poultry_count')} /></Field>}
      <Field label="Contact phone (optional)" htmlFor="contact_phone" error={errors.contact_phone?.message}><input id="contact_phone" type="tel" className={err('contact_phone')} {...register('contact_phone')} /></Field>
      {isAdmin && (
        <>
          <Field label="Owner (farmer)" htmlFor="owner_id"><select id="owner_id" className="input" {...register('owner_id')}>
            <option value="">— none —</option>
            {people.data?.filter((u) => u.role === 'farmer' && u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select></Field>
          <Field label="Assigned veterinarian" htmlFor="veterinarian_id"><select id="veterinarian_id" className="input" {...register('veterinarian_id')}>
            <option value="">— none —</option>
            {people.data?.filter((u) => u.role === 'veterinarian' && u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select></Field>
        </>
      )}
      {serverError && <p role="alert" className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>{farm ? 'Save changes' : 'Register farm'}</Button>
      </div>
    </form>
  );
}
