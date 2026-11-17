'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { id: string; lat: number; lng: number; color: string; label: string; pulse?: boolean };

function Fit({ points, line, fitKey }: { points: MapPoint[]; line?: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = points.map((p) => [p.lat, p.lng] as [number, number]);
    if (line) pts.push(...line);
    if (pts.length === 0) return;
    if (pts.length === 1) { map.setView(pts[0], 14, { animate: true }); return; }
    map.fitBounds(pts, { padding: [50, 50], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

export default function LiveMap({ points, line, fitKey }: { points: MapPoint[]; line?: [number, number][]; fitKey?: string }) {
  return (
    <MapContainer center={[59.3293, 18.0686]} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution="Tiles &copy; Esri"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        maxZoom={18}
      />
      {line && line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: '#facc15', weight: 4, opacity: 0.85, dashArray: '6 8' }} />
      )}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.pulse ? 11 : 9}
          pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.85, className: p.pulse ? 'nt-pulse' : undefined }}
        >
          <Tooltip>{p.label}</Tooltip>
        </CircleMarker>
      ))}
      <Fit points={points} line={line} fitKey={fitKey ?? String(points.length)} />
    </MapContainer>
  );
}