import { useEffect, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';
import { Pos } from '../lib/types';

type Props = { pickup: Pos; dest: Pos; driver?: Pos | null };

export default function TripMap({ pickup, dest, driver }: Props) {
  const ref = useRef<MapView>(null);

  function fit() {
    const pts = [pickup, dest, ...(driver ? [driver] : [])].map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
    ref.current?.fitToCoordinates(pts, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }

  useEffect(fit, [driver?.lat, driver?.lng, pickup.lat, dest.lat]);

  return (
    <MapView
      ref={ref}
      style={{ flex: 1 }}
      onMapReady={fit}
      initialRegion={{ latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
    >
      <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" pinColor="green" />
      <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title="Destination" pinColor="red" />
      {driver && (
        <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} title="Driver" pinColor="blue" />
      )}
    </MapView>
  );
}