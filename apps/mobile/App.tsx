import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import RiderHome from './screens/RiderHome';
import DriverHome from './screens/DriverHome';
import FriendsScreen from './screens/FriendsScreen';
import SharedWithMe from './screens/SharedWithMe';


function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [isSignup, setIsSignup] = useState(true);

  async function submit() {
    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, role } },
      });
      if (error) Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Error', error.message);
    }
  }

  return (
    <View style={s.c}>
      <Text style={s.t}>Negotiate Taxi</Text>
      {isSignup && <TextInput style={s.i} placeholder="Full name" value={name} onChangeText={setName} />}
      <TextInput style={s.i} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={s.i} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {isSignup && (
        <View style={s.row}>
          <Button title={role === 'rider' ? '✓ Rider' : 'Rider'} onPress={() => setRole('rider')} />
          <Button title={role === 'driver' ? '✓ Driver' : 'Driver'} onPress={() => setRole('driver')} />
        </View>
      )}
      <Button title={isSignup ? 'Sign up' : 'Log in'} onPress={submit} />
      <Button title={isSignup ? 'I already have an account' : 'Create account'} onPress={() => setIsSignup(!isSignup)} />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'ride' | 'friends' | 'shared'>('ride');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setRole(null); return; }
    supabase.from('profiles').select('role, full_name').eq('id', session.user.id).single()
      .then(({ data }) => { setRole(data?.role ?? null); setName(data?.full_name ?? ''); });
  }, [session]);

  if (!session) return <AuthScreen />;
  const userId = session.user.id;

  return (
    <View style={{ flex: 1, paddingTop: 48 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 }}>
        <Text style={{ fontWeight: 'bold' }}>{name} ({role ?? '...'})</Text>
        <Button title="Log out" onPress={() => supabase.auth.signOut()} />
      </View>

      {role === 'rider' && (
        <>
          <View style={{ flex: 1 }}>
            {tab === 'ride' && <RiderHome userId={userId} />}
            {tab === 'friends' && <FriendsScreen userId={userId} />}
            {tab === 'shared' && <SharedWithMe userId={userId} />}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 24, paddingTop: 8, borderTopWidth: 1, borderColor: '#ddd' }}>
            <Button title={tab === 'ride' ? '● Ride' : 'Ride'} onPress={() => setTab('ride')} />
            <Button title={tab === 'friends' ? '● Friends' : 'Friends'} onPress={() => setTab('friends')} />
            <Button title={tab === 'shared' ? '● Shared with me' : 'Shared with me'} onPress={() => setTab('shared')} />
          </View>
        </>
      )}
      {role === 'driver' && <DriverHome userId={userId} />}
      {role === 'admin' && <Text style={{ padding: 16 }}>Admins use the web dashboard.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  t: { fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  i: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
});