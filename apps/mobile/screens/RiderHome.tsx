import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { geocode, distanceKm, suggestPrice } from '../lib/geo';
import { Ride, Offer, Pos } from '../lib/types';
import TripMap from '../components/TripMap';
import PriceCard from '../components/PriceCard';
import ShareRideButton from '../components/ShareRideButton';
import SosButton from '../components/SosButton';


const STATUS_TEXT: Record<string, string> = {
  accepted: 'Driver accepted. Getting ready.',
  arriving: 'Driver is on the way to you',
  in_progress: 'Trip in progress',
};

export default function RiderHome({ userId }: { userId: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPos, setDriverPos] = useState<Pos | null>(null);
  const [dest, setDest] = useState('');
  const [price, setPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: r } = await supabase
      .from('rides').select('*')
      .eq('rider_id', userId)
      .in('status', ['requested', 'accepted', 'arriving', 'in_progress'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setRide(r);

    if (r?.status === 'requested') {
      const { data } = await supabase
        .from('offers').select('*, profiles(full_name)')
        .eq('ride_id', r.id).eq('status', 'pending').order('price');
      setOffers(data ?? []);
    } else {
      setOffers([]);
    }

    if (r?.driver_id) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', r.driver_id).maybeSingle();
      setDriverName(data?.full_name ?? 'Your driver');
    }
  }, [userId]);

  // Reload whenever my ride or any offer changes (realtime)
  useEffect(() => {
    load();
    const ch = supabase.channel('rider-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `rider_id=eq.${userId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  // Live driver location
  useEffect(() => {
    const live = ride?.driver_id && ['accepted', 'arriving', 'in_progress'].includes(ride.status);
    if (!live || !ride?.driver_id) { setDriverPos(null); return; }
    const driverId = ride.driver_id;
    supabase.from('driver_locations').select('lat,lng').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (data) setDriverPos({ lat: data.lat, lng: data.lng }); });
    const ch = supabase.channel('loc-' + driverId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        (p: any) => { if (p.new?.lat) setDriverPos({ lat: p.new.lat, lng: p.new.lng }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ride?.driver_id, ride?.status]);

  async function getHere() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Location permission is needed');
    const here = await Location.getCurrentPositionAsync({});
    return { lat: here.coords.latitude, lng: here.coords.longitude };
  }

  async function suggest() {
    try {
      const here = await getHere();
      const to = await geocode(dest);
      if (!to) throw new Error('Destination not found');
      setPrice(String(suggestPrice(distanceKm(here, to))));
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  async function requestRide() {
    const offered = parseInt(price, 10);
    if (!dest.trim() || !offered) return Alert.alert('Enter a destination and a price');
    setBusy(true);
    try {
      const here = await getHere();
      const to = await geocode(dest);
      if (!to) throw new Error('Destination not found');
      const { error } = await supabase.from('rides').insert({
        rider_id: userId,
        pickup_address: 'My location', pickup_lat: here.lat, pickup_lng: here.lng,
        dest_address: to.label, dest_lat: to.lat, dest_lng: to.lng,
        offered_price: offered,
      });
      if (error) throw error;
      setDest(''); setPrice('');
      await load();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setBusy(false);
  }

  async function acceptOffer(id: string) {
    const { error } = await supabase.rpc('accept_offer', { p_offer: id });
    if (error) Alert.alert('Error', error.message);
    load();
  }

  async function updateMyOffer() {
    const n = parseInt(newPrice, 10);
    if (!ride || !n) return;
    const { error } = await supabase.from('rides').update({ offered_price: n }).eq('id', ride.id);
    if (error) Alert.alert('Error', error.message);
    setNewPrice('');
    load();
  }

  async function cancelRide() {
    if (!ride) return;
    const { error } = await supabase.rpc('set_ride_status', { p_ride: ride.id, p_status: 'cancelled' });
    if (error) Alert.alert('Error', error.message);
    load();
  }

  // 1) No active ride: request form
  if (!ride) {
    return (
      <View style={s.c}>
        <Text style={s.h}>Where to?</Text>
        <TextInput style={s.i} placeholder="Destination (e.g. Stockholm Central Station)" value={dest} onChangeText={setDest} />
        <Button title="Suggest a price" onPress={suggest} />
        <TextInput style={s.i} placeholder="Your offer (SEK)" keyboardType="number-pad" value={price} onChangeText={setPrice} />
        <Button title={busy ? 'Please wait...' : 'Request ride'} onPress={requestRide} disabled={busy} />
      </View>
    );
  }

  // 2) Waiting for offers
  if (ride.status === 'requested') {
    return (
      <View style={s.c}>
        <Text style={s.h}>Your offer: {ride.offered_price} kr</Text>
        <Text numberOfLines={2}>To: {ride.dest_address}</Text>
        <View style={s.row}>
          <TextInput style={[s.i, { flex: 1 }]} placeholder="Change my offer" keyboardType="number-pad" value={newPrice} onChangeText={setNewPrice} />
          <Button title="Update" onPress={updateMyOffer} />
        </View>
        <Text style={s.h}>Driver offers</Text>
        {offers.length === 0 && <Text>Waiting for drivers...</Text>}
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <View style={s.card}>
              <Text style={{ flex: 1 }}>{item.profiles?.full_name ?? 'Driver'}: {item.price} kr</Text>
              <Button title="Accept" onPress={() => acceptOffer(item.id)} />
            </View>
          )}
        />
        <Button title="Cancel request" color="red" onPress={cancelRide} />
      </View>
    );
  }

  // 3) Accepted / arriving / in progress: live map
  return (
    <View style={{ flex: 1 }}>
        <View style={{ padding: 12, gap: 8 }}>
           <Text style={s.h}>{STATUS_TEXT[ride.status]}</Text>
           <Text>Driver: {driverName}</Text>
           <PriceCard ride={ride} />
           <ShareRideButton rideId={ride.id} userId={userId} />
        </View>
      <TripMap
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        dest={{ lat: ride.dest_lat, lng: ride.dest_lng }}
        driver={driverPos}
      />
    <SosButton userId={userId} rideId={ride.id} />
      {ride.status !== 'in_progress' && (
        <Button title="Cancel ride" color="red" onPress={cancelRide} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, padding: 16, gap: 10 },
  h: { fontSize: 18, fontWeight: 'bold' },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8 },
});