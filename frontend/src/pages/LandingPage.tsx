import {
  ArrowRight, BarChart3, Bell, Building2, CheckCircle2, ChevronDown, ClipboardCheck, CloudSun, FileCheck2, Megaphone,
  ShieldCheck, Sparkles, Stethoscope, Syringe, ThermometerSun, Users, Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import type { PublicWeatherLocation, SymptomCheckResult, SymptomLibrary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PublicFooter, PublicNav } from '../components/PublicShell';
import TalukMap, { type MapPoint } from '../components/TalukMap';
import { fmtDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useReveal } from '../lib/useReveal';
import { weatherLabel } from '../lib/weather';

const QUICK_SIGNS = {
  pig: ['fever', 'skin_redness', 'sudden_death', 'cough', 'watery_diarrhoea', 'blisters', 'abortion', 'lameness'],
  poultry: ['sudden_high_mortality', 'twisted_neck', 'green_diarrhoea', 'gasping', 'swollen_head', 'bloody_droppings', 'white_diarrhoea', 'egg_drop'],
} as const;

const FEATURES = [
  { icon: <ClipboardCheck className="h-5 w-5" />, title: 'Complete farm records', text: 'Vaccinations, mortality (including nil reports), hygiene inspections, visitor precautions and shed readings in one place.', color: 'bg-brand-50 text-brand-600' },
  { icon: <Stethoscope className="h-5 w-5" />, title: 'Symptom checker', text: 'Tap the signs you see; get the closest pig or poultry diseases, what to look for next and when to report — with sources.', color: 'bg-rose-50 text-rose-600' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: 'Explainable risk assessment', text: 'Every assessment lists the rules triggered, the evidence behind them and what to do next. Missing data is flagged, never assumed.', color: 'bg-sky-50 text-sky-600' },
  { icon: <Bell className="h-5 w-5" />, title: 'Alerts that don’t pile up', text: 'Deduplicated alerts move from open to acknowledged to resolved, with who acted and when.', color: 'bg-amber-50 text-amber-600' },
  { icon: <Megaphone className="h-5 w-5" />, title: 'Official disease notices', text: 'Outbreak notices from government sources, linked to their publication and shown on every affected farm in the district.', color: 'bg-red-50 text-red-600' },
  { icon: <CloudSun className="h-5 w-5" />, title: 'Live weather & maps', text: 'Current conditions and 3-day forecasts with heat-stress advisories for every taluk, on an interactive map.', color: 'bg-teal-50 text-teal-600' },
  { icon: <BarChart3 className="h-5 w-5" />, title: 'Official statistics', text: 'District pig and poultry populations from the Livestock Census on data.gov.in, with source and year.', color: 'bg-violet-50 text-violet-600' },
  { icon: <Users className="h-5 w-5" />, title: 'Three roles, one truth', text: 'Department, veterinarians and farmers see the same records — each only for the farms they are responsible for.', color: 'bg-orange-50 text-orange-600' },
];

const FAQ: [string, string][] = [
  ['Is the symptom checker a diagnosis?', 'No. It compares the signs you select with published veterinary descriptions and ranks the closest matches. Many diseases look alike; a veterinarian, and often a laboratory test, is needed to confirm. Reportable diseases trigger an instruction to contact the veterinary officer.'],
  ['Where does the information come from?', 'Disease descriptions summarise WOAH disease cards and standard veterinary references (linked on every result). Weather is live from Open-Meteo. Official notices and statistics are entered or imported from government publications with a link to the source.'],
  ['Does the website store what I check?', 'The public checker stores nothing. Signed-in users can choose to save a check to a farm, so a veterinarian can later record the confirmed diagnosis.'],
  ['Who can see my farm records?', 'Only you, the veterinarian assigned to your farm and department administrators. The server enforces this for every request.'],
  ['Does it work on a phone?', 'Yes. Every page is designed for small screens so records can be entered in the shed or during a field visit.'],
];

const TEMP_SCALE = [
  { max: 25, color: '#f9c99a', label: '< 25 °C' },
  { max: 30, color: '#f19a52', label: '25–30 °C' },
  { max: 35, color: '#d9631f', label: '30–35 °C' },
  { max: 99, color: '#9a3a0a', label: '≥ 35 °C' },
];
const tempColor = (t: number | null | undefined) => (t == null ? '#a8a29e' : TEMP_SCALE.find((s) => t < s.max)!.color);

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function QuickChecker({ library }: { library: SymptomLibrary | null }) {
  const [species, setSpecies] = useState<'pig' | 'poultry'>('pig');
  const [signs, setSigns] = useState<string[]>([]);
  const [result, setResult] = useState<SymptomCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    library?.species[species].signs.forEach((g) => g.items.forEach((i) => { m[i.id] = i.label; }));
    return m;
  }, [library, species]);

  useEffect(() => {
    if (!signs.length) { setResult(null); return; }
    const ctrl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      Api.publicCheck({ species, signs, sudden_deaths: signs.includes('sudden_death') || signs.includes('sudden_high_mortality') })
        .then((r) => { if (!ctrl.signal.aborted) setResult(r); })
        .catch(() => { if (!ctrl.signal.aborted) setResult(null); })
        .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    }, 220);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [species, signs]);

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-400/30 via-teal-300/10 to-harvest-400/30 blur-2xl" aria-hidden />
      <div className="relative rounded-3xl border border-white/15 bg-white p-5 shadow-2xl shadow-ink-900/40 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-display text-base font-bold"><Sparkles className="h-4 w-4 text-brand-600" aria-hidden /> Try it now</p>
          <div className="flex rounded-lg bg-stone-100 p-0.5 text-xs font-semibold">
            {(['pig', 'poultry'] as const).map((s) => (
              <button key={s} aria-pressed={species === s} onClick={() => { setSpecies(s); setSigns([]); }}
                className={`rounded-md px-3 py-1 transition ${species === s ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-500'}`}>
                {s === 'pig' ? '🐖 Pig' : '🐓 Poultry'}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500">Tap the signs you see:</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_SIGNS[species].map((id) => {
            const on = signs.includes(id);
            return (
              <button key={id} aria-pressed={on} onClick={() => setSigns((c) => (on ? c.filter((x) => x !== id) : [...c, id]))}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 text-stone-700 hover:border-brand-400 hover:bg-brand-50'}`}>
                {labels[id] ?? id}
              </button>
            );
          })}
        </div>
        <div className="mt-4 min-h-[11.5rem] rounded-2xl bg-stone-50 p-3">
          {!signs.length ? (
            <p className="flex h-[10.5rem] items-center justify-center px-6 text-center text-sm text-stone-400">The closest matching diseases will appear here instantly.</p>
          ) : !result ? (
            <p className="flex h-[10.5rem] items-center justify-center text-sm text-stone-400">{busy ? 'Comparing…' : 'Could not reach the checker.'}</p>
          ) : (
            <div className="space-y-2.5">
              {result.urgent_warning && <p className="rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">Possible reportable disease — contact the veterinary officer</p>}
              {result.results.slice(0, 3).map((r) => (
                <div key={r.disease_id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-800">{r.name}</span>
                    <span className="text-stone-500">{r.match_score}/100</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
                    <div className={`h-full rounded-full transition-all duration-500 ${r.strength === 'strong' ? 'bg-red-500' : r.strength === 'moderate' ? 'bg-amber-500' : 'bg-stone-400'}`} style={{ width: `${r.match_score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-snug text-stone-400">Symptom match, not a diagnosis.</p>
          <Link to="/check" className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand-700 hover:underline">Full checker <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </div>
    </div>
  );
}

function LiveSection() {
  const wx = useAsync(() => Api.publicWeather(), []);
  const notices = useAsync(() => Api.publicNotices(), []);
  const locs: PublicWeatherLocation[] = wx.data?.locations ?? [];
  const okCount = locs.filter((l) => l.ok).length;
  const points: MapPoint[] = locs.map((l) => ({
    id: l.taluk, position: [l.latitude, l.longitude], label: l.taluk, color: tempColor(l.ok ? l.temperature_c : null),
    radius: 13, tooltip: l.ok && l.temperature_c != null ? `${l.taluk} ${Math.round(l.temperature_c)}°` : l.taluk,
    popup: l.ok ? (
      <div className="text-xs leading-relaxed"><p className="font-semibold">{l.taluk}</p>
        <p>{weatherLabel(l.weather_code ?? null)} · {l.temperature_c?.toFixed(1)} °C · RH {l.relative_humidity_pct ?? '—'} %</p>
        <p>Max next 3 days: {l.max_next_days_c?.toFixed(1) ?? '—'} °C{l.heat_advisory && ' · heat advisory'}</p></div>
    ) : <p className="text-xs">{l.taluk}: weather unavailable</p>,
  }));
  const hot = locs.filter((l) => l.ok && l.heat_advisory);

  return (
    <section id="live" className="scroll-mt-10 bg-[#f4f7f5] px-5 py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-600">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" /></span>
            Live from Haveri district
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Right now, across all eight taluks</h2>
          <p className="mt-4 text-stone-600">Live temperatures and 3-day heat outlook for each taluk headquarters, alongside the official disease notices currently in force.</p>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Reveal>
            <TalukMap points={points} height={460} legend={
              <div><p className="mb-1 font-semibold text-stone-700">Temperature now</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">{TEMP_SCALE.map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-stone-400" />unavailable</span></div></div>
            } />
            <p className="mt-2 text-[11px] text-stone-500">Markers sit at taluk headquarters towns. Weather data by Open-Meteo.com (CC BY 4.0).</p>
          </Reveal>
          <div className="space-y-5">
            <Reveal delay={80}>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
                <p className="flex items-center gap-2 font-display font-bold"><ThermometerSun className="h-5 w-5 text-harvest-600" aria-hidden /> Heat outlook</p>
                {wx.loading ? <p className="mt-3 text-sm text-stone-400">Loading live weather…</p>
                  : !okCount ? <p className="mt-3 text-sm text-stone-500">Live weather is unavailable at the moment. It refreshes automatically on your next visit.</p>
                    : hot.length ? <p className="mt-3 text-sm text-stone-700"><strong>{hot.length} of {okCount}</strong> taluks expect 35 °C or more in the next three days: {hot.map((h) => h.taluk).join(', ')}. Shade, ventilation and cool water reduce heat stress.</p>
                      : <p className="mt-3 text-sm text-stone-700">No taluk is forecast to reach 35 °C in the next three days.</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {locs.filter((l) => l.ok).slice(0, 8).map((l) => (
                    <div key={l.taluk} className="flex items-center justify-between rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
                      <span className="font-medium text-stone-700">{l.taluk}</span>
                      <span className="font-semibold" style={{ color: tempColor(l.temperature_c) === '#f9c99a' ? '#b4682b' : tempColor(l.temperature_c) }}>{l.temperature_c?.toFixed(0)}°</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
                <p className="flex items-center gap-2 font-display font-bold"><Megaphone className="h-5 w-5 text-red-600" aria-hidden /> Official disease notices</p>
                {notices.loading ? <p className="mt-3 text-sm text-stone-400">Loading…</p> : !notices.data?.length ? (
                  <p className="mt-3 text-sm text-stone-500">No active official notices have been recorded. Department staff add notices from government publications as they are issued.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">{notices.data.slice(0, 4).map((n) => (
                    <li key={n.id} className="text-sm"><p className="font-semibold text-stone-800">{n.disease}</p>
                      <p className="text-xs text-stone-500">{[n.taluk, n.district].filter(Boolean).join(', ')} · {fmtDate(n.reported_on)} · <a href={n.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{n.source_name}</a></p></li>
                  ))}</ul>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function Section({ id, eyebrow, title, intro, children, className = '' }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-10 px-5 py-20 lg:px-8 lg:py-24 ${className}`}>
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 text-base leading-relaxed text-stone-600">{intro}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const lib = useAsync(() => Api.publicLibrary(), []);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  useReveal([lib.data]);
  const highlights = useMemo(() => {
    if (!lib.data) return [];
    const all = [...lib.data.species.pig.diseases.map((d) => ({ ...d, sp: '🐖' })), ...lib.data.species.poultry.diseases.map((d) => ({ ...d, sp: '🐓' }))];
    return all.filter((d) => d.urgent_report).slice(0, 6);
  }, [lib.data]);
  const totals = lib.data ? { diseases: lib.data.counts.pig + lib.data.counts.poultry, signs: lib.data.sign_counts.pig + lib.data.sign_counts.poultry } : null;

  return (
    <div className="bg-white">
      <div className="relative overflow-hidden bg-ink-900">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div className="absolute -left-40 -top-40 h-[30rem] w-[30rem] animate-pulse rounded-full bg-brand-500/30 blur-3xl [animation-duration:6s]" aria-hidden />
        <div className="absolute -right-32 top-40 h-[26rem] w-[26rem] rounded-full bg-harvest-500/15 blur-3xl" aria-hidden />
        <PublicNav overlay />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-32 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pb-28 lg:pt-40">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden /> Pig &amp; poultry farm biosecurity · Haveri, Karnataka
            </p>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Spot disease early. <span className="bg-gradient-to-r from-brand-300 via-teal-200 to-harvest-400 bg-clip-text text-transparent">Protect every farm.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-100/80">
              A symptom checker for pigs and poultry, farm biosecurity records, explainable risk alerts, official disease notices and live weather —
              for the department, veterinarians and farmers working on the same farms.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/check" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/40 transition hover:-translate-y-0.5 hover:from-brand-400 hover:to-brand-500">
                Check symptoms — free <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to={user ? '/dashboard' : '/login'} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                {user ? 'Open your dashboard' : 'Sign in to the portal'}
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[[totals?.diseases ?? '—', 'diseases covered'], [totals?.signs ?? '—', 'clinical signs'], ['8', 'taluks live']].map(([v, l]) => (
                <div key={String(l)}><dt className="sr-only">{l}</dt><dd className="font-display text-3xl font-extrabold text-white">{v}</dd><p className="text-xs text-brand-100/70">{l}</p></div>
              ))}
            </dl>
          </div>
          <div className="animate-fade-up [animation-delay:150ms]"><QuickChecker library={lib.data} /></div>
        </div>
        <a href="#live" aria-label="Scroll to live map" className="relative mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:text-white"><ChevronDown className="h-5 w-5 animate-bounce" /></a>
      </div>

      <LiveSection />

      <Section id="features" eyebrow="Features" title="Everything a biosecurity programme needs" intro="Built around the daily work of recording, checking and following up on pig and poultry farms.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 70}>
              <div className="group h-full rounded-2xl border border-stone-200/80 bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-lift">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-110 ${f.color}`}>{f.icon}</span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section eyebrow="Disease library" title="Know the diseases that must be reported" intro="Fast-spreading diseases that must be reported to the veterinary officer — with their characteristic signs." className="bg-[#f4f7f5]">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {highlights.map((d, i) => (
            <Reveal key={d.id} delay={(i % 3) * 80}>
              <div className="h-full rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
                <div className="flex items-center gap-2"><span className="text-2xl" aria-hidden>{d.sp}</span><h3 className="font-display text-lg font-bold">{d.name}</h3></div>
                <p className="mt-2 text-sm text-stone-600">{d.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{d.signs.filter((s) => s.weight === 3).map((s) => <span key={s.label} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-800">{s.label}</span>)}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 text-center"><Link to="/diseases" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-brand-400">Browse all {totals?.diseases ?? ''} conditions <ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
      </Section>

      <Section id="how" eyebrow="How it works" title="Record. Assess. Act.">
        <div className="relative grid gap-6 lg:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-12 hidden h-0.5 bg-gradient-to-r from-brand-200 via-brand-400 to-brand-200 lg:block" aria-hidden />
          {[
            { n: '01', icon: <Syringe className="h-5 w-5" />, t: 'Record', d: 'Farmers and veterinarians log vaccinations, deaths, hygiene checks, visitors and shed conditions from any device.' },
            { n: '02', icon: <ShieldCheck className="h-5 w-5" />, t: 'Assess', d: 'One click runs transparent rules over the records, and the symptom checker compares signs with veterinary references.' },
            { n: '03', icon: <FileCheck2 className="h-5 w-5" />, t: 'Act', d: 'Alerts are resolved with notes; reportable diseases are escalated; district notices and heat advisories reach the right farms.' },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="relative h-full rounded-2xl border border-stone-200/80 bg-white p-7 text-center shadow-card">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/20">{s.icon}</span>
                <p className="mt-4 text-xs font-bold tracking-widest text-brand-500">STEP {s.n}</p>
                <h3 className="mt-1 text-xl font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="roles" eyebrow="Who it’s for" title="One system, three views of the same farms" className="bg-[#f4f7f5]">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: <Building2 className="h-6 w-6" />, role: 'Department', text: 'District-wide view of every farm on a live map, follow-up lists, alert status, official notices and statistics, plus user management.' },
            { icon: <Stethoscope className="h-6 w-6" />, role: 'Veterinarians', text: 'Assigned farms, overdue vaccinations, alerts to resolve, and confirmed diagnoses that build a real dataset over time.' },
            { icon: <Warehouse className="h-6 w-6" />, role: 'Farmers', text: 'Simple forms for daily records, the symptom checker, upcoming vaccinations, district advisories and local weather.' },
          ].map((r, i) => (
            <Reveal key={r.role} delay={i * 100}>
              <div className="h-full rounded-2xl border border-stone-200/80 bg-white p-7 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">{r.icon}</span>
                <h3 className="mt-5 text-xl font-bold">{r.role}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{r.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <section className="px-5 py-20 lg:px-8">
        <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-ink-900 px-6 py-14 sm:px-12">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
          <div className="relative grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Data &amp; trust</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Honest about what the data can and cannot say</h2>
              <p className="mt-4 text-brand-100/80">Biosecurity decisions affect livelihoods, so every number shows where it comes from and where its limits are.</p>
            </div>
            <ul className="space-y-4 text-sm text-brand-100/90">
              {[
                'Farm data comes only from what users record — nothing is filled in automatically.',
                'Weather, disease notices, census figures and disease descriptions carry their source and a link to it.',
                'Risk scores and symptom matches are explainable indices, not probabilities or diagnoses.',
                'Veterinarian-confirmed diagnoses are stored so a future model can be trained on real cases.',
              ].map((t) => <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-brand-400" aria-hidden />{t}</li>)}
            </ul>
          </div>
        </Reveal>
      </section>

      <Section id="faq" eyebrow="FAQ" title="Questions people ask">
        <div className="mx-auto max-w-3xl divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white shadow-card">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <button className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left font-semibold text-stone-800" aria-expanded={faqOpen === i} onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {q}<ChevronDown className={`h-5 w-5 flex-none text-stone-400 transition ${faqOpen === i ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {faqOpen === i && <p className="animate-fade-up px-6 pb-5 text-sm leading-relaxed text-stone-600">{a}</p>}
            </div>
          ))}
        </div>
      </Section>

      <section className="px-5 pb-24 lg:px-8">
        <Reveal className="mx-auto flex max-w-7xl flex-col items-center gap-6 rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink-800 px-6 py-14 text-center shadow-lift sm:px-12">
          <h2 className="max-w-2xl font-display text-3xl font-extrabold text-white sm:text-4xl">Seeing something unusual in your shed today?</h2>
          <p className="max-w-xl text-brand-100/90">Check the signs in under a minute. If it could be a reportable disease, you will know whom to call.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/check" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-800 transition hover:-translate-y-0.5">Open the symptom checker <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link to="/diseases" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Disease library</Link>
          </div>
        </Reveal>
      </section>

      <PublicFooter />
    </div>
  );
}
