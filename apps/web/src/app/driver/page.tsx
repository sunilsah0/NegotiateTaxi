'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../lib/useProfile';
import { usePosition } from '../../lib/usePosition';
import { distanceKm, getRoute, suggestPrice } from '../../lib/geo';
import type { Pos, Ride } from '../../lib/types';
import AppShell from '../../components/AppShell';
import AuthPanel from '../../components/AuthPanel';
import WrongRole from '../../components/WrongRole';
import SosButton from '../../components/SosButton';
import type { MapPoint } from '../../components/LiveMap';

const LiveMap = dynamic(() => import('../../components/LiveMap'), { ssr: false });

const STEPS = ['accepted', 'arriving', 'in_progress'];
const NEXT: Record<string, { status: string; label: string }> = {
  accepted: { status: 'arriving', label: 'I’m on my way' },
  arriving: { status: 'in_progress', label: 'Start trip' },
  in_progress: { status: 'completed', label: 'Complete trip' },
};

export default function DriverPage() {
  const { session, profile, ready, signOut } = useProfile();
  if (!ready) return <div className="nt-center"><p className="nt-muted">Loading…</p></div>;
  if (!session) return <AuthPanel title="Drive with Negotiate Taxi" subtitle="Go online, receive requests, name your price." signupRole="driver" />;
  if (profile?.role !== 'driver') return <WrongRole expected="driver" actual={profile?.role} />;
  return (
    <AppShell label="Driver" name={profile?.full_name} onLogout={signOut}>
      <DriverApp userId={session.user.id} approvedInitial={!!profile?.approved} />
    </AppShell>
  );
}

