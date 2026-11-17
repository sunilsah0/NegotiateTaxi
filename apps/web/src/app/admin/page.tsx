'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../lib/useProfile';
import type { Profile } from '../../lib/types';
import AppShell from '../../components/AppShell';
import AuthPanel from '../../components/AuthPanel';
import WrongRole from '../../components/WrongRole';
import type { MapPoint } from '../../components/LiveMap';

const LiveMap = dynamic(() => import('../../components/LiveMap'), { ssr: false });

type AdminRide = {
  id: string; rider_id: string; driver_id: string | null; status: string; dest_address: string;
  pickup_lat: number; pickup_lng: number; dest_lat: number; dest_lng: number;
  offered_price: number; final_price: number | null;
};
type Loc = { driver_id: string; ride_id: string | null; lat: number; lng: number; updated_at: string };
type Sos = { id: string; user_id: string; lat: number | null; lng: number | null; created_at: string };

export default function AdminPage() {
  const { session, profile, ready, signOut } = useProfile();
  if (!ready) return <div className="nt-center"><p className="nt-muted">Loading…</p></div>;
  if (!session) return <AuthPanel title="Admin control room" subtitle="Live view of every trip and driver." />;
  if (profile?.role !== 'admin') return <WrongRole expected="admin" actual={profile?.role} />;
  return (
    <AppShell label="Admin · live" name={profile?.full_name} onLogout={signOut}>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [alerts, setAlerts] = useState<Sos[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [p, r, s, l] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, approved'),
      supabase.from('rides').select('*').in('status', ['requested', 'accepted', 'arriving', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('sos_alerts').select('*').eq('resolved', false).order('created_at', { ascending: false }),
      supabase.from('driver_locations').select('*'),
    ]);
    setProfiles((p.data ?? []) as Profile[]);
    setRides((r.data ?? []) as AdminRide[]);
    setAlerts((s.data ?? []) as Sos[]);
    setLocs(Object.fromEntries(((l.data ?? []) as Loc[]).map((x) => [x.driver_id, x])));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('web-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { driver_id?: string };
          setLocs((prev) => {
            const copy = { ...prev };
            if (old.driver_id) delete copy[old.driver_id];
            return copy;
          });
        } else {
          const n = payload.new as Loc;
          setLocs((prev) => ({ ...prev, [n.driver_id]: n }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';
  const drivers = profiles.filter((p) => p.role === 'driver');
  const freshLocs = Object.values(locs).filter((l) => now === 0 || now - new Date(l.updated_at).getTime() < 120000);
  const activeRides = rides.filter((r) => r.status !== 'requested');
  const waiting = rides.filter((r) => r.status === 'requested');

  async function toggleApproval(d: Profile) {
    await supabase.from('profiles').update({ approved: !d.approved }).eq('id', d.id);
    load();
  }
  async function resolveSos(id: string) {
    await supabase.from('sos_alerts').update({ resolved: true }).eq('id', id);
    load();
  }

  const points: MapPoint[] = [
    ...freshLocs.map((l) => ({
      id: 'd' + l.driver_id, lat: l.lat, lng: l.lng, pulse: true,
      color: l.ride_id ? '#3b82f6' : '#22d3ee',
      label: `${name(l.driver_id)} (${l.ride_id ? 'on a trip' : 'available'})`,
    })),
    ...rides.flatMap((r): MapPoint[] => r.status === 'requested'
      ? [{ id: 'w' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#f59e0b', label: `Waiting rider: ${name(r.rider_id)} (${r.offered_price} kr)` }]
      : [
          { id: 'p' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#22c55e', label: `Pickup: ${name(r.rider_id)}` },
          { id: 'x' + r.id, lat: r.dest_lat, lng: r.dest_lng, color: '#9ca3af', label: 'Destination' },
        ]),
    ...alerts.filter((a) => a.lat !== null && a.lng !== null)
      .map((a) => ({ id: 's' + a.id, lat: a.lat as number, lng: a.lng as number, color: '#ef4444', label: `SOS: ${name(a.user_id)}`, pulse: true })),
  ];

  return (
    <div className="nt-stage" style={{ ['--off' as string]: '60px' } as React.CSSProperties}>
      <div className="nt-panel">
        <div className="nt-stats">
          <div className="nt-card nt-stat"><b>{freshLocs.length}</b><span className="nt-muted">drivers live</span></div>
          <div className="nt-card nt-stat"><b>{activeRides.length}</b><span className="nt-muted">active trips</span></div>
          <div className="nt-card nt-stat"><b>{waiting.length}</b><span className="nt-muted">riders waiting</span></div>
          <div className="nt-card nt-stat"><b style={{ color: alerts.length ? '#ef4444' : undefined }}>{alerts.length}</b><span className="nt-muted">SOS alerts</span></div>
        </div>

        {alerts.length > 0 && (
          <div className="nt-card" style={{ borderColor: '#ef4444' }}>
            <h2 className="nt-h3" style={{ color: '#ef4444' }}>🚨 Active SOS</h2>
            {alerts.map((a) => (
              <div key={a.id} className="nt-offer">
                <span>{name(a.user_id)}<br /><span className="nt-muted">{new Date(a.created_at).toLocaleTimeString()}</span></span>
                <button className="nt-btn sm nt-danger" onClick={() => resolveSos(a.id)}>Resolve</button>
              </div>
            ))}
          </div>
        )}

        <div className="nt-card">
          <h2 className="nt-h3">Active trips</h2>
          {activeRides.length === 0 && <p className="nt-muted">None right now</p>}
          {activeRides.map((r) => (
            <p key={r.id} className="nt-muted">{name(r.rider_id)} with {name(r.driver_id)} · {r.status.replace('_', ' ')} · {r.final_price} kr</p>
          ))}
        </div>

        <div className="nt-card">
          <h2 className="nt-h3">Drivers</h2>
          {drivers.length === 0 && <p className="nt-muted">No drivers yet</p>}
          {drivers.map((d) => (
            <div key={d.id} className="nt-offer">
              <span>{d.full_name ?? 'Unnamed'}<br /><span className="nt-muted">{d.approved ? 'approved' : 'waiting for approval'}</span></span>
              <button className={`nt-btn sm ${d.approved ? '' : 'nt-primary'}`} onClick={() => toggleApproval(d)}>{d.approved ? 'Revoke' : 'Approve'}</button>
            </div>
          ))}
        </div>
        <p className="nt-muted">Map: blue = driver on a trip, cyan = available driver, orange = waiting rider, green = pickup, gray = destination, red = SOS.</p>
      </div>
      <div className="nt-map"><LiveMap points={points} fitKey={String(points.length)} /></div>
    </div>
  );
}