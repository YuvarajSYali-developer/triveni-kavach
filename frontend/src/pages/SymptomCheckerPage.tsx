import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Api } from '../api/endpoints';
import type { SavedSymptomCheck } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import SymptomChecker from '../components/SymptomChecker';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Pager, Spinner, Table } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { fmtDateTime, humanize } from '../lib/format';
import { useAsync } from '../lib/useAsync';

export default function SymptomCheckerPage() {
  const [version, setVersion] = useState(0);
  const lib = useAsync(() => Api.publicLibrary(), []);
  const farms = useAsync(() => Api.farms({ limit: 200 }), []);
  const farmParam = Number(useSearchParams()[0].get('farm')) || null;
  const initialFarm = farms.data?.items.find((f) => f.id === farmParam);
  return (
    <div>
      <PageHeader eyebrow="Disease awareness" title="Symptom checker"
        subtitle="Compare the signs you see with published veterinary descriptions. Save checks to a farm so a veterinarian can record the confirmed diagnosis." />
      <Card>
        {lib.loading || (farmParam && farms.loading) ? <Spinner /> : lib.error ? <ErrorState error={lib.error} onRetry={lib.reload} />
          : <SymptomChecker library={lib.data!} mode="app" farms={farms.data?.items ?? []} initialFarm={initialFarm} onSaved={() => setVersion((v) => v + 1)} />}
      </Card>
      <div className="mt-6"><Card title="Saved checks"><CheckHistory key={version} /></Card></div>
    </div>
  );
}

const LIMIT = 15;
export function CheckHistory({ farmId }: { farmId?: number }) {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [confirming, setConfirming] = useState<SavedSymptomCheck | null>(null);
  const { data, error, loading, reload } = useAsync(() => Api.symptomChecks({ farm_id: farmId, limit: LIMIT, offset }), [farmId, offset]);
  const canConfirm = user?.role === 'admin' || user?.role === 'veterinarian';
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.items.length) return <EmptyState title="No saved checks yet" hint="Use “Check and save to records” to keep a check with a farm." />;
  return (
    <>
      <Table head={<><th className="th">When</th><th className="th">Species</th><th className="th">Closest matches</th><th className="th">Farm</th><th className="th">Confirmed diagnosis</th><th className="th" /></>}>
        {data.items.map((c) => (
          <tr key={c.id}>
            <td className="td whitespace-nowrap">{fmtDateTime(c.created_at)}{c.animal_identifier && <span className="block text-xs text-stone-500">{c.animal_identifier}</span>}</td>
            <td className="td">{humanize(c.species)}</td>
            <td className="td">{c.results.slice(0, 2).map((r) => `${r.name} (${r.match_score})`).join(', ') || '—'}{c.urgent && <span className="ml-1"><Badge tone="red">reportable</Badge></span>}</td>
            <td className="td">{c.farm_id ? <Link to={`/farms/${c.farm_id}`} className="text-brand-700 hover:underline">#{c.farm_id}</Link> : '—'}</td>
            <td className="td">{c.confirmed_diagnosis ? <><span className="font-medium">{c.confirmed_diagnosis}</span><span className="block text-xs text-stone-500">{humanize(c.diagnosis_method ?? '')}</span></> : <span className="text-stone-400">Pending</span>}</td>
            <td className="td text-right">{canConfirm && !c.confirmed_diagnosis && <Button variant="secondary" className="!py-1" onClick={() => setConfirming(c)}><ClipboardCheck className="h-4 w-4" aria-hidden /> Confirm</Button>}</td>
          </tr>
        ))}
      </Table>
      <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
      <Modal open={!!confirming} title="Record confirmed diagnosis" onClose={() => setConfirming(null)}>
        {confirming && <ConfirmForm check={confirming} onDone={() => { setConfirming(null); reload(); }} />}
      </Modal>
    </>
  );
}

function ConfirmForm({ check, onDone }: { check: SavedSymptomCheck; onDone: () => void }) {
  const [diagnosis, setDiagnosis] = useState(check.results[0]?.name ?? '');
  const [method, setMethod] = useState('clinical');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await Api.confirmSymptomCheck(check.id, { diagnosis: diagnosis.trim(), method, notes: notes || null }); onDone(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4 text-sm">
      <p className="text-stone-600">Record what the animal was actually diagnosed with. Confirmed cases form a real, veterinarian-labelled dataset for training a future model.</p>
      <label className="block"><span className="label">Diagnosis</span>
        <input className="input" list="dx-options" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        <datalist id="dx-options">{check.results.map((r) => <option key={r.disease_id} value={r.name} />)}</datalist></label>
      <label className="block"><span className="label">Confirmed by</span>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="clinical">Clinical examination</option><option value="laboratory">Laboratory test</option><option value="post_mortem">Post-mortem</option>
        </select></label>
      <label className="block"><span className="label">Notes (optional)</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p role="alert" className="text-red-700">{err}</p>}
      <div className="flex justify-end"><Button onClick={submit} loading={busy} disabled={diagnosis.trim().length < 2}>Save diagnosis</Button></div>
    </div>
  );
}
