'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../lib/useProfile';
import { usePosition } from '../../lib/usePosition';
import { distanceKm, geocode, getRoute, quoteTrip } from '../../lib/geo';
import type { TripQuote } from '../../lib/geo';
import type { Offer, Pos, Ride } from '../../lib/types';
import AppShell from '../../components/AppShell';
import AuthPanel from '../../components/AuthPanel';
import WrongRole from '../../components/WrongRole';
import FriendsPanel from '../../components/FriendsPanel';
import SharedTrips from '../../components/SharedTrips';
import ShareRide from '../../components/ShareRide';
import SosButton from '../../components/SosButton';
import PoolPopup from '../../components/PoolPopup';
import type { MapPoint } from '../../components/LiveMap';

const LiveMap = dynamic(() => import('../../components/LiveMap'), { ssr: false });

type Quote = TripQuote & { to: { lat: number; lng: number; label: string } };
const STEPS = ['accepted', 'arriving', 'in_progress'];
const STATUS_TEXT: Record<string, string> = {
  accepted: 'Driver accepted. Getting ready.',
  arriving: 'Your driver is on the way',
  in_progress: 'Trip in progress',
};

export default function RiderPage() {
  const { session, profile, ready, signOut } = useProfile();
  if (!ready) return <div className="nt-center"><p className="nt-muted">Loading…</p></div>;
  if (!session) return <AuthPanel title="Ride with Negotiate Taxi" subtitle="Name your price. Pick your driver." signupRole="rider" />;
  if (profile?.role !== 'rider') return <WrongRole expected="rider" actual={profile?.role} />;
  return (
    <AppShell label="Rider" name={profile?.full_name} onLogout={signOut}>
      <RiderApp userId={session.user.id} />
    </AppShell>
  );
}

