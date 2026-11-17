'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { MapPoint } from '../components/LiveMap';

const LiveMap = dynamic(() => import('../components/LiveMap'), { ssr: false });

type Profile = { id: string; full_name: string | null; role: string; approved: boolean };
type Ride = {
  id: string; rider_id: string; driver_id: string | null; status: string;
  dest_address: string; pickup_lat: number; pickup_lng: number;
  dest_lat: number; dest_lng: number; offered_price: number; final_price: number | null;
};
type Loc = { driver_id: string; ride_id: string | null; lat: number; lng: number };
type Sos = { id: string; user_id: string; lat: number | null; lng: number | null; created_at: string };

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [alerts, setAlerts] = useState<Sos[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setMe(null); return; }
    supabase.from('profiles').select('id, full_name, role, approved')
      .eq('id', session.user.id).single()
      .then(({ data }) => setMe(data as Profile | null));
  }, [session]);

  const isAdmin = me?.role === 'admin';

  const load = useCallback(async () => {
    const [p, r, s, l] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, approved'),
      supabase.from('rides').select('*')
        .in('status', ['requested', 'accepted', 'arriving', 'in_progress'])
        .order('created_at', { ascending: false }),
      supabase.from('sos_alerts').select('*').eq('resolved', false).order('created_at', { ascending: false }),
      supabase.from('driver_locations').select('*'),
    ]);
    setProfiles((p.data ?? []) as Profile[]);
    setRides((r.data ?? []) as Ride[]);
    setAlerts((s.data ?? []) as Sos[]);
    setLocs(Object.fromEntries(((l.data ?? []) as Loc[]).map((x) => [x.driver_id, x])));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    const ch = supabase.channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<Loc>;
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
  }, [isAdmin, load]);

  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setError(error ? error.message : '');
  }
  async function toggleApproval(d: Profile) {
    await supabase.from('profiles').update({ approved: !d.approved }).eq('id', d.id);
    load();
  }
  async function resolveSos(id: string) {
    await supabase.from('sos_alerts').update({ resolved: true }).eq('id', id);
    load();
  }

  // ---- Login screen ----
  if (!session) {
    return (
      <main className="min-h-screen bg-white text-black flex items-center justify-center">
        <form onSubmit={login} className="w-80 space-y-3">
          <h1 className="text-2xl font-bold">Negotiate Taxi Admin</h1>
          <input className="w-full border rounded p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full border rounded p-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="w-full bg-black text-white rounded p-2">Log in</button>
        </form>
      </main>
    );
  }

  if (me && !isAdmin) {
    return (
      <main className="min-h-screen bg-white text-black p-8">
        <p>This account is not an admin.</p>
        <button className="underline" onClick={() => supabase.auth.signOut()}>Log out</button>
      </main>
    );
  }
  if (!me) return <main className="min-h-screen bg-white text-black p-8">Loading...</main>;

  // ---- Dashboard ----
  const activeRides = rides.filter((r) => r.status !== 'requested');
  const driverPoints: MapPoint[] = Object.values(locs)
    .filter((l) => l.ride_id)
    .map((l) => ({ id: 'd' + l.driver_id, lat: l.lat, lng: l.lng, color: '#2563eb', label: 'Driver: ' + name(l.driver_id) }));
  const ridePoints: MapPoint[] = rides.flatMap((r) =>
    r.status === 'requested'
      ? [{ id: 'p' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#f59e0b', label: 'Waiting rider: ' + name(r.rider_id) }]
      : [
          { id: 'p' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#16a34a', label: 'Pickup: ' + name(r.rider_id) },
          { id: 'x' + r.id, lat: r.dest_lat, lng: r.dest_lng, color: '#6b7280', label: 'Destination' },
        ]
  );
  const sosPoints: MapPoint[] = alerts
    .filter((a) => a.lat !== null && a.lng !== null)
    .map((a) => ({ id: 's' + a.id, lat: a.lat as number, lng: a.lng as number, color: '#dc2626', label: 'SOS: ' + name(a.user_id) }));
  const drivers = profiles.filter((p) => p.role === 'driver');

  return (
    <main className="min-h-screen bg-white text-black p-6 space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Negotiate Taxi: live admin</h1>
        <button className="underline" onClick={() => supabase.auth.signOut()}>Log out</button>
      </header>

      {alerts.length > 0 && (
        <section className="border-2 border-red-600 rounded p-3 space-y-2">
          <h2 className="font-bold text-red-600">🚨 Active SOS alerts</h2>
          {alerts.map((a) => (
            <div key={a.id} className="flex justify-between items-center">
              <span>{name(a.user_id)}, {new Date(a.created_at).toLocaleTimeString()}</span>
              <button className="bg-red-600 text-white rounded px-3 py-1" onClick={() => resolveSos(a.id)}>Mark resolved</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <p className="text-sm mb-2">
          Blue = driver, green = pickup, gray = destination, orange = rider waiting, red = SOS
        </p>
        <LiveMap points={[...ridePoints, ...driverPoints, ...sosPoints]} />
      </section>

      <section>
        <h2 className="font-bold mb-2">Active rides ({activeRides.length})</h2>
        {activeRides.length === 0 && <p>None</p>}
        {activeRides.map((r) => (
          <div key={r.id} className="border-b py-1 text-sm">
            {name(r.rider_id)} with {name(r.driver_id)}, {r.status.replace('_', ' ')}, {r.final_price} kr, to {r.dest_address}
          </div>
        ))}
        <p className="text-sm mt-2">Riders waiting for offers: {rides.filter((r) => r.status === 'requested').length}</p>
      </section>

      <section>
        <h2 className="font-bold mb-2">Drivers</h2>
        {drivers.length === 0 && <p>No drivers yet</p>}
        {drivers.map((d) => (
          <div key={d.id} className="flex justify-between items-center border-b py-1">
            <span>{d.full_name ?? 'Unnamed'}: {d.approved ? 'approved' : 'waiting for approval'}</span>
            <button className="border rounded px-3 py-1" onClick={() => toggleApproval(d)}>
              {d.approved ? 'Revoke' : 'Approve'}
            </button>
          </div>
        ))}
      </section>
    </main>
  );
}