function DriverApp({ userId, approvedInitial }: { userId: string; approvedInitial: boolean }) {
  const [approved, setApproved] = useState(approvedInitial);
  const [online, setOnline] = useState(false);
  const [open, setOpen] = useState<Ride[]>([]);
  const [myOffers, setMyOffers] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Ride | null>(null);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [line, setLine] = useState<[number, number][] | undefined>();
  const [msg, setMsg] = useState('');
  const rideId = active?.id ?? null;
  const tracking = approved && (online || !!active);
  const { pos, error: locError } = usePosition(tracking);
  const posRef = useRef<Pos | null>(null);

  useEffect(() => { posRef.current = pos; }, [pos]);

  // Live approval changes
  useEffect(() => {
    const ch = supabase.channel('web-approval-' + userId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (p) => {
        const n = p.new as { approved?: boolean };
        setApproved(!!n.approved);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const load = useCallback(async () => {
    const { data: a } = await supabase.from('rides').select('*').eq('driver_id', userId)
      .in('status', ['accepted', 'arriving', 'in_progress']).limit(1).maybeSingle();
    setActive((a as Ride | null) ?? null);
    if (a) return;
    const { data: o } = await supabase.from('rides').select('*').eq('status', 'requested').order('created_at', { ascending: false });
    setOpen((o ?? []) as Ride[]);
    const { data: mo } = await supabase.from('offers').select('ride_id, price').eq('driver_id', userId).eq('status', 'pending');
    setMyOffers(Object.fromEntries((mo ?? []).map((x: { ride_id: string; price: number }) => [x.ride_id, x.price])));
  }, [userId]);

  useEffect(() => {
    if (!approved) return;
    load();
    const ch = supabase.channel('web-driver-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `driver_id=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [approved, userId, load]);

  // Broadcast my live location every 4 seconds while online or on a ride
  useEffect(() => {
    if (!tracking) return;
    const send = () => {
      const p = posRef.current;
      if (!p) return;
      supabase.from('driver_locations').upsert({
        driver_id: userId, ride_id: rideId, lat: p.lat, lng: p.lng, updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.warn(error.message); });
    };
    send();
    const t = setInterval(send, 4000);
    return () => clearInterval(t);
  }, [tracking, rideId, userId]);

  // Keep the screen awake so GPS keeps flowing
  useEffect(() => {
    if (!tracking || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, [tracking]);

  // Route: me to pickup, then pickup to destination
  useEffect(() => {
    if (!active) { setLine(undefined); return; }
    const pickup = { lat: active.pickup_lat, lng: active.pickup_lng };
    const dest = { lat: active.dest_lat, lng: active.dest_lng };
    const inTrip = active.status === 'in_progress';
    const from = inTrip ? pickup : pos;
    if (!from) return;
    let cancelled = false;
    getRoute(from, inTrip ? dest : pickup).then((r) => { if (!cancelled) setLine(r.line); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status, !!pos]);

  async function toggleOnline() {
    if (online) {
      setOnline(false);
      await supabase.from('driver_locations').delete().eq('driver_id', userId);
    } else {
      setOnline(true);
    }
  }

  async function sendOffer(r: Ride, p: number) {
    if (!p || p <= 0) { setMsg('Enter a price first.'); return; }
    const { error } = await supabase.from('offers').upsert(
      { ride_id: r.id, driver_id: userId, price: p, status: 'pending' },
      { onConflict: 'ride_id,driver_id' }
    );
    setMsg(error ? error.message : '');
    load();
  }

  async function advance(status: string) {
    if (!active) return;
    const { error } = await supabase.rpc('set_ride_status', { p_ride: active.id, p_status: status });
    if (error) setMsg(error.message);
    load();
  }

  if (!approved) {
    return (
      <div className="nt-page">
        <div className="nt-card">
          <h2 className="nt-h3">Waiting for approval</h2>
          <p className="nt-muted">An admin must verify your taxi permit and driver licence before you can take rides. This page unlocks by itself once you are approved.</p>
        </div>
      </div>
    );
  }

  const points: MapPoint[] = [];
  if (pos) points.push({ id: 'me', lat: pos.lat, lng: pos.lng, color: '#3b82f6', label: 'You', pulse: true });
  if (active) {
    points.push({ id: 'pickup', lat: active.pickup_lat, lng: active.pickup_lng, color: '#22c55e', label: 'Pickup' });
    points.push({ id: 'dest', lat: active.dest_lat, lng: active.dest_lng, color: '#ef4444', label: 'Destination' });
  } else if (online) {
    open.forEach((r) => points.push({ id: r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#f59e0b', label: `${r.offered_price} kr offer`, pulse: true }));
  }
  const fitKey = active ? `${active.id}-${active.status}-${line?.length ?? 0}` : `${open.length}-${pos ? 'p' : 'n'}-${online}`;
  const next = active ? NEXT[active.status] : null;

  return (
    <div className="nt-stage" style={{ ['--off' as string]: '60px' } as React.CSSProperties}>
      <div className="nt-panel">
        {msg && <div className="nt-card"><p className="nt-muted">{msg}</p></div>}
        {locError && <div className="nt-card"><p className="nt-muted">{locError}</p></div>}

        {active && next && (
          <>
            <div className="nt-steps">
              {STEPS.map((s, i) => <div key={s} className={`nt-step ${i <= STEPS.indexOf(active.status) ? 'on' : ''}`} />)}
            </div>
            <div className="nt-card">
              <p className="nt-muted">Agreed fixed price</p>
              <div className="nt-price">{active.final_price} kr</div>
              <p className="nt-muted">To: {active.dest_address}</p>
              <p className="nt-muted">{active.status === 'in_progress' ? 'Drive to the destination.' : 'Drive to the pickup point (green).'}</p>
            </div>
            <button className="nt-btn nt-primary" onClick={() => advance(next.status)}>{next.label}</button>
            <SosButton userId={userId} rideId={active.id} pos={pos} />
          </>
        )}

        {!active && !online && (
          <div className="nt-card">
            <h2 className="nt-h3">You are offline</h2>
            <p className="nt-muted">Go online to see ride requests nearby and share your live location with riders you are matched with.</p>
            <button className="nt-btn nt-primary" onClick={toggleOnline}>Go online</button>
          </div>
        )}

        {!active && online && (
          <>
            <div className="nt-offer">
              <h2 className="nt-h3">Ride requests ({open.length})</h2>
              <button className="nt-btn sm" onClick={toggleOnline}>Go offline</button>
            </div>
            {open.length === 0 && <p className="nt-muted nt-pulse">Listening for new requests…</p>}
            {open.map((r) => {
              const pickup = { lat: r.pickup_lat, lng: r.pickup_lng };
              const km = distanceKm(pickup, { lat: r.dest_lat, lng: r.dest_lng }) * 1.3;
              const away = pos ? distanceKm(pos, pickup) : null;
              return (
                <div key={r.id} className="nt-card">
                  <p className="nt-muted">To: {r.dest_address}</p>
                  <p className="nt-muted">
                    Trip about {km.toFixed(1)} km · typical price about {suggestPrice(km)} kr
                    {away !== null && ` · ${away.toFixed(1)} km to pickup`}
                  </p>
                  <div className="nt-price">{r.offered_price} kr</div>
                  {myOffers[r.id] && <p className="nt-muted">Your offer: {myOffers[r.id]} kr (waiting for the rider)</p>}
                  <button className="nt-btn nt-primary" onClick={() => sendOffer(r, r.offered_price)}>Accept {r.offered_price} kr</button>
                  <div className="nt-row">
                    <input className="nt-input" type="number" inputMode="numeric" placeholder="Counter price"
                      value={counter[r.id] ?? ''} onChange={(e) => setCounter({ ...counter, [r.id]: e.target.value })} />
                    <button className="nt-btn" onClick={() => sendOffer(r, parseInt(counter[r.id] ?? '', 10))}>Counter</button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      <div className="nt-map"><LiveMap points={points} line={active ? line : undefined} fitKey={fitKey} /></div>
    </div>
  );
}