function RiderApp({ userId }: { userId: string }) {
  const [tab, setTab] = useState<'ride' | 'friends' | 'shared'>('ride');
  const [ride, setRide] = useState<Ride | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPos, setDriverPos] = useState<Pos | null>(null);
  const [line, setLine] = useState<[number, number][] | undefined>();
  const [dest, setDest] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [price, setPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showPool, setShowPool] = useState(false);
  const [mate, setMate] = useState<string | null>(null);
  const { pos: me, error: locError } = usePosition(true);
  const prevRide = useRef<Ride | null>(null);

  const load = useCallback(async () => {
    const { data: r } = await supabase.from('rides').select('*').eq('rider_id', userId)
      .in('status', ['requested', 'accepted', 'arriving', 'in_progress'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const next = (r as Ride | null) ?? null;
    if (prevRide.current && !next) setMsg('Your trip has ended. Thanks for riding!');
    prevRide.current = next;
    setRide(next);
    if (next?.status === 'requested') {
      const { data } = await supabase.from('offers').select('*, profiles(full_name)')
        .eq('ride_id', next.id).eq('status', 'pending').order('price');
      setOffers((data ?? []) as Offer[]);
    } else {
      setOffers([]);
    }
    if (next?.driver_id) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', next.driver_id).maybeSingle();
      setDriverName(data?.full_name ?? 'Your driver');
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('web-rider-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `rider_id=eq.${userId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  // Live driver location
  const driverId = ride?.driver_id ?? null;
  const live = !!driverId && !!ride && STEPS.includes(ride.status);
  useEffect(() => {
    if (!live || !driverId) { setDriverPos(null); return; }
    supabase.from('driver_locations').select('lat,lng').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (data) setDriverPos({ lat: data.lat, lng: data.lng }); });
    const ch = supabase.channel('web-loc-' + driverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, (p) => {
        const n = p.new as { lat?: number; lng?: number };
        if (typeof n.lat === 'number' && typeof n.lng === 'number') setDriverPos({ lat: n.lat, lng: n.lng });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [live, driverId]);

  // Road route for the active ride
  useEffect(() => {
    if (!ride) { setLine(undefined); return; }
    let cancelled = false;
    getRoute({ lat: ride.pickup_lat, lng: ride.pickup_lng }, { lat: ride.dest_lat, lng: ride.dest_lng })
      .then((r) => { if (!cancelled) setLine(r.line); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  // Who am I sharing the ride with? (first name only)
  const poolKey = ride ? `${ride.id}-${ride.status}-${ride.pool_count}-${ride.pool_parent ?? ''}` : '';
  useEffect(() => {
    if (!ride || ride.status === 'requested' || (!ride.pool_parent && ride.pool_count === 0)) { setMate(null); return; }
    let cancelled = false;
    supabase.rpc('pool_mate', { p_ride: ride.id }).then(({ data }) => {
      if (cancelled) return;
      const row = (data ?? [])[0] as { full_name: string } | undefined;
      setMate(row?.full_name ?? null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  async function getQuote() {
    setMsg('');
    if (!me) { setMsg(locError || 'Waiting for your location. Please allow location access.'); return; }
    if (!dest.trim()) { setMsg('Type a destination first.'); return; }
    setBusy(true);
    try {
      const to = await geocode(dest);
      if (!to) { setMsg('Destination not found. Try a street name plus Stockholm.'); return; }
      const q = await quoteTrip(me, to);
      setQuote({ ...q, to });
      setPrice(String(q.guide));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not get a price.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRide(allowPool: boolean) {
    setShowPool(false);
    const offered = parseInt(price, 10);
    if (!quote || !me || !offered) { setMsg('Get a price estimate first, then set your offer.'); return; }
    if (offered < quote.min || offered > quote.max) { setMsg(`Your offer must be between ${quote.min} and ${quote.max} kr.`); return; }
    setBusy(true);
    setMsg('');
    const { error } = await supabase.from('rides').insert({
      rider_id: userId,
      pickup_address: 'My location', pickup_lat: me.lat, pickup_lng: me.lng,
      dest_address: quote.to.label, dest_lat: quote.to.lat, dest_lng: quote.to.lng,
      offered_price: offered, est_km: quote.km, est_minutes: quote.minutes, allow_pool: allowPool,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setQuote(null); setDest(''); setPrice('');
    load();
  }

  async function acceptOffer(id: string) {
    const { error } = await supabase.rpc('accept_offer', { p_offer: id });
    if (error) setMsg(error.message);
    load();
  }
  async function updateOffer() {
    const n = parseInt(newPrice, 10);
    if (!ride || !n) return;
    if (ride.min_price !== null && ride.max_price !== null && (n < ride.min_price || n > ride.max_price)) {
      setMsg(`Your offer must be between ${ride.min_price} and ${ride.max_price} kr.`);
      return;
    }
    const { error } = await supabase.from('rides').update({ offered_price: n }).eq('id', ride.id);
    setMsg(error ? error.message : '');
    setNewPrice('');
    load();
  }
  async function togglePool() {
    if (!ride) return;
    const { error } = await supabase.from('rides').update({ allow_pool: !ride.allow_pool }).eq('id', ride.id);
    if (error) setMsg(error.message);
    load();
  }
  async function cancelRide() {
    if (!ride) return;
    const { error } = await supabase.rpc('set_ride_status', { p_ride: ride.id, p_status: 'cancelled' });
    if (error) setMsg(error.message);
    load();
  }

  // Map content
  const points: MapPoint[] = [];
  if (ride) {
    points.push({ id: 'pickup', lat: ride.pickup_lat, lng: ride.pickup_lng, color: '#22c55e', label: 'Pickup' });
    points.push({ id: 'dest', lat: ride.dest_lat, lng: ride.dest_lng, color: '#ef4444', label: 'Destination' });
    if (driverPos) points.push({ id: 'driver', lat: driverPos.lat, lng: driverPos.lng, color: '#3b82f6', label: 'Your driver', pulse: true });
  } else {
    if (me) points.push({ id: 'me', lat: me.lat, lng: me.lng, color: '#22d3ee', label: 'You', pulse: true });
    if (quote) points.push({ id: 'dest', lat: quote.to.lat, lng: quote.to.lng, color: '#ef4444', label: 'Destination' });
  }
  const mapLine = ride ? line : quote?.line;
  const fitKey = ride
    ? `${ride.id}-${ride.status}-${driverPos ? driverPos.lat.toFixed(3) + driverPos.lng.toFixed(3) : ''}-${line?.length ?? 0}`
    : `${quote ? quote.to.label : 'none'}-${me ? 'p' : 'n'}`;

  const priceNum = parseInt(price, 10);
  const inRange = !!quote && priceNum >= quote.min && priceNum <= quote.max;
  const chips = quote ? [quote.min, quote.guide, Math.min(quote.max, Math.round(quote.guide * 1.15))] : [];
  const chipNames = ['minimum', 'market guide', 'higher'];
  const away = ride && driverPos ? distanceKm(driverPos, { lat: ride.pickup_lat, lng: ride.pickup_lng }) : null;

  return (
    <>
      <div className="nt-tabs">
        {(['ride', 'friends', 'shared'] as const).map((t) => (
          <button key={t} className={`nt-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'ride' ? 'Ride' : t === 'friends' ? 'Friends' : 'Shared with me'}
          </button>
        ))}
      </div>

      {tab === 'friends' && <div className="nt-page"><FriendsPanel userId={userId} /></div>}
      {tab === 'shared' && <SharedTrips userId={userId} />}

      {tab === 'ride' && (
        <div className="nt-stage">
          <div className="nt-panel">
            {msg && <div className="nt-card"><p className="nt-muted">{msg}</p></div>}

            {!ride && (
              <>
                <h2 className="nt-h3">Where to?</h2>
                <div className="nt-row">
                  <input className="nt-input" placeholder="e.g. Stockholm Central Station" value={dest}
                    onChange={(e) => { setDest(e.target.value); setQuote(null); }} />
                  <button className="nt-btn nt-primary" onClick={getQuote} disabled={busy}>{busy ? '…' : 'Price'}</button>
                </div>
                {!me && <p className="nt-muted">{locError || 'Finding your location… please allow location access.'}</p>}
                {quote && (
                  <div className="nt-card">
                    <p className="nt-muted">{quote.km.toFixed(1)} km · about {Math.round(quote.minutes)} min</p>
                    <p className="nt-muted">
                      Market guide <b>{quote.guide} kr</b> (based on typical Stockholm taxi tariffs).
                      You can offer between <b>{quote.min}</b> and <b>{quote.max} kr</b>.
                    </p>
                    <div className="nt-chips">
                      {chips.map((b, i) => (
                        <button key={i} className={`nt-chip ${price === String(b) ? 'on' : ''}`} onClick={() => setPrice(String(b))}>
                          {b} kr<br /><span className="nt-muted">{chipNames[i]}</span>
                        </button>
                      ))}
                    </div>
                    <input className="nt-input" type="number" inputMode="numeric" placeholder="Your offer (SEK)"
                      min={quote.min} max={quote.max} value={price} onChange={(e) => setPrice(e.target.value)} />
                    {price !== '' && !inRange && (
                      <p className="nt-muted" style={{ color: '#fca5a5' }}>
                        {priceNum < quote.min ? `The minimum offer is ${quote.min} kr.` : `The maximum offer is ${quote.max} kr.`}
                      </p>
                    )}
                    <button className="nt-btn nt-primary" onClick={() => setShowPool(true)} disabled={busy || !inRange}>
                      Request ride at {price || '…'} kr
                    </button>
                  </div>
                )}
              </>
            )}

            {ride?.status === 'requested' && (
              <>
                <h2 className="nt-h3">Your offer: {ride.offered_price} kr</h2>
                <p className="nt-muted">To: {ride.dest_address}</p>
                {ride.min_price !== null && <p className="nt-muted">Allowed range: {ride.min_price} to {ride.max_price} kr</p>}
                <div className="nt-row">
                  <input className="nt-input" type="number" inputMode="numeric" placeholder="Change my offer" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                  <button className="nt-btn" onClick={updateOffer}>Update</button>
                </div>
                <div className="nt-card">
                  <div className="nt-offer">
                    <span>Shared ride: <b>{ride.allow_pool ? 'allowed' : 'not allowed'}</b></span>
                    <button className="nt-btn sm" onClick={togglePool}>{ride.allow_pool ? 'Turn off' : 'Turn on'}</button>
                  </div>
                  {ride.allow_pool && <p className="nt-muted">Offers can also come from drivers who are already on a trip along your route.</p>}
                </div>
                <h2 className="nt-h3">Driver offers</h2>
                {offers.length === 0 && <p className="nt-muted nt-pulse">Waiting for drivers…</p>}
                {offers.map((o) => (
                  <div key={o.id} className="nt-card nt-offer">
                    <span><b>{o.profiles?.full_name ?? 'Driver'}</b><br /><span className="nt-price">{o.price} kr</span></span>
                    <button className="nt-btn nt-primary" onClick={() => acceptOffer(o.id)}>Accept</button>
                  </div>
                ))}
                <button className="nt-btn" onClick={cancelRide}>Cancel request</button>
              </>
            )}

            {ride && ride.status !== 'requested' && (
              <>
                <div className="nt-steps">
                  {STEPS.map((s, i) => <div key={s} className={`nt-step ${i <= STEPS.indexOf(ride.status) ? 'on' : ''}`} />)}
                </div>
                <h2 className="nt-h3">{STATUS_TEXT[ride.status]}</h2>

                {ride.pool_parent && (
                  <div className="nt-card nt-alert">
                    <b>Shared ride</b>
                    <p className="nt-muted">You share this car with {mate ?? 'another passenger'}, who travels on the same route. Your price is unchanged.</p>
                  </div>
                )}
                {!ride.pool_parent && mate && (
                  <div className="nt-card nt-alert">
                    <b>A second passenger joined</b>
                    <p className="nt-muted">{mate} travels on the same route. You allowed shared rides. Your price is unchanged.</p>
                  </div>
                )}
                {!ride.pool_parent && !mate && ride.allow_pool && (
                  <p className="nt-muted">Shared rides: allowed. Your driver may add one passenger on your route.</p>
                )}

                <div className="nt-card">
                  <p className="nt-muted">Driver</p>
                  <div className="nt-price">{driverName}</div>
                  {away !== null && ride.status !== 'in_progress' && (
                    <p className="nt-muted">{away.toFixed(1)} km away · about {Math.max(1, Math.round(away * 2.5))} min</p>
                  )}
                  {!driverPos && <p className="nt-muted nt-pulse">Waiting for the driver’s live location…</p>}
                </div>
                <div className="nt-card">
                  <p className="nt-muted">Agreed fixed price (locked)</p>
                  <div className="nt-price">{ride.final_price} kr</div>
                  <p className="nt-muted">You will not be charged more than this. Your first offer was {ride.offered_price} kr.</p>
                </div>
                <ShareRide rideId={ride.id} userId={userId} />
                <div className="nt-row">
                  <SosButton userId={userId} rideId={ride.id} pos={me} />
                  {ride.status !== 'in_progress' && <button className="nt-btn" onClick={cancelRide}>Cancel ride</button>}
                </div>
              </>
            )}
          </div>
          <div className="nt-map"><LiveMap points={points} line={mapLine} fitKey={fitKey} /></div>
        </div>
      )}

      {showPool && <PoolPopup onChoose={requestRide} onClose={() => setShowPool(false)} />}
    </>
  );
}