import { ArrowRight, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from './Layout';

const LINKS: [string, string][] = [['/#features', 'Features'], ['/check', 'Symptom checker'], ['/diseases', 'Disease library'], ['/#live', 'Live map'], ['/#faq', 'FAQ']];

export function PublicNav({ overlay = false }: { overlay?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const cta = (
    <Link to={user ? '/dashboard' : '/login'} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-sm transition hover:bg-brand-50">
      {user ? 'Open dashboard' : 'Sign in'} <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
  return (
    <header className={`${overlay ? 'absolute' : 'relative bg-ink-900'} inset-x-0 top-0 z-30`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link to="/"><Brand light /></Link>
        <nav aria-label="Site" className="hidden items-center gap-7 lg:flex">
          {LINKS.map(([href, label]) => href.startsWith('/#')
            ? <a key={href} href={href} className="text-sm font-medium text-brand-100/80 transition hover:text-white">{label}</a>
            : <NavLink key={href} to={href} className={({ isActive }) => `text-sm font-medium transition ${isActive ? 'text-white' : 'text-brand-100/80 hover:text-white'}`}>{label}</NavLink>)}
        </nav>
        <div className="hidden lg:block">{cta}</div>
        <button className="rounded-lg p-2 text-white lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-6 w-6" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink-900/95 p-6 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between"><Brand light /><button aria-label="Close menu" onClick={() => setOpen(false)} className="p-2 text-white"><X className="h-6 w-6" /></button></div>
          <div className="mt-10 flex flex-col gap-6">
            {LINKS.map(([href, label]) => href.startsWith('/#')
              ? <a key={href} href={href} onClick={() => setOpen(false)} className="text-lg font-medium text-white">{label}</a>
              : <Link key={href} to={href} onClick={() => setOpen(false)} className="text-lg font-medium text-white">{label}</Link>)}
            <div onClick={() => setOpen(false)}>{cta}</div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white px-5 py-12 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Brand />
          <p className="mt-3 max-w-md text-sm text-stone-500">
            Individual internship prototype for Smart India Hackathon problem statement 25006, developed during an internship with the
            Department of Animal Husbandry and Veterinary Services, Haveri. Not an official government service.
          </p>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-stone-800">Explore</p>
          <ul className="mt-3 space-y-2 text-stone-500">
            <li><Link to="/check" className="hover:text-brand-700">Symptom checker</Link></li>
            <li><Link to="/diseases" className="hover:text-brand-700">Disease library</Link></li>
            <li><Link to="/login" className="hover:text-brand-700">Sign in</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-stone-800">Data sources</p>
          <ul className="mt-3 space-y-2 text-stone-500">
            <li><a className="hover:text-brand-700" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather: Open-Meteo.com (CC BY 4.0)</a></li>
            <li><a className="hover:text-brand-700" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Maps: © OpenStreetMap contributors, © CARTO</a></li>
            <li><a className="hover:text-brand-700" href="https://data.gov.in/" target="_blank" rel="noopener noreferrer">Statistics: data.gov.in</a></li>
            <li>Disease information: WOAH, Merck Veterinary Manual</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string; eyebrow?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7f5]">
      <div className="relative overflow-hidden bg-ink-900">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" aria-hidden />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
        <PublicNav />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-6 lg:px-8">
          {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">{eyebrow}</p>}
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 max-w-3xl text-brand-100/80">{subtitle}</p>}
        </div>
      </div>
      <main className="mx-auto -mt-6 max-w-7xl px-5 pb-20 lg:px-8">{children}</main>
      <PublicFooter />
    </div>
  );
}
