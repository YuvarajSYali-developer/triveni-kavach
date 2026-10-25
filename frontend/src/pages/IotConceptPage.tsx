import { Card, Notice, PageHeader } from '../components/ui';
import { API_BASE } from '../api/client';

type Stage = { title: string; detail: string; status: 'implemented' | 'referenced' | 'proposed' };
const STAGES: Stage[] = [
  { title: 'Environmental sensors', detail: 'Temperature, humidity, air quality (e.g. ammonia)', status: 'referenced' },
  { title: 'Edge device', detail: 'Microcontroller that samples and batches readings', status: 'proposed' },
  { title: 'Communication layer', detail: 'Wi-Fi / GSM / MQTT bridge — not chosen', status: 'proposed' },
  { title: 'Ingestion API', detail: 'POST /telemetry/ingest with validation', status: 'implemented' },
  { title: 'Database', detail: 'environmental_observations with explicit source', status: 'implemented' },
  { title: 'Dashboard & rules', detail: 'Charts + ENVIRONMENT_OUT_OF_RANGE rule', status: 'implemented' },
];
const STYLE = {
  implemented: { fill: '#f1f8f2', stroke: '#2d6f40', label: 'Implemented in software' },
  referenced: { fill: '#eff6ff', stroke: '#2a78d6', label: 'Mentioned in SIH reference material; not built' },
  proposed: { fill: '#fafaf9', stroke: '#a8a29e', label: 'Proposed design option; not built' },
};

const EXAMPLE = `POST ${API_BASE}/telemetry/ingest
Authorization: Bearer <token>
Content-Type: application/json

{
  "farm_id": 3,
  "readings": [
    {
      "observed_at": "2026-10-25T06:00:00Z",
      "shed_label": "Shed 1",
      "temperature_c": 27.4,
      "relative_humidity_pct": 66.0,
      "ammonia_ppm": 11.5,
      "source": "simulated"
    }
  ]
}`;

export default function IotConceptPage() {
  const w = 150, gap = 22, h = 92;
  return (
    <div>
      <PageHeader title="IoT integration concept" subtitle="A software-only demonstration. No physical hardware has been built, installed or tested." />
      <div className="space-y-6">
        <Notice>
          Environmental data in this system comes from two sources only: <strong>manual</strong> entry by a person, and the <strong>simulated</strong> telemetry
          generator. The <code>device</code> source is reserved for a future, tested integration and is rejected by the API in this deployment.
        </Notice>
        <Card title="Conceptual data flow">
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${STAGES.length * (w + gap)} ${h + 50}`} className="min-w-[900px]" role="img" aria-label="Sensors to edge device to communication layer to ingestion API to database to dashboard">
              {STAGES.map((s, i) => {
                const x = i * (w + gap), st = STYLE[s.status];
                return (
                  <g key={s.title}>
                    <rect x={x + 1} y={1} width={w} height={h} rx={8} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={s.status === 'implemented' ? undefined : '5 4'} />
                    <text x={x + w / 2 + 1} y={32} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1c1917">{s.title}</text>
                    <foreignObject x={x + 8} y={42} width={w - 14} height={h - 44}>
                      <p style={{ fontSize: 11, color: '#57534e', textAlign: 'center', lineHeight: 1.3 }}>{s.detail}</p>
                    </foreignObject>
                    {i < STAGES.length - 1 && <path d={`M${x + w + 4} ${h / 2} l${gap - 8} 0`} stroke="#78716c" strokeWidth={1.5} markerEnd="url(#arrow)" />}
                  </g>
                );
              })}
              <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="#78716c" /></marker></defs>
              <g transform={`translate(0 ${h + 22})`} fontSize={11} fill="#57534e">
                {(['implemented', 'referenced', 'proposed'] as const).map((k, i) => (
                  <g key={k} transform={`translate(${i * 300} 0)`}>
                    <rect width={14} height={14} rx={3} fill={STYLE[k].fill} stroke={STYLE[k].stroke} strokeDasharray={k === 'implemented' ? undefined : '3 2'} />
                    <text x={20} y={11}>{STYLE[k].label}</text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="What the reference material actually contains">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700">
              <li>The SIH React prototype lists “IoT Integration: real-time environmental monitoring with temperature, humidity, and air quality sensors” as a feature, and shows fixed temperature (24 °C) and humidity (65 %) values in the farmer screen. These values were hard-coded, not sensor data.</li>
              <li>The IoT reference image and the original SIH presentation were <strong>not available</strong> in the supplied repositories, so specific hardware components (board, sensor models, radio) cannot be confirmed and are not named here.</li>
              <li>Everything left of the ingestion API in the diagram is therefore a proposal.</li>
            </ul>
          </Card>
          <Card title="Proposed future device contract">
            <p className="mb-2 text-sm text-stone-600">A future device would post batches to the existing ingestion endpoint with <code>source: "device"</code> and a <code>device_id</code>, after the integration is tested and <code>ALLOW_DEVICE_SOURCE</code> is enabled. Today the same contract accepts <code>manual</code> and <code>simulated</code>:</p>
            <pre className="overflow-x-auto rounded-md bg-stone-900 p-3 text-xs text-stone-100">{EXAMPLE}</pre>
            <p className="mt-2 text-xs text-stone-500">Device authentication (per-device keys rather than user tokens) is an open design item; see docs/iot-concept.md.</p>
          </Card>
        </div>
        <Card title="Try it">
          <p className="text-sm text-stone-600">Open a farm → <strong>Environment</strong> tab → <strong>Simulate telemetry</strong>, optionally with an out-of-range excursion, then run the biosecurity assessment to see the environment rule evaluate the simulated values (with a data-quality warning that they are simulated).</p>
        </Card>
      </div>
    </div>
  );
}
