import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
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

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (f: Form) => {
    setError(null);
    try {
      await login(f.email, f.password);
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink-900 p-10 lg:flex">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" aria-hidden />
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <Link to="/" className="relative"><Brand light /></Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold leading-tight text-white">Biosecurity records that<br />protect every farm.</h2>
          <ul className="mt-8 space-y-3 text-sm text-brand-100/85">
            {['Farm records for vaccinations, mortality, hygiene and visitors', 'Explainable assessments and deduplicated alerts',
              'Official disease notices and live taluk weather'].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 flex-none text-brand-400" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-100/60">Internship prototype · Department of Animal Husbandry and Veterinary Services, Haveri</p>
      </aside>

      <main className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center justify-between lg:hidden"><Link to="/"><Brand /></Link></div>
          <Link to="/" className="mb-8 hidden items-center gap-1 text-sm text-stone-500 hover:text-stone-800 lg:inline-flex"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to home</Link>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-stone-500">Sign in with the account issued to you by the department.</p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
              <input id="email" type="email" autoComplete="username" placeholder="name@example.com" className={`input !py-2.5 ${errors.email ? 'input-error' : ''}`} {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <input id="password" type="password" autoComplete="current-password" className={`input !py-2.5 ${errors.password ? 'input-error' : ''}`} {...register('password')} />
            </Field>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" loading={isSubmitting} className="w-full !py-2.5">Sign in</Button>
          </form>
          <div className="mt-8 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-stone-500" aria-live="polite">
            {health.loading ? 'Checking backend…'
              : health.error ? (<><CircleAlert className="h-4 w-4 flex-none text-red-500" aria-hidden /> Backend unreachable: {errorMessage(health.error)}</>)
                : (<><span className="h-2 w-2 flex-none rounded-full bg-brand-500" aria-hidden /> Backend connected · database {health.data?.database} · {health.data?.environment}</>)}
          </div>
        </div>
      </main>
    </div>
  );
}
