import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Api } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Layout';
import { Button, Field } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { useAsync } from '../lib/useAsync';

const schema = z.object({
  email: z.string().trim().email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const health = useAsync(() => Api.health(), []);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (f: Form) => {
    setError(null);
    try {
      await login(f.email, f.password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-stone-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Brand /></div>
        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-stone-500">Department administrators, veterinarians and farmers sign in with the account issued to them.</p>
          <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
              <input id="email" type="email" autoComplete="username" className={`input ${errors.email ? 'input-error' : ''}`} {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <input id="password" type="password" autoComplete="current-password" className={`input ${errors.password ? 'input-error' : ''}`} {...register('password')} />
            </Field>
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" loading={isSubmitting} className="w-full">Sign in</Button>
          </form>
        </div>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-stone-500" aria-live="polite">
          {health.loading ? 'Checking backend…'
            : health.error ? (<><CircleAlert className="h-3.5 w-3.5 text-red-500" aria-hidden /> Backend unreachable: {errorMessage(health.error)}</>)
              : (<><CheckCircle2 className="h-3.5 w-3.5 text-brand-600" aria-hidden /> Backend connected · database {health.data?.database} · {health.data?.environment}</>)}
        </div>
        <p className="mt-3 text-center text-xs text-stone-400">
          Development accounts are created with <code>python scripts/seed_demo.py</code> (see README).
        </p>
      </div>
    </div>
  );
}
