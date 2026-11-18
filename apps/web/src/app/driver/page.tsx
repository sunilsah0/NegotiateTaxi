'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../lib/useProfile';
import { usePosition } from '../../lib/usePosition';
import { distanceKm, getRoute } from '../../lib/geo';
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
  const [candidates, setCandidates] = useState<Ride[]>([]);
  const [myOffers, setMyOffers] = useState<Record<string, number>>({});
  const [actives, setActives] = useState<Ride[]>([]);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [line, setLine] = useState<[number, number][] | undefined>();
  const [msg, setMsg] = useState('');
  const [poolAlert, setPoolAlert] = useState('');
  const seen = useRef<Set<string>>(new Set());
  const posRef = useRef<Pos | null>(null);

  const primary = actives.find((r) => !r.pool_parent) ?? actives[0] ?? null;
  const rideId = primary?.id ?? null;
  const hasMate = actives.some((r) => !!r.pool_parent);
  const tracking = approved && (online || actives.length > 0);
  const { pos, error: locError } = usePosition(tracking);

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
      .in('status', ['accepted', 'arriving', 'in_progress']).order('created_at', { ascending: true });
    const list = (a ?? []) as Ride[];
    setActives(list);
    const prim = list.find((r) => !r.pool_parent) ?? null;

    if (list.length === 0) {
      const { data: o } = await supabase.from('rides').select('*').eq('status', 'requested').order('created_at', { ascending: false });
      setOpen((o ?? []) as Ride[]);
      setCandidates([]);
    } else {
      setOpen([]);
      if (prim && prim.allow_pool && !list.some((r) => r.pool_parent)) {
        // Only riders on the same route who also allowed sharing are returned
        const { data: c } = await supabase.rpc('pool_candidates', { p_primary: prim.id });
        setCandidates((c ?? []) as Ride[]);
      } else {
        setCandidates([]);
      }
    }
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

  // Notify the driver when a new passenger appears on the same route
  useEffect(() => {
    const fresh = candidates.filter((c) => !seen.current.has(c.id));
    if (fresh.length === 0) return;
    fresh.forEach((c) => seen.current.add(c.id));
    setPoolAlert(`${fresh.length} new passenger${fresh.length > 1 ? 's' : ''} on your route`);
    if ('vibrate' in navigator) navigator.vibrate(200);
  }, [candidates]);

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

  // Route: me to pickup, then pickup to destination (first passenger)
  useEffect(() => {
    if (!primary) { setLine(undefined); return; }
    const pickup = { lat: primary.pickup_lat, lng: primary.pickup_lng };
    const dest = { lat: primary.dest_lat, lng: primary.dest_lng };
    const inTrip = primary.status === 'in_progress';
    const from = inTrip ? pickup : pos;
    if (!from) return;
    let cancelled = false;
    getRoute(from, inTrip ? dest : pickup).then((r) => { if (!cancelled) setLine(r.line); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary?.id, primary?.status, !!pos]);

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
    if (r.min_price !== null && r.max_price !== null && (p < r.min_price || p > r.max_price)) {
      setMsg(`Price must be between ${r.min_price} and ${r.max_price} kr for this trip.`);
      return;
    }
    const { error } = await supabase.from('offers').upsert(
      { ride_id: r.id, driver_id: userId, price: p, status: 'pending' },
      { onConflict: 'ride_id,driver_id' }
    );
    setMsg(error ? error.message : '');
    load();
  }

  async function advance(r: Ride, status: string) {
    const { error } = await supabase.rpc('set_ride_status', { p_ride: r.id, p_status: status });
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

  const requestCard = (r: Ride, pool: boolean) => {
    const pickup = { lat: r.pickup_lat, lng: r.pickup_lng };
    const away = pos ? distanceKm(pos, pickup) : null;
    return (
      <div key={r.id} className="nt-card">
        {pool && <span className="nt-badge">Same route</span>}
        <p className="nt-muted">To: {r.dest_address}</p>
        <p className="nt-muted">
          {r.est_km !== null && `${Number(r.est_km).toFixed(1)} km · `}market guide {r.guide_price} kr · allowed {r.min_price} to {r.max_price} kr
          {away !== null && ` · ${away.toFixed(1)} km to pickup`}
        </p>
        <div className="nt-price">{r.offered_price} kr</div>
        {myOffers[r.id] && <p className="nt-muted">Your offer: {myOffers[r.id]} kr (waiting for the rider)</p>}
        <button className="nt-btn nt-primary" onClick={() => sendOffer(r, r.offered_price)}>Offer {r.offered_price} kr</button>
        <div className="nt-row">
          <input className="nt-input" type="number" inputMode="numeric" placeholder="Counter price"
            value={counter[r.id] ?? ''} onChange={(e) => setCounter({ ...counter, [r.id]: e.target.value })} />
          <button className="nt-btn" onClick={() => sendOffer(r, parseInt(counter[r.id] ?? '', 10))}>Counter</button>
        </div>
      </div>
    );
  };

  const points: MapPoint[] = [];
  if (pos) points.push({ id: 'me', lat: pos.lat, lng: pos.lng, color: '#3b82f6', label: 'You', pulse: true });
  actives.forEach((r) => {
    points.push({ id: 'p' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#22c55e', label: r.pool_parent ? 'Shared passenger pickup' : 'Pickup' });
    points.push({ id: 'd' + r.id, lat: r.dest_lat, lng: r.dest_lng, color: '#ef4444', label: 'Destination' });
  });
  if (actives.length === 0 && online) {
    open.forEach((r) => points.push({ id: r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#f59e0b', label: `${r.offered_price} kr offer`, pulse: true }));
  } else {
    candidates.forEach((r) => points.push({ id: 'c' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#f59e0b', label: `Same route: ${r.offered_price} kr`, pulse: true }));
  }
  const fitKey = actives.length
    ? `${actives.map((r) => r.id + r.status).join('|')}-${line?.length ?? 0}`
    : `${open.length}-${pos ? 'p' : 'n'}-${online}`;

  return (
    <div className="nt-stage" style={{ ['--off' as string]: '60px' } as React.CSSProperties}>
      <div className="nt-panel">
        {msg && <div className="nt-card"><p className="nt-muted">{msg}</p></div>}
        {locError && <div className="nt-card"><p className="nt-muted">{locError}</p></div>}
        {poolAlert && (
          <div className="nt-card nt-alert nt-offer">
            <span>🔔 {poolAlert}</span>
            <button className="nt-btn sm" onClick={() => setPoolAlert('')}>OK</button>
          </div>
        )}

        {actives.length > 0 && (
          <>
            {actives.map((r) => {
              const next = NEXT[r.status];
              return (
                <div key={r.id} className="nt-card">
                  <div className="nt-offer">
                    <span className="nt-muted">{r.pool_parent ? 'Shared passenger' : 'Passenger'}</span>
                    <span className="nt-badge">{r.status.replace('_', ' ')}</span>
                  </div>
                  <div className="nt-steps">
                    {STEPS.map((s, i) => <div key={s} className={`nt-step ${i <= STEPS.indexOf(r.status) ? 'on' : ''}`} />)}
                  </div>
                  <div className="nt-price">{r.final_price} kr</div>
                  <p className="nt-muted">To: {r.dest_address}</p>
                  {next && <button className="nt-btn nt-primary" onClick={() => advance(r, next.status)}>{next.label}</button>}
                </div>
              );
            })}
            {primary && <SosButton userId={userId} rideId={primary.id} pos={pos} />}

            {primary && !primary.allow_pool && !hasMate && (
              <div className="nt-card">
                <p className="nt-muted">Your passenger did not allow shared rides, so you cannot add another passenger on this trip.</p>
              </div>
            )}
            {hasMate && <p className="nt-muted">You have a shared passenger (the maximum is one extra).</p>}
            {primary?.allow_pool && !hasMate && (
              <>
                <h2 className="nt-h3">Passengers on your route ({candidates.length})</h2>
                {candidates.length === 0 && <p className="nt-muted nt-pulse">Watching for passengers on the same route…</p>}
                {candidates.map((r) => requestCard(r, true))}
              </>
            )}
          </>
        )}

        {actives.length === 0 && !online && (
          <div className="nt-card">
            <h2 className="nt-h3">You are offline</h2>
            <p className="nt-muted">Go online to see ride requests nearby and share your live location with riders you are matched with.</p>
            <button className="nt-btn nt-primary" onClick={toggleOnline}>Go online</button>
          </div>
        )}

        {actives.length === 0 && online && (
          <>
            <div className="nt-offer">
              <h2 className="nt-h3">Ride requests ({open.length})</h2>
              <button className="nt-btn sm" onClick={toggleOnline}>Go offline</button>
            </div>
            {open.length === 0 && <p className="nt-muted nt-pulse">Listening for new requests…</p>}
            {open.map((r) => requestCard(r, false))}
          </>
        )}
      </div>
      <div className="nt-map"><LiveMap points={points} line={primary ? line : undefined} fitKey={fitKey} /></div>
    </div>
  );
}