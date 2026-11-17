'use client';
import { useEffect, useState } from 'react';
import type { Pos } from './types';

export function usePosition(enabled: boolean) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) { setError('This browser has no location support.'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setError(''); },
      (e) => setError(e.message || 'Location permission was denied.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos, error };
}