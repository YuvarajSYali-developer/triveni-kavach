import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Api } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import FarmForm from '../components/FarmForm';
import { HAVERI_TALUKS } from '../lib/constants';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pager, Spinner, StatusBadge, Table } from '../components/ui';
import { fmtNum, humanize } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const LIMIT = 25;

export default function FarmsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [taluk, setTaluk] = useState('');
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, error, loading, reload } = useAsync(
    () => Api.farms({ q: debounced, farm_type: type, taluk, limit: LIMIT, offset }), [debounced, type, taluk, offset],
  );
  const canCreate = user?.role === 'admin' || user?.role === 'farmer';
  const filtered = !!(debounced || type || taluk);

  return (
    <div>
      <PageHeader title="Farms" subtitle={user?.role === 'admin' ? 'All registered pig, poultry and mixed farms' : user?.role === 'veterinarian' ? 'Farms assigned to you' : 'Your registered farms'}
        actions={canCreate && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Register farm</Button>} />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="relative">
            <span className="sr-only">Search farms</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" aria-hidden />
            <input className="input pl-9" placeholder="Search by farm or village name" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" aria-label="Farm type" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}>
            <option value="">All types</option><option value="pig">Pig</option><option value="poultry">Poultry</option><option value="mixed">Mixed</option>
          </select>
          <select className="input" aria-label="Taluk" value={taluk} onChange={(e) => { setTaluk(e.target.value); setOffset(0); }}>
            <option value="">All taluks</option>{HAVERI_TALUKS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Spinner /> : data && data.items.length === 0 ? (
          <EmptyState title={filtered ? 'No farms match these filters' : 'No farms yet'}
            hint={filtered ? 'Try clearing the search or filters.' : canCreate ? 'Register the first farm to start keeping records.' : 'Farms assigned to you will appear here.'} />
        ) : data && (
          <>
            <Table head={<><th className="th">Farm</th><th className="th">Type</th><th className="th">Location</th><th className="th text-right">Animals</th>
              <th className="th">Veterinarian</th><th className="th">Latest assessment</th><th className="th text-right">Active alerts</th></>}>
              {data.items.map((f) => (
                <tr key={f.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navigate(`/farms/${f.id}`)}>
                  <td className="td"><Link to={`/farms/${f.id}`} className="font-medium text-stone-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{f.name}</Link>
                    {f.is_demo && <span className="ml-2"><Badge>demo</Badge></span>}</td>
                  <td className="td">{humanize(f.farm_type)}</td>
                  <td className="td">{f.taluk}, {f.district}</td>
                  <td className="td text-right">{fmtNum(f.total_animals)}</td>
                  <td className="td">{f.veterinarian?.full_name ?? <span className="text-stone-400">Unassigned</span>}</td>
                  <td className="td"><StatusBadge value={f.latest_status} /></td>
                  <td className="td text-right">{f.open_alerts ? <span className="font-medium text-red-700">{f.open_alerts}</span> : 0}</td>
                </tr>
              ))}
            </Table>
            <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <Modal open={creating} title="Register a farm" onClose={() => setCreating(false)} wide>
        <FarmForm onCancel={() => setCreating(false)} onSaved={(f) => { setCreating(false); navigate(`/farms/${f.id}`); }} />
      </Modal>
    </div>
  );
}
