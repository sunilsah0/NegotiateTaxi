'use client';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { id: string; lat: number; lng: number; color: string; label: string };

export default function LiveMap({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer center={[59.3293, 18.0686]} zoom={11} style={{ height: 480, width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={9}
          pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.8 }}
        >
          <Tooltip>{p.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}