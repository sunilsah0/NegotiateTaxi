'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = { id: string; requester_id: string; addressee_id: string; status: string };

export default function FriendsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('friendships').select('*');
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)))];
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((p ?? []).map((x: { id: string; full_name: string | null }) => [x.id, x.full_name ?? 'Unknown'])));
    }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('web-friends-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  async function send() {
    if (!email.trim()) return;
    const { error } = await supabase.rpc('send_friend_request', { p_email: email });
    setMsg(error ? error.message : 'Done. If that customer account exists, a request was sent.');
    setEmail('');
    load();
  }
  async function accept(id: string) { await supabase.rpc('accept_friend', { p_id: id }); load(); }
  async function remove(id: string) { await supabase.from('friendships').delete().eq('id', id); load(); }

  const other = (r: Row) => names[r.requester_id === userId ? r.addressee_id : r.requester_id] ?? '…';
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee_id === userId);
  const sent = rows.filter((r) => r.status === 'pending' && r.requester_id === userId);
  const friends = rows.filter((r) => r.status === 'accepted');

  return (
    <>
      <div className="nt-card">
        <h2 className="nt-h3">Add a friend</h2>
        <input className="nt-input" type="email" placeholder="Friend’s email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="nt-btn nt-primary" onClick={send}>Send friend request</button>
        {msg && <p className="nt-muted">{msg}</p>}
      </div>
      <div className="nt-card">
        <h2 className="nt-h3">Requests for you</h2>
        {incoming.length === 0 && <p className="nt-muted">None</p>}
        {incoming.map((r) => (
          <div key={r.id} className="nt-offer">
            <span>{other(r)}</span>
            <span className="nt-row">
              <button className="nt-btn sm nt-primary" onClick={() => accept(r.id)}>Accept</button>
              <button className="nt-btn sm" onClick={() => remove(r.id)}>Decline</button>
            </span>
          </div>
        ))}
      </div>
      <div className="nt-card">
        <h2 className="nt-h3">Waiting for them</h2>
        {sent.length === 0 && <p className="nt-muted">None</p>}
        {sent.map((r) => (
          <div key={r.id} className="nt-offer">
            <span>{other(r)}</span>
            <button className="nt-btn sm" onClick={() => remove(r.id)}>Cancel</button>
          </div>
        ))}
      </div>
      <div className="nt-card">
        <h2 className="nt-h3">Verified friends</h2>
        {friends.length === 0 && <p className="nt-muted">None yet</p>}
        {friends.map((r) => (
          <div key={r.id} className="nt-offer">
            <span>✓ {other(r)}</span>
            <button className="nt-btn sm" onClick={() => remove(r.id)}>Remove</button>
          </div>
        ))}
      </div>
    </>
  );
}