'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Friend = { id: string; name: string };
type FriendRow = { requester_id: string; addressee_id: string };

export default function ShareRide({ rideId, userId }: { rideId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data: f } = await supabase.from('friendships').select('*').eq('status', 'accepted');
    const ids = ((f ?? []) as FriendRow[]).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setFriends((p ?? []).map((x: { id: string; full_name: string | null }) => ({ id: x.id, name: x.full_name ?? 'Friend' })));
    } else {
      setFriends([]);
    }
    const { data: sh } = await supabase.from('ride_shares').select('friend_id').eq('ride_id', rideId);
    setShared((sh ?? []).map((x: { friend_id: string }) => x.friend_id));
  }, [rideId, userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function share(friendId: string) {
    const { error } = await supabase.rpc('share_ride', { p_ride: rideId, p_friend: friendId });
    setErr(error ? error.message : '');
    load();
  }
  async function stop(friendId: string) {
    await supabase.from('ride_shares').delete().eq('ride_id', rideId).eq('friend_id', friendId);
    load();
  }

  return (
    <div className="nt-card">
      <button className="nt-btn" onClick={() => setOpen(!open)}>{open ? 'Hide sharing' : 'Share this ride with a friend'}</button>
      {open && friends.length === 0 && <p className="nt-muted">No verified friends yet. Add some in the Friends tab.</p>}
      {open && friends.map((f) => (
        <div key={f.id} className="nt-offer">
          <span>{f.name}</span>
          {shared.includes(f.id)
            ? <button className="nt-btn sm nt-danger" onClick={() => stop(f.id)}>Stop sharing</button>
            : <button className="nt-btn sm nt-primary" onClick={() => share(f.id)}>Share live</button>}
        </div>
      ))}
      {err && <p className="nt-muted" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}