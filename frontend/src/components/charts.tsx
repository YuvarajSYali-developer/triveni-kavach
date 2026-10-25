/** Chart helpers. Colour slots come from a validated categorical palette
 * (pig = slot 1 blue, poultry = slot 2 orange, mixed = slot 3 aqua) and follow the
 * entity, never its rank. Grid and axes are recessive; text stays in neutral ink. */
import { useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const SERIES = { pig: '#2a78d6', poultry: '#eb6834', mixed: '#1baf7a', single: '#2d6f40' } as const;
const AXIS = { stroke: '#a8a29e', fontSize: 12, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="#e7e5e4" vertical={false} />;
const TOOLTIP = { contentStyle: { borderRadius: 6, borderColor: '#e7e5e4', fontSize: 12 }, cursor: { fill: '#f5f5f4' } };

/** Chart with a "table view" toggle so every chart has an accessible tabular equivalent. */
export function ChartFrame<T extends Record<string, unknown>>({
  rows, columns, children, height = 240, empty,
}: { rows: T[]; columns: { key: keyof T; label: string }[]; children: ReactNode; height?: number; empty: string }) {
  const [table, setTable] = useState(false);
  if (!rows.length) return <p className="py-10 text-center text-sm text-stone-500">{empty}</p>;
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <button className="text-xs text-stone-500 underline-offset-2 hover:underline" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr>{columns.map((c) => <th key={String(c.key)} className="th">{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={String(c.key)} className="td">{String(r[c.key] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}><ResponsiveContainer>{children as JSX.Element}</ResponsiveContainer></div>
      )}
    </div>
  );
}

export function SimpleBars<T extends Record<string, unknown>>({
  rows, x, y, yLabel, color = SERIES.single, colorFor, empty,
}: { rows: T[]; x: keyof T; y: keyof T; yLabel: string; color?: string; colorFor?: (row: T) => string; empty: string }) {
  return (
    <ChartFrame rows={rows} columns={[{ key: x, label: String(x).replace(/_/g, ' ') }, { key: y, label: yLabel }]} empty={empty}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        {GRID}
        <XAxis dataKey={String(x)} {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} formatter={(v) => [v, yLabel]} />
        <Bar dataKey={String(y)} name={yLabel} fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}
          shape={colorFor ? (props: unknown) => {
            const p = props as { x: number; y: number; width: number; height: number; payload: T };
            return <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height)} rx={4} fill={colorFor(p.payload)} />;
          } : undefined}>
          <LabelList dataKey={String(y)} position="top" fontSize={11} fill="#57534e" />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function SpeciesBars({ rows, empty }: { rows: { week_start: string; pig: number; poultry: number }[]; empty: string }) {
  return (
    <ChartFrame rows={rows} columns={[{ key: 'week_start', label: 'Week starting' }, { key: 'pig', label: 'Pig deaths' }, { key: 'poultry', label: 'Poultry deaths' }]} empty={empty}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
        {GRID}
        <XAxis dataKey="week_start" {...AXIS} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} labelFormatter={(d) => `Week starting ${d}`} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: '#57534e' }} />
        <Bar dataKey="pig" name="Pig" fill={SERIES.pig} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        <Bar dataKey="poultry" name="Poultry" fill={SERIES.poultry} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

export function EnvLines({ rows, empty }: { rows: { t: string; temperature_c: number | null; relative_humidity_pct: number | null; ammonia_ppm: number | null }[]; empty: string }) {
  // One axis per chart: temperature, humidity and ammonia have different units, so they are small multiples.
  const panels = [
    { key: 'temperature_c' as const, label: 'Temperature (°C)', color: SERIES.pig },
    { key: 'relative_humidity_pct' as const, label: 'Relative humidity (%)', color: SERIES.poultry },
    { key: 'ammonia_ppm' as const, label: 'Ammonia (ppm)', color: SERIES.single },
  ].filter((p) => rows.some((r) => r[p.key] !== null));
  if (!rows.length) return <p className="py-10 text-center text-sm text-stone-500">{empty}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {panels.map((p) => (
        <div key={p.key}>
          <p className="mb-1 text-xs font-medium text-stone-600">{p.label}</p>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                {GRID}
                <XAxis dataKey="t" {...AXIS} tick={false} />
                <YAxis {...AXIS} domain={['auto', 'auto']} />
                <Tooltip {...TOOLTIP} cursor={{ stroke: '#a8a29e' }} />
                <Line type="monotone" dataKey={p.key} name={p.label} stroke={p.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
