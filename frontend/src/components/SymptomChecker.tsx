import { AlertOctagon, BookOpen, CheckCircle2, ChevronRight, ExternalLink, RotateCcw, Save, Search, ShieldAlert, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Api } from '../api/endpoints';
import type { Farm, SymptomCheckResult, SymptomLibrary, SymptomResult } from '../api/types';
import { errorMessage } from '../lib/errors';
import { humanize } from '../lib/format';
import { Badge, Button, Notice, Spinner } from './ui';

type Species = 'pig' | 'poultry';
const SPECIES: { id: Species; emoji: string; label: string; examples: string }[] = [
  { id: 'pig', emoji: '🐖', label: 'Pigs', examples: 'incl. ASF, CSF, FMD' },
  { id: 'poultry', emoji: '🐓', label: 'Poultry', examples: 'incl. bird flu, Ranikhet' },
];

export default function SymptomChecker({ library, mode, farms = [], onSaved, initialFarm }: {
  library: SymptomLibrary; mode: 'public' | 'app'; farms?: Farm[]; onSaved?: (id: number) => void; initialFarm?: Farm;
}) {
  const [species, setSpecies] = useState<Species>(initialFarm?.farm_type === 'poultry' ? 'poultry' : 'pig');
  const [age, setAge] = useState<string>('');
  const [suddenDeaths, setSuddenDeaths] = useState(false);
  const [signs, setSigns] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [farmId, setFarmId] = useState(initialFarm ? String(initialFarm.id) : '');
  const [animalId, setAnimalId] = useState('');
  const [result, setResult] = useState<SymptomCheckResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const kb = library.species[species];
  const eligibleFarms = farms.filter((f) => f.farm_type === 'mixed' || f.farm_type === species);
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return kb.signs.map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [kb, filter]);

  const switchSpecies = (s: Species) => { setSpecies(s); setSigns([]); setAge(''); setResult(null); setSavedId(null); };
  const toggle = (id: string) => { setSigns((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); setResult(null); setSavedId(null); };
  const reset = () => { setSigns([]); setAge(''); setSuddenDeaths(false); setResult(null); setSavedId(null); setErr(null); };
  const body = () => ({ species, signs, age_group: age || null, sudden_deaths: suddenDeaths });

  const run = async (save: boolean) => {
    setBusy(save ? 'save' : 'check'); setErr(null);
    try {
      if (save) {
        const r = await Api.saveSymptomCheck({ ...body(), farm_id: farmId ? Number(farmId) : null, animal_identifier: animalId || null });
        setResult(r); setSavedId(r.id); onSaved?.(r.id);
      } else {
        setResult(await Api.publicCheck(body()));
      }
      setTimeout(() => document.getElementById('checker-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-6">
        <section>
          <StepTitle n={1} title="Which animals?" />
          <div className="grid grid-cols-2 gap-3">
            {SPECIES.map((s) => (
              <button key={s.id} onClick={() => switchSpecies(s.id)} aria-pressed={species === s.id}
                className={`group rounded-2xl border-2 p-4 text-left transition ${species === s.id ? 'border-brand-500 bg-brand-50/70 shadow-md shadow-brand-900/5' : 'border-stone-200 bg-white hover:border-brand-300'}`}>
                <span className="text-3xl" aria-hidden>{s.emoji}</span>
                <p className="mt-2 font-display text-base font-bold">{s.label}</p>
                <p className="text-xs text-stone-500">{library.counts[s.id]} conditions {s.examples}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <StepTitle n={2} title="Age and pattern" />
          <div className="flex flex-wrap gap-2">
            {kb.age_groups.map((a) => (
              <Chip key={a.id} active={age === a.id} onClick={() => { setAge(age === a.id ? '' : a.id); setResult(null); }}>{a.label}</Chip>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-red-600 focus:ring-red-500" checked={suddenDeaths}
              onChange={(e) => { setSuddenDeaths(e.target.checked); setResult(null); }} />
            <span><strong>Sudden or unusually high deaths</strong> in the last few days</span>
          </label>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <StepTitle n={3} title="What signs do you see?" />
            <span className="mb-3 text-xs font-medium text-brand-700">{signs.length} selected</span>
          </div>
          <label className="relative mb-3 block">
            <span className="sr-only">Filter signs</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" aria-hidden />
            <input className="input pl-9" placeholder="Filter signs, e.g. diarrhoea" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="max-h-[26rem] space-y-4 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">{g.group}</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((i) => <Chip key={i.id} active={signs.includes(i.id)} title={i.help || undefined} onClick={() => toggle(i.id)}>{i.label}</Chip>)}
                </div>
              </div>
            ))}
            {!groups.length && <p className="text-sm text-stone-500">No signs match “{filter}”.</p>}
          </div>
        </section>

        {mode === 'app' && (
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="label">Link to farm (optional)</span>
              <select className="input" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">— not linked —</option>
                {eligibleFarms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select></label>
            <label className="text-sm"><span className="label">Animal / batch ID (optional)</span>
              <input className="input" value={animalId} maxLength={60} onChange={(e) => setAnimalId(e.target.value)} /></label>
          </section>
        )}

        {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(false)} loading={busy === 'check'} disabled={!signs.length} className="!px-5 !py-2.5">
            Check symptoms <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          {mode === 'app' && (
            <Button variant="secondary" onClick={() => run(true)} loading={busy === 'save'} disabled={!signs.length}>
              <Save className="h-4 w-4" aria-hidden /> Check and save to records
            </Button>
          )}
          {(signs.length > 0 || result) && <Button variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden /> Start over</Button>}
        </div>
      </div>

      <div id="checker-results" className="scroll-mt-24">
        {busy && !result ? <Spinner label="Comparing signs…" /> : result ? <Results r={result} savedId={savedId} /> : <Placeholder library={library} />}
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{n}</span>{title}
    </h3>
  );
}

function Chip({ active, children, onClick, title }: { active: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${active
        ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-400 hover:bg-brand-50'}`}>
      {active && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}{children}
    </button>
  );
}

function Placeholder({ library }: { library: SymptomLibrary }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><BookOpen className="h-7 w-7" aria-hidden /></span>
      <p className="mt-4 font-display text-lg font-bold">Results appear here</p>
      <p className="mt-1 max-w-sm text-sm text-stone-500">
        Select the signs you see. The checker compares them with published descriptions of {library.counts.pig + library.counts.poultry} pig and poultry diseases
        and explains every match.
      </p>
    </div>
  );
}

const STRENGTH = { strong: { tone: 'red', label: 'Strong match' }, moderate: { tone: 'amber', label: 'Moderate match' }, weak: { tone: 'gray', label: 'Weak match' } } as const;
const BAR = { strong: 'from-red-500 to-red-400', moderate: 'from-amber-500 to-amber-400', weak: 'from-stone-400 to-stone-300' };

function Results({ r, savedId }: { r: SymptomCheckResult; savedId: number | null }) {
  return (
    <div className="space-y-4 animate-fade-up">
      {r.urgent_warning && (
        <div role="alert" className="rounded-2xl border border-red-300 bg-gradient-to-br from-red-50 to-white p-4 text-sm text-red-900 shadow-sm">
          <p className="flex items-center gap-2 font-display text-base font-bold"><AlertOctagon className="h-5 w-5" aria-hidden /> Report immediately</p>
          <p className="mt-1">{r.urgent_warning}</p>
        </div>
      )}
      {savedId && <Notice tone="green">Saved as check #{savedId}. A veterinarian can record the confirmed diagnosis later.</Notice>}
      {r.no_match ? (
        <Notice>None of the diseases in the knowledge base match these signs. Contact a veterinarian, especially if animals are dying.</Notice>
      ) : r.results.map((m, i) => <ResultCard key={m.disease_id} m={m} rank={i + 1} />)}
      <div className="rounded-2xl bg-stone-100/80 p-4 text-xs leading-relaxed text-stone-600">
        <p className="font-semibold text-stone-700">Always</p>
        <ul className="mt-1 list-disc pl-4">{r.general_advice.map((a) => <li key={a}>{a}</li>)}</ul>
        <p className="mt-3">{r.disclaimer} Knowledge base {r.kb_version} — {r.review_status}.</p>
      </div>
    </div>
  );
}

function ResultCard({ m, rank }: { m: SymptomResult; rank: number }) {
  const s = STRENGTH[m.strength];
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full font-display text-sm font-bold ${rank === 1 ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-lg font-bold leading-tight">{m.name}</h4>
            {m.urgent_report && <Badge tone="red" dot>Reportable</Badge>}
            {m.zoonotic && <Badge tone="violet"><Users className="h-3 w-3" aria-hidden /> Can infect people</Badge>}
            {m.category !== 'infectious' && <Badge>{humanize(m.category)}</Badge>}
          </div>
          <p className="mt-1 text-sm text-stone-600">{m.summary}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="font-semibold text-stone-700">{m.match_score}<span className="font-normal text-stone-400"> / 100 symptom match</span></span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={`Symptom match ${m.match_score} out of 100`}>
          <div className={`h-full rounded-full bg-gradient-to-r ${BAR[m.strength]}`} style={{ width: `${m.match_score}%` }} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Signs that match</p>
          <div className="flex flex-wrap gap-1.5">{m.matched_signs.map((x) => <span key={x} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{x}</span>)}</div></div>
        {m.also_check_for.length > 0 && (
          <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Also look for</p>
            <div className="flex flex-wrap gap-1.5">{m.also_check_for.map((x) => <span key={x} className="rounded-md border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-600">{x}</span>)}</div></div>
        )}
      </div>
      <div className="mt-4 rounded-xl bg-brand-50/60 p-3 text-sm">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-brand-900"><ShieldAlert className="h-4 w-4" aria-hidden /> What to do</p>
        <ul className="list-disc space-y-0.5 pl-5 text-stone-700">{m.actions.map((a) => <li key={a}>{a}</li>)}</ul>
      </div>
      {m.notes.length > 0 && <p className="mt-2 text-xs text-stone-500">{m.notes.join(' ')}</p>}
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
        Sources: {m.sources.map((src) => (
          <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">{src.title}<ExternalLink className="h-3 w-3" aria-hidden /></a>
        ))}
      </p>
    </article>
  );
}
