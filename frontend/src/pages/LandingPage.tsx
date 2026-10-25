import {
  ArrowRight, BarChart3, Bell, Building2, CheckCircle2, ClipboardCheck, CloudSun, FileCheck2, Menu, Megaphone,
  ShieldCheck, Stethoscope, Syringe, Users, Warehouse, X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Layout';

const FEATURES = [
  { icon: <ClipboardCheck className="h-5 w-5" />, title: 'Complete farm records', text: 'Vaccinations, mortality (including nil reports), hygiene inspections, visitor entry precautions and shed readings in one place.', color: 'bg-brand-50 text-brand-600' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: 'Explainable risk assessment', text: 'Every assessment lists the exact rules triggered, the evidence behind them and what to do next. Missing data is flagged, never assumed.', color: 'bg-sky-50 text-sky-600' },
  { icon: <Bell className="h-5 w-5" />, title: 'Alerts that don’t pile up', text: 'Deduplicated alerts move from open to acknowledged to resolved, with who acted and when.', color: 'bg-amber-50 text-amber-600' },
  { icon: <Megaphone className="h-5 w-5" />, title: 'Official disease notices', text: 'Outbreak notices from government sources, each linked to its publication, shown on every affected farm in the district.', color: 'bg-red-50 text-red-600' },
  { icon: <CloudSun className="h-5 w-5" />, title: 'Live weather by taluk', text: 'Current conditions and a 3-day forecast with heat-stress advisories, from Open-Meteo.', color: 'bg-teal-50 text-teal-600' },
  { icon: <BarChart3 className="h-5 w-5" />, title: 'Official livestock statistics', text: 'District pig and poultry populations imported from the Livestock Census on data.gov.in, with source and year.', color: 'bg-violet-50 text-violet-600' },
];

const ROLES = [
  { icon: <Building2 className="h-6 w-6" />, role: 'Department', text: 'District-wide view of every farm, follow-up lists, alert status, official notices and statistics, plus user management.' },
  { icon: <Stethoscope className="h-6 w-6" />, role: 'Veterinarians', text: 'Assigned farms, overdue vaccinations, alerts to resolve and an exploratory pig health-screening aid.' },
  { icon: <Warehouse className="h-6 w-6" />, role: 'Farmers', text: 'Simple forms for daily records, upcoming vaccinations, district advisories and local weather for their own farms.' },
];

function Nav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [['#features', 'Features'], ['#how', 'How it works'], ['#roles', 'Who it’s for'], ['#trust', 'Data & trust']];
  const cta = user
    ? <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-sm transition hover:bg-brand-50">Open dashboard <ArrowRight className="h-4 w-4" aria-hidden /></Link>
    : <Link to="/login" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-sm transition hover:bg-brand-50">Sign in <ArrowRight className="h-4 w-4" aria-hidden /></Link>;
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link to="/"><Brand light /></Link>
        <nav aria-label="Landing" className="hidden items-center gap-8 md:flex">
          {links.map(([href, label]) => <a key={href} href={href} className="text-sm font-medium text-brand-100/80 transition hover:text-white">{label}</a>)}
        </nav>
        <div className="hidden md:block">{cta}</div>
        <button className="rounded-lg p-2 text-white md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-6 w-6" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink-900/95 p-6 md:hidden">
          <div className="flex items-center justify-between"><Brand light /><button aria-label="Close menu" onClick={() => setOpen(false)} className="p-2 text-white"><X className="h-6 w-6" /></button></div>
          <div className="mt-10 flex flex-col gap-6">
            {links.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)} className="text-lg font-medium text-white">{label}</a>)}
            <div onClick={() => setOpen(false)}>{cta}</div>
          </div>
        </div>
      )}
    </header>
  );
}

