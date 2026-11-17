import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

type Row = { id: string; requester_id: string; addressee_id: string; status: string };

export default function FriendsScreen({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('friendships').select('*');
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)))];
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((p ?? []).map((x) => [x.id, x.full_name ?? 'Unknown'])));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('friends-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  async function send() {
    if (!email.trim()) return;
    const { error } = await supabase.rpc('send_friend_request', { p_email: email });
    if (error) return Alert.alert('Error', error.message);
    setEmail('');
    Alert.alert('Done', 'If that customer account exists, a friend request was sent.');
    load();
  }
  async function accept(id: string) {
    await supabase.rpc('accept_friend', { p_id: id });
    load();
  }
  async function remove(id: string) {
    await supabase.from('friendships').delete().eq('id', id);
    load();
  }

  const other = (r: Row) => names[r.requester_id === userId ? r.addressee_id : r.requester_id] ?? '...';
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee_id === userId);
  const sent = rows.filter((r) => r.status === 'pending' && r.requester_id === userId);
  const friends = rows.filter((r) => r.status === 'accepted');

  return (
    <ScrollView contentContainerStyle={s.c}>
      <Text style={s.h}>Add a friend</Text>
      <TextInput style={s.i} placeholder="Friend's email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Button title="Send friend request" onPress={send} />

      <Text style={s.h}>Requests for you</Text>
      {incoming.length === 0 && <Text>None</Text>}
      {incoming.map((r) => (
        <View key={r.id} style={s.row}>
          <Text style={{ flex: 1 }}>{other(r)}</Text>
          <Button title="Accept" onPress={() => accept(r.id)} />
          <Button title="Decline" color="red" onPress={() => remove(r.id)} />
        </View>
      ))}

      <Text style={s.h}>Waiting for them</Text>
      {sent.length === 0 && <Text>None</Text>}
      {sent.map((r) => (
        <View key={r.id} style={s.row}>
          <Text style={{ flex: 1 }}>{other(r)}</Text>
          <Button title="Cancel" color="red" onPress={() => remove(r.id)} />
        </View>
      ))}

      <Text style={s.h}>Verified friends</Text>
      {friends.length === 0 && <Text>None yet</Text>}
      {friends.map((r) => (
        <View key={r.id} style={s.row}>
          <Text style={{ flex: 1 }}>✓ {other(r)}</Text>
          <Button title="Remove" color="red" onPress={() => remove(r.id)} />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { padding: 16, gap: 10 },
  h: { fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});