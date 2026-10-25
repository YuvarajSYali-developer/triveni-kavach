import { Activity, BarChart3, Bell, Cpu, Home, Info, LogOut, Megaphone, Menu, ShieldCheck, Stethoscope, Users, Warehouse, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import type { Role } from '../api/types';

const NAV: { to: string; label: string; icon: ReactNode; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
  { to: '/farms', label: 'Farms', icon: <Warehouse className="h-4 w-4" /> },
  { to: '/alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
  { to: '/notices', label: 'Disease notices', icon: <Megaphone className="h-4 w-4" /> },
  { to: '/statistics', label: 'Livestock statistics', icon: <BarChart3 className="h-4 w-4" /> },
  { to: '/screening', label: 'Health screening', icon: <Stethoscope className="h-4 w-4" /> },
  { to: '/iot', label: 'IoT concept', icon: <Cpu className="h-4 w-4" /> },
  { to: '/users', label: 'Users', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { to: '/about', label: 'About & limitations', icon: <Info className="h-4 w-4" /> },
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
      {!compact && (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-stone-900">Triveni Kavach</p>
          <p className="text-[11px] text-stone-500">Farm biosecurity &amp; animal health</p>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  // Explicit sign-out goes to a clean login page, so the next user is not redirected to this user's last page.
  const signOut = () => { navigate('/login', { replace: true }); logout(); };
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`}>
          {n.icon}{n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 flex-none flex-col border-r border-stone-200 bg-white px-3 py-4 lg:flex">
        <div className="px-2 pb-6"><Brand /></div>
        {nav}
        <div className="mt-auto rounded-md bg-stone-50 p-3 text-xs text-stone-500">
          <Activity className="mb-1 h-4 w-4 text-brand-600" aria-hidden />
          Internship prototype. Weather is live from Open-Meteo; notices and statistics link to their official sources.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2 lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1.5 hover:bg-stone-100"><Menu className="h-5 w-5" /></button>
            <Brand compact />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user.full_name}</p>
              <p className="text-xs text-stone-500">{ROLE_LABEL[user.role]}{user.is_demo && ' · demo account'}</p>
            </div>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
              <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 bg-stone-900/40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="h-full w-64 bg-white p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between"><Brand /><button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
              {nav}
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"><Outlet /></main>
      </div>
    </div>
  );
}
