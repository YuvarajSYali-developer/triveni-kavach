import { ExternalLink, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import { PublicPage } from '../components/PublicShell';
import { Badge, ErrorState, Notice, Spinner } from '../components/ui';
import { humanize } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const WEIGHT = { 3: 'bg-brand-600 text-white', 2: 'bg-brand-100 text-brand-800', 1: 'bg-stone-100 text-stone-600' } as Record<number, string>;

export default function DiseaseLibraryPage() {
  const lib = useAsync(() => Api.publicLibrary(), []);
  const [species, setSpecies] = useState<'pig' | 'poultry'>('pig');
  const [q, setQ] = useState('');
  const diseases = useMemo(() => {
    const list = lib.data?.species[species].diseases ?? [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((d) => d.name.toLowerCase().includes(s) || d.signs.some((x) => x.label.toLowerCase().includes(s))) : list;
  }, [lib.data, species, q]);

  return (
    <PublicPage eyebrow="Reference" title="Pig & poultry disease library"
      subtitle="The clinical signs behind the symptom checker, with the characteristic signs highlighted and links to the published sources.">
      {lib.loading ? <Spinner /> : lib.error ? <ErrorState error={lib.error} onRetry={lib.reload} /> : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-card">
            <div className="flex rounded-xl bg-stone-100 p-1">
              {(['pig', 'poultry'] as const).map((s) => (
                <button key={s} onClick={() => setSpecies(s)} aria-pressed={species === s}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${species === s ? 'bg-white text-brand-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                  {s === 'pig' ? '🐖 Pigs' : '🐓 Poultry'} <span className="font-normal text-stone-400">({lib.data!.counts[s]})</span>
                </button>
              ))}
            </div>
            <label className="relative min-w-[14rem] flex-1">
              <span className="sr-only">Search diseases or signs</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" aria-hidden />
              <input className="input pl-9" placeholder="Search a disease or a sign" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Link to="/check" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Open the symptom checker</Link>
          </div>
          <div className="mb-6"><Notice>Knowledge base {lib.data!.kb_version} — <strong>{lib.data!.review_status}</strong>. Information for awareness only; it is not a diagnosis.</Notice></div>
          <div className="grid gap-5 md:grid-cols-2">
            {diseases.map((d) => (
              <article key={d.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card transition hover:shadow-lift">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold">{d.name}</h2>
                  {d.urgent_report && <Badge tone="red" dot>Reportable</Badge>}
                  {d.zoonotic && <Badge tone="violet"><Users className="h-3 w-3" aria-hidden /> Zoonotic</Badge>}
                  {d.category !== 'infectious' && <Badge>{humanize(d.category)}</Badge>}
                </div>
                <p className="mt-1.5 text-sm text-stone-600">{d.summary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.signs.map((s) => <span key={s.label} className={`rounded-md px-2 py-0.5 text-xs ${WEIGHT[s.weight]}`}>{s.label}</span>)}
                </div>
                <p className="mt-3 text-xs text-stone-500">Typical ages: {d.ages.map(humanize).join(', ')}</p>
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-stone-700">{d.actions.map((a) => <li key={a}>{a}</li>)}</ul>
                <p className="mt-3 flex flex-wrap gap-x-3 text-xs">{d.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">{s.title}<ExternalLink className="h-3 w-3" aria-hidden /></a>
                ))}</p>
              </article>
            ))}
            {!diseases.length && <p className="text-sm text-stone-500">Nothing matches “{q}”.</p>}
          </div>
          <p className="mt-6 text-xs text-stone-500">Dark green = characteristic sign · light green = common sign · grey = sometimes seen.</p>
        </>
      )}
    </PublicPage>
  );
}
