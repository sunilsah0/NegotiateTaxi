import { useCallback, useEffect, useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { Ride, Pos } from '../lib/types';
import TripMap from '../components/TripMap';

type Share = { ride_id: string; rider_id: string; rides: Ride | null };
const ACTIVE = ['requested', 'accepted', 'arriving', 'in_progress'];

function FriendTrip({ ride, riderName, onBack }: { ride: Ride; riderName: string; onBack: () => void }) {
  const [driverPos, setDriverPos] = useState<Pos | null>(null);

  useEffect(() => {
    if (!ride.driver_id) { setDriverPos(null); return; }
    const driverId = ride.driver_id;
    supabase.from('driver_locations').select('lat,lng').eq('driver_id', driverId).maybeSingle()
      .then(({ data }) => { if (data) setDriverPos({ lat: data.lat, lng: data.lng }); });
    const ch = supabase.channel('friend-loc-' + driverId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        (p: any) => { if (p.new?.lat) setDriverPos({ lat: p.new.lat, lng: p.new.lng }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ride.driver_id]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12 }}>
        <Button title="← Back" onPress={onBack} />
        <Text style={s.h}>{riderName}'s trip: {ride.status.replace('_', ' ')}</Text>
        <Text numberOfLines={2}>Going to: {ride.dest_address}</Text>
        {!ride.driver_id && <Text>Still looking for a driver...</Text>}
      </View>
      <TripMap
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        dest={{ lat: ride.dest_lat, lng: ride.dest_lng }}
        driver={driverPos}
      />
    </View>
  );
}

export default function SharedWithMe({ userId }: { userId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('ride_shares').select('ride_id, rider_id, rides(*)').eq('friend_id', userId);
    const list = ((data ?? []) as unknown as Share[]).filter((x) => x.rides && ACTIVE.includes(x.rides.status));
    setShares(list);
    const ids = [...new Set(list.map((x) => x.rider_id))];
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.full_name ?? 'Friend'])));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('shared-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_shares' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  const current = shares.find((x) => x.ride_id === selected);
  if (current?.rides) {
    return <FriendTrip ride={current.rides} riderName={names[current.rider_id] ?? 'Friend'} onBack={() => setSelected(null)} />;
  }

  return (
    <View style={s.c}>
      <Text style={s.h}>Trips shared with me</Text>
      {shares.length === 0 && <Text>No friend is sharing a trip right now.</Text>}
      <FlatList
        data={shares}
        keyExtractor={(x) => x.ride_id}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={{ flex: 1 }}>{names[item.rider_id] ?? 'Friend'}: {item.rides?.status.replace('_', ' ')}</Text>
            <Button title="Track live" onPress={() => setSelected(item.ride_id)} />
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, padding: 16, gap: 10 },
  h: { fontSize: 18, fontWeight: 'bold' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8 },
});