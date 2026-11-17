'use client';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const HOME: Record<string, string> = { rider: '/rider', driver: '/driver', admin: '/admin' };

export default function WrongRole({ expected, actual }: { expected: string; actual?: string }) {
  return (
    <div className="nt-center">
      <div className="nt-card nt-auth">
        <h2 className="nt-h3">This is the {expected} area</h2>
        <p className="nt-muted">You are logged in as: {actual ?? 'unknown'}.</p>
        {actual && HOME[actual] && <Link className="nt-btn nt-primary" href={HOME[actual]}>Go to my {actual} page</Link>}
        <button className="nt-btn" onClick={() => supabase.auth.signOut()}>Log out</button>
      </div>
    </div>
  );
}