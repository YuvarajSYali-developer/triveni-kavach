import { AlertTriangle, Bell, CalendarClock, ClipboardCheck, HeartPulse, Syringe, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Api } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { SERIES, SimpleBars, SpeciesBars } from '../components/charts';
import { Card, EmptyState, ErrorState, Notice, PageHeader, Spinner, StatCard, StatusBadge } from '../components/ui';
import { daysAgo, fmtDate, fmtDateTime, fmtNum, humanize, isoDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const PRESETS = [30, 90, 180, 365];
const TITLES = {
  admin: ['Department dashboard', 'All registered farms'],
  veterinarian: ['Veterinarian dashboard', 'Farms assigned to you'],
  farmer: ['My farm dashboard', 'Farms registered to you'],
} as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(daysAgo(89));
  const [to, setTo] = useState(isoDate(new Date()));
  const { data, error, loading, reload } = useAsync(() => Api.dashboard({ date_from: from, date_to: to }), [from, to]);
  if (!user) return null;
  const [title, scope] = TITLES[user.role];

  const filters = (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Date range">
      {PRESETS.map((d) => (
        <button key={d} onClick={() => { setFrom(daysAgo(d - 1)); setTo(isoDate(new Date())); }}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${from === daysAgo(d - 1) && to === isoDate(new Date()) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50'}`}>
          {d === 365 ? '1 year' : `${d} days`}
        </button>
      ))}
      <label className="text-xs text-stone-500">From<input type="date" className="input mt-0.5 !py-1" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
      <label className="text-xs text-stone-500">To<input type="date" className="input mt-0.5 !py-1" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
    </div>
  );

  return (
    <div>
      <PageHeader title={title} subtitle={`${scope} · figures computed from database records for the selected period`} actions={filters} />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {data.contains_demo_data && (
            <Notice>Includes <strong>fictional demonstration records</strong> created by the development seed script. They are not real farms or observations.</Notice>
          )}
          {data.farms.total === 0 ? (
            <Card><EmptyState title="No farms yet" hint={user.role === 'veterinarian' ? 'No farms have been assigned to you. An administrator assigns farms.' : 'Register a farm to start recording biosecurity data.'}
              action={user.role !== 'veterinarian' ? <Link to="/farms" className="text-sm font-medium text-brand-700 underline">Go to farms</Link> : undefined} /></Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                <StatCard label="Farms" value={fmtNum(data.farms.total)} icon={<Warehouse className="h-4 w-4" />}
                  hint={`${fmtNum(data.farms.population.pig)} pigs · ${fmtNum(data.farms.population.poultry)} poultry recorded`} />
                <StatCard label="Active alerts" value={data.alerts.active} icon={<Bell className="h-4 w-4" />} tone={data.alerts.by_severity.high ? 'danger' : data.alerts.active ? 'warn' : 'default'}
                  hint={`${data.alerts.by_severity.high} high · ${data.alerts.open} unacknowledged`} />
                <StatCard label="Deaths recorded" value={fmtNum(data.mortality.total_in_period)} icon={<HeartPulse className="h-4 w-4" />}
                  hint={`${data.mortality.reports_in_period} reports in period`} />
                <StatCard label="Vaccinations given" value={data.vaccinations.completed_in_period} icon={<Syringe className="h-4 w-4" />}
                  hint={`${data.vaccinations.missed_in_period} recorded as missed`} />
                <StatCard label="Overdue vaccinations" value={data.vaccinations.overdue} icon={<CalendarClock className="h-4 w-4" />} tone={data.vaccinations.overdue ? 'danger' : 'default'}
                  hint={`${data.vaccinations.due_next_30_days} due in next 30 days`} />
                <StatCard label="Hygiene inspections" value={data.hygiene.inspections_in_period} icon={<ClipboardCheck className="h-4 w-4" />} tone={data.hygiene.failed ? 'warn' : 'default'}
                  hint={`${data.hygiene.passed} passed · ${data.hygiene.failed} failed`} />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card title="Farms requiring follow-up" className="lg:col-span-2"
                  actions={<Link to="/alerts" className="text-xs font-medium text-brand-700 hover:underline">View alerts</Link>}>
                  {data.follow_up_farms.length === 0 ? <EmptyState title="No farms currently flagged" hint="Based on active high-severity alerts and the latest rule-based assessment of each farm." /> : (
                    <ul className="divide-y divide-stone-100">
                      {data.follow_up_farms.map((f) => (
                        <li key={f.farm_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                          <div>
                            <Link to={`/farms/${f.farm_id}`} className="text-sm font-medium text-stone-900 hover:text-brand-700 hover:underline">{f.farm_name}</Link>
                            <p className="text-xs text-stone-500">{f.taluk} · {f.reasons.join('; ')}</p>
                          </div>
                          <div className="text-right"><StatusBadge value={f.latest_status} />
                            <p className="mt-0.5 text-[11px] text-stone-400">{f.latest_assessed_at ? `assessed ${fmtDate(f.latest_assessed_at)}` : ''}</p></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Latest assessment status by farm">
                  <SimpleBars rows={data.risk_status.map((r) => ({ status: humanize(r.status), farms: r.count }))} x="status" y="farms" yLabel="Farms"
                    empty="No farms" />
                  <p className="mt-2 text-xs text-stone-500">Rule-based biosecurity status — not a disease probability.</p>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Recorded mortality per week">
                  <SpeciesBars rows={data.mortality.weekly} empty="No mortality reports in this period." />
                </Card>
                <Card title="Vaccinations administered per month">
                  <SimpleBars rows={data.vaccinations.monthly_completed} x="month" y="completed" yLabel="Vaccinations" empty="No completed vaccinations in this period." />
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card title="Upcoming vaccinations (30 days)">
                  <DueList items={data.vaccinations.upcoming} empty="Nothing scheduled in the next 30 days." />
                  {data.vaccinations.overdue_items.length > 0 && (
                    <>
                      <p className="mb-1 mt-4 flex items-center gap-1 text-xs font-semibold uppercase text-red-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Overdue</p>
                      <DueList items={data.vaccinations.overdue_items} empty="" />
                    </>
                  )}
                </Card>
                {user.role === 'admin' ? (
                  <Card title="Farms by type">
                    <SimpleBars rows={data.farms.by_type.map((t) => ({ type: humanize(t.type), farms: t.count, key: t.type }))} x="type" y="farms" yLabel="Farms"
                      colorFor={(r) => SERIES[r.key as keyof typeof SERIES]} empty="No farms" />
                  </Card>
                ) : (
                  <Card title="Environmental readings in period">
                    <EnvSummary readings={data.environment.readings_in_period} />
                  </Card>
                )}
                <Card title={user.role === 'admin' ? 'Recent administrative activity' : 'Recent activity on your farms'}>
                  {data.recent_activity.length === 0 ? <EmptyState title="No activity recorded yet" /> : (
                    <ul className="max-h-72 space-y-2 overflow-y-auto">
                      {data.recent_activity.map((a, i) => (
                        <li key={i} className="text-sm">
                          <p className="text-stone-800">{a.summary}</p>
                          <p className="text-xs text-stone-500">{a.actor} · {fmtDateTime(a.at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              {user.role === 'admin' && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card title="Farms and active alerts by taluk">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead><tr><th className="th">Taluk</th><th className="th text-right">Farms</th><th className="th text-right">Active alerts</th></tr></thead>
                        <tbody className="divide-y divide-stone-100">
                          {data.farms.by_taluk.map((t) => (
                            <tr key={t.taluk}><td className="td">{t.taluk}</td><td className="td text-right">{t.farms}</td>
                              <td className="td text-right">{t.open_alerts ? <span className="font-medium text-red-700">{t.open_alerts}</span> : 0}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">A map is not shown: farms store taluk-level locations only, and precise coordinates are not collected.</p>
                  </Card>
                  <Card title="Environmental readings and screenings in period">
                    <EnvSummary readings={data.environment.readings_in_period} />
                    <p className="mt-3 text-sm text-stone-600">Animal-health screening requests: <strong>{data.screenings_in_period}</strong></p>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DueList({ items, empty }: { items: { id: number; farm_id: number; farm_name: string; vaccine_name: string; species: string; due_on: string }[]; empty: string }) {
  if (!items.length) return empty ? <p className="text-sm text-stone-500">{empty}</p> : null;
  return (
    <ul className="space-y-2">
      {items.map((v) => (
        <li key={v.id} className="flex items-start justify-between gap-2 text-sm">
          <div><p className="font-medium text-stone-800">{v.vaccine_name} <span className="font-normal text-stone-500">({v.species})</span></p>
            <Link to={`/farms/${v.farm_id}`} className="text-xs text-brand-700 hover:underline">{v.farm_name}</Link></div>
          <span className="whitespace-nowrap text-xs text-stone-600">{fmtDate(v.due_on)}</span>
        </li>
      ))}
    </ul>
  );
}

function EnvSummary({ readings }: { readings: Partial<Record<string, number>> }) {
  const entries = Object.entries(readings);
  if (!entries.length) return <p className="text-sm text-stone-500">No environmental readings in this period.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {entries.map(([src, n]) => (
        <li key={src} className="flex items-center justify-between"><StatusBadge value={src} /><span className="font-medium">{fmtNum(n)}</span></li>
      ))}
      <li className="pt-1 text-xs text-stone-500">“Simulated” readings are generated demonstration values, not measurements.</li>
    </ul>
  );
}
