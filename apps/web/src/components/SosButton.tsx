'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Pos } from '../lib/types';

export default function SosButton({ userId, rideId, pos }: { userId: string; rideId: string; pos: Pos | null }) {
  const [sent, setSent] = useState(false);

  async function send() {
    if (!window.confirm('Send an SOS with your location to Negotiate Taxi admins? If you are in immediate danger, call 112.')) return;
    const { error } = await supabase.from('sos_alerts').insert({
      user_id: userId, ride_id: rideId, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
    });
    if (error) window.alert('Could not send SOS. Call 112 now. ' + error.message);
    else setSent(true);
  }

  return <button className="nt-btn nt-danger" onClick={send}>{sent ? 'SOS sent' : '🚨 SOS'}</button>;
}