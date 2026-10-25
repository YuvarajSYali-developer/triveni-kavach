import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { Api } from '../api/endpoints';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, SuccessToast, Table } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { ROLE_LABEL } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const schema = z.object({
  full_name: z.string().trim().min(2, 'At least 2 characters').max(120),
  email: z.string().trim().email('Enter a valid e-mail address'),
  role: z.enum(['admin', 'veterinarian', 'farmer']),
  phone: z.string().trim().regex(/^(\+?[0-9][0-9 -]{6,18})?$/, 'Digits, spaces or dashes only').optional(),
  password: z.string().min(10, 'At least 10 characters').max(128).refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and digits'),
});
type Form = z.infer<typeof schema>;

export default function UsersPage() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => Api.users(role || undefined), [role]);
  const closeToast = useCallback(() => setToast(null), []);

  const toggle = async () => {
    if (!toggling) return;
    setBusy(true); setErr(null);
    try { await Api.updateUser(toggling.id, { is_active: !toggling.is_active }); setToast(`${toggling.full_name} ${toggling.is_active ? 'deactivated' : 'reactivated'}.`); reload(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); setToggling(null); }
  };

  return (
    <div>
      <PageHeader title="User accounts" subtitle="Accounts are created by administrators; there is no public self-registration."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> New account</Button>} />
      <Card>
        <select aria-label="Role" className="input mb-4 !w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option><option value="admin">Administrators</option><option value="veterinarian">Veterinarians</option><option value="farmer">Farmers</option>
        </select>
        {err && <div className="mb-3"><ErrorState error={new Error(err)} /></div>}
        {loading && !data ? <Spinner /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <EmptyState title="No accounts" /> : (
          <Table head={<><th className="th">Name</th><th className="th">E-mail</th><th className="th">Role</th><th className="th">Status</th><th className="th" /></>}>
            {data.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.full_name} {u.is_demo && <Badge>demo</Badge>}</td><td className="td">{u.email}</td>
                <td className="td">{ROLE_LABEL[u.role]}</td><td className="td">{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="td text-right">{u.id !== me?.id && <Button variant="ghost" className="!py-1" onClick={() => setToggling(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={creating} title="New account" onClose={() => setCreating(false)}>
        <UserForm onCancel={() => setCreating(false)} onSaved={(u) => { setCreating(false); setToast(`Created ${u.full_name}.`); reload(); }} />
      </Modal>
      <ConfirmDialog open={!!toggling} title={toggling?.is_active ? 'Deactivate account?' : 'Reactivate account?'} busy={busy}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'} onCancel={() => setToggling(null)} onConfirm={toggle}
        message={toggling?.is_active ? `${toggling?.full_name} will no longer be able to sign in. Their records are kept.` : `${toggling?.full_name} will be able to sign in again.`} />
      <SuccessToast message={toast} onClose={closeToast} />
    </div>
  );
}

function UserForm({ onSaved, onCancel }: { onSaved: (u: User) => void; onCancel: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { role: 'farmer' } });
  const onSubmit = async (f: Form) => {
    setServerError(null);
    try { onSaved(await Api.createUser({ ...f, phone: f.phone || null })); }
    catch (e) {
      if (e instanceof ApiError) e.fieldErrors.forEach((fe) => fe.field && setError(fe.field as keyof Form, { message: fe.message }));
      setServerError(errorMessage(e));
    }
  };
  const cls = (bad: unknown) => (bad ? 'input input-error' : 'input');
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}><input id="full_name" className={cls(errors.full_name)} {...register('full_name')} /></Field>
      <Field label="E-mail" htmlFor="email" error={errors.email?.message}><input id="email" type="email" className={cls(errors.email)} {...register('email')} /></Field>
      <Field label="Role" htmlFor="role"><select id="role" className="input" {...register('role')}>
        <option value="farmer">Farmer</option><option value="veterinarian">Veterinarian</option><option value="admin">Department administrator</option></select></Field>
      <Field label="Phone (optional)" htmlFor="phone" error={errors.phone?.message}><input id="phone" type="tel" className={cls(errors.phone)} {...register('phone')} /></Field>
      <Field label="Initial password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters with letters and digits. Share it securely.">
        <input id="password" type="password" autoComplete="new-password" className={cls(errors.password)} {...register('password')} /></Field>
      {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={isSubmitting}>Create account</Button></div>
    </form>
  );
}