function HeroPreview() {
  const rows = [
    { name: 'Hill-view piggery', taluk: 'Haveri', status: 'Low', cls: 'bg-brand-100 text-brand-800' },
    { name: 'River-side layers', taluk: 'Savanur', status: 'Moderate', cls: 'bg-amber-100 text-amber-800' },
    { name: 'Valley pig unit', taluk: 'Byadgi', status: 'High', cls: 'bg-red-100 text-red-800' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-label="Interface preview with sample values">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-400/30 via-teal-300/10 to-harvest-400/30 blur-2xl" aria-hidden />
      <div className="relative rounded-2xl border border-white/15 bg-white/95 p-4 shadow-2xl shadow-ink-900/40 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-brand-300" /></div>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">Preview · sample values</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[['Farms', '24', 'bg-brand-50 text-brand-700'], ['Active alerts', '5', 'bg-red-50 text-red-700'], ['Due vaccinations', '8', 'bg-sky-50 text-sky-700']].map(([l, v, c]) => (
            <div key={l} className="rounded-xl border border-stone-100 p-2.5">
              <p className="text-[10px] font-medium text-stone-500">{l}</p>
              <p className={`mt-1 inline-block rounded-md px-1.5 font-display text-xl font-bold ${c}`}>{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-stone-100 p-3">
          <p className="mb-2 text-[11px] font-semibold text-stone-700">Mortality per week</p>
          <div className="flex h-20 items-end gap-1.5">
            {[3, 4, 2, 5, 3, 4, 6, 3, 2, 9, 4, 3].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h * 10}%`, opacity: i === 9 ? 1 : 0.75 }} />
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
              <span className="font-medium text-stone-700">{r.name} <span className="font-normal text-stone-400">· {r.taluk}</span></span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.cls}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-16 -left-6 hidden w-56 rounded-xl border border-stone-100 bg-white p-3 shadow-xl sm:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-700"><Megaphone className="h-3.5 w-3.5" aria-hidden /> Official notice</p>
        <p className="mt-1 text-[11px] leading-snug text-stone-600">Linked to the publishing authority, shown on every farm in the district.</p>
      </div>
      <div className="absolute -right-3 -top-5 hidden rounded-xl border border-stone-100 bg-white px-3 py-2 shadow-xl sm:block">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700"><CloudSun className="h-3.5 w-3.5" aria-hidden /> Live taluk weather</p>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, intro, children, className = '' }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-10 px-5 py-20 lg:px-8 lg:py-24 ${className}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 text-base leading-relaxed text-stone-600">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="bg-white">
      <div className="relative overflow-hidden bg-ink-900">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <div className="absolute -right-32 top-40 h-[26rem] w-[26rem] rounded-full bg-harvest-500/15 blur-3xl" aria-hidden />
        <Nav />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-24 pt-32 lg:grid-cols-2 lg:px-8 lg:pb-32 lg:pt-40">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden /> Pig &amp; poultry farm biosecurity · Haveri, Karnataka
            </p>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Protect every farm with <span className="bg-gradient-to-r from-brand-300 via-teal-200 to-harvest-400 bg-clip-text text-transparent">records you can act on</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100/80">
              Triveni Kavach brings farm records, explainable biosecurity assessments, official disease notices and live weather together,
              for the department, veterinarians and farmers working on the same farms.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={user ? '/dashboard' : '/login'} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40 transition hover:from-brand-400 hover:to-brand-500">
                {user ? 'Open your dashboard' : 'Sign in to the portal'} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#features" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">See what it does</a>
            </div>
            <ul className="mt-10 grid max-w-lg grid-cols-1 gap-2.5 text-sm text-brand-100/80 sm:grid-cols-2">
              {['Role-based access for 3 user types', 'Every alert explains its reasons', 'Official sources linked, never invented', 'Works on phones in the field'].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 flex-none text-brand-400" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </div>
      </div>

      <Section id="features" eyebrow="Features" title="Everything a biosecurity programme needs, in one portal"
        intro="Built around the day-to-day work of recording, checking and following up on pig and poultry farms.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-stone-200/80 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>{f.icon}</span>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="how" eyebrow="How it works" title="Record. Assess. Act." className="bg-[#f4f7f5]">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            { n: '01', icon: <Syringe className="h-5 w-5" />, t: 'Record', d: 'Farmers and veterinarians log vaccinations, deaths, hygiene checks, visitors and shed conditions from any device.' },
            { n: '02', icon: <ShieldCheck className="h-5 w-5" />, t: 'Assess', d: 'One click runs transparent rules over the records: overdue vaccinations, mortality spikes, failed inspections, incomplete precautions.' },
            { n: '03', icon: <FileCheck2 className="h-5 w-5" />, t: 'Act', d: 'Alerts are acknowledged and resolved with notes; district notices and weather advisories reach the farms they concern.' },
          ].map((s) => (
            <div key={s.n} className="relative rounded-2xl bg-white p-7 shadow-card">
              <span className="absolute right-6 top-5 font-display text-5xl font-extrabold text-brand-100">{s.n}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-900/20">{s.icon}</span>
              <h3 className="mt-5 text-xl font-bold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="roles" eyebrow="Who it’s for" title="One system, three views of the same farms">
        <div className="grid gap-6 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.role} className="rounded-2xl border border-stone-200/80 p-7 transition hover:border-brand-300 hover:bg-brand-50/30">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">{r.icon}</span>
              <h3 className="mt-5 text-xl font-bold">{r.role}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{r.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-stone-500"><Users className="h-4 w-4" aria-hidden /> Each person sees only the farms they own or are assigned to, enforced by the server.</p>
      </Section>

      <section id="trust" className="scroll-mt-10 px-5 pb-24 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-ink-900 px-6 py-14 sm:px-12">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
          <div className="relative grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Data &amp; trust</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Honest about what the data can and cannot say</h2>
              <p className="mt-4 text-brand-100/80">Biosecurity decisions affect livelihoods, so the system shows where every number comes from and where its limits are.</p>
            </div>
            <ul className="space-y-4 text-sm text-brand-100/90">
              {[
                'Farm data comes only from what users record. Nothing is filled in automatically.',
                'Weather, disease notices and census figures carry their source and a link to it.',
                'Risk scores summarise recorded gaps in practice under provisional rules. They are not disease probabilities.',
                'The health-screening aid uses a model trained on synthetic data. It never replaces a veterinarian.',
              ].map((t) => <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-brand-400" aria-hidden />{t}</li>)}
            </ul>
          </div>
          <div className="relative mt-12 flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
            <Link to={user ? '/dashboard' : '/login'} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50">
              {user ? 'Open your dashboard' : 'Sign in'} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-sm text-brand-100/70">Accounts are issued by the department administrator.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Brand />
            <p className="mt-3 text-sm text-stone-500">
              Individual internship prototype for Smart India Hackathon problem statement 25006, developed during an internship with the
              Department of Animal Husbandry and Veterinary Services, Haveri. Not an official government service.
            </p>
          </div>
          <div className="text-sm text-stone-500">
            <p className="font-semibold text-stone-700">Data sources</p>
            <ul className="mt-2 space-y-1">
              <li><a className="hover:text-brand-700" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather: Open-Meteo.com (CC BY 4.0)</a></li>
              <li><a className="hover:text-brand-700" href="https://data.gov.in/" target="_blank" rel="noopener noreferrer">Statistics: Open Government Data Platform India</a></li>
              <li>Notices: linked official publications</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
