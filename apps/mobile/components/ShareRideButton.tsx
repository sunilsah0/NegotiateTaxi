import { useCallback, useEffect, useState } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

type Friend = { id: string; name: string };

export default function ShareRideButton({ rideId, userId }: { rideId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [shared, setShared] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data: f } = await supabase.from('friendships').select('*').eq('status', 'accepted');
    const ids = (f ?? []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setFriends((p ?? []).map((x) => ({ id: x.id, name: x.full_name ?? 'Friend' })));
    } else {
      setFriends([]);
    }
    const { data: sh } = await supabase.from('ride_shares').select('friend_id').eq('ride_id', rideId);
    setShared((sh ?? []).map((x) => x.friend_id));
  }, [rideId, userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function share(friendId: string) {
    const { error } = await supabase.rpc('share_ride', { p_ride: rideId, p_friend: friendId });
    if (error) Alert.alert('Error', error.message);
    load();
  }
  async function stop(friendId: string) {
    await supabase.from('ride_shares').delete().eq('ride_id', rideId).eq('friend_id', friendId);
    load();
  }

  return (
    <View>
      <Button title={open ? 'Hide sharing' : 'Share this ride with a friend'} onPress={() => setOpen(!open)} />
      {open && friends.length === 0 && (
        <Text style={{ padding: 6 }}>No verified friends yet. Add friends in the Friends tab.</Text>
      )}
      {open && friends.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text>{f.name}</Text>
          {shared.includes(f.id)
            ? <Button title="Stop sharing" color="red" onPress={() => stop(f.id)} />
            : <Button title="Share" onPress={() => share(f.id)} />}
        </View>
      ))}
    </View>
  );
}