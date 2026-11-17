'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabase';
import type { Pos, Ride } from '../lib/types';
import type { MapPoint } from './LiveMap';

const LiveMap = dynamic(() => import('./LiveMap'), { ssr: false });

type Share = { ride_id: string; rider_id: string; rides: Ride | null };
const ACTIVE = ['requested', 'accepted', 'arriving', 'in_progress'];

export default function SharedTrips({ userId }: { userId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [driverPos, setDriverPos] = useState<Pos | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ride_shares').select('ride_id, rider_id, rides(*)').eq('friend_id', userId);
    const list = ((data ?? []) as unknown as Share[]).filter((x) => x.rides && ACTIVE.includes(x.rides.status));
    setShares(list);
    const ids = [...new Set(list.map((x) => x.rider_id))];
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((p ?? []).map((x: { id: string; full_name: string | null }) => [x.id, x.full_name ?? 'Friend'])));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('web-shared-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_shares' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  const current = shares.find((x) => x.ride_id === selected)?.rides ?? null;
  const driverId = current?.driver_id ?? null;

  useEffect(() => {
    if (!driverId) { setDriverPos(null); return; }
    supabase.from('driver_locations').select('lat,lng').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (data) setDriverPos({ lat: data.lat, lng: data.lng }); });
    const ch = supabase.channel('web-friend-loc-' + driverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, (p) => {
        const n = p.new as { lat?: number; lng?: number };
        if (typeof n.lat === 'number' && typeof n.lng === 'number') setDriverPos({ lat: n.lat, lng: n.lng });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [driverId]);

  const points: MapPoint[] = [];
  if (current) {
    points.push({ id: 'p', lat: current.pickup_lat, lng: current.pickup_lng, color: '#22c55e', label: 'Pickup' });
    points.push({ id: 'd', lat: current.dest_lat, lng: current.dest_lng, color: '#ef4444', label: 'Destination' });
    if (driverPos) points.push({ id: 'drv', lat: driverPos.lat, lng: driverPos.lng, color: '#3b82f6', label: 'Driver', pulse: true });
  }

  return (
    <div className="nt-stage">
      <div className="nt-panel">
        <h2 className="nt-h3">Trips shared with me</h2>
        {shares.length === 0 && <p className="nt-muted">No friend is sharing a trip right now. Sharing stops automatically when a trip ends.</p>}
        {shares.map((s) => (
          <div key={s.ride_id} className="nt-card">
            <div className="nt-offer">
              <span><b>{names[s.rider_id] ?? 'Friend'}</b><br /><span className="nt-muted">{s.rides?.status.replace('_', ' ')} · to {s.rides?.dest_address.split(',')[0]}</span></span>
              <button className="nt-btn sm nt-primary" onClick={() => setSelected(s.ride_id)}>Track live</button>
            </div>
          </div>
        ))}
        {current && !driverId && <p className="nt-muted">Still looking for a driver…</p>}
      </div>
      <div className="nt-map">
        <LiveMap points={points} fitKey={`${selected}-${driverPos ? driverPos.lat.toFixed(3) + driverPos.lng.toFixed(3) : ''}`} />
      </div>
    </div>
  );
}