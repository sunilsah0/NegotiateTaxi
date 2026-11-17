import { Pos } from './types';

// Free OpenStreetMap search (fine for development; not for heavy production use)
export async function geocode(query: string) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': 'NegotiateTaxi-student-project' } });
  const json = await res.json();
  if (!json.length) return null;
  return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), label: json[0].display_name as string };
}

// Straight-line distance in km (haversine)
export function distanceKm(a: Pos, b: Pos) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Placeholder tariff: start fee + per-km price, x1.3 because roads are longer than straight lines.
// Tune these numbers later.
export function suggestPrice(km: number) {
  return Math.round(59 + 15 * km * 1.3);
}