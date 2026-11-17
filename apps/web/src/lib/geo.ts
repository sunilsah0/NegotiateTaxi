import type { Pos } from './types';

export type Place = { lat: number; lng: number; label: string };

async function nominatim(q: string): Promise<Place | null> {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('nominatim ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || j.length === 0) return null;
  return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: String(j[0].display_name) };
}

async function photon(q: string): Promise<Place | null> {
  const r = await fetch('https://photon.komoot.io/api/?limit=1&lat=59.33&lon=18.07&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('photon ' + r.status);
  const j = await r.json();
  const f = j.features?.[0];
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  const p = f.properties ?? {};
  const label = [p.name, p.street, p.city].filter(Boolean).join(', ') || q;
  return { lat, lng, label };
}

// Tries one free geocoder, then the other
export async function geocode(q: string): Promise<Place | null> {
  try { const a = await nominatim(q); if (a) return a; } catch { /* try the next one */ }
  try { return await photon(q); } catch { return null; }
}

export function distanceKm(a: Pos, b: Pos) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Placeholder tariff for road kilometres. Tune later.
export function suggestPrice(roadKm: number) {
  return Math.round(59 + 15 * roadKm);
}

// Real road route from the free OSRM demo server; falls back to a straight line
export async function getRoute(a: Pos, b: Pos) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    const route = j.routes?.[0];
    if (!route) throw new Error('no route');
    return {
      km: route.distance / 1000 as number,
      minutes: route.duration / 60 as number,
      line: (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]),
    };
  } catch {
    const km = distanceKm(a, b) * 1.3;
    return { km, minutes: km * 2.5, line: [[a.lat, a.lng], [b.lat, b.lng]] as [number, number][] };
  }
}