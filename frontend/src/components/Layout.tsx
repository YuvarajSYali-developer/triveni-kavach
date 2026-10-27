import {
  BarChart3, Bell, Cpu, FlaskConical, Home, Info, LogOut, Megaphone, Menu, ShieldCheck, Stethoscope, Users, Warehouse, X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import type { Role } from '../api/types';

type Item = { to: string; label: string; icon: ReactNode; roles?: Role[] };
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <Home className="h-[18px] w-[18px]" /> },
      { to: '/alerts', label: 'Alerts', icon: <Bell className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    title: 'Farm operations',
    items: [
      { to: '/farms', label: 'Farms & records', icon: <Warehouse className="h-[18px] w-[18px]" /> },
      { to: '/symptom-checker', label: 'Symptom checker', icon: <Stethoscope className="h-[18px] w-[18px]" /> },
      { to: '/screening', label: 'AI screening (experimental)', icon: <FlaskConical className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    title: 'Official data',
    items: [
      { to: '/notices', label: 'Disease notices', icon: <Megaphone className="h-[18px] w-[18px]" /> },
      { to: '/statistics', label: 'Livestock statistics', icon: <BarChart3 className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    title: 'More',
    items: [
      { to: '/users', label: 'Users', icon: <Users className="h-[18px] w-[18px]" />, roles: ['admin'] },
      { to: '/iot', label: 'IoT concept', icon: <Cpu className="h-[18px] w-[18px]" /> },
      { to: '/about', label: 'About & limitations', icon: <Info className="h-[18px] w-[18px]" /> },
    ],
  },
];

export function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-sm shadow-brand-900/30">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      {!compact && (
        <div className="leading-tight">
          <p className={`font-display text-[15px] font-bold ${light ? 'text-white' : 'text-stone-900'}`}>Triveni Kavach</p>
          <p className={`text-[11px] ${light ? 'text-brand-200/80' : 'text-stone-500'}`}>Farm biosecurity &amp; animal health</p>
        </div>
      )}
    </div>
  );
}

const initials = (name: string) =>
  name.replace(/^(Dr\.?|Demo)\s+/gi, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  // Explicit sign-out goes to a clean login page, so the next user is not redirected to this user's last page.
  const signOut = () => { navigate('/login', { replace: true }); logout(); };

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {GROUPS.map((g) => {
        const items = g.items.filter((n) => !n.roles || n.roles.includes(user.role));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/50">{g.title}</p>
            <div className="flex flex-col gap-0.5">
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive
                      ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_theme(colors.brand.400)]'
                      : 'text-brand-100/70 hover:bg-white/5 hover:text-white'}`}>
                  <span className="opacity-90">{n.icon}</span>{n.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 bg-[radial-gradient(ellipse_at_top_left,rgba(39,154,95,0.25),transparent_60%)] px-3 py-5">
      <Link to="/" className="mb-8 px-2"><Brand light /></Link>
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-[11px] leading-relaxed text-brand-100/70">
        Weather is live from Open-Meteo. Notices and statistics link to their official sources.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 flex-none lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink-900/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="relative h-full w-72" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200/70 bg-white/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-stone-100"><Menu className="h-5 w-5" /></button>
            <Brand compact />
          </div>
          <p className="hidden text-sm text-stone-500 lg:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-stone-800">{user.full_name}</p>
              <p className="text-xs text-stone-500">{ROLE_LABEL[user.role]}{user.is_demo && ' · demo account'}</p>
            </div>
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white ring-2 ring-white">
              {initials(user.full_name) || '?'}
            </span>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-600 transition hover:border-stone-300 hover:bg-stone-50">
              <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 animate-fade-up px-4 py-7 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
