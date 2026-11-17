import { View, Text, StyleSheet } from 'react-native';
import { Ride } from '../lib/types';
import { distanceKm, suggestPrice } from '../lib/geo';

export default function PriceCard({ ride }: { ride: Ride }) {
  const km = distanceKm(
    { lat: ride.pickup_lat, lng: ride.pickup_lng },
    { lat: ride.dest_lat, lng: ride.dest_lng }
  );
  return (
    <View style={s.card}>
      <Text style={s.big}>Agreed fixed price: {ride.final_price} kr</Text>
      <Text>This price is locked. You will not be charged more than this.</Text>
      <Text style={s.small}>
        Your first offer: {ride.offered_price} kr. Typical price for this trip (our estimate): about{' '}
        {suggestPrice(km)} kr.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 10, borderRadius: 8, backgroundColor: '#eef7ee', gap: 2 },
  big: { fontWeight: 'bold', fontSize: 16 },
  small: { color: '#555', fontSize: 12 },
});