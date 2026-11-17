import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { distanceKm } from '../lib/geo';
import { Ride, Pos } from '../lib/types';
import TripMap from '../components/TripMap';

const NEXT: Record<string, { status: string; label: string }> = {
  accepted: { status: 'arriving', label: "I'm on my way" },
  arriving: { status: 'in_progress', label: 'Start trip' },
  in_progress: { status: 'completed', label: 'Complete trip' },
};

export default function DriverHome({ userId }: { userId: string }) {
  const [open, setOpen] = useState<Ride[]>([]);
  const [myOffers, setMyOffers] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Ride | null>(null);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [me, setMe] = useState<Pos | null>(null);

  const load = useCallback(async () => {
    const { data: a } = await supabase
      .from('rides').select('*')
      .eq('driver_id', userId)
      .in('status', ['accepted', 'arriving', 'in_progress'])
      .limit(1).maybeSingle();
    setActive(a);
    if (a) return;

    const { data: o } = await supabase
      .from('rides').select('*').eq('status', 'requested')
      .order('created_at', { ascending: false });
    setOpen(o ?? []);

    const { data: mo } = await supabase
      .from('offers').select('ride_id, price')
      .eq('driver_id', userId).eq('status', 'pending');
    setMyOffers(Object.fromEntries((mo ?? []).map((x) => [x.ride_id, x.price])));
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('driver-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `driver_id=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  // While on a ride: send my GPS position every few seconds
  useEffect(() => {
    if (!active) { setMe(null); return; }
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Location permission is needed'); return; }
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        async (loc) => {
          const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setMe(p);
          await supabase.from('driver_locations').upsert({
            driver_id: userId, ride_id: active.id, lat: p.lat, lng: p.lng,
            updated_at: new Date().toISOString(),
          });
        }
      );
      if (cancelled) s.remove(); else sub = s;
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [active?.id]);

  async function sendOffer(ride: Ride, p: number) {
    if (!p || p <= 0) return Alert.alert('Enter a price');
    const { error } = await supabase.from('offers').upsert(
      { ride_id: ride.id, driver_id: userId, price: p, status: 'pending' },
      { onConflict: 'ride_id,driver_id' }
    );
    if (error) Alert.alert('Error', error.message);
    load();
  }

  async function advance(status: string) {
    if (!active) return;
    const { error } = await supabase.rpc('set_ride_status', { p_ride: active.id, p_status: status });
    if (error) Alert.alert('Error', error.message);
    load();
  }

  // Active ride: map + status buttons
  if (active) {
    const next = NEXT[active.status];
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 12 }}>
          <Text style={s.h}>Active ride: {active.final_price} kr</Text>
          <Text numberOfLines={2}>To: {active.dest_address}</Text>
        </View>
        <TripMap
          pickup={{ lat: active.pickup_lat, lng: active.pickup_lng }}
          dest={{ lat: active.dest_lat, lng: active.dest_lng }}
          driver={me}
        />
        {next && <Button title={next.label} onPress={() => advance(next.status)} />}
      </View>
    );
  }

  // No active ride: list of open requests
  return (
    <View style={s.c}>
      <Text style={s.h}>Ride requests</Text>
      {open.length === 0 && <Text>No requests right now.</Text>}
      <FlatList
        data={open}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const km = distanceKm(
            { lat: item.pickup_lat, lng: item.pickup_lng },
            { lat: item.dest_lat, lng: item.dest_lng }
          );
          return (
            <View style={s.card}>
              <Text numberOfLines={2}>To: {item.dest_address}</Text>
              <Text>Trip about {km.toFixed(1)} km. Rider offers {item.offered_price} kr</Text>
              {myOffers[item.id] && <Text>Your offer: {myOffers[item.id]} kr (waiting)</Text>}
              <Button title={`Accept ${item.offered_price} kr`} onPress={() => sendOffer(item, item.offered_price)} />
              <View style={s.row}>
                <TextInput
                  style={[s.i, { flex: 1 }]} placeholder="Counter price" keyboardType="number-pad"
                  value={counter[item.id] ?? ''} onChangeText={(t) => setCounter({ ...counter, [item.id]: t })}
                />
                <Button title="Counter" onPress={() => sendOffer(item, parseInt(counter[item.id] ?? '', 10))} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, padding: 16, gap: 10 },
  h: { fontSize: 18, fontWeight: 'bold' },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  card: { padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 10, gap: 6 },
});