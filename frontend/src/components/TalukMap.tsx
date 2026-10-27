import 'leaflet/dist/leaflet.css';
import { useState, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { HAVERI_CENTER } from '../lib/constants';

export interface MapPoint {
  id: string;
  position: [number, number];
  label: string;
  color: string;
  radius?: number;
  tooltip?: string;
  popup?: ReactNode;
  pulse?: boolean;
}

/** Leaflet map of Haveri district with taluk-level circle markers.
 * Tiles: CARTO Voyager (OpenStreetMap data), free with attribution, no API key. */
export default function TalukMap({ points, height = 380, zoom = 9, className = '', legend }: {
  points: MapPoint[]; height?: number; zoom?: number; className?: string; legend?: ReactNode;
}) {
  const [tileError, setTileError] = useState(false);
  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 ${className}`} style={{ height }}>
      <MapContainer center={HAVERI_CENTER} zoom={zoom} scrollWheelZoom={false} className="h-full w-full bg-[#e8eee9]" attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={18}
          eventHandlers={{ tileerror: () => setTileError(true) }}
        />
        {points.map((p) => (
          <CircleMarker key={p.id} center={p.position} radius={p.radius ?? 12}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: p.color, fillOpacity: 0.9 }}>
            {p.tooltip && <Tooltip direction="top" offset={[0, -8]} permanent className="taluk-tooltip">{p.tooltip}</Tooltip>}
            {p.popup && <Popup>{p.popup}</Popup>}
          </CircleMarker>
        ))}
      </MapContainer>
      {legend && <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-white/95 px-3 py-2 text-xs shadow-md">{legend}</div>}
      {tileError && (
        <p className="absolute right-3 top-3 z-[400] rounded-md bg-white/95 px-2 py-1 text-[11px] text-stone-500 shadow">Base map tiles could not load; markers are still accurate.</p>
      )}
    </div>
  );
}
