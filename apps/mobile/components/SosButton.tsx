import { Alert, Button } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

export default function SosButton({ userId, rideId }: { userId: string; rideId: string }) {
  function confirm() {
    Alert.alert(
      'Send SOS?',
      'This alerts Negotiate Taxi admins with your location. If you are in immediate danger, call 112.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: send },
      ]
    );
  }

  async function send() {
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const p = await Location.getCurrentPositionAsync({});
      lat = p.coords.latitude;
      lng = p.coords.longitude;
    } catch {}
    const { error } = await supabase
      .from('sos_alerts')
      .insert({ user_id: userId, ride_id: rideId, lat, lng });
    if (error) Alert.alert('Could not send SOS', 'Call 112 now. ' + error.message);
    else Alert.alert('SOS sent', 'Admins can see your alert. If you are in danger, call 112.');
  }

  return <Button title="🚨 SOS" color="red" onPress={confirm} />;
}