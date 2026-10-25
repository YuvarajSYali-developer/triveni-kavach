import { CloudSun, ExternalLink, Megaphone, ThermometerSun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import type { Attribution, OutbreakNotice, Weather } from '../api/types';
import { fmtDate, fmtNum } from '../lib/format';
import { weatherLabel } from '../lib/weather';
import { useAsync } from '../lib/useAsync';
import { ApiError } from '../api/client';
import { Card, ErrorState, Notice, Spinner } from './ui';

export function SourceLink({ name, url }: { name: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
      {name} <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

export function WeatherAttribution({ a }: { a: Attribution }) {
  return (
    <p className="text-[11px] text-stone-500">
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{a.text}</a> ·{' '}
      <a href={a.licence_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{a.licence}</a>
    </p>
  );
}

export function WeatherCard({ farmId }: { farmId: number }) {
  const w = useAsync(() => Api.farmWeather(farmId), [farmId]);
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><CloudSun className="h-4 w-4 text-brand-600" aria-hidden /> Local weather (live)</span>}>
      {w.loading ? <Spinner label="Fetching live weather…" /> : w.error ? (
        w.error instanceof ApiError && w.error.status === 404
          ? <p className="text-sm text-stone-500">{w.error.message} Live weather is available for the taluks of Haveri district.</p>
          : <ErrorState error={w.error} onRetry={w.reload} />
      ) : w.data && <WeatherBody w={w.data} />}
    </Card>
  );
}

function WeatherBody({ w }: { w: Weather }) {
  const c = w.current;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-stone-500">Regional conditions near {w.taluk} town (not a measurement inside the farm sheds). Updated {w.observed_at ? w.observed_at.replace('T', ' ') : '—'} ({w.timezone ?? 'local time'}).</p>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div><p className="text-3xl font-semibold">{c.temperature_c !== null ? `${c.temperature_c.toFixed(1)} °C` : '—'}</p>
          <p className="text-stone-500">{weatherLabel(c.weather_code)}{c.apparent_temperature_c !== null && ` · feels like ${c.apparent_temperature_c.toFixed(0)} °C`}</p></div>
        <dl className="grid grid-cols-3 gap-4 text-xs">
          <div><dt className="text-stone-500">Humidity</dt><dd className="font-medium">{fmtNum(c.relative_humidity_pct)} %</dd></div>
          <div><dt className="text-stone-500">Wind</dt><dd className="font-medium">{fmtNum(c.wind_speed_kmh, 0)} km/h</dd></div>
          <div><dt className="text-stone-500">Rain now</dt><dd className="font-medium">{fmtNum(c.precipitation_mm, 1)} mm</dd></div>
        </dl>
      </div>
      <table className="min-w-full text-xs">
        <thead><tr><th className="th">Day</th><th className="th text-right">Max °C</th><th className="th text-right">Min °C</th><th className="th text-right">Rain mm</th></tr></thead>
        <tbody>{w.forecast.map((f) => (
          <tr key={f.date}><td className="td">{fmtDate(f.date)}</td><td className="td text-right">{fmtNum(f.temperature_max_c, 1)}</td>
            <td className="td text-right">{fmtNum(f.temperature_min_c, 1)}</td><td className="td text-right">{fmtNum(f.precipitation_mm, 1)}</td></tr>
        ))}</tbody>
      </table>
      {w.advisories.map((a) => (
        <Notice key={a}><span className="inline-flex items-start gap-1.5"><ThermometerSun className="mt-0.5 h-4 w-4 flex-none" aria-hidden />{a}</span></Notice>
      ))}
      <WeatherAttribution a={w.attribution} />
    </div>
  );
}

export function TalukWeatherTable() {
  const all = useAsync(
    async () => {
      const list = (await Api.weatherLocations()).locations;
      return Promise.all(list.map((l) => Api.weather(l.district, l.taluk).then((w) => ({ ok: true as const, w, l }), (e: Error) => ({ ok: false as const, e, l }))));
    }, [],
  );
  if (all.loading) return <Spinner label="Fetching live weather for each taluk…" />;
  if (all.error) return <ErrorState error={all.error} onRetry={all.reload} />;
  const rows = all.data ?? [];
  const first = rows.find((r) => r.ok);
  if (rows.length && !first) {
    const reason = rows[0].ok ? '' : rows[0].e.message;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span>Live weather is unavailable right now. {reason}</span>
        <button onClick={all.reload} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100">Retry</button>
      </div>
    );
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr><th className="th">Taluk</th><th className="th text-right">Now °C</th><th className="th text-right">RH %</th><th className="th">Conditions</th><th className="th text-right">3-day max °C</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => r.ok ? (
              <tr key={r.l.taluk}>
                <td className="td">{r.w.taluk}</td><td className="td text-right">{fmtNum(r.w.current.temperature_c, 1)}</td>
                <td className="td text-right">{fmtNum(r.w.current.relative_humidity_pct)}</td><td className="td">{weatherLabel(r.w.current.weather_code)}</td>
                <td className={`td text-right ${r.w.advisories.length ? 'font-medium text-red-700' : ''}`}>
                  {fmtNum(Math.max(...r.w.forecast.map((f) => f.temperature_max_c ?? -99)), 1)}</td>
              </tr>
            ) : (
              <tr key={r.l.taluk}><td className="td">{r.l.taluk}</td><td className="td text-stone-500" colSpan={4}>Unavailable: {r.e.message}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Regional weather at taluk headquarters towns; red = forecast maximum at or above the provisional 35 °C heat advisory threshold.</p>
      {first?.ok && <WeatherAttribution a={first.w.attribution} />}
    </div>
  );
}

export function AdvisoryBanner({ farmId }: { farmId: number }) {
  const adv = useAsync(() => Api.farmAdvisories(farmId), [farmId]);
  if (!adv.data?.length) return null;
  return (
    <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="mb-2 flex items-center gap-1.5 font-semibold"><Megaphone className="h-4 w-4" aria-hidden /> Official disease notice{adv.data.length > 1 ? 's' : ''} for this district</p>
      <ul className="space-y-1.5">{adv.data.map((n) => <NoticeLine key={n.id} n={n} />)}</ul>
      <p className="mt-2 text-xs text-red-800">Follow the instructions of the issuing authority and contact your veterinarian. <Link to="/notices" className="underline">All notices</Link></p>
    </div>
  );
}

export function NoticeLine({ n }: { n: Pick<OutbreakNotice, 'disease' | 'district' | 'taluk' | 'reported_on' | 'source_name' | 'source_url'> }) {
  return (
    <li>
      <strong>{n.disease}</strong> — {n.taluk ? `${n.taluk}, ` : ''}{n.district}, reported {fmtDate(n.reported_on)} · Source: <SourceLink name={n.source_name} url={n.source_url} />
    </li>
  );
